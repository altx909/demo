/**
 * Catch-all route for /journal/post/*
 *
 * Server-side renders the journal article: fetches the post from Sanity,
 * serializes its Portable Text body to HTML, and injects BOTH the head
 * metadata (title, description, OG/Twitter, JSON-LD) AND the full article
 * markup into the static shell — so AI crawlers and search engines receive
 * the real content in the initial HTML. The shell's client JS only wires up
 * the share controls when it detects the server already rendered the article
 * (and still works as a client-side fallback if this function can't fetch).
 *
 * Env vars (already configured for the rentals API):
 *   SANITY_PROJECT_ID, SANITY_DATASET, SANITY_API_TOKEN
 */

const SANITY_API_VERSION = 'v2024-01-01';
const BASE = 'https://meetkrishna.com';
const AGENT_ID = `${BASE}/#krishna`;

const CAT_LABELS = {
  buying: 'Buying', selling: 'Selling', renting: 'Renting',
  'property-management': 'Property Management', market: 'Saskatoon Market',
  neighbourhoods: 'Neighbourhoods', tips: 'Tips & Guides'
};

export async function onRequest(context) {
  const {request, env} = context;
  const url = new URL(request.url);

  const indexUrl = new URL('/journal/post/index.html', url.origin);
  const assetRes = await env.ASSETS.fetch(new Request(indexUrl, {method: 'GET'}));
  let html = await assetRes.text();

  const m = url.pathname.match(/\/post\/([^\/]+?)\/?$/);
  const slug = m ? decodeURIComponent(m[1]) : '';

  if (slug) {
    try {
      const post = await fetchPost(env, slug);
      if (post) {
        const pageUrl = url.origin + url.pathname;
        html = injectMeta(html, post, pageUrl);
        html = html.replace(/<!--SSR_BODY-->[\s\S]*?<!--\/SSR_BODY-->/, () => renderArticle(post, pageUrl));
      }
    } catch (err) {
      console.error('journal SSR error:', err && err.message);
    }
  }

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300'
    }
  });
}

/* ============================================ DATA ============================================ */

async function fetchPost(env, slug) {
  if (!env.SANITY_PROJECT_ID || !env.SANITY_DATASET) return null;
  const query = `*[_type == "journalPost" && slug.current == $slug][0]{
    title, excerpt, metaTitle, metaDescription, author, publishedAt, _updatedAt, category,
    "image": featuredImage.asset->url,
    "imageAlt": featuredImage.alt,
    body[]{
      ...,
      _type == "image" => { "_type": _type, "url": asset->url, alt, caption }
    }
  }`;
  const u = `https://${env.SANITY_PROJECT_ID}.api.sanity.io/${SANITY_API_VERSION}/data/query/${env.SANITY_DATASET}` +
    `?query=${encodeURIComponent(query)}&%24slug=${encodeURIComponent(JSON.stringify(slug))}&perspective=published`;
  const headers = {};
  if (env.SANITY_API_TOKEN) headers['Authorization'] = `Bearer ${env.SANITY_API_TOKEN}`;
  const res = await fetch(u, {headers});
  if (!res.ok) return null;
  const data = await res.json();
  const p = data.result;
  if (!p) return null;
  return {
    title: p.title || '',
    excerpt: p.excerpt || '',
    metaTitle: p.metaTitle || '',
    metaDescription: p.metaDescription || '',
    author: p.author || 'Krishna Ambilwade',
    category: p.category || '',
    publishedAt: p.publishedAt || '',
    updatedAt: p._updatedAt || '',
    dateLabel: formatDate(p.publishedAt),
    image: p.image || '',            // raw asset URL (params applied per use)
    imageAlt: p.imageAlt || p.title || '',
    bodyHtml: portableTextToHtml(p.body)
  };
}

/* ============================================ HEAD META ============================================ */

