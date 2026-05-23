/**
 * Catch-all route for /rent/property/*
 *
 * Cloudflare Pages doesn't reliably process the _redirects rule for nested
 * slug URLs on this project, so we use a Pages Function instead. This always
 * serves the property/index.html for any URL under /rent/property/, and
 * the front-end JS reads the slug from window.location.pathname.
 *
 * Examples this catches:
 *   /rent/property/test-2-br-lawson-heights
 *   /rent/property/test-2-br-lawson-heights/
 *   /rent/property/anything
 *   /rent/property/  (passes through to the natural index.html)
 */

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Always serve the static property/index.html content. The browser URL
  // stays as the slug-based path; the page's JS handles the rest.
  const indexUrl = new URL('/rent/property/index.html', url.origin);
  const indexRequest = new Request(indexUrl, {
    method: 'GET',
    headers: request.headers
  });

  return env.ASSETS.fetch(indexRequest);
}
