const https = require('https');
const http = require('http');
const xml2js = require('xml2js');
const fs = require('fs');

const RSS_SOURCES = [
  { id: "aljazeera",     name_en: "Al Jazeera",     name_fa: "الجزیره",        url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { id: "france24",      name_en: "France 24",      name_fa: "فرانس ۲۴",      url: "https://www.france24.com/en/rss" },
  { id: "dw",            name_en: "DW",             name_fa: "دویچه‌وله",      url: "https://rss.dw.com/xml/rss-en-all" },
  { id: "guardian",      name_en: "The Guardian",   name_fa: "گاردین",         url: "https://www.theguardian.com/world/rss" },
  { id: "foreignpolicy", name_en: "Foreign Policy", name_fa: "فارن پالیسی",   url: "https://foreignpolicy.com/feed/" },
  { id: "skynews",       name_en: "Sky News",       name_fa: "اسکای‌نیوز",     url: "https://feeds.skynews.com/feeds/rss/world.xml" },
  { id: "bbc",           name_en: "BBC World",      name_fa: "بی‌بی‌سی",       url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { id: "nytimes",       name_en: "NY Times",       name_fa: "نیویورک تایمز",  url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
  { id: "independent",   name_en: "Independent",    name_fa: "ایندیپندنت",     url: "https://www.independent.co.uk/rss" },
  { id: "economist",     name_en: "The Economist",  name_fa: "اکونومیست",      url: "https://www.economist.com/the-world-this-week/rss.xml" },
  { id: "arabnews",      name_en: "Arab News",      name_fa: "عرب نیوز",       url: "https://www.arabnews.com/rss.xml" },
  { id: "reuters",       name_en: "Reuters",        name_fa: "رویترز",         url: "https://feeds.reuters.com/reuters/worldNews" },
  { id: "rt",            name_en: "RT",             name_fa: "آر‌تی",           url: "https://www.rt.com/rss/news/" },
  { id: "xinhua",        name_en: "Xinhua",         name_fa: "شینهوا",         url: "http://www.xinhuanet.com/english/rss/worldrss.xml" },
  { id: "alarabiya",     name_en: "Al Arabiya",     name_fa: "العربیه",        url: "https://www.alarabiya.net/tools/rss" },
  { id: "middleeasteye", name_en: "Middle East Eye",name_fa: "میدل ایست آی",  url: "https://www.middleeasteye.net/rss" },
  { id: "irna",          name_en: "IRNA",           name_fa: "ایرنا",          url: "https://www.irna.ir/rss" },
  { id: "mehrnews",      name_en: "Mehr News",      name_fa: "مهر",            url: "https://en.mehrnews.com/rss" },
  { id: "iribnews",      name_en: "IRIB News",      name_fa: "صدا و سیما",     url: "https://www.iribnews.ir/fa/rss" },
  { id: "khabaronline",  name_en: "Khabar Online",  name_fa: "خبرآنلاین",      url: "https://www.khabaronline.ir/rss" },
  { id: "mashregh",      name_en: "Mashregh News",  name_fa: "مشرق",           url: "https://www.mashreghnews.ir/rss" },
];

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      timeout: 15000,
    };
    const req = lib.get(url, options, (res) => {
      // handle redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error('HTTP ' + res.statusCode));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.setTimeout(15000);
  });
}

async function fetchRSS(source) {
  try {
    const xml = await fetchUrl(source.url);
    const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });
    const items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
    const arr = Array.isArray(items) ? items : [items];
    const articles = arr.slice(0, 8).map((item, i) => {
      var link = '';
      if (typeof item.link === 'string') link = item.link;
      else if (item.link?.href) link = item.link.href;
      else if (item.link?._) link = item.link._;
      else if (Array.isArray(item.link)) link = item.link[0]?.href || item.link[0] || '';
      return {
        id: source.id + '_' + i,
        agencyId: source.id,
        title: item.title?._ || item.title || '',
        description: item.description?._ || item.description || item.summary?._ || item.summary || '',
        sourceUrl: link,
        pubDate: item.pubDate || item.published || new Date().toISOString(),
      };
    }).filter(a => a.title);
    console.log('✅ ' + source.id + ': ' + articles.length + ' articles');
    return articles;
  } catch (e) {
    console.log('❌ ' + source.id + ': ' + e.message);
    return [];
  }
}

async function main() {
  console.log('Starting RSS fetch...');
  const results = await Promise.all(RSS_SOURCES.map(fetchRSS));
  const allArticles = results.flat();
  console.log('Total: ' + allArticles.length + ' articles');
  const payload = {
    fetched_at: new Date().toISOString(),
    total: allArticles.length,
    agencies: RSS_SOURCES.map(s => ({ id: s.id, name_en: s.name_en, name_fa: s.name_fa })),
    articles: allArticles,
  };
  fs.writeFileSync('raw_news.json', JSON.stringify(payload, null, 2));
  console.log('Saved raw_news.json');
}

main().catch(console.error);
