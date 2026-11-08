import sys,json,io,html,datetime,os
os.environ.setdefault('XDG_CACHE_HOME','/tmp/zohurnews-cache');os.makedirs(os.environ['XDG_CACHE_HOME'],exist_ok=True)
from zoneinfo import ZoneInfo
from openpyxl import Workbook
from openpyxl.cell import WriteOnlyCell
from openpyxl.styles import Font,Alignment,PatternFill
from openpyxl.worksheet.dimensions import ColumnDimension
from weasyprint import HTML

NAMES={'all_sources':'همهٔ رسانه‌ها','irna':'ایرنا','isna':'ایسنا','fars':'فارس','tass':'تاس','ap':'آسوشیتدپرس','mashregh':'مشرق','khabaronline':'خبرآنلاین','yjc':'باشگاه خبرنگاران','asriran':'عصر ایران','bbc':'بی‌بی‌سی','reuters':'رویترز','guardian':'گاردین','france24':'فرانس۲۴','aljazeera':'الجزیره','nytimes':'نیویورک تایمز','dw':'دویچه وله','rt':'آرتی','skynews':'اسکای نیوز','independent':'ایندیپندنت','economist':'اکونومیست','foreignpolicy':'فارن پالیسی','mehrnews':'مهر انگلیسی (آرشیوی)'}
CATS={'politics':'سیاست','economy':'اقتصاد','military':'نظامی','diplomacy':'دیپلماسی','society':'جامعه','technology':'فناوری','energy':'انرژی','environment':'محیط زیست','culture':'فرهنگ','unknown':'موضوع عمومی'}
TITLES={'archive':'آرشیو فیلترشده','media':'مقایسه رسانه‌ها','selected':'مقایسه خبرهای انتخاب‌شده','dossier':'پرونده خبر'}
def clean(v):
 if v is None:return ''
 if isinstance(v,(dict,list)):v=json.dumps(v,ensure_ascii=False)
 if isinstance(v,str):return ''.join(c for c in v if ord(c)>=32 or c in '\n\t')[:32700]
 return v
def source(a):return NAMES.get(a.get('source_id') or a.get('id'),a.get('source_id') or a.get('id',''))
def tables(d):
 a=d.get('articles',[]);s=d.get('sources',[]);result=[]
 if a:result.append(('اخبار',['شناسه','رسانه','تیتر اصلی','تیتر فارسی','انتشار اعلامی منبع (ISO)','اولین مشاهده (ISO)','دسته','خلاصه اصلی','لید فارسی','نشانی منبع','زبان','وضعیت ترجمه','برچسب ناشر'],[[x.get('id'),source(x),x.get('title_original'),x.get('title_fa'),x.get('published_at'),x.get('first_seen_at'),CATS.get(x.get('category'),x.get('category')),x.get('text_original'),x.get('lead'),x.get('url'),x.get('lang'),x.get('translation_status'),x.get('source_categories')] for x in a]))
 if s:result.append(('رسانه‌ها',['رسانه','تعداد خبر','سهم درصد','دارای زمان انتشار','دارای خلاصه اصلی','منتظر ترجمه','قدیمی‌ترین انتشار (ISO)','تازه‌ترین انتشار (ISO)','فاصله از نخستین زمان (دقیقه)'],[[source(x),x.get('count'),x.get('share_percent'),x.get('published_known'),x.get('original_excerpt'),x.get('translation_pending'),x.get('first_published'),x.get('last_published'),x.get('relative_minutes')] for x in s]))
 if d.get('categories'):result.append(('موضوع‌ها',['موضوع','تعداد'],[[CATS.get(x.get('id'),x.get('id')),x.get('count')] for x in d['categories']]))
 if d.get('days'):result.append(('روند روزانه',['روز میلادی UTC','رسانه','تعداد'],[[x.get('day'),source(x),x.get('count')] for x in d['days']]))
 if d.get('versions'):result.append(('نسخه‌های ذخیره‌شده',['زمان ثبت (ISO)','هش محتوا'],[[x.get('recorded_at'),x.get('content_hash')] for x in d['versions']]))
 if d.get('evidence'):result.append(('شواهد نگارش',['شناسه خبر','رسانه','نشانه','شاهد اصلی','روش'],[[x.get('article_id'),source(x),x.get('name'),x.get('evidence'),x.get('method')] for x in d['evidence']]))
 for key,title in [('coverage','پوشش مرتبط'),('history','سابقه موضوع')]:
  if d.get(key):result.append((title,['شناسه','رسانه','تیتر','انتشار اعلامی (ISO)','شباهت تیتر','واژه‌های مشترک','نشانی منبع'],[[x.get('id'),source(x),x.get('title_fa') or x.get('title_original'),x.get('published_at'),x.get('similarity'),x.get('shared_terms'),x.get('url')] for x in d[key]]))
 return result
def filter_rows(d):
 labels={'q':'جستجو','source':'رسانه','sources':'رسانه‌ها','category':'دسته','tag':'برچسب فرعی','from':'از زمان (ISO)','to':'تا زمان (ISO)','date_basis':'مبنای تاریخ','selection_ids':'شناسه خبرهای انتخاب‌شده'}
 rows=[]
 for key,label in labels.items():
  value=d.get('filters',{}).get(key)
  if not value:continue
  if key=='source':value=NAMES.get(value,value)
  if key=='sources':value='، '.join(NAMES.get(x,x) for x in str(value).split(','))
  if key in ['category','tag']:value=CATS.get(value,value)
  if key=='selection_ids':value=' / '.join(value)
  rows.append([label,value])
 return rows
