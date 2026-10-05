"""
Read-only survey of the production server.

Answers the questions that decide how customer domains can work here: which
web server is actually in front, how the vhost is configured, what the public
IP is, and what the running app's environment looks like.

Changes nothing. Reads deploy_config.json / deploy.py defaults for credentials.

    python scripts/server-inspect.py
"""
import json
import os
import sys

import paramiko

# The server prints box-drawing characters (pm2) that a cp1252 console cannot
# encode; force UTF-8 rather than losing the output to a crash.
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

SITE_USER = CFG["site_user"]
SITE_DOMAIN = CFG["site_domain"]
APP_DIR = f"/home/{SITE_USER}/htdocs/{SITE_DOMAIN}"

CHECKS = [
    ("public IP (as the internet sees it)", "curl -s --max-time 10 https://api.ipify.org || echo unavailable"),
    ("local addresses", "hostname -I"),
    ("web server on :80/:443", "ss -lntp 2>/dev/null | grep -E ':80 |:443 ' || echo none"),
    ("nginx present", "command -v nginx >/dev/null && nginx -v 2>&1 || echo 'no nginx'"),
    ("caddy present", "command -v caddy >/dev/null && caddy version || echo 'no caddy'"),
    ("app port listeners", "ss -lntp 2>/dev/null | grep -E ':4400 |:3000 ' || echo none"),
    ("pm2 processes", "export NVM_DIR=$HOME/.nvm; . $NVM_DIR/nvm.sh >/dev/null 2>&1; pm2 list 2>&1 | head -20"),
    ("app dir", f"ls -la {APP_DIR} 2>&1 | head -15"),
    ("server .env keys (values hidden)", f"sed -E 's/=.*/=<set>/' {APP_DIR}/.env 2>&1 | head -40"),
    ("nginx vhost for this site", f"ls /etc/nginx/sites-enabled/ 2>&1 | head -20"),
    ("vhost contents", f"cat /etc/nginx/sites-enabled/{SITE_DOMAIN}.conf 2>/dev/null | head -60 || echo 'not readable as site user'"),
    ("app answers locally", "curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:4400/api/health || echo fail"),
    ("health body", "curl -s --max-time 10 http://127.0.0.1:4400/api/health || echo fail"),
    ("sudo available?", "sudo -n true 2>&1 && echo 'passwordless sudo' || echo 'no passwordless sudo'"),
]


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(
        CFG["host"],
        username=SITE_USER,
        password=CFG["site_password"],
        timeout=30,
        allow_agent=False,
        look_for_keys=False,
    )
    print(f"connected to {CFG['host']} as {SITE_USER}\n")

    for label, command in CHECKS:
        print(f"--- {label} " + "-" * max(0, 60 - len(label)))
        _in, out, err = ssh.exec_command(command, timeout=60)
        body = out.read().decode("utf-8", "replace").strip()
        error = err.read().decode("utf-8", "replace").strip()
        print(body or error or "(no output)")
        print()

    ssh.close()


if __name__ == "__main__":
    sys.exit(main())
