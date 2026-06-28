const https = require('https');
const http = require('http');
const xml2js = require('xml2js');
const fs = require('fs');

const RSS_SOURCES = [
  // === منابع خارجی ===
  { id: "aljazeera",     name_en: "Al Jazeera",     name_fa: "الجزیره",        url: "https://www.aljazeera.com/xml/rss/all.xml", lang:"en" },
  { id: "france24",      name_en: "France 24",      name_fa: "فرانس ۲۴",      url: "https://www.france24.com/en/rss", lang:"en" },
  { id: "dw",            name_en: "DW",             name_fa: "دویچه‌وله",      url: "https://rss.dw.com/xml/rss-en-all", lang:"en" },
  { id: "guardian",      name_en: "The Guardian",   name_fa: "گاردین",         url: "https://www.theguardian.com/world/rss", lang:"en" },
  { id: "foreignpolicy", name_en: "Foreign Policy", name_fa: "فارن پالیسی",   url: "https://foreignpolicy.com/feed/", lang:"en" },
  { id: "skynews",       name_en: "Sky News",       name_fa: "اسکای‌نیوز",     url: "https://feeds.skynews.com/feeds/rss/world.xml", lang:"en" },
  { id: "bbc",           name_en: "BBC World",      name_fa: "بی‌بی‌سی",       url: "https://feeds.bbci.co.uk/news/world/rss.xml", lang:"en" },
  { id: "nytimes",       name_en: "NY Times",       name_fa: "نیویورک تایمز",  url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", lang:"en" },
  { id: "independent",   name_en: "Independent",    name_fa: "ایندیپندنت",     url: "https://www.independent.co.uk/rss", lang:"en" },
  { id: "economist",     name_en: "The Economist",  name_fa: "اکونومیست",      url: "https://www.economist.com/the-world-this-week/rss.xml", lang:"en" },
  { id: "rt",            name_en: "RT",             name_fa: "آر‌تی",           url: "https://www.rt.com/rss/news/", lang:"en" },
  { id: "xinhua",        name_en: "Xinhua",         name_fa: "شینهوا",         url: "http://www.xinhuanet.com/english/rss/worldrss.xml", lang:"en" },
  { id: "middleeasteye", name_en: "Middle East Eye",name_fa: "میدل ایست آی",  url: "https://www.middleeasteye.net/rss/section/news", lang:"en" },
  { id: "arabnews",      name_en: "Arab News",      name_fa: "عرب نیوز",       url: "https://www.arabnews.com/cat/3/rss.xml", lang:"en" },
  // === منابع ایرانی ===
  { id: "irna_fa",       name_en: "IRNA",           name_fa: "ایرنا",          url: "https://www.irna.ir/rss", lang:"fa" },
  { id: "irna_en",       name_en: "IRNA English",   name_fa: "ایرنا انگلیسی",  url: "https://en.irna.ir/rss", lang:"en" },
  { id: "mehrnews",      name_en: "Mehr News",      name_fa: "مهر",            url: "https://en.mehrnews.com/rss", lang:"en" },
  { id: "khabaronline",  name_en: "Khabar Online",  name_fa: "خبرآنلاین",      url: "https://www.khabaronline.ir/rss", lang:"fa" },
  { id: "mashregh",      name_en: "Mashregh News",  name_fa: "مشرق",           url: "https://www.mashreghnews.ir/rss", lang:"fa" },
  { id: "isna",          name_en: "ISNA",           name_fa: "ایسنا",          url: "https://www.isna.ir/rss", lang:"fa" },
  { id: "tabnak",        name_en: "Tabnak",         name_fa: "تابناک",         url: "https://www.tabnak.ir/rss", lang:"fa" },
];

// === کلمات کلیدی برای امتیازدهی ارتباط با ایران (بدون AI) ===
const IRAN_KEYWORDS = [
  'iran', 'tehran', 'persian', 'gulf', 'khamenei', 'pezeshkian', 'irgc',
  'sanction', 'nuclear deal', 'jcpoa', 'hormuz', 'farsi',
  'ایران', 'تهران', 'ایرانی', 'فارس', 'خلیج فارس', 'خامنه‌ای', 'پزشکیان',
  'سپاه', 'تحریم', 'برجام', 'هسته‌ای', 'هرمز'
];

const REGION_KEYWORDS = [
  { re: /israel|gaza|palestin|hamas|hezbollah|lebanon|syria|iraq|yemen|houthi/i, region: 'middleeast' },
  { re: /russia|moscow|putin|ukraine|kyiv/i, region: 'eurasia' },
  { re: /china|beijing|xinhua|taiwan/i, region: 'asia' },
  { re: /europe|eu |brussels|nato|france|germany|britain|uk /i, region: 'europe' },
  { re: /america|washington|biden|trump|usa|u\.s\./i, region: 'americas' },
  { re: /iran|tehran|persian/i, region: 'iran' },
];

const CATEGORY_KEYWORDS = [
  { re: /military|army|attack|strike|missile|war|troops|defense|weapon/i, category: 'military' },
  { re: /econom|market|trade|inflation|gdp|bank|currency|oil price/i, category: 'economy' },
  { re: /diplomat|summit|treaty|negotiat|talks|foreign minister|ambassador/i, category: 'diplomacy' },
  { re: /technology|ai |artificial intelligence|tech |startup|chip|cyber/i, category: 'technology' },
  { re: /climate|environment|pollution|emission|renewable/i, category: 'environment' },
  { re: /culture|film|music|art |festival|heritage/i, category: 'culture' },
  { re: /energy|gas |oil |petroleum|nuclear power|electricity/i, category: 'energy' },
  // اخبار اجتماعی/خدماتی/عمرانی محلی - باید قبل از fallback سیاسی چک شود، نه بعدش
  { re: /پل|جاده|آسفالت|بهسازی|تعمیر|راه روستایی|آبرسانی|فاضلاب|پارک|بوستان|مدرسه‌سازی|زیرساخت|عمران|شهرداری محلی|road repair|bridge|infrastructure|municipal|sewage|local council/i, category: 'society' },
  { re: /election|parliament|president|minister|government|policy|protest/i, category: 'politics' },
];

// کلمات نشانه‌ی اهمیت محلی/خدماتی پایین (نه ملی، نه بین‌المللی) - برای فیلتر اهمیت
const LOW_IMPORTANCE_KEYWORDS = [
  /\bپل\b|\bجاده\b|آسفالت|بهسازی|تعمیر.*محور|راه روستایی|آبرسانی روستا|فاضلاب شهر|پارک محل|بوستان محل|افتتاح.*روستا|شهرستان.*آغاز شد/i,
  /local council|municipal repair|village road|small town/i,
];

// آیا خبر نشانه‌های اهمیت ملی/بین‌المللی دارد؟ (برای جلوگیری از فیلتر نادرست خبرهای واقعاً مهم)
const NATIONAL_IMPORTANCE_KEYWORDS = [
  /رئیس‌جمهور|رهبر|وزیر|پارلمان|مجلس|سپاه|ارتش|تحریم|برجام|هسته‌ای|دیپلماسی|سفیر|نخست‌وزیر|بحران|جنگ|حمله|انفجار بزرگ/i,
  /president|prime minister|parliament|sanction|nuclear|military|crisis|diplomatic/i,
];

function fetchUrl(url, redirectCount) {
  redirectCount = redirectCount || 0;
  if (redirectCount > 5) return Promise.reject(new Error('too many redirects'));
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      timeout: 15000,
    };
    try {
      const req = lib.get(url, options, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303) {
          return fetchUrl(res.headers.location, redirectCount + 1).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
        let data = '';
        res.setEncoding('utf8');
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.setTimeout(15000);
    } catch(e) { reject(e); }
  });
}

