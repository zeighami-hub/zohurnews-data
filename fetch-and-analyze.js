// ============================================================
// اسکریپت اصلی چرخه‌ی تحلیل خبر - نسخه‌ی بدون گوگل‌کلود
// اجرا می‌شود داخل GitHub Actions (نه Cloud Run)
// ذخیره‌سازی کش/صف: Upstash Redis (نه گیت‌هاب)
// تحلیل هوش مصنوعی: Gemini API با کلید ساده (نه Vertex AI)
// آرشیو: همچنان روی گیت‌هاب (Append-Only، بدون تداخل)
// ============================================================

const https = require('https');
const http = require('http');
const xml2js = require('xml2js');
const crypto = require('crypto');
const { Redis } = require('@upstash/redis');
const { Octokit } = require('@octokit/rest');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'zeighami-hub';
const GITHUB_REPO = process.env.GITHUB_REPO || 'zohurnews-data';
const MAX_AGE_HOURS = 24;
const REJECTED_RETENTION_HOURS = 24;

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
const octokit = new Octokit({ auth: GITHUB_TOKEN });

// ============================================================
// === بخش ۱: واکشی RSS (بدون تغییر نسبت به نسخه‌ی قبلی) ===
// ============================================================

const RSS_SOURCES = [
  { id: "aljazeera",     name_en: "Al Jazeera",     name_fa: "الجزیره",        url: "https://www.aljazeera.com/xml/rss/all.xml", lang:"en" },
  { id: "france24",      name_en: "France 24",      name_fa: "فرانس ۲۴",      url: "https://www.france24.com/en/rss", lang:"en" },
  { id: "dw",            name_en: "DW",             name_fa: "دویچه‌وله",      url: "https://rss.dw.com/xml/rss-en-all", lang:"en" },
  { id: "guardian",      name_en: "The Guardian",   name_fa: "گاردین",         url: "https://www.theguardian.com/world/rss", lang:"en" },
  { id: "foreignpolicy", name_en: "Foreign Policy", name_fa: "فارن پالیسی",   url: "https://foreignpolicy.com/feed/", lang:"en" },
  { id: "skynews",       name_en: "Sky News",       name_fa: "اسکای‌نیوز",     url: "https://feeds.skynews.com/feeds/rss/world.xml", lang:"en" },
  { id: "bbc",           name_en: "BBC World",      name_fa: "بی‌بی‌سی",       url: "https://feeds.bbci.co.uk/news/world/rss.xml", lang:"en" },
  { id: "nytimes",       name_en: "NY Times",       name_fa: "نیویورک تایمز",  url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", lang:"en" },
  { id: "independent",   name_en: "Independent",    name_fa: "ایندیپندنت",     url: "https://www.independent.co.uk/rss", lang:"en" },
  { id: "economist",     name_en: "The Economist",  name_fa: "اکونومیست",      url: "https://www.economist.com/international/rss.xml", lang:"en" },
  { id: "rt",            name_en: "RT",             name_fa: "آر‌تی",           url: "https://www.rt.com/rss/news/", lang:"en" },
  { id: "reuters",       name_en: "Reuters",        name_fa: "رویترز",         url: "https://news.google.com/rss/search?q=iran+site:reuters.com&hl=en&gl=US", lang:"en" },
  { id: "irna",          name_en: "IRNA",           name_fa: "ایرنا",          url: "https://www.irna.ir/rss", lang:"fa" },
  { id: "mehrnews",      name_en: "Mehr News",      name_fa: "مهر",            url: "https://en.mehrnews.com/rss", lang:"en" },
  { id: "khabaronline",  name_en: "Khabar Online",  name_fa: "خبرآنلاین",      url: "https://www.khabaronline.ir/rss", lang:"fa" },
  { id: "mashregh",      name_en: "Mashregh News",  name_fa: "مشرق",           url: "https://www.mashreghnews.ir/rss", lang:"fa" },
  { id: "isna",          name_en: "ISNA",           name_fa: "ایسنا",          url: "https://www.isna.ir/rss", lang:"fa" },
  { id: "yjc",           name_en: "YJC",            name_fa: "باشگاه خبرنگاران", url: "https://www.yjc.ir/fa/rss/allnews", lang:"fa" },
  { id: "asriran",       name_en: "Asr Iran",       name_fa: "عصر ایران",      url: "https://www.asriran.com/fa/rss/allnews", lang:"fa" },
];

const IRAN_KEYWORDS = [
  'iran', 'tehran', 'persian', 'gulf', 'khamenei', 'pezeshkian', 'irgc',
  'sanction', 'nuclear deal', 'jcpoa', 'hormuz', 'farsi',
  'ایران', 'تهران', 'ایرانی', 'فارس', 'خلیج فارس', 'خامنه‌ای', 'پزشکیان',
  'سپاه', 'تحریم', 'برجام', 'هسته‌ای', 'هرمز',
  'اصفهان', 'شیراز', 'مشهد', 'تبریز', 'قم', 'اهواز', 'کرج', 'یزد', 'کرمان',
  'بندرعباس', 'قشم', 'کیش', 'سیریک', 'زاهدان', 'رشت', 'ساری', 'گرگان',
  'همدان', 'اراک', 'ارومیه', 'زنجان', 'قزوین', 'کاشان', 'خرم‌آباد', 'بوشهر',
  'سنندج', 'بیرجند', 'بجنورد', 'ایلام', 'یاسوج', 'سمنان', 'شهرکرد',
  'خوزستان', 'آذربایجان', 'خراسان', 'سیستان', 'بلوچستان', 'هرمزگان', 'کردستان',
  'isfahan', 'shiraz', 'mashhad', 'tabriz', 'qom', 'ahvaz', 'karaj', 'kish',
  'bandar abbas', 'zahedan', 'khuzestan',
];

const IRANIAN_DOMESTIC_AGENCIES = new Set(['irna', 'mehrnews', 'khabaronline', 'mashregh', 'isna', 'yjc', 'asriran']);
const DOMESTIC_AGENCY_SCORE_BOOST = 2;

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
  { re: /پل|جاده|آسفالت|بهسازی|تعمیر|راه روستایی|آبرسانی|فاضلاب|پارک|بوستان|مدرسه‌سازی|زیرساخت|عمران|شهرداری محلی|road repair|bridge|infrastructure|municipal|sewage|local council/i, category: 'society' },
  { re: /election|parliament|president|minister|government|policy|protest/i, category: 'politics' },
];

