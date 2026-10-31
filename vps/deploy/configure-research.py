#!/usr/bin/env python3
"""Run interactively on the VPS. Credentials never enter shell history or output."""
import argparse,re,datetime
import os,pathlib,secrets,getpass,json,urllib.request,urllib.error,urllib.parse,hashlib,hmac,time,subprocess,sys
parser=argparse.ArgumentParser()
parser.add_argument('--activate',action='store_true')
parser.add_argument('--model')
parser.add_argument('--new-key',action='store_true',help='Replace a previously entered candidate key')
args=parser.parse_args()
os.umask(0o077)
root=pathlib.Path('/opt/zohurnews');private=root/'private';private.mkdir(mode=0o700,exist_ok=True)
pendingfile=private/'gemini-pending.env'
def read_env(p):
    return dict(line.split('=',1) for line in p.read_text().splitlines() if '=' in line and not line.startswith('#')) if p.exists() else {}
pending=read_env(pendingfile)
def save_pending(key,model=''):
    if any(ord(c) in (10,13) for c in key+model):raise ValueError('Invalid credential/model value')
    temp=private/'gemini-pending.env.tmp'
    temp.write_text('GEMINI_API_KEY='+key+chr(10)+('GEMINI_MODEL='+model+chr(10) if model else ''));temp.chmod(0o600);temp.replace(pendingfile)
envfile=private/'worker.env'
existing={}
if envfile.exists():
    existing=dict(line.split('=',1) for line in envfile.read_text().splitlines() if '=' in line and not line.startswith('#'))
cached_key=existing.get('GEMINI_API_KEY','') or pending.get('GEMINI_API_KEY','')
key=(getpass.getpass('Gemini API key (hidden, blank keeps existing): ').strip() or cached_key) if args.new_key or not cached_key else cached_key
if not key:sys.exit('A valid Gemini API key is required.')
save_pending(key,args.model or existing.get('GEMINI_MODEL','') or pending.get('GEMINI_MODEL',''))
stage='model-list'
model=args.model or existing.get('GEMINI_MODEL') or pending.get('GEMINI_MODEL')
def google(endpoint,payload=None):
    body=None if payload is None else json.dumps(payload).encode()
    req=urllib.request.Request('https://generativelanguage.googleapis.com/v1beta/'+endpoint,data=body,headers={'x-goog-api-key':key,'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=45) as r:return json.load(r)
try:
    models=[];page=''
    while True:
        response=google('models?pageSize=100'+('&pageToken='+urllib.parse.quote(page) if page else ''))
        models.extend(m for m in response.get('models',[]) if 'generateContent' in m.get('supportedGenerationMethods',[]))
        page=response.get('nextPageToken','')
        if not page:break
    if model:
        if not any(m['name']=='models/'+model for m in models):raise ValueError('Model no longer available')
    else:
        for i,m in enumerate(models):print(str(i+1)+': '+m['name'])
        selected=input('Select a model number: ').strip();model=models[int(selected)-1]['name'].removeprefix('models/')
        if int(selected)<1:raise ValueError()
    save_pending(key,model)
    stage='generation-probe'
    # An actual small inference verifies key, model access and JSON response support.
    probe=google('models/'+urllib.parse.quote(model,safe='')+':generateContent',{'contents':[{'parts':[{'text':'Return only the JSON object {"ok":true}.'}]}],'generationConfig':{'responseMimeType':'application/json'}})
    result=''.join(p.get('text','') for p in probe['candidates'][0]['content']['parts'])
    if json.loads(result).get('ok') is not True:raise ValueError('Unexpected probe')
except urllib.error.HTTPError as e:
    from gemini_diagnostics import describe_http_error
    report=describe_http_error(e,key,stage,model)
    diagnostic=private/'gemini-validation.json'
    diagnostic.write_text(json.dumps(report,ensure_ascii=False,indent=2));diagnostic.chmod(0o600)
    print('Gemini validation failed: HTTP '+str(report['http_status'])+' / '+report['google_status'])
    print(report['message'])
    if report.get('retry_after'):print('Retry-After: '+report['retry_after'])
    print('No translation schedule was enabled. Candidate credentials are saved root-only for retry.')
    sys.exit(1)
except Exception as e:
    print('Gemini validation failed ('+type(e).__name__+'); no translation schedule was enabled.')
    print('Candidate credentials saved root-only; retry does not require re-entering the key.')
    sys.exit(1)
values={'GEMINI_API_KEY':key,'GEMINI_MODEL':model,'PUBLISH_MODE':'local','MAX_PER_CYCLE':'100','MAX_RSS_ITEMS':'100'}
if any('\n' in x or '\r' in x for x in values.values()):sys.exit('Invalid configuration value')
os.umask(0o077)
envfile.write_text(''.join(k+'='+v+'\n' for k,v in values.items()));envfile.chmod(0o600)
pendingfile.unlink(missing_ok=True)
print('Gemini credentials validated and saved privately. No host receiver is needed in research v3.')
if '--activate' not in sys.argv:
    print('Run configure-research.py --activate to switch from capture-only to translation + capture.');sys.exit(0)
subprocess.run(['systemctl','stop','zohurnews-capture.timer','zohurnews-capture.service'],check=True)
try:
    subprocess.run(['systemctl','start','zohurnews-research.service'],check=True)
except subprocess.CalledProcessError:
    subprocess.run(['systemctl','enable','--now','zohurnews-capture.timer'])
    sys.exit('Translation cycle failed; capture-only schedule restored.')
subprocess.run(['systemctl','disable','zohurnews-capture.timer'],check=True)
subprocess.run(['systemctl','enable','--now','zohurnews-research.timer','zohurnews-backup.timer'],check=True)
print('First translation cycle completed; automatic research ingestion enabled.')
