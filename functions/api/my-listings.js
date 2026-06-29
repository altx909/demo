const MRP_URL =
  'https://private-office.myrealpage.com/wps/-/tmpl~v2,noframe~true/mylistings/67223/mylistings.def/SearchResults.form?vow-skip-logging=true&vow.logout=true&ignore_sort_cookie=true';

function innerText(block) {
  return block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function attr(html, name) {
  const m = html.match(new RegExp(`${name}="([^"]+)"`));
  return m ? m[1] : '';
}
function firstMatch(html, re) {
  const m = html.match(re);
  return m ? (m[2] || m[1]).trim() : '';
}

function parseListing(block) {
  const id       = attr(block, 'data-listing-id');
  const shareUrl = attr(block, 'data-share-url');
  const isNew    = /NEW-BANNER/.test(block);
  const isPending = /status-PENDING/.test(block);

  const image = firstMatch(block,
    /class="mrp-listing-main-image[^"]*"[^>]*data-src="([^"]+)"|data-src="([^"]+)"[^>]*class="mrp-listing-main-image/);

  const price = firstMatch(block,
    /class="mrp-listing-price-container"[^>]*>\s*(\$[\d,]+)/);

  const addrBlock = firstMatch(block,
    /mrp-listing-address-info[\s\S]*?<a [^>]+>([\s\S]*?)<span class="mrp-listing-minor-address-info"/);
  const address = innerText(addrBlock);

  const neighbourhood = firstMatch(block, /mrp-listing-list-subarea">([^<]+)</);

  const status = isPending ? 'Conditional Sale'
    : isNew ? 'New Listing'
    : firstMatch(block, /summary-status[\s\S]*?<span[^>]*>\s*([^<]+?)\s*<\/span>/);

  const mls   = firstMatch(block, /mls-num-line"><span>([^<]+)</);
  const beds  = parseInt(firstMatch(block, /bedrooms-line"><span>(\d+)<\/span>/) || '0');
  const baths = parseInt(firstMatch(block, /bathrooms-line"><span>(\d+)<\/span>/) || '0');
  const sqftStr = firstMatch(block, /mrp-i-unit"[^>]*>([\d,]+ sq\. ft\.)/);
  const sqft  = parseInt(sqftStr.replace(/[^0-9]/g, '') || '0');
  const type  = firstMatch(block, /summary-property-type">\s*<span>([^<]+)</);

  return { id, image, price, address, neighbourhood, beds, baths, sqft, type, status, href: shareUrl, mls };
}

export async function onRequest() {
  try {
    const res = await fetch(MRP_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `MRP returned ${res.status}` }), { status: 502 });
    }

    const html = await res.text();
    const blocks = html.split('<li class="mrp-listing-result').slice(1);
    const listings = blocks.map(parseListing).filter(l => l.id && l.price);

    return new Response(JSON.stringify(listings), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
