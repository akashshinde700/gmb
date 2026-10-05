"""
WebSetu -- deploy WITHOUT taking the site down.

    python scripts/deploy-swap.py             # build beside, smoke-test, swap
    python scripts/deploy-swap.py --rollback     # put the previous build back
    python scripts/deploy-swap.py --use-staging  # reuse an already-built ~/deploy-staging

Why this exists
---------------
`deploy.py` stops the app first, then wipes htdocs, uploads, installs, and runs
`next build` ON THE SERVER before starting anything again. Every one of those
minutes is a hard 502 for real visitors -- a customer was thrown out of the
onboarding wizard at "Create My Website" by exactly that window.

This script does the same work in the opposite order. The live build keeps
serving while the new one is built beside it, so the old build is deleted only
once the new one exists and has answered a request. The only downtime is one
PM2 restart -- seconds, not minutes.

    deploy.py       stop -> wipe -> upload -> npm ci -> build -> start
    deploy-swap.py  upload -> npm ci -> build -> smoke test -> swap -> start
                    ^-------------- site is up throughout -------^

deploy.py is imported rather than copied, so both scripts read the same
deploy_config.json, write the same .env, and produce the same PM2 process.
Neither file is modified by this one.

Layout on the server
--------------------
    ~/htdocs/<domain>     the live build (what PM2 runs)
    ~/deploy-staging      the build in progress; becomes live on swap
    ~/deploy-previous     the build that was live before the last swap

`~/deploy-previous` is what --rollback restores, and it is what gets deleted at
the start of the next swap. One spare copy, ~1.3 GB, on a disk with 165 GB free.

One caveat, and it is inherent to deploying without downtime: `prisma db push`
runs against the shared database while the OLD build is still serving. Additive
changes (a new column, a new table) are safe. A rename or a drop is not -- the
running build will hit the missing column. For those, use deploy.py and accept
the outage.
"""

import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import deploy as D  # noqa: E402  -- config, env, ssh helpers; never modified

ARGS = sys.argv[1:]
ROLLBACK = "--rollback" in ARGS
# Skip straight to the smoke test and swap, reusing whatever is already built in
# ~/deploy-staging. For retrying after a swap failed, or after the build
# succeeded and something later did not -- rebuilding takes ten minutes and
# would produce the same bytes.
USE_STAGING = "--use-staging" in ARGS

STAGING = D.SITE_HOME + "/deploy-staging"
PREVIOUS = D.SITE_HOME + "/deploy-previous"
LIVE = D.REMOTE_APP
# The new build answers here before anything is swapped. A build that cannot
# serve a request never reaches production.
SMOKE_PORT = D.APP_PORT + 1


def ecosystem_for(app_dir):
    """PM2 config pointing at one build directory. Same shape as deploy.py's, so
    the two scripts can be used interchangeably on the same server."""
    return (
        "// PM2 config -- runs the Next.js standalone server (output: 'standalone').\n"
        "// server.js does not load .env, so the full runtime env is inlined below.\n"
        "module.exports = "
        + json.dumps(
            {
                "apps": [
                    {
                        "name": D.PM2_NAME,
                        "cwd": app_dir + "/.next/standalone",
                        "script": "server.js",
                        "instances": 1,
                        "exec_mode": "fork",
                        "autorestart": True,
                        "max_restarts": 10,
                        "restart_delay": 4000,
                        "max_memory_restart": "600M",
                        "env": D._pm2_env(),
                    }
                ]
            },
            indent=2,
        )
        + ";\n"
    )


def http_code(ssh, url, timeout=20):
    cmd = "curl -sk -o /dev/null -w '%{http_code}' --max-time " + str(timeout) + " " + url + " || true"
    out, _, _ = D.run_site(ssh, cmd)
    return out.strip()[-3:]


def relink_uploads(ssh, app_dir):
    D.run_site(
        ssh,
        "rm -rf " + app_dir + "/.next/standalone/public/uploads && "
        "ln -sfn " + D.UPLOADS_DIR + " " + app_dir + "/.next/standalone/public/uploads",
    )


def restart_pm2(ssh, sftp, app_dir):
    """Point PM2 at one build directory and start it.

    delete + start rather than restart: PM2 caches cwd from when the process was
    created, so a restart would go on running the directory that has just been
    renamed out from under it.
    """
    D.upload_string(sftp, ecosystem_for(app_dir), app_dir + "/ecosystem.config.js")
    D.run_site(ssh, "pm2 delete " + D.PM2_NAME + " 2>&1 | tail -1; true")
    D.run_site(ssh, "cd " + app_dir + " && pm2 start ecosystem.config.js 2>&1 | cat", check=True)
    D.run_site(ssh, "pm2 save 2>&1 | tail -1")