def metadata(d):
 stamp=datetime.datetime.fromisoformat(d['generated_at'].replace('Z','+00:00')).astimezone(ZoneInfo('Asia/Tehran')).isoformat(timespec='seconds')
 return [['عنوان','ظهورنیوز — '+TITLES[d['kind']]],['زمان ساخت (تهران)',stamp],['تعداد مجموعه',d['total']],['تعداد ردیف‌های جدول اصلی',d['returned']],['خروجی محدود شده','بله؛ بازه را کوچک‌تر کنید' if d.get('truncated') else 'خیر'],['دامنه متن','تیتر و خلاصه ذخیره‌شده؛ متن کامل ناشر تضمین نشده است.'],['تقدم انتشار','زمان اعلامی در داده‌های موجود؛ اثبات اولین انتشار در اینترنت نیست.'],['مبنای آمار','رکوردهای ذخیره‌شده و فیلترشده، نه کل خروجی ناشران.']]+filter_rows(d)
def spreadsheet(d):
 wb=Workbook(write_only=True)
 for title,heads,rows in [('گزارش',['مشخصه','مقدار'],metadata(d))]+tables(d):
  ws=wb.create_sheet(title);ws.sheet_view.rightToLeft=True;ws.freeze_panes='A2'
  for i in range(1,len(heads)+1):ws.column_dimensions[__import__('openpyxl').utils.get_column_letter(i)].width=38 if i>1 else 26
  def cells(values,header=False):
   out=[]
   for value in values:
    v=clean(value);c=WriteOnlyCell(ws,value=v)
    if isinstance(v,str):c.data_type='s'
    elif isinstance(v,float):c.number_format='0.00'
    c.alignment=Alignment(horizontal='right',vertical='top',wrap_text=True)
    c.font=Font(name='DejaVu Sans',size=11,bold=header,color='FFFFFF' if header else '172033')
    if header:c.fill=PatternFill('solid',fgColor='233A55')
    out.append(c)
   return out
  ws.append(cells(heads,True))
  for row in rows:ws.append(cells(row))
  ws.auto_filter.ref='A1:'+__import__('openpyxl').utils.get_column_letter(len(heads))+str(len(rows)+1)
 out=io.BytesIO();wb.save(out);return out.getvalue()
def esc(v):return html.escape(str(clean(v)))
def ltr(v):return '<span dir="ltr" style="display:inline-block">'+esc(v)+'</span>'
def table(title,heads,rows,limit=200):
 note='' if len(rows)<=limit else '<p>این جدول در PDF به '+str(limit)+' ردیف از '+str(len(rows))+' محدود شده است؛ جدول کامل در اکسل موجود است.</p>'
 return '<h2>'+esc(title)+'</h2>'+note+'<table><thead><tr>'+''.join('<th>'+esc(x)+'</th>' for x in heads)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td dir="auto">'+esc(v)+'</td>' for v in row)+'</tr>' for row in rows[:limit])+'</tbody></table>'
def pdf(d):
 parts=['<h1>ظهورنیوز — '+TITLES[d['kind']]+'</h1>',table('دامنه گزارش',['مشخصه','مقدار'],metadata(d))]
 if d.get('articles'):
  if d['kind']=='archive':
   parts.append(table('خبرها',['رسانه','تیتر','انتشار اعلامی','خلاصه ذخیره‌شده'],[[source(a),a.get('title_fa') or a.get('title_original'),a.get('published_at'),(a.get('lead') or a.get('text_original') or '')[:320]] for a in d['articles']]))
  else:
   for a in d['articles']:
    parts+=['<h2>'+esc(source(a))+' — '+esc(a.get('title_fa') or a.get('title_original'))+'</h2>','<p>انتشار اعلامی: '+ltr(a.get('published_at'))+'</p>','<h3>متن اصلی ذخیره‌شده</h3><p dir="auto">'+esc(a.get('title_original'))+'</p><p dir="auto">'+esc(a.get('text_original'))+'</p>','<h3>ترجمه / لید</h3><p>'+esc(a.get('lead'))+'</p>','<p>منبع: '+ltr(a.get('url'))+'</p>']
 for title,heads,rows in tables(d):
  if title=='اخبار':continue
  parts.append(table(title,heads,rows))
 style='''@page{size:A4 landscape;margin:14mm;@bottom-left{content:counter(page) " / " counter(pages);font-family:"DejaVu Sans";font-size:9px}}body{font-family:"DejaVu Sans";direction:rtl;font-size:10px;color:#172033}h1{font-size:20px}h2{font-size:14px;margin-top:20px;break-after:avoid}h3{font-size:12px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #bdc8d4;padding:6px;text-align:right;vertical-align:top;overflow-wrap:anywhere}th{background:#233a55;color:white}thead{display:table-header-group}tr{break-inside:avoid}p{line-height:1.8;overflow-wrap:anywhere}'''
 def deny(url):raise ValueError('External resources disabled')
 return HTML(string='<html lang="fa" dir="rtl"><meta charset="utf-8"><style>'+style+'</style><body>'+''.join(parts)+'</body></html>',url_fetcher=deny).write_pdf()
if __name__=='__main__':
 data=json.load(sys.stdin);sys.stdout.buffer.write(spreadsheet(data) if data['format']=='xlsx' else pdf(data))