function injectMeta(html, post, pageUrl) {
  const siteName = 'Krishna Ambilwade · Saskatoon Real Estate';
  const rawTitle = post.metaTitle || post.title || 'Journal';
  const fullTitle = `${rawTitle} — Krishna Ambilwade`;
  const desc = post.metaDescription || post.excerpt || '';
  const img = post.image ? withParams(post.image, 'w=1200&h=630&fit=crop&auto=format') : '';

  const tags = [
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="${a(siteName)}" />`,
    `<meta property="og:title" content="${a(rawTitle)}" />`,
    `<meta property="og:description" content="${a(desc)}" />`,
    `<meta property="og:url" content="${a(pageUrl)}" />`,
    img ? `<meta property="og:image" content="${a(img)}" />` : '',
    img ? `<meta property="og:image:width" content="1200" />` : '',
    img ? `<meta property="og:image:height" content="630" />` : '',
    `<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${a(rawTitle)}" />`,
    `<meta name="twitter:description" content="${a(desc)}" />`,
    img ? `<meta name="twitter:image" content="${a(img)}" />` : '',
    `<link rel="canonical" href="${a(pageUrl)}" />`,
    jsonLd(post, pageUrl, rawTitle, desc, img)
  ].filter(Boolean).join('\n');

  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${a(fullTitle)}</title>`);
  html = html.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${a(desc)}" />`);
  html = html.replace('<!--SSR_HEAD-->', tags);
  return html;
}

function jsonLd(post, pageUrl, title, desc, img) {
  const graph = [
    {
      '@type': 'Article', 'headline': title, 'description': desc,
      'mainEntityOfPage': {'@type': 'WebPage', '@id': pageUrl},
      'author': {'@type': 'Person', 'name': post.author || 'Krishna Ambilwade'},
      'publisher': {
        '@type': 'RealEstateAgent', '@id': AGENT_ID, 'name': 'Krishna Ambilwade',
        'logo': {'@type': 'ImageObject', 'url': `${BASE}/apple-touch-icon.png`}
      }
    },
    {
      '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': `${BASE}/`},
        {'@type': 'ListItem', 'position': 2, 'name': 'Journal', 'item': `${BASE}/journal/`},
        {'@type': 'ListItem', 'position': 3, 'name': title, 'item': pageUrl}
      ]
    }
  ];
  if (img) graph[0].image = img;
  if (post.publishedAt) graph[0].datePublished = post.publishedAt;
  if (post.updatedAt || post.publishedAt) graph[0].dateModified = post.updatedAt || post.publishedAt;
  const safe = JSON.stringify({'@context': 'https://schema.org', '@graph': graph}).replace(/<\//g, '<\\/');
  return `<script type="application/ld+json">${safe}</script>`;
}

/* ============================================ ARTICLE BODY ============================================ */