def swap(ssh, sftp):
    """The only part of a deploy that is allowed to interrupt anybody."""
    D.banner("[7] Swap")
    # Deleting the previous build is the FIRST thing here and not a moment
    # earlier: until this line, two complete working builds exist on disk.
    D.run_site(ssh, "rm -rf " + PREVIOUS)
    D.run_site(ssh, "pm2 stop " + D.PM2_NAME + " 2>&1 | tail -2; true")
    # Both are on the same filesystem, so these are renames: instant, and
    # nothing is left half-moved if the box loses power mid-deploy.
    D.run_site(ssh, "mv " + LIVE + " " + PREVIOUS + " && mv " + STAGING + " " + LIVE, check=True)
    # The symlink was made under the staging path; remake it under the live one.
    relink_uploads(ssh, LIVE)
    restart_pm2(ssh, sftp, LIVE)


def rollback(ssh, sftp):
    D.banner("[ROLLBACK] restoring the previous build")
    _, _, code = D.run_site(ssh, "test -d " + PREVIOUS)
    if code != 0:
        raise RuntimeError("nothing to roll back to: " + PREVIOUS + " does not exist")
    D.run_site(ssh, "pm2 stop " + D.PM2_NAME + " 2>&1 | tail -2; true")
    D.run_site(
        ssh,
        "rm -rf " + STAGING + " && mv " + LIVE + " " + STAGING + " && mv " + PREVIOUS + " " + LIVE,
        check=True,
    )
    relink_uploads(ssh, LIVE)
    restart_pm2(ssh, sftp, LIVE)
    D.p("[INFO] the build that was rolled back is parked at " + STAGING)


def build_staging(ssh, sftp):
    # No database backup is taken before a deploy, by instruction. The admin
    # console has a "Download backup" button (GET /api/admin/backup) that makes
    # the same consistent snapshot on demand, so copies of the whole customer
    # database no longer pile up on the server after every deploy.
    #
    # The trade, stated plainly: a deploy that loses or corrupts data has
    # nothing to roll back to but whatever was last downloaded by hand. The
    # build itself is still reversible -- `--rollback` swaps the previous build
    # back -- but that restores CODE, not rows.
    D.run_site(ssh, "mkdir -p " + D.UPLOADS_DIR, check=True)

    D.banner("[2] Uploading the new build beside the live one")
    D.p("  the site keeps serving from the current build throughout")
    D.run_site(ssh, "rm -rf " + STAGING + " && mkdir -p " + STAGING, check=True)
    D.upload_tree(sftp, ROOT, STAGING)
    D.upload_string(sftp, D.ENV_CONTENT, STAGING + "/.env")

    D.banner("[3] npm ci")
    D.run_site(
        ssh,
        "cd " + STAGING + " && npm ci --no-audit --no-fund 2>&1 | tail -20",
        timeout=1800,
        check=True,
    )

    D.banner("[4] prisma generate + db push")
    D.p("  NOTE: this touches the database the LIVE build is still using.")
    D.p("        Additive changes are safe; a rename or a drop is not.")
    D.run_site(ssh, "cd " + STAGING + " && npx prisma generate 2>&1 | tail -5", timeout=600, check=True)
    _, _, pc = D.run_site(
        ssh,
        "cd " + STAGING + " && npx prisma db push --accept-data-loss 2>&1 | tail -15",
        timeout=600,
    )
    if pc != 0:
        raise RuntimeError("prisma db push failed -- nothing was swapped, the site is untouched")

    D.banner("[5] next build (output: standalone)")
    D.run_site(
        ssh,
        "cd " + STAGING + " && rm -rf .next && npm run build 2>&1 | tail -40",
        timeout=2400,
        check=True,
    )
    relink_uploads(ssh, STAGING)
    # Next's tracing misses the generated Prisma client and its native engine;
    # copy them in exactly as deploy.py does.
    D.run_site(
        ssh,
        "cd " + STAGING + " && test -f .next/standalone/server.js && "
        "mkdir -p .next/standalone/node_modules .next/standalone/prisma && "
        "cp -r node_modules/.prisma .next/standalone/node_modules/ && "
        "cp -r node_modules/@prisma .next/standalone/node_modules/ && "
        "cp -r prisma/. .next/standalone/prisma/ && echo '[OK] standalone assembled'",
        timeout=600,
        check=True,
    )