const LOW_IMPORTANCE_KEYWORDS = [
  /\bپل\b|\bجاده\b|آسفالت|بهسازی|تعمیر.*محور|راه روستایی|آبرسانی روستا|فاضلاب شهر|پارک محل|بوستان محل|افتتاح.*روستا|شهرستان.*آغاز شد/i,
  /local council|municipal repair|village road|small town/i,
];

const NATIONAL_IMPORTANCE_KEYWORDS = [
  /رئیس‌جمهور|رهبر|وزیر|پارلمان|مجلس|سپاه|ارتش|تحریم|برجام|هسته‌ای|دیپلماسی|سفیر|نخست‌وزیر|بحران|جنگ|حمله|انفجار بزرگ/i,
  /president|prime minister|parliament|sanction|nuclear|military|crisis|diplomatic/i,
];

const UNSTABLE_URL_AGENCIES = new Set(["reuters"]);

function fetchUrl(url, redirectCount) {
  redirectCount = redirectCount || 0;
  if (redirectCount > 5) return Promise.reject(new Error('too many redirects'));
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('http://') ? http : https;
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
          // ریدایرکت ممکن است آدرس نسبی باشد (مثلاً "/rss") - باید نسبت به آدرس فعلی resolve شود
          let nextUrl = res.headers.location;
          try { nextUrl = new URL(nextUrl, url).toString(); } catch (e) { /* اگر resolve نشد، همان مقدار خام امتحان می‌شود */ }
          return fetchUrl(nextUrl, redirectCount + 1).then(resolve).catch(reject);
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
    } catch (e) { reject(e); }
  });
}

function scoreIranRelevance(text, agencyId) {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of IRAN_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) score += 1;
  }
  if (agencyId && IRANIAN_DOMESTIC_AGENCIES.has(agencyId)) score += DOMESTIC_AGENCY_SCORE_BOOST;
  return score;
}