// === امتیازدهی ارتباط با ایران (بدون AI) ===
function scoreIranRelevance(text) {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of IRAN_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) score += 1;
  }
  return score;
}

// === تشخیص دسته‌بندی بر اساس کلمات کلیدی (بدون AI) ===
function detectCategory(text) {
  for (const item of CATEGORY_KEYWORDS) {
    if (item.re.test(text)) return item.category;
  }
  return 'politics'; // پیش‌فرض
}

// === تشخیص منطقه بر اساس کلمات کلیدی (بدون AI) ===
function detectRegion(text) {
  for (const item of REGION_KEYWORDS) {
    if (item.re.test(text)) return item.region;
  }
  return 'global';
}

// === تشخیص اخبار کم‌اهمیت محلی/خدماتی (بدون AI) ===
// منطق: اگر نشانه‌ی اهمیت ملی/بین‌المللی دارد، همیشه مهم تلقی می‌شود (حتی اگر کلمه محلی هم داشته باشد)
// در غیر این صورت، اگر فقط نشانه‌ی محلی/خدماتی کوچک دارد، کم‌اهمیت تلقی می‌شود
function isLowImportance(text) {
  const hasNationalSignal = NATIONAL_IMPORTANCE_KEYWORDS.some(re => re.test(text));
  if (hasNationalSignal) return false;
  return LOW_IMPORTANCE_KEYWORDS.some(re => re.test(text));
}