function renderArticle(post, pageUrl) {
  const cat = post.category ? `<span class="article__cat">${e(CAT_LABELS[post.category] || post.category)}</span>` : '';
  const meta = [post.dateLabel, post.author].filter(Boolean).map(e).join('<span class="dot"></span>');
  const excerpt = post.excerpt ? `<p class="article__excerpt">${e(post.excerpt)}</p>` : '';
  const hero = post.image
    ? `<div class="article__hero"><img src="${a(withParams(post.image, 'w=1800&auto=format&fit=crop&q=80'))}" alt="${a(post.imageAlt)}" /></div>`
    : '';
  const shareTitle = post.metaTitle || post.title || '';
  const u = encodeURIComponent(pageUrl);
  const t = encodeURIComponent(shareTitle);

  const share = `
        <div class="article__share">
          <span class="article__share-label">Share</span>
          <button class="share-btn" id="shareNative" aria-label="Share this article">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="6" cy="12" r="2.2" stroke="currentColor" stroke-width="1.6"/><circle cx="17" cy="6" r="2.2" stroke="currentColor" stroke-width="1.6"/><circle cx="17" cy="18" r="2.2" stroke="currentColor" stroke-width="1.6"/><path d="M8 11l7-4M8 13l7 4" stroke="currentColor" stroke-width="1.6"/></svg>
          </button>
          <a class="share-btn" href="https://twitter.com/intent/tweet?url=${u}&text=${t}" target="_blank" rel="noopener" aria-label="Share on X"><svg viewBox="0 0 24 24" fill="none"><path d="M4 4l16 16M20 4L4 20" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></a>
          <a class="share-btn" href="https://www.facebook.com/sharer/sharer.php?u=${u}" target="_blank" rel="noopener" aria-label="Share on Facebook"><svg viewBox="0 0 24 24" fill="none"><path d="M14 21v-7h2.5l.5-3H14V9.2c0-.9.3-1.5 1.6-1.5H17V5.1C16.7 5 15.8 5 14.8 5 12.6 5 11 6.3 11 9v2H8.5v3H11v7h3z" fill="currentColor"/></svg></a>
          <a class="share-btn" href="https://www.linkedin.com/sharing/share-offsite/?url=${u}" target="_blank" rel="noopener" aria-label="Share on LinkedIn"><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="9" width="3" height="11" fill="currentColor"/><circle cx="4.5" cy="4.5" r="1.8" fill="currentColor"/><path d="M9 20v-7c0-1.5 1-2.6 2.7-2.6S15 11.5 15 13v7h-3v-6c0-.8-.4-1.3-1.1-1.3S10 13.2 10 14v6H9z" fill="currentColor"/></svg></a>
          <button class="share-btn" id="shareCopy" aria-label="Copy link"><svg viewBox="0 0 24 24" fill="none"><path d="M9 9h10v10a1 1 0 01-1 1H9a1 1 0 01-1-1V9z" stroke="currentColor" stroke-width="1.6"/><path d="M16 9V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" stroke="currentColor" stroke-width="1.6"/></svg></button>
          <span class="share-copied" id="shareCopied">Link copied</span>
        </div>`;

  return `<article data-ssr="1" data-share-title="${a(shareTitle)}">
        <header class="article">
          <a class="article__back" href="/journal/">
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none" style="transform:rotate(180deg)"><path d="M1 5h11M8 1l4 4-4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            The Journal
          </a>
          ${cat}
          <h1 class="article__title">${e(post.title)}</h1>
          <div class="article__meta">${meta}</div>
          ${excerpt}
          ${share}
        </header>
        ${hero}
        <div class="article__body">${post.bodyHtml || ''}</div>
        <div class="article__cta">
          <h3>Thinking about your next move?</h3>
          <p>Whether you're buying, selling, renting, or investing in Saskatoon — let's talk.</p>
          <a class="article__cta-btn" href="/cal/">Book a call with Krishna</a>
        </div>
      </article>`;
}

/* ============================================ PORTABLE TEXT → HTML ============================================ */

function portableTextToHtml(blocks) {
  if (!Array.isArray(blocks)) return '';
  let html = '';
  let listType = null;
  const closeList = () => { if (listType) { html += listType === 'number' ? '</ol>' : '</ul>'; listType = null; } };

  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    if (block._type === 'image' && block.url) {
      closeList();
      const src = withParams(block.url, 'w=1400&auto=format&fit=crop&q=80');
      const alt = a(block.alt || '');
      const cap = block.caption ? `<figcaption>${e(block.caption)}</figcaption>` : '';
      html += `<figure class="post-fig"><img src="${src}" alt="${alt}" loading="lazy" />${cap}</figure>`;
      continue;
    }
    if (block._type === 'block') {
      const inner = renderSpans(block.children || [], block.markDefs || []);
      const li = block.listItem;
      if (li === 'bullet' || li === 'number') {
        if (listType && listType !== li) closeList();
        if (!listType) { html += li === 'number' ? '<ol>' : '<ul>'; listType = li; }
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
    let text = e(span.text || '');
    if (!text) return '';
    const marks = span.marks || [];
    if (marks.includes('strong')) text = `<strong>${text}</strong>`;
    if (marks.includes('em')) text = `<em>${text}</em>`;
    marks.forEach((mk) => {
      const def = defs[mk];
      if (def && def._type === 'link' && def.href) {
        const ext = /^https?:\/\//i.test(def.href);
        text = `<a href="${a(def.href)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`;
      }
    });
    return text;
  }).join('');
}

/* ============================================ HELPERS ============================================ */

function e(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br />');
}
function a(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function withParams(url, params) {
  if (!url) return '';
  return url + (url.includes('?') ? '&' : '?') + params;
}
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