function detectCategory(text) {
  for (const item of CATEGORY_KEYWORDS) if (item.re.test(text)) return item.category;
  return 'politics';
}

function detectRegion(text) {
  for (const item of REGION_KEYWORDS) if (item.re.test(text)) return item.region;
  return 'global';
}

function isLowImportance(text) {
  const hasNationalSignal = NATIONAL_IMPORTANCE_KEYWORDS.some(re => re.test(text));
  if (hasNationalSignal) return false;
  return LOW_IMPORTANCE_KEYWORDS.some(re => re.test(text));
}

// id پایدار بر اساس هش MD5 آدرس خبر - مستقل از ترتیب پردازش
// (برخلاف شماره‌ترتیب ساده که هر چرخه معنای متفاوتی داشت و باعث تداخل id بین خبرهای مختلف می‌شد)
function stableArticleId(agencyId, sourceUrl, fallbackTitle) {
  const base = sourceUrl || fallbackTitle || '';
  const hash = crypto.createHash('md5').update(base).digest('hex').slice(0, 10);
  return agencyId + '_' + hash;
}

async function fetchOneRSSSource(source) {
  try {
    const xml = await fetchUrl(source.url);
    const cleanXml = xml
      .replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    const parsed = await xml2js.parseStringPromise(cleanXml, { explicitArray: false });
    const items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
    let arr = Array.isArray(items) ? items : [items];
    arr = arr.slice(0, 20);

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
        id: stableArticleId(source.id, link, title),
        agencyId: source.id,
        title: title,
        description: desc,
        sourceUrl: link,
        pubDate: pubDate,
        lang: source.lang || 'en',
        iranScore: scoreIranRelevance(fullText, source.id),
        category: detectCategory(fullText),
        region: detectRegion(fullText),
        lowImportance: isLowImportance(fullText),
      };
    }).filter(a => {
      if (!a.title || a.title.length <= 3) return false;
      const dupKey = a.sourceUrl || a.title;
      if (seenInThisSource.has(dupKey)) return false;
      seenInThisSource.add(dupKey);
      return true;
    });

    console.log('✅ ' + source.id + ': ' + articles.length + ' articles (iran-relevant: ' + articles.filter(a => a.iranScore > 0).length + ')');
    return articles;
  } catch (e) {
    console.log('❌ ' + source.id + ': ' + e.message);
    return [];
  }
}

async function fetchAllRSS() {
  console.log('Fetching RSS from ' + RSS_SOURCES.length + ' sources...');
  const results = await Promise.all(RSS_SOURCES.map(fetchOneRSSSource));
  const allArticles = results.flat();
  allArticles.sort((a, b) => {
    if (b.iranScore !== a.iranScore) return b.iranScore - a.iranScore;
    return new Date(b.pubDate) - new Date(a.pubDate);
  });
  console.log('RSS fetch done: ' + allArticles.length + ' articles, ' + allArticles.filter(a => a.iranScore > 0).length + ' Iran-relevant');
  return { total: allArticles.length, agencies: RSS_SOURCES.map(s => ({ id: s.id, name_en: s.name_en, name_fa: s.name_fa })), articles: allArticles };
}

function formatPersianTime(pubDate) {
  try {
    const d = new Date(pubDate);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' }) +
      ' - ' + d.toLocaleDateString('fa-IR', { day: 'numeric', month: 'long', timeZone: 'Asia/Tehran' });
  } catch (e) { return null; }
}

// ============================================================
// === بخش ۲: تحلیل با Gemini API (کلید ساده، نه Vertex AI) ===
// ============================================================

