import ast,io,json,pathlib,tempfile,unittest,urllib.error
from email.message import Message
from gemini_diagnostics import describe_http_error
class Tests(unittest.TestCase):
 def test_quota_response_redacts_credentials(self):
  key='AIza'+'A'*30;h=Message();h['Retry-After']='60'
  data={'error':{'status':'RESOURCE_EXHAUSTED','message':'Quota exceeded '+key+' https://example.com/?key=opaque-secret&x=1'}}
  e=urllib.error.HTTPError('https://example.com',429,'quota',h,io.BytesIO(json.dumps(data).encode()))
  r=describe_http_error(e,key,'generation-probe','gemini-2.5-flash-lite')
  self.assertEqual(r['http_status'],429);self.assertEqual(r['retry_after'],'60');self.assertNotIn(key,json.dumps(r));self.assertNotIn('opaque-secret',json.dumps(r))
 def test_non_json_response_not_logged(self):
  e=urllib.error.HTTPError('https://example.com',403,'denied',{},io.BytesIO(b'<html>sensitive-value</html>'))
  self.assertNotIn('sensitive-value',json.dumps(describe_http_error(e,'','probe','model')))
 def test_pending_file_is_private_and_valid_env(self):
  p=pathlib.Path(__file__).with_name('configure-research.py');tree=ast.parse(p.read_text())
  functions=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in ['read_env','save_pending']]
  with tempfile.TemporaryDirectory()as d:
   ns={'private':pathlib.Path(d),'pendingfile':pathlib.Path(d)/'gemini-pending.env'};exec(compile(ast.Module(body=functions,type_ignores=[]),str(p),'exec'),ns)
   ns['save_pending']('test-key','gemini-2.5-flash-lite')
   f=pathlib.Path(d)/'gemini-pending.env'
   self.assertEqual(f.stat().st_mode&0o777,0o600)
   self.assertEqual(ns['read_env'](f),{'GEMINI_API_KEY':'test-key','GEMINI_MODEL':'gemini-2.5-flash-lite'})
   with self.assertRaises(ValueError):ns['save_pending']('bad'+chr(10)+'key')
if __name__=='__main__':unittest.main()
