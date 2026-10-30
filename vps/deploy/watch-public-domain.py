#!/usr/bin/env python3
"""Complete TLS cutover only once both public A records reach this VPS."""
import pathlib,socket,subprocess
marker=pathlib.Path('/opt/zohurnews/state/public-domain-ready')
if marker.exists():raise SystemExit(0)
try:
 for host in ['zohurnews.com','www.zohurnews.com']:
  addresses={x[4][0]for x in socket.getaddrinfo(host,80,type=socket.SOCK_STREAM)}
  if '91.228.186.233'not in addresses:
   print(host+': waiting for DNS A record 91.228.186.233');raise SystemExit(0)
except socket.gaierror:
 print('DNS lookup unavailable; retry later');raise SystemExit(0)
subprocess.run(['bash','/opt/zohurnews/releases/research-v3/deploy/enable-public-domain.sh'],check=True)
marker.write_text('DNS, TLS and HTTPS health verified\n')