def smoke_test(ssh):
    """Start the new build on a spare port, prove it answers, stop it.

    Start, poll and kill are ONE remote command on purpose. Starting the server
    in its own SSH command and polling from later ones looks tidier and hangs
    the deploy: paramiko reads the channel until end-of-file, and a background
    process the shell has spawned keeps that channel open no matter how the
    foreground command exits. The first run of this script sat on that line
    until it was killed -- harmlessly, because nothing had been swapped yet, but
    it never finished either.

    stdin comes from /dev/null and setsid detaches the process group, so the
    server holds nothing belonging to the SSH session.
    """
    D.banner("[6] Smoke test on port " + str(SMOKE_PORT))
    D.p("  the new build has to answer a request before it is allowed to replace anything")
    port = str(SMOKE_PORT)
    script = (
        "cd " + STAGING + " && set -a && . ./.env && set +a && cd .next/standalone && "
        "setsid env PORT=" + port + " HOSTNAME=127.0.0.1 node server.js "
        "< /dev/null > /tmp/websetu-smoke.log 2>&1 & "
        "sp=$!; c=''; "
        "for i in $(seq 1 40); do sleep 2; "
        'c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 '
        "http://127.0.0.1:" + port + "/api/plans 2>/dev/null || true); "
        '[ "$c" = "200" ] && break; done; '
        "kill $sp 2>/dev/null; sleep 1; kill -9 $sp 2>/dev/null; "
        "fuser -k " + port + "/tcp 2>/dev/null; "
        'echo "SMOKE=$c"'
    )
    out, _, _ = D.run_site(ssh, script, timeout=240)
    ok = "SMOKE=200" in out
    if not ok:
        D.run_site(ssh, "tail -30 /tmp/websetu-smoke.log")
        raise RuntimeError(
            "the new build did not answer on port " + port + " -- "
            "nothing was swapped, the live site never went down"
        )
    D.p("  [OK] new build answered 200 on " + port)


def main():
    D.banner("WebSetu -- zero-downtime deploy")
    D.p("  host    : " + D.HOST + "  (user " + D.SITE_USER + ")")
    D.p("  live    : " + LIVE)
    D.p("  staging : " + STAGING)
    D.p("  previous: " + PREVIOUS + "   (kept for --rollback)")

    ssh = D.connect(D.SITE_USER, D.SITE_PASSWORD)
    sftp = ssh.open_sftp()
    started = time.time()
    try:
        if ROLLBACK:
            rollback(ssh, sftp)
            D.banner("[ROLLED BACK]")
            return

        if USE_STAGING:
            _, _, code = D.run_site(ssh, "test -f " + STAGING + "/.next/standalone/server.js")
            if code != 0:
                raise RuntimeError("--use-staging: no built app at " + STAGING)
            D.p("[INFO] --use-staging: reusing the build already in " + STAGING)
        else:
            build_staging(ssh, sftp)
        smoke_test(ssh)
        swap(ssh, sftp)

        D.banner("[8] Health check")
        local = ""
        for _ in range(20):
            time.sleep(1.5)
            local = http_code(ssh, "http://127.0.0.1:" + str(D.APP_PORT) + "/")
            if local == "200":
                break
        public = http_code(ssh, "https://" + D.SITE_DOMAIN + "/", timeout=25)
        D.p("  local  127.0.0.1:" + str(D.APP_PORT) + "/  -> " + local)
        D.p("  public https://" + D.SITE_DOMAIN + "/ -> " + public)
        if local != "200":
            D.p("[ERROR] the swapped build is not serving -- rolling back")
            rollback(ssh, sftp)
            raise RuntimeError("swap failed its health check; the previous build has been restored")

        D.banner("[SUCCESS]")
        D.p("  URL      : https://" + D.SITE_DOMAIN)
        D.p("  App      : " + LIVE + "  (pm2 '" + D.PM2_NAME + "', port " + str(D.APP_PORT) + ")")
        D.p("  Previous : " + PREVIOUS + "   (python scripts/deploy-swap.py --rollback)")
        D.p("  Backup   : none taken -- Admin > Overview > Download backup")
        D.p("  Total    : " + str(int(time.time() - started)) + "s, of which the site was down "
            "for the PM2 restart only")

    except Exception as e:
        D.p("\n[ERROR] " + str(e))
        sys.exit(1)
    finally:
        try:
            sftp.close()
        finally:
            ssh.close()
        D.p("\n[INFO] SSH closed.")


if __name__ == "__main__":
    main()
