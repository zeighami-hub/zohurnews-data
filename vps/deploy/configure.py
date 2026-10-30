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
secret=existing.get('PUBLISH_SECRET') or secrets.token_hex(32)
values={'GEMINI_API_KEY':key,'GEMINI_MODEL':model,'PUBLISH_URL':'https://zohurnews.com/api/receive-news-v2.php','PUBLISH_SECRET':secret,'MAX_PER_CYCLE':'100'}
if any('\n' in x or '\r' in x for x in values.values()):sys.exit('Invalid configuration value')
os.umask(0o077)
envfile.write_text(''.join(k+'='+v+'\n' for k,v in values.items()));envfile.chmod(0o600)
config=private/'host-config.php';config.write_text("<?php\nreturn ['publish_secret' => '"+secret+"'];\n");config.chmod(0o600)
print('Credentials validated and saved. Upload private/host-config.php to ../.zohur-private/config.php outside public_html.')
if '--activate' not in sys.argv:
    print('After installing the host files, rerun with --activate to check the receiver and enable the schedule.');sys.exit(0)
body=b'{"schema":2,"probe":true}';stamp=str(int(time.time()));sig=hmac.new(secret.encode(),stamp.encode()+b'.'+body,hashlib.sha256).hexdigest()
try:
    req=urllib.request.Request(values['PUBLISH_URL'],data=body,headers={'Content-Type':'application/json','X-Zohur-Timestamp':stamp,'X-Zohur-Signature':sig})
    with urllib.request.urlopen(req,timeout=30) as r:ack=json.load(r)
    if ack.get('status')!='ready' or ack.get('schema')!=2:raise ValueError()
except Exception as e:sys.exit('Host receiver validation failed ('+type(e).__name__+'); schedule remains disabled.')
subprocess.run(['systemctl','start','zohurnews.service'],check=True)
subprocess.run(['systemctl','enable','--now','zohurnews.timer','zohurnews-backup.timer'],check=True)
print('First live publication completed and schedule enabled. Verify the public generated_at timestamp.')
