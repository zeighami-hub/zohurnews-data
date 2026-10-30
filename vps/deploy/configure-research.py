#!/usr/bin/env python3
"""Run interactively on the VPS. Credentials never enter shell history or output."""
import os,pathlib,secrets,getpass,json,urllib.request,urllib.error,urllib.parse,hashlib,hmac,time,subprocess,sys
root=pathlib.Path('/opt/zohurnews');private=root/'private';private.mkdir(mode=0o700,exist_ok=True)
envfile=private/'worker.env'
existing={}
if envfile.exists():
    existing=dict(line.split('=',1) for line in envfile.read_text().splitlines() if '=' in line and not line.startswith('#'))
key=(existing.get('GEMINI_API_KEY','') if '--activate' in sys.argv and existing else getpass.getpass('Gemini API key (blank keeps existing): ').strip() or existing.get('GEMINI_API_KEY',''))
if not key:sys.exit('A valid Gemini API key is required.')
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
    if '--activate' in sys.argv and existing.get('GEMINI_MODEL'):
        model=existing['GEMINI_MODEL']
        if not any(m['name']=='models/'+model for m in models):raise ValueError('Model no longer available')
    else:
        for i,m in enumerate(models):print(str(i+1)+': '+m['name'])
        selected=input('Select a model number: ').strip();model=models[int(selected)-1]['name'].removeprefix('models/')
        if int(selected)<1:raise ValueError()
    # An actual small inference verifies key, model access and JSON response support.
    probe=google('models/'+urllib.parse.quote(model,safe='')+':generateContent',{'contents':[{'parts':[{'text':'Return only the JSON object {"ok":true}.'}]}],'generationConfig':{'responseMimeType':'application/json'}})
    result=''.join(p.get('text','') for p in probe['candidates'][0]['content']['parts'])
    if json.loads(result).get('ok') is not True:raise ValueError('Unexpected probe')
except Exception as e:sys.exit('Gemini validation failed ('+type(e).__name__+'); no schedule was enabled.')
values={'GEMINI_API_KEY':key,'GEMINI_MODEL':model,'PUBLISH_MODE':'local','MAX_PER_CYCLE':'100','MAX_RSS_ITEMS':'100'}
if any('\n' in x or '\r' in x for x in values.values()):sys.exit('Invalid configuration value')
os.umask(0o077)
envfile.write_text(''.join(k+'='+v+'\n' for k,v in values.items()));envfile.chmod(0o600)
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
