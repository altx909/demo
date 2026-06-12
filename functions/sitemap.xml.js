/**
 * GET /sitemap.xml
 *
 * Dynamic sitemap: static marketing pages + journal posts + available rentals,
 * pulled live from Sanity so new content appears without redeploying.
 * Cached 1 hour. Thank-you pages and the booking page are intentionally omitted
 * (the /typ-* pages are noindex).
 *
 * Env vars (already configured for the rentals API):
 *   SANITY_PROJECT_ID, SANITY_DATASET, SANITY_API_TOKEN
 */

const SANITY_API_VERSION = 'v2024-01-01';
const BASE = 'https://meetkrishna.com';

const STATIC_PAGES = [
  {loc: '/',                       changefreq: 'weekly',  priority: '1.0'},
  {loc: '/buy/',                   changefreq: 'monthly', priority: '0.8'},
  {loc: '/sell/',                  changefreq: 'monthly', priority: '0.8'},
  {loc: '/rent/',                  changefreq: 'daily',   priority: '0.8'},
  {loc: '/property-management/',   changefreq: 'monthly', priority: '0.7'},
  {loc: '/journal/',               changefreq: 'weekly',  priority: '0.7'},
  // /cal/, /card/, /pre-approval/ intentionally excluded — utility/redirect pages
];

export async function onRequestGet({env, request}) {
  const cache = caches.default;
  const cacheKey = new Request(request.url, request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let posts = [];
  let rentals = [];
  try {
    posts = await query(env, `*[_type == "journalPost" && defined(slug.current)]{"slug": slug.current, "lastmod": coalesce(publishedAt, _updatedAt)} | order(lastmod desc)`);
  } catch (e) { console.error('sitemap posts error', e && e.message); }
  try {
    rentals = await query(env, `*[_type == "rental" && status == "available" && defined(slug.current)]{"slug": slug.current, "lastmod": _updatedAt}`);
  } catch (e) { console.error('sitemap rentals error', e && e.message); }

  const urls = [];
  STATIC_PAGES.forEach((s) => urls.push(urlEntry(BASE + s.loc, null, s.changefreq, s.priority)));
  posts.forEach((p) => urls.push(urlEntry(`${BASE}/journal/post/${encodeURIComponent(p.slug)}/`, p.lastmod, 'monthly', '0.6')));
  rentals.forEach((r) => urls.push(urlEntry(`${BASE}/rent/property/${encodeURIComponent(r.slug)}/`, r.lastmod, 'weekly', '0.6')));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.join('\n') + `\n</urlset>\n`;

  const response = new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
  await cache.put(cacheKey, response.clone());
  return response;
}

async function query(env, groq) {
  if (!env.SANITY_PROJECT_ID || !env.SANITY_DATASET) return [];
  const u = `https://${env.SANITY_PROJECT_ID}.api.sanity.io/${SANITY_API_VERSION}/data/query/${env.SANITY_DATASET}?query=${encodeURIComponent(groq)}&perspective=published`;
  const headers = {};
  if (env.SANITY_API_TOKEN) headers['Authorization'] = `Bearer ${env.SANITY_API_TOKEN}`;
  const res = await fetch(u, {headers});
  if (!res.ok) return [];
  const data = await res.json();
  return data.result || [];
}

function urlEntry(loc, lastmod, changefreq, priority) {
  const mod = lastmod ? `    <lastmod>${escapeXml(String(lastmod).slice(0, 10))}</lastmod>\n` : '';
  return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n${mod}    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
