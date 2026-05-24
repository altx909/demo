/**
 * GET /api/journal
 *
 * Fetches published journal posts from Sanity, newest first (featured pinned),
 * normalized to a light shape for the journal list page. Cached 5 minutes.
 *
 * Required Cloudflare environment variables:
 *   SANITY_PROJECT_ID  (e.g., u9fnmai5)
 *   SANITY_DATASET     (e.g., production)
 *   SANITY_API_TOKEN   (Viewer-role token from sanity.io)
 */

const SANITY_API_VERSION = 'v2024-01-01';

const LIST_FIELDS = `
  _id,
  "slug": slug.current,
  title,
  excerpt,
  "image": featuredImage.asset->url,
  "imageAlt": featuredImage.alt,
  publishedAt,
  author,
  category,
  tags,
  featured
`;

export async function onRequestGet({env, request}) {
  const cache = caches.default;
  const cacheKey = new Request(request.url, request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  if (!env.SANITY_PROJECT_ID || !env.SANITY_DATASET) {
    return json({error: 'Sanity not configured'}, 500);
  }

  const query = `*[_type == "journalPost" && defined(slug.current)] | order(featured desc, publishedAt desc) { ${LIST_FIELDS} }`;
  const url = `https://${env.SANITY_PROJECT_ID}.api.sanity.io/${SANITY_API_VERSION}/data/query/${env.SANITY_DATASET}?query=${encodeURIComponent(query)}&perspective=published`;

  try {
    const headers = {};
    if (env.SANITY_API_TOKEN) headers['Authorization'] = `Bearer ${env.SANITY_API_TOKEN}`;

    const res = await fetch(url, {headers});
    if (!res.ok) {
      const text = await res.text();
      console.error('Sanity error:', res.status, text);
      return json({error: 'Sanity fetch failed', status: res.status}, 502);
    }

    const data = await res.json();
    const posts = (data.result || []).map(normalize);
    const body = JSON.stringify({posts, count: posts.length});

    const response = new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*'
      }
    });
    await cache.put(cacheKey, response.clone());
    return response;
  } catch (err) {
    console.error('journal fetch error:', err);
    return json({error: 'Server error', detail: err && err.message}, 500);
  }
}

function normalize(p) {
  return {
    id: p._id,
    slug: p.slug || '',
    title: p.title || '',
    excerpt: p.excerpt || '',
    image: addImageParams(p.image, 1200),
    imageAlt: p.imageAlt || p.title || '',
    publishedAt: p.publishedAt || '',
    dateLabel: formatDate(p.publishedAt),
    author: p.author || 'Krishna Ambilwade',
    category: p.category || '',
    tags: p.tags || [],
    featured: !!p.featured
  };
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-CA', {year: 'numeric', month: 'long', day: 'numeric'});
}

function addImageParams(url, width) {
  if (!url) return '';
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}w=${width}&auto=format&fit=crop&q=80`;
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json'}
  });
}
