"""Research documents, using the existing Persian PDF/font and safe XLSX helpers."""
import sys,json,io,csv,zipfile,datetime
import importlib.util,pathlib
_spec=importlib.util.spec_from_file_location('zohur_render_export',pathlib.Path(__file__).with_name('render-export.py'))
_helper=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(_helper)
clean,esc,table=_helper.clean,_helper.esc,_helper.table
from openpyxl import Workbook
from openpyxl.cell import WriteOnlyCell
from openpyxl.styles import Font,Alignment,PatternFill
from openpyxl.utils import get_column_letter
from weasyprint import HTML

def xlsx(d):
 w=Workbook(write_only=True)
 for i,t in enumerate(d['tables']):
  s=w.create_sheet(str(i+1)+' '+t['name'][:26]);s.sheet_view.rightToLeft=True;s.freeze_panes='A2'
  for n in range(len(t['columns'])):s.column_dimensions[get_column_letter(n+1)].width=32
  for ri,row in enumerate([t['columns']]+t['rows']):
   cells=[]
   for val in row:
    v=clean(val);c=WriteOnlyCell(s,value=v)
    if isinstance(v,str):c.data_type='s'
    c.alignment=Alignment(horizontal='right',vertical='top',wrap_text=True)
    c.font=Font(name='DejaVu Sans',size=10,bold=ri==0)
    if ri==0:c.fill=PatternFill('solid',fgColor='D3E0EE')
    cells.append(c)
   s.append(cells)
  s.auto_filter.ref='A1:'+get_column_letter(len(t['columns']))+str(len(t['rows'])+1)
 out=io.BytesIO();w.save(out);return out.getvalue()

def pdf(d):
 # Each table discloses truncation; full data is in XLSX/JSON/ZIP.
 parts=['<h1>پژوهش دانشگاهی — '+esc(d['project']['title'])+'</h1><p>'+esc(d['note'])+'</p>']
 for t in d['tables']:
  rows=t['rows'];cols=t['columns']
  # Wide raw/coding tables are rendered as per-record blocks so Persian remains readable.
  if len(cols)>8:
   parts.append('<h2>'+esc(t['name'])+'</h2>')
   if len(rows)>200:parts.append('<p>PDF شامل ۲۰۰ ردیف از '+str(len(rows))+' است؛ داده کامل در اکسل و بسته خروجی موجود است.</p>')
   for row in rows[:200]:parts.append(table('', ['مشخصه','مقدار'],list(zip(cols,row)),200))
  else:parts.append(table(t['name'],cols,rows,200))
 css='''@page{size:A4 landscape;margin:14mm;@bottom-left{content:counter(page);font-family:"DejaVu Sans"}}body{font-family:"DejaVu Sans";direction:rtl;font-size:10px;color:#172033}h1{font-size:20px}h2{font-size:14px;break-after:avoid}table{width:100%;border-collapse:collapse;table-layout:fixed;margin:12px 0}td,th{border:1px solid #bdc8d4;padding:6px;text-align:right;vertical-align:top;overflow-wrap:anywhere}th{background:#e0e9f3}thead{display:table-header-group}tr{break-inside:avoid}p{line-height:1.8}'''
 def deny(url):raise ValueError('External resources disabled')
 return HTML(string='<html lang="fa" dir="rtl"><meta charset="utf-8"><style>'+css+'</style><body>'+''.join(parts)+'</body></html>',url_fetcher=deny).write_pdf()

BASE=[('item_id','A36'),('article_id','A64'),('source_id','A100'),('news_url','A2048'),('title','A2000'),('coder_id','A36'),('batch_id','A36'),('book_ver','F8.0'),('coding_status','A20')]
def flat(d):
 # Export each codebook version separately in ZIP; standalone CSV uses newest approved version.
 books=d['books'];book=next((x for x in reversed(books) if x['status']=='approved'),books[-1]);variables=book['data']['variables']
 heads=[x[0] for x in BASE]+['v_'+v['id'] for v in variables];items={x['id']:x for x in d['items']};rows=[]
 for c in d['codingRows']:
  if c['version']!=book['version']:continue
  it=items[c['item_id']];a=it['snapshot']
  rows.append([it['id'],it['article_id'],a.get('source_id'),a.get('url'),a.get('title_fa') or a.get('title_original'),c['coder_id'],c['batch_id'],c['version'],c['status']]+[c['data']['values'].get(v['id']) for v in variables])
 if not rows:
  for it in d['items']:
   a=it['snapshot'];rows.append([it['id'],it['article_id'],a.get('source_id'),a.get('url'),a.get('title_fa') or a.get('title_original'),'','',book['version'],'not_coded']+[None]*len(variables))
 return book,heads,rows