async function analyzeWithGemini(articles) {
  const articlesText = articles.map(function (a, i) {
    var flagNote = a.lowImportance ? "[flagged:possibly-local-low-value]" : "";
    return "[" + i + "][" + a.agencyId + "][cat:" + a.category + "][region:" + a.region + "][lang:" + (a.lang || "en") + "]" + flagNote + " " + a.title + "\n" + String(a.description).slice(0, 250);
  }).join("\n\n");

  const prompt = "You are a news analysis system. Each item below is numbered in [brackets] like [3][agencyid]... - you MUST copy that exact same bracket number back in the \"index\" field of your output (as an integer) so your answer can be matched to the correct input item. Do not invent, skip, or reorder numbers - one output element per input item, each with its own correct index. The category, region, and lang for each item are already determined (shown in brackets) - keep category/region as-is unless clearly wrong. IMPORTANT: if lang is 'fa', the source text is ALREADY in Persian - do NOT re-translate it, just lightly clean up the existing Persian title/description into 'title_fa' and 'lead' (preserve the original wording and tone, only fix obvious typos or trim length, no creative rewriting). If lang is 'en' (or any non-Persian), translate naturally into Persian for 'title_fa' and 'lead'. SOME items carry a [flagged:possibly-local-low-value] marker - this is just a hint from a simple keyword filter, NOT a final decision. Read the full text and decide for yourself: if the item is genuinely a minor local/municipal/service story with no national or international significance (e.g. a small bridge repair in one town, a local park opening), set \"keep\":false. But if the flagged item actually concerns something nationally or internationally significant (e.g. an attack on infrastructure, a strike affecting a whole sector, a policy affecting many people) even if it shares some keywords with minor local news, set \"keep\":true - context matters more than keywords. Items WITHOUT the flag should almost always have \"keep\":true unless clearly trivial. CRITICAL for 'lead': this must be a FAITHFUL, NEUTRAL reflection of ONLY what the source text itself states - translated/lightly cleaned, never adding your own interpretation, conclusions, broader context, or 'why it matters' commentary that isn't explicitly in the source. Do not editorialize or introduce a new angle. For each news item return: {\"index\":<same bracket number from input, integer>,\"keep\":true/false,\"title_fa\":\"Persian title (translated if lang=en, lightly cleaned original if lang=fa)\",\"lead\":\"2-3 sentence FAITHFUL Persian summary, no added interpretation, see instructions above\",\"category\":\"keep from brackets unless wrong\",\"region\":\"keep from brackets unless wrong\",\"sentiment\":{\"positive\":0-100,\"neutral\":0-100,\"negative\":0-100}} Return ONLY a raw JSON array, no markdown. Do NOT include id, agencyId, sourceUrl or title fields - only index and the fields listed above.\n\nNews:\n" + articlesText;

  try {
    // gemini-2.5-flash برای کاربران جدید بسته شده (Google، تیر ۱۴۰۵) و تا مهر ۱۴۰۵ کلاً حذف می‌شود.
    // gemini-3.5-flash-lite: ارزان‌ترین/سریع‌ترین مدل نسل فعلی، مناسب طبقه‌بندی/ترجمه حجم بالا.
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=" + GEMINI_API_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // در نسل ۳ به‌جای thinkingBudget از thinkingLevel استفاده می‌شود؛
        // "minimal" برای کار طبقه‌بندی/ترجمه حجم بالا سریع‌ترین و ارزان‌ترین حالت است
        generationConfig: { thinkingConfig: { thinkingLevel: "minimal" } },
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    const text = data.candidates[0].content.parts[0].text;
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    const hasCorruption = function (item) {
      const fields = [item.title_fa, item.lead].join('');
      return fields.indexOf('\uFFFD') !== -1;
    };

    const kept = [];
    const rejected = [];
    const seenIndex = new Set();

    parsed.forEach(function (item) {
      const idx = item.index;
      // اعتبارسنجی سخت‌گیرانه: اگر index نامعتبر، خارج از محدوده یا تکراری بود، این آیتم نادیده گرفته می‌شود
      // (بهتر است یک خبر این چرخه از قلم بیفتد - چرخه بعد دوباره امتحان می‌شود - تا این‌که id اشتباه به خبر دیگری بچسبد)
      if (typeof idx !== 'number' || idx < 0 || idx >= articles.length || seenIndex.has(idx)) return;
      seenIndex.add(idx);
      const original = articles[idx];

      if (item.keep === false) {
        rejected.push({ sourceUrl: original.sourceUrl });
        return;
      }
      if (hasCorruption(item)) {
        rejected.push({ sourceUrl: original.sourceUrl });
        return;
      }
      // id، sourceUrl، agencyId و پابدیت همیشه از داده‌ی اصلی خودمان می‌آیند - هرگز از خروجی Gemini
      kept.push({
        id: original.id,
        agencyId: original.agencyId,
        title: original.title,
        title_fa: item.title_fa,
        lead: item.lead,
        category: item.category || original.category,
        region: item.region || original.region,
        sourceUrl: original.sourceUrl,
        pubDate: original.pubDate,
        time: formatPersianTime(original.pubDate) || '',
        iranScore: original.iranScore,
        sentiment: item.sentiment || { positive: 33, neutral: 34, negative: 33 },
      });
    });
    return { kept: kept, rejected: rejected };
  } catch (e) {
    console.error("Gemini API error: " + e.message);
    return { kept: [], rejected: [] };
  }
}

