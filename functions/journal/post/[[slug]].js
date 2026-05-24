/**
 * Catch-all route for /journal/post/*
 *
 * Serves the static /journal/post/index.html shell, but first fetches the
 * matching post from Sanity and injects server-side <title>, meta description,
 * and Open Graph / Twitter tags (using the featured image as the share image)
 * into the head — so social crawlers and search engines see real metadata.
 *
 * The article body itself is still rendered client-side by the shell's JS.
 *
 * Env vars (already configured for the rentals API):
 *   SANITY_PROJECT_ID, SANITY_DATASET, SANITY_API_TOKEN
 */

const SANITY_API_VERSION = 'v2024-01-01';

export async function onRequest(context) {
  const {request, env} = context;
  const url = new URL(request.url);

  // 1. Load the static shell.
  const indexUrl = new URL('/journal/post/index.html', url.origin);
  const assetRes = await env.ASSETS.fetch(new Request(indexUrl, {method: 'GET'}));
  let html = await assetRes.text();

  // 2. Derive the slug and fetch the post for meta tags.
  const m = url.pathname.match(/\/post\/([^\/]+?)\/?$/);
  const slug = m ? decodeURIComponent(m[1]) : '';

  if (slug) {
    try {
      const post = await fetchPostMeta(env, slug);
      if (post) html = injectMeta(html, post, url);
    } catch (err) {
      // On any failure, fall back to the shell as-is (client JS still renders).
      console.error('journal SSR meta error:', err && err.message);
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

async function fetchPostMeta(env, slug) {
  if (!env.SANITY_PROJECT_ID || !env.SANITY_DATASET) return null;
  const query = `*[_type == "journalPost" && slug.current == $slug][0]{
    title, excerpt, metaTitle, metaDescription, author, publishedAt, _updatedAt,
    "image": featuredImage.asset->url
  }`;
  const u = `https://${env.SANITY_PROJECT_ID}.api.sanity.io/${SANITY_API_VERSION}/data/query/${env.SANITY_DATASET}` +
    `?query=${encodeURIComponent(query)}&%24slug=${encodeURIComponent(JSON.stringify(slug))}&perspective=published`;
  const headers = {};
  if (env.SANITY_API_TOKEN) headers['Authorization'] = `Bearer ${env.SANITY_API_TOKEN}`;
  const res = await fetch(u, {headers});
  if (!res.ok) return null;
  const data = await res.json();
  return data.result || null;
}

function injectMeta(html, post, url) {
  const siteName = 'Krishna Ambilwade · Saskatoon Real Estate';
  const rawTitle = post.metaTitle || post.title || 'Journal';
  const fullTitle = `${rawTitle} — Krishna Ambilwade`;
  const desc = post.metaDescription || post.excerpt || '';
  const pageUrl = url.origin + url.pathname;
  const img = post.image
    ? post.image + (post.image.includes('?') ? '&' : '?') + 'w=1200&h=630&fit=crop&auto=format'
    : '';

  const e = (s) => String(s || '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const tags = [
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="${e(siteName)}" />`,
    `<meta property="og:title" content="${e(rawTitle)}" />`,
    `<meta property="og:description" content="${e(desc)}" />`,
    `<meta property="og:url" content="${e(pageUrl)}" />`,
    img ? `<meta property="og:image" content="${e(img)}" />` : '',
    img ? `<meta property="og:image:width" content="1200" />` : '',
    img ? `<meta property="og:image:height" content="630" />` : '',
    `<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${e(rawTitle)}" />`,
    `<meta name="twitter:description" content="${e(desc)}" />`,
    img ? `<meta name="twitter:image" content="${e(img)}" />` : '',
    `<link rel="canonical" href="${e(pageUrl)}" />`,
    jsonLd(post, pageUrl, rawTitle, desc, img)
  ].filter(Boolean).join('\n');

  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${e(fullTitle)}</title>`);
  html = html.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${e(desc)}" />`);
  html = html.replace('<!--SSR_HEAD-->', tags);
  return html;
}

function jsonLd(post, pageUrl, title, desc, img) {
  const AGENT = 'https://meetkrishna.com/#krishna';
  const graph = [
    {
      '@type': 'Article',
      'headline': title,
      'description': desc,
      'mainEntityOfPage': {'@type': 'WebPage', '@id': pageUrl},
      'author': {'@type': 'Person', 'name': post.author || 'Krishna Ambilwade'},
      'publisher': {
        '@type': 'RealEstateAgent', '@id': AGENT, 'name': 'Krishna Ambilwade',
        'logo': {'@type': 'ImageObject', 'url': 'https://meetkrishna.com/apple-touch-icon.png'}
      }
    },
    {
      '@type': 'BreadcrumbList',
      'itemListElement': [
        {'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': 'https://meetkrishna.com/'},
        {'@type': 'ListItem', 'position': 2, 'name': 'Journal', 'item': 'https://meetkrishna.com/journal/'},
        {'@type': 'ListItem', 'position': 3, 'name': title, 'item': pageUrl}
      ]
    }
  ];
  const article = graph[0];
  if (img) article.image = img;
  if (post.publishedAt) article.datePublished = post.publishedAt;
  if (post._updatedAt || post.publishedAt) article.dateModified = post._updatedAt || post.publishedAt;
  const data = {'@context': 'https://schema.org', '@graph': graph};
  // Safe to embed in HTML <script>: only need to neutralize </script>
  const safe = JSON.stringify(data).replace(/<\//g, '<\\/');
  return `<script type="application/ld+json">${safe}</script>`;
}
