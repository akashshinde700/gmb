"""
Run one command on the production server, as the site user, in the app
directory with the app's environment loaded.

    python scripts/server-run.py "npm run plans:domains"
    python scripts/server-run.py "npx prisma db push --accept-data-loss"

Loads .env and nvm first, because the standalone server and the shell see
different environments — a command run without `set -a; . .env` will not find
DATABASE_URL and will fail in a confusing way.

Whatever you pass is executed verbatim on a live server. Read it twice.
"""
import json
import os
import sys

import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = {
    "host": "200.141.9.196",
    "site_user": "websetu",
    "site_password": "Infinitydev@789",
    "site_domain": "www.websetu.instantqr.tech",
}
cfg_path = os.path.join(ROOT, "deploy_config.json")
if os.path.exists(cfg_path):
    with open(cfg_path, encoding="utf-8") as f:
        CFG.update(json.load(f))

APP_DIR = f"/home/{CFG['site_user']}/htdocs/{CFG['site_domain']}"
PRELUDE = (
    'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; '
    f"cd {APP_DIR} && set -a && . ./.env && set +a && "
)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    command = " ".join(sys.argv[1:])

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(
        CFG["host"],
        username=CFG["site_user"],
        password=CFG["site_password"],
        timeout=30,
        allow_agent=False,
        look_for_keys=False,
    )
    print(f"$ {command}\n")
    _in, out, err = ssh.exec_command(PRELUDE + command, timeout=600)
    status = out.channel.recv_exit_status()
    body = out.read().decode("utf-8", "replace")
    error = err.read().decode("utf-8", "replace")
    if body:
        print(body.rstrip())
    if error:
        print(error.rstrip())
    print(f"\n[exit {status}]")
    ssh.close()
    return status


if __name__ == "__main__":
    sys.exit(main())