// ============================================================
// === بخش ۳: خواندن/نوشتن کش و صف در Upstash Redis ===
// ============================================================

async function fetchExistingCache() {
  try {
    const raw = await redis.get('news:cache');
    if (!raw) return { articles: [] };
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    console.log('No existing cache in Redis, starting fresh: ' + e.message);
    return { articles: [] };
  }
}

async function saveCache(payload) {
  await redis.set('news:cache', JSON.stringify(payload));
  console.log('news:cache saved - total: ' + payload.total);
}

// خواندن URLهای رد‌شده‌ی هنوز معتبر (۲۴ ساعت اخیر) از Sorted Set
// و هرس خودکار رکوردهای قدیمی‌تر - جایگزین آرایه‌ی rejected در فایل قدیمی
async function getValidRejectedUrls() {
  const cutoff = Date.now() - REJECTED_RETENTION_HOURS * 60 * 60 * 1000;
  await redis.zremrangebyscore('news:rejected', 0, cutoff);
  const members = await redis.zrange('news:rejected', 0, -1);
  return new Set(members);
}

async function addRejectedUrls(urls) {
  if (!urls || urls.length === 0) return;
  const now = Date.now();
  const uniqueUrls = [...new Set(urls.filter(Boolean))];
  if (uniqueUrls.length === 0) return;
  // فرمت درست @upstash/redis: آرایه‌ای از {score, member}، نه یک آبجکت ساده {member: score}
  const pairs = uniqueUrls.map(u => ({ score: now, member: u }));
  await redis.zadd('news:rejected', ...pairs);
}

// افزودن خبرهای تازه به صف انتشار (FIFO: تولیدکننده RPUSH می‌کند، مصرف‌کننده در فاز ۵ LPOP می‌کند)
async function pushToQueue(items) {
  if (!items || items.length === 0) return;
  const now = new Date().toISOString();
  const lightItems = items.map(a => JSON.stringify({
    id: a.id, agencyId: a.agencyId, title: a.title, title_fa: a.title_fa, lead: a.lead,
    sourceUrl: a.sourceUrl, iranScore: a.iranScore || 0, queued_at: now,
  }));
  await redis.rpush('news:queue', ...lightItems);
  console.log(lightItems.length + ' items pushed to news:queue');
}

// ============================================================
// === بخش ۴: ادغام/دیدوپلیکیت (بدون تغییر منطق) ===
// ============================================================

function dedupKeyFor(a) {
  if (UNSTABLE_URL_AGENCIES.has(a.agencyId)) return "title:" + (a.title || "").trim();
  return a.sourceUrl || a.title;
}

function mergeAndDedup(oldArticles, newArticles) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - MAX_AGE_HOURS * 60 * 60 * 1000);
  const seen = new Set();
  const merged = [];
  const expired = [];

  for (const a of newArticles) {
    const key = dedupKeyFor(a);
    if (key && !seen.has(key)) {
      seen.add(key);
      a.analyzed_at = now.toISOString();
      merged.push(a);
    }
  }
  for (const a of (oldArticles || [])) {
    const key = dedupKeyFor(a);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const articleTime = new Date(a.analyzed_at || 0);
    if (articleTime > cutoff) merged.push(a);
    else expired.push(a);
  }
  merged.sort((a, b) => new Date(b.analyzed_at || 0) - new Date(a.analyzed_at || 0));
  return { merged, expired };
}

// ============================================================
// === بخش ۵: آرشیو - همچنان روی گیت‌هاب (Append-Only) ===
// ============================================================

