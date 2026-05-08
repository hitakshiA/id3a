#!/bin/bash
# One-shot redeploy on the VPS — pulls latest main, rebuilds the client, and
# reloads the API process. Run as root from any directory:
#
#   ssh root@139.59.86.231 'bash /var/www/id3a/ops/redeploy.sh'
#
# Idempotent. Safe to run while users are connected (pm2 reload is graceful).

set -euo pipefail

APP_DIR=/var/www/id3a

echo "==> pulling latest"
cd "$APP_DIR"
git fetch -q origin
git reset --hard origin/main

echo "==> npm install (only on lockfile changes)"
npm install --silent --prefer-offline 2>&1 | tail -3

echo "==> client build"
npm -w client run build 2>&1 | tail -5

echo "==> reloading api"
pm2 reload id3a-api 2>&1 | tail -3

echo "==> nginx config is left alone"
# Certbot owns the live /etc/nginx/sites-available/id3a (it injected the
# `listen 443 ssl` block + redirect). Naively copying ops/nginx.conf over it
# strips the SSL listener and takes HTTPS down. If ops/nginx.conf changes,
# apply it manually:
#   1. cp ops/nginx.conf /etc/nginx/sites-available/id3a
#   2. certbot --nginx -n --redirect -d id3a.fun -d www.id3a.fun
#   3. systemctl reload nginx

echo ""
echo "==> done"
pm2 list | grep id3a-api
