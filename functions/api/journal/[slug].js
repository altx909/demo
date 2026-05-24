/**
 * GET /api/journal/[slug]
 *
 * Fetches a single published journal post by slug. Serializes the Portable
 * Text body to HTML server-side so the detail page can inject it directly.
 * Cached 5 minutes.
 *
 * Required Cloudflare environment variables:
 *   SANITY_PROJECT_ID, SANITY_DATASET, SANITY_API_TOKEN
 */

const SANITY_API_VERSION = 'v2024-01-01';

const POST_QUERY = `*[_type == "journalPost" && slug.current == $slug][0]{
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
  metaTitle,
  metaDescription,
  body[]{
    ...,
    _type == "image" => { "_type": _type, "url": asset->url, alt, caption }
  }
}`;

export async function onRequestGet({env, request, params}) {
  const slug = params.slug;
  if (!slug) return json({error: 'Slug required'}, 400);

  const cache = caches.default;
  const cacheKey = new Request(request.url, request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  if (!env.SANITY_PROJECT_ID || !env.SANITY_DATASET) {
    return json({error: 'Sanity not configured'}, 500);
  }

  const params_qs = `&%24slug=${encodeURIComponent(JSON.stringify(slug))}`;
  const url = `https://${env.SANITY_PROJECT_ID}.api.sanity.io/${SANITY_API_VERSION}/data/query/${env.SANITY_DATASET}?query=${encodeURIComponent(POST_QUERY)}${params_qs}&perspective=published`;

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
    if (!data.result) return json({error: 'Post not found'}, 404);

    const post = normalize(data.result);
    const body = JSON.stringify({post});

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
    console.error('journal post fetch error:', err);
    return json({error: 'Server error', detail: err && err.message}, 500);
  }
}

function normalize(p) {
  return {
    id: p._id,
    slug: p.slug || '',
    title: p.title || '',
    excerpt: p.excerpt || '',
    image: addImageParams(p.image, 1800),
    imageAlt: p.imageAlt || p.title || '',
    publishedAt: p.publishedAt || '',
    dateLabel: formatDate(p.publishedAt),
    author: p.author || 'Krishna Ambilwade',
    category: p.category || '',
    tags: p.tags || [],
    metaTitle: p.metaTitle || '',
    metaDescription: p.metaDescription || '',
    bodyHtml: portableTextToHtml(p.body)
  };
}

/* ============================================
   PORTABLE TEXT → HTML
   Handles headings, paragraphs, quotes, bullet/number lists,
   bold/italic, links, and inline images.
   ============================================ */
function portableTextToHtml(blocks) {
  if (!Array.isArray(blocks)) return '';
  let html = '';
  let listType = null;
  const closeList = () => {
    if (listType) { html += listType === 'number' ? '</ol>' : '</ul>'; listType = null; }
  };

  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;

    if (block._type === 'image' && block.url) {
      closeList();
      const src = addImageParams(block.url, 1400);
      const alt = escapeAttr(block.alt || '');
      const cap = block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : '';
      html += `<figure class="post-fig"><img src="${src}" alt="${alt}" loading="lazy" />${cap}</figure>`;
      continue;
    }

    if (block._type === 'block') {
      const inner = renderSpans(block.children || [], block.markDefs || []);
      const listItem = block.listItem;
      if (listItem === 'bullet' || listItem === 'number') {
        if (listType && listType !== listItem) closeList();
        if (!listType) { html += listItem === 'number' ? '<ol>' : '<ul>'; listType = listItem; }
        html += `<li>${inner}</li>`;
        continue;
      }
      closeList();
      const style = block.style || 'normal';
      if (style === 'h2') html += `<h2>${inner}</h2>`;
      else if (style === 'h3') html += `<h3>${inner}</h3>`;
      else if (style === 'blockquote') html += `<blockquote>${inner}</blockquote>`;
      else html += `<p>${inner}</p>`;
    }
  }
  closeList();
  return html;
}

function renderSpans(children, markDefs) {
  const defs = {};
  (markDefs || []).forEach((d) => { if (d && d._key) defs[d._key] = d; });
  return (children || []).map((span) => {
    if (!span || span._type !== 'span') return '';
    let text = escapeHtml(span.text || '');
    if (!text) return '';
    const marks = span.marks || [];
    if (marks.includes('strong')) text = `<strong>${text}</strong>`;
    if (marks.includes('em')) text = `<em>${text}</em>`;
    marks.forEach((m) => {
      const def = defs[m];
      if (def && def._type === 'link' && def.href) {
        const href = escapeAttr(def.href);
        const ext = /^https?:\/\//i.test(def.href);
        text = `<a href="${href}"${ext ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`;
      }
    });
    return text;
  }).join('');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br />');
}
function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
