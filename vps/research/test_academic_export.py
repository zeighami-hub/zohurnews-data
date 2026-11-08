import unittest,subprocess,json,io,zipfile,csv,pathlib,importlib.util
from openpyxl import load_workbook
ROOT=pathlib.Path(__file__).parent
class Exports(unittest.TestCase):
 def data(self):
  return {'project':{'title':'پژوهش اقناع خبری'},'generated_at':'2026-11-08T12:00:00Z','method':'academic-1.0.0','note':'داده آزمون، نه نتیجه پژوهشی','tables':[{'name':'گزارش','columns':['عنوان','مقدار'],'rows':[['متن فارسی','شاهد پژوهشی'],['فرمول','=1+1']]}],'items':[{'id':'test-item','article_id':'abc','snapshot':{'url':'https://example.com/news','source_id':'irna','title_original':'تیتر، با نقل "قول" و خط\nبعد'}}],'books':[{'version':2,'status':'approved','data':{'variables':[{'id':'tone','label':'بار ارزشی','type':'categorical','level':'nominal','values':[{'value':1,'label':'مثبت'},{'value':2,'label':'منفی'}]},{'id':'comment','label':'توضیح','type':'text','level':'nominal','values':[]}]}}],'codingRows':[{'version':2,'batch_id':'batch','item_id':'test-item','coder_id':'coder','status':'confirmed','data':{'values':{'tone':1,'comment':'متن فارسی با ویرگول، و "نقل قول"\nخط دوم'}}}]}
 def render(self,fmt):
  d={**self.data(),'format':fmt};return subprocess.run(['python3',str(ROOT/'academic-render.py')],input=json.dumps(d,ensure_ascii=False).encode(),capture_output=True,check=True).stdout
 def test_xlsx_pdf(self):
  data=self.render('xlsx');w=load_workbook(io.BytesIO(data));s=w.worksheets[0];self.assertTrue(s.sheet_view.rightToLeft);self.assertEqual(s['B3'].value,'=1+1');self.assertEqual(s['B3'].data_type,'s');self.assertTrue(self.render('pdf').startswith(b'%PDF'))
 def test_csv_syntax_zip(self):
  data=self.render('csv').decode('utf-8-sig');rows=list(csv.reader(io.StringIO(data)));self.assertEqual(len(rows),2);self.assertEqual(rows[0][-2:],['v_tone','v_comment']);self.assertEqual(rows[1][-2],'1');self.assertIn('\n',rows[1][-1]);syntax=self.render('sps').decode('utf-8-sig');self.assertIn('v_tone F40.10',syntax);self.assertIn("1 'مثبت'",syntax);self.assertIn('/FIRSTCASE=2',syntax);self.assertIn('v_comment A32767',syntax);self.assertNotIn('SAVE OUTFILE',syntax)
  with zipfile.ZipFile(io.BytesIO(self.render('zip'))) as z:
   self.assertEqual(z.read('academic.csv').decode('utf-8-sig'),data);self.assertIn('codebook-v2/academic.sps',z.namelist());self.assertEqual(json.loads(z.read('research.json'))['project']['title'],'پژوهش اقناع خبری')
if __name__=='__main__':unittest.main()
