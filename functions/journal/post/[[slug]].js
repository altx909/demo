/**
 * Catch-all route for /journal/post/*
 *
 * Serves the static /journal/post/index.html shell for any slug-based URL
 * under /journal/post/. The front-end JS reads the slug from
 * window.location.pathname and fetches /api/journal/<slug>.
 *
 * Examples this catches:
 *   /journal/post/saskatoon-spring-market
 *   /journal/post/saskatoon-spring-market/
 */

export async function onRequest(context) {
  const {request, env} = context;
  const url = new URL(request.url);

  const indexUrl = new URL('/journal/post/index.html', url.origin);
  const indexRequest = new Request(indexUrl, {
    method: 'GET',
    headers: request.headers
  });

  return env.ASSETS.fetch(indexRequest);
}