async function fetchArchiveFile(path) {
  try {
    const url = 'https://raw.githubusercontent.com/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/main/' + path;
    const data = await fetchUrl(url);
    const parsed = JSON.parse(data);
    return Array.isArray(parsed.articles) ? parsed.articles : [];
  } catch (e) { return []; }
}

function groupExpiredByAgencyAndDate(expiredArticles) {
  const groups = {};
  for (const a of expiredArticles) {
    const d = new Date(a.analyzed_at || Date.now());
    const dateStr = d.toISOString().slice(0, 10);
    const key = dateStr + "/" + (a.agencyId || "unknown");
    if (!groups[key]) groups[key] = [];
    groups[key].push(a);
  }
  return groups;
}

async function archiveExpiredArticles(expiredArticles) {
  if (!expiredArticles || expiredArticles.length === 0) return;
  console.log("Archiving " + expiredArticles.length + " expired articles...");
  const groups = groupExpiredByAgencyAndDate(expiredArticles);
  const indexEntries = [];

  for (const key of Object.keys(groups)) {
    try {
      const [dateStr, agencyId] = key.split("/");
      const path = "archive/" + dateStr + "/" + agencyId + ".json";
      const existing = await fetchArchiveFile(path);
      const seenUrls = new Set(existing.map(a => a.sourceUrl));
      const newOnes = groups[key].filter(a => !seenUrls.has(a.sourceUrl));
      if (newOnes.length === 0) continue;
      const combined = existing.concat(newOnes);

      const content = Buffer.from(JSON.stringify({ date: dateStr, agencyId: agencyId, total: combined.length, articles: combined }, null, 2)).toString("base64");
      var sha;
      try {
        const fileInfo = await octokit.repos.getContent({ owner: GITHUB_OWNER, repo: GITHUB_REPO, path: path });
        sha = fileInfo.data.sha;
      } catch (e) { sha = undefined; }
      await octokit.repos.createOrUpdateFileContents({
        owner: GITHUB_OWNER, repo: GITHUB_REPO, path: path,
        message: "archive " + dateStr + " " + agencyId + " (+" + newOnes.length + ")", content: content, sha: sha,
      });
      console.log("Archived " + newOnes.length + " -> " + path);

      for (const a of newOnes) {
        indexEntries.push({ id: a.id, agencyId: agencyId, date: dateStr, title_fa: a.title_fa, category: a.category, region: a.region, iranScore: a.iranScore || 0, sourceUrl: a.sourceUrl, archivePath: path });
      }
    } catch (e) {
      console.error("Archive error for group " + key + ": " + e.message);
    }
  }

  if (indexEntries.length > 0) {
    try { await updateSearchIndex(indexEntries); }
    catch (e) { console.error("updateSearchIndex error: " + e.message); }
  }
}

async function updateSearchIndex(newEntries) {
  const path = "archive/index.json";
  let existingIndex = [];
  try {
    const url = 'https://raw.githubusercontent.com/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/main/' + path;
    const data = await fetchUrl(url);
    existingIndex = JSON.parse(data).entries || [];
  } catch (e) { existingIndex = []; }

  const seenIds = new Set(existingIndex.map(e => e.id));
  const merged = existingIndex.concat(newEntries.filter(e => !seenIds.has(e.id)));
  const content = Buffer.from(JSON.stringify({ updated_at: new Date().toISOString(), total: merged.length, entries: merged }, null, 2)).toString("base64");
  var sha;
  try {
    const fileInfo = await octokit.repos.getContent({ owner: GITHUB_OWNER, repo: GITHUB_REPO, path: path });
    sha = fileInfo.data.sha;
  } catch (e) { sha = undefined; }
  await octokit.repos.createOrUpdateFileContents({
    owner: GITHUB_OWNER, repo: GITHUB_REPO, path: path,
    message: "update search index (+" + newEntries.length + ")", content: content, sha: sha,
  });
  console.log("Search index updated: " + merged.length + " total entries");
}

// ============================================================
// === بخش ۶: چرخه‌ی اصلی ===
// ============================================================