def csv_bytes(d):
 _,heads,rows=flat(d);s=io.StringIO(newline='');w=csv.writer(s,lineterminator='\r\n',quoting=csv.QUOTE_ALL);w.writerow(heads)
 for row in rows:w.writerow(['' if v is None else v.encode('utf-8')[:32767].decode('utf-8','ignore') if isinstance(v,str) else v for v in row])
 return s.getvalue().encode('utf-8-sig')
def sps(d):
 b,_,_=flat(d);vv=b['data']['variables'];q=lambda x:"'"+str(x).replace("'","''").replace('\n',' ').replace('\r',' ')[:2000]+"'"
 s=['* ZohurNews academic-1.0.0. UTF-8. No SAV file is claimed.', '* Place this syntax beside academic.csv; set the working directory to this folder.', '* Empty numeric cells are SYSMIS. Empty strings mean missing text.', '* One row per coder/item/batch; repeated coding rounds are not independent cases.', '* Codebook version '+str(b['version'])+'. Other versions are separate files in the ZIP.', 'SET UNICODE=ON.', "GET DATA /TYPE=TXT /FILE='academic.csv' /ENCODING='UTF8'", "/ARRANGEMENT=DELIMITED /DELCASE=LINE /DELIMITERS=',' /QUALIFIER='\"' /FIRSTCASE=2 /IMPORTCASE=ALL /VARIABLES="]
 fields=BASE+ [('v_'+v['id'],'A32767' if v['type']=='text' else 'F40.10') for v in vv]
 s += [name+' '+fmt for name,fmt in fields];s[-1]+='.'
 for v in vv:
  name='v_'+v['id'];s.append('VARIABLE LABELS '+name+' '+q(v['label'])+'.')
  if v['type']=='categorical':s.append('VALUE LABELS '+name+' '+' '.join(str(x['value'])+' '+q(x['label']) for x in v['values'])+'.')
  level={'nominal':'NOMINAL','ordinal':'ORDINAL','interval':'SCALE','ratio':'SCALE'}[v['level']];s.append('VARIABLE LEVEL '+name+' ('+level+').')
 s.append('EXECUTE.');return ('\n'.join(s)+'\n').encode('utf-8-sig')
def bundle(d):
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
  z.writestr('academic.csv',csv_bytes(d));z.writestr('academic.sps',sps(d));z.writestr('research.json',json.dumps(d,ensure_ascii=False,indent=2));z.writestr('codebooks.json',json.dumps(d['books'],ensure_ascii=False,indent=2))
  for b in d['books']:
   sub={**d,'books':[b]};z.writestr('codebook-v'+str(b['version'])+'/academic.csv',csv_bytes(sub));z.writestr('codebook-v'+str(b['version'])+'/academic.sps',sps(sub))
  z.writestr('README.txt','ظهورنیوز ابزار گردآوری است، نه منبع علمی مستقل. فایل research.json شامل نسخه‌های ثابت، دفترچه‌ها، نمونه‌ها و کدهای قابل دسترسی است. CSV برای SPSS و UTF-8 است؛ فایل اکسل برای استفاده در صفحه‌گسترده مناسب‌تر است. هر ردیف CSV یک کدگذار/خبر/دور است. دوره‌های منتشرنشده پاسخ دیگران را آشکار نمی‌کنند. مقادیر خالی مفقودند و صفر معتبر است. فایل SAV تولید نشده است. برای اجرای Syntax پوشه کاری SPSS را پوشه فایل‌ها انتخاب کنید. خروجی CSV اصلی جدیدترین نسخه تأییدشده دفترچه است؛ نسخه‌های دیگر در پوشه جدا موجودند. PDF جدول‌های طولانی را با اعلام صریح محدود می‌کند.\n')
 return out.getvalue()
if __name__=='__main__':
 d=json.load(sys.stdin);fmt=d['format'];data=xlsx(d) if fmt=='xlsx' else pdf(d) if fmt=='pdf' else csv_bytes(d) if fmt=='csv' else sps(d) if fmt=='sps' else bundle(d) if fmt=='zip' else json.dumps(d,ensure_ascii=False,indent=2).encode('utf-8');sys.stdout.buffer.write(data)