async function fetchRSS(source) {
  try {
    const xml = await fetchUrl(source.url);
    if (process.env.DEBUG_RSS) {
      console.log('DEBUG ' + source.id + ' raw length: ' + xml.length);
      console.log('DEBUG ' + source.id + ' first 200 chars: ' + xml.slice(0, 200));
    }
    const cleanXml = xml
      .replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    const parsed = await xml2js.parseStringPromise(cleanXml, { explicitArray: false });
    if (process.env.DEBUG_RSS) {
      console.log('DEBUG ' + source.id + ' parsed top keys: ' + Object.keys(parsed || {}).join(','));
    }
    const items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
    const arr = Array.isArray(items) ? items : [items];

    // واکشی همه آیتم‌های فید (بدون محدودیت ۸ تا) - معمولا فیدها ۲۰-۵۰ آیتم دارند
    const seenInThisSource = new Set();
    const articles = arr.map((item, i) => {
      var link = '';
      if (typeof item.link === 'string') link = item.link;
      else if (item.link?.href) link = item.link.href;
      else if (item.link?._) link = item.link._;
      else if (Array.isArray(item.link)) link = item.link[0]?.href || item.link[0] || '';

      var title = item.title?._ || item.title || '';
      var desc = item.description?._ || item.description || item.summary?._ || item.summary || '';
      if (typeof title === 'object') title = JSON.stringify(title);
      if (typeof desc === 'object') desc = JSON.stringify(desc);
      title = String(title).replace(/<[^>]*>/g, '').trim();
      desc = String(desc).replace(/<[^>]*>/g, '').trim().slice(0, 400);

      const fullText = title + ' ' + desc;
      const pubDate = item.pubDate || item.published || new Date().toISOString();

      return {
        id: source.id + '_' + i,
        agencyId: source.id,
        title: title,
        description: desc,
        sourceUrl: link,
        pubDate: pubDate,
        lang: source.lang || 'en',
        // === فیلدهای محاسبه‌شده بدون AI (صرفه‌جویی توکن) ===
        iranScore: scoreIranRelevance(fullText),
        category: detectCategory(fullText),
        region: detectRegion(fullText),
        lowImportance: isLowImportance(fullText),
      };
    }).filter(a => {
      if (!a.title || a.title.length <= 3) return false;
      // حذف تکراری فقط در همین خبرگزاری (نه بین خبرگزاری‌ها)
      const dupKey = a.sourceUrl || a.title;
      if (seenInThisSource.has(dupKey)) return false;
      seenInThisSource.add(dupKey);
      // حذف اخبار کم‌اهمیت محلی/خدماتی، مگر اینکه امتیاز ارتباط با ایران داشته باشند
      // (یعنی حتی یک خبر محلی کوچک اگر به موضوع ملی ایران مربوط باشد نگه داشته می‌شود)
      if (a.lowImportance && a.iranScore === 0) return false;
      return true;
    });

    console.log('✅ ' + source.id + ': ' + articles.length + ' articles (iran-relevant: ' + articles.filter(a=>a.iranScore>0).length + ')');
    return articles;
  } catch (e) {
    console.log('❌ ' + source.id + ': ' + e.message);
    return [];
  }
}

async function main() {
  console.log('Starting RSS fetch from ' + RSS_SOURCES.length + ' sources (full feed, no per-source limit)...');
  const results = await Promise.all(RSS_SOURCES.map(fetchRSS));
  const allArticles = results.flat();

  // مرتب‌سازی: ابتدا خبرهای مرتبط با ایران (امتیاز بالاتر اول)، سپس بر اساس تاریخ
  allArticles.sort((a, b) => {
    if (b.iranScore !== a.iranScore) return b.iranScore - a.iranScore;
    return new Date(b.pubDate) - new Date(a.pubDate);
  });

  console.log('Total: ' + allArticles.length + ' articles, ' + allArticles.filter(a=>a.iranScore>0).length + ' Iran-relevant');

  const payload = {
    fetched_at: new Date().toISOString(),
    total: allArticles.length,
    agencies: RSS_SOURCES.map(s => ({ id: s.id, name_en: s.name_en, name_fa: s.name_fa })),
    articles: allArticles,
  };
  fs.writeFileSync('raw_news.json', JSON.stringify(payload, null, 2));
  console.log('Saved raw_news.json with ' + allArticles.length + ' articles');
}

main().catch(console.error);
