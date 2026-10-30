#!/usr/bin/env bash
set -euo pipefail
python3 - <<'PY'
import socket
for host in ['zohurnews.com','www.zohurnews.com']:
 addresses={x[4][0]for x in socket.getaddrinfo(host,80,type=socket.SOCK_STREAM)}
 if '91.228.186.233'not in addresses:raise SystemExit(host+' still does not point to VPS 91.228.186.233; DNS cutover required first.')
print('Both DNS names point to this VPS.')
PY
nginx -t
certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email --redirect -d zohurnews.com -d www.zohurnews.com
nginx -t
curl --fail --silent --show-error https://zohurnews.com/api/health
