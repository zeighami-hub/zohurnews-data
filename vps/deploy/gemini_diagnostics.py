"""Bounded, credential-redacted provider diagnostics; never log headers or request bodies."""
import json,re,datetime
def describe_http_error(error,key,stage,model):
    raw=error.read(32768).decode('utf8','replace')
    try:
        payload=json.loads(raw).get('error',{})
        message=str(payload.get('message','Provider request failed'))
        status=str(payload.get('status','UNKNOWN'))
    except (ValueError,AttributeError):
        message='Provider returned a non-JSON error; raw response suppressed.'
        status='UNKNOWN'
    def clean(value):
        text=str(value)
        if key:text=text.replace(key,'[REDACTED]')
        text=re.sub(r'AIza[0-9A-Za-z_-]{20,}','[REDACTED]',text)
        text=re.sub(r'(?i)([?&](?:key|api_key|token)=)[^& ]+',lambda m:m.group(1)+'[REDACTED]',text)
        return text[:1600]
    retry=error.headers.get('Retry-After') if error.headers else None
    return {'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'stage':stage,'model':clean(model),'http_status':error.code,'google_status':clean(status),'message':clean(message),'retry_after':retry if retry and re.fullmatch(r'[0-9]{1,6}',retry) else None}
