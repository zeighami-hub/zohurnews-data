import unittest,importlib.util,io
from openpyxl import load_workbook
spec=importlib.util.spec_from_file_location('render_export','research/render-export.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
class TestExport(unittest.TestCase):
 def sample(self):
  return dict(format='xlsx',kind='selected',generated_at='2026-11-08T12:00:00Z',filters={'q':'ایران'},total=1,returned=1,truncated=False,articles=[dict(id='a',source_id='irna',title_original='=1+1',title_fa='خبر فارسی ایران',lead='<script>unsafe</script>',text_original='متن اصلی خبر',source_categories=['اقتصاد'],url='https://example.com')])
 def test_xlsx_is_real_rtl_workbook_with_safe_text(self):
  b=r.spreadsheet(self.sample());self.assertEqual(b[:2],b'PK');w=load_workbook(io.BytesIO(b));s=w['اخبار'];self.assertTrue(s.sheet_view.rightToLeft);self.assertEqual(s['C2'].value,'=1+1');self.assertEqual(s['C2'].data_type,'s');self.assertEqual(s['D2'].value,'خبر فارسی ایران');self.assertIn('گزارش',w.sheetnames)
 def test_pdf_is_embedded_text_document(self):
  b=r.pdf(self.sample());self.assertEqual(b[:5],b'%PDF-');self.assertGreater(len(b),4000);self.assertIn(b'/Font',b)
if __name__=='__main__':unittest.main()