async function main() {
  console.log("Starting analysis cycle (GitHub Actions + Redis + Gemini API)...");

  // قفل جلوگیری از اجرای هم‌پوشان - اگر اجرای قبلی هنوز در حال کار است، این اجرا رد می‌شود
  const lockAcquired = await redis.set('lock:fetcher', '1', { nx: true, ex: 600 });
  if (!lockAcquired) {
    console.log("یک اجرای دیگر در حال انجام است (قفل فعال است) - رد شدن از این اجرا");
    return;
  }

  try {
    const rawData = await fetchAllRSS();
    if (!rawData.articles || rawData.articles.length === 0) {
      console.log("No articles to analyze");
      return;
    }

    const existingCache = await fetchExistingCache();
    console.log("Existing cache has " + (existingCache.articles || []).length + " articles");

    const existingUrls = new Set((existingCache.articles || []).map(a => a.sourceUrl));
    const existingTitles = new Set((existingCache.articles || []).map(a => (a.title || "").trim()).filter(Boolean));
    const rejectedUrls = await getValidRejectedUrls();

    let toAnalyze = rawData.articles.filter(a => {
      if (existingUrls.has(a.sourceUrl)) return false;
      if (rejectedUrls.has(a.sourceUrl)) return false;
      if (UNSTABLE_URL_AGENCIES.has(a.agencyId) && existingTitles.has((a.title || "").trim())) return false;
      return true;
    });
    console.log(toAnalyze.length + " new articles need analysis (skipped " + (rawData.articles.length - toAnalyze.length) + ")");

    const MAX_PER_CYCLE = 200;
    if (toAnalyze.length > MAX_PER_CYCLE) {
      toAnalyze.sort((a, b) => (b.iranScore || 0) - (a.iranScore || 0));
      toAnalyze = toAnalyze.slice(0, MAX_PER_CYCLE);
    }

    if (toAnalyze.length === 0) {
      console.log("Nothing new to analyze, re-saving existing cache (cleanup old entries)");
      const { merged, expired } = mergeAndDedup(existingCache.articles, []);
      await archiveExpiredArticles(expired);
      await saveCache({ generated_at: new Date().toISOString(), total: merged.length, new_this_cycle: 0, agencies: rawData.agencies, articles: merged });
      return;
    }

    var BATCH = 15;
    var newAnalyzed = [];
    var newlyRejected = [];
    for (var i = 0; i < toAnalyze.length; i += BATCH) {
      var batch = toAnalyze.slice(i, i + BATCH);
      var batchResult = await analyzeWithGemini(batch);
      newlyRejected = newlyRejected.concat(batchResult.rejected);
      newAnalyzed = newAnalyzed.concat(batchResult.kept);
      console.log("Batch " + Math.floor(i / BATCH + 1) + " done: " + batchResult.kept.length + " kept, " + batchResult.rejected.length + " rejected");
      if (i + BATCH < toAnalyze.length) await new Promise(r => setTimeout(r, 1500));
    }

    const { merged: mergedArticles, expired } = mergeAndDedup(existingCache.articles, newAnalyzed);
    console.log("After merge: " + mergedArticles.length + " unique articles, " + expired.length + " expiring to archive");

    const MAX_QUEUE_ADD_PER_CYCLE = 20;
    let toQueue = newAnalyzed;
    if (toQueue.length > MAX_QUEUE_ADD_PER_CYCLE) {
      toQueue = [...newAnalyzed].sort((a, b) => (b.iranScore || 0) - (a.iranScore || 0)).slice(0, MAX_QUEUE_ADD_PER_CYCLE);
    }

    await Promise.all([
      archiveExpiredArticles(expired),
      pushToQueue(toQueue),
      addRejectedUrls(newlyRejected.map(r => r.sourceUrl)),
    ]);

    await saveCache({
      generated_at: new Date().toISOString(),
      total: mergedArticles.length,
      new_this_cycle: newAnalyzed.length,
      agencies: rawData.agencies,
      articles: mergedArticles,
    });

    console.log("Done! New: " + newAnalyzed.length + " | Total in 24h window: " + mergedArticles.length);
  } finally {
    // آزادکردن قفل حتی اگر خطایی رخ داده باشد
    await redis.del('lock:fetcher');
  }
}

main().catch(function (e) {
  console.error("Fatal error: " + e.message);
  process.exit(1);
});
