const https = require('https');

const MRP_URL =
  'https://private-office.myrealpage.com/wps/-/tmpl~v2,noframe~true/mylistings/67223/mylistings.def/SearchResults.form?vow-skip-logging=true&vow.logout=true&ignore_sort_cookie=true';

// Redirect-following fetch with browser-like headers
function get(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : require('http');
    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache',
      },
    };
    lib.get(url, opts, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        const next = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
        return get(next, redirects - 1).then(resolve).catch(reject);
      }
      let body = '';
      res.on('data', c => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

// Minimal HTML text extractor — avoids a cheerio dep
function innerText(block) {
  return block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function attr(html, attrName) {
  const m = html.match(new RegExp(`${attrName}="([^"]+)"`));
  return m ? m[1] : '';
}
function firstMatch(html, re) {
  const m = html.match(re);
  return m ? m[1].trim() : '';
}

function parseListing(block) {
  const id          = attr(block, 'data-listing-id');
  const shareUrl    = attr(block, 'data-share-url');
  const isNew       = /NEW-BANNER/.test(block);
  const isPending   = /status-PENDING/.test(block);

  // Image: use data-src on the main photo img
  const image = firstMatch(block, /class="mrp-listing-main-image[^"]*"[^>]*data-src="([^"]+)"|data-src="([^"]+)"[^>]*class="mrp-listing-main-image/);

  // Price
  const price = firstMatch(block, /class="mrp-listing-price-container"[^>]*>\s*(\$[\d,]+)/);

  // Street address (first text node in the address <a>)
  const addrBlock = firstMatch(block, /mrp-listing-address-info[\s\S]*?<a [^>]+>([\s\S]*?)<span class="mrp-listing-minor-address-info"/);
  const address   = innerText(addrBlock);

  // Neighbourhood
  const neighbourhood = firstMatch(block, /mrp-listing-list-subarea">([^<]+)</);

  // Stats
  const status  = isPending ? 'Conditional Sale' : (isNew ? 'New Listing' : firstMatch(block, /summary-status[\s\S]*?<span[^>]*>\s*([^<]+?)\s*<\/span>/));
  const mls     = firstMatch(block, /mls-num-line"><span>([^<]+)</);
  const beds    = parseInt(firstMatch(block, /bedrooms-line"><span>(\d+)<\/span>/) || '0');
  const baths   = parseInt(firstMatch(block, /bathrooms-line"><span>(\d+)<\/span>/) || '0');
  const sqftStr = firstMatch(block, /mrp-i-unit"[^>]*>([\d,]+ sq\. ft\.)/);
  const sqft    = parseInt(sqftStr.replace(/[^0-9]/g, '') || '0');
  const type    = firstMatch(block, /summary-property-type">\s*<span>([^<]+)</);

  return { id, image, price, address, neighbourhood, beds, baths, sqft, type, status, href: shareUrl, mls };
}

exports.handler = async () => {
  try {
    const { status, body: html } = await get(MRP_URL);

    if (status !== 200) {
      return { statusCode: 502, body: JSON.stringify({ error: `MRP returned ${status}`, preview: html.slice(0, 300) }) };
    }

    // Split on listing boundaries
    const blocks = html.split('<li class="mrp-listing-result').slice(1);
    const listings = blocks.map(b => parseListing(b)).filter(l => l.id && l.price);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(listings),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
