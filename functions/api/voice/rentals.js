/**
 * POST /api/voice/rentals
 *
 * Minimal rental lookup for the GHL Voice AI CUSTOM_ACTION. Reuses the same
 * Sanity query/normalize pattern as /api/rentals and /api/rentals/[slug]
 * (see those files) rather than redesigning the data layer.
 *
 * Body: { mode: "search" | "lookup", ...params }
 *
 * mode "search":   { bedrooms?, maxBudget?, neighbourhood?, pets? } -> up to 3 listings
 * mode "lookup":   { slug? | address? | id? } -> single listing (or {found:false})
 *
 * Required Cloudflare environment variables (same as /api/rentals):
 *   SANITY_PROJECT_ID, SANITY_DATASET, SANITY_API_TOKEN
 *
 * ponytail: one query fetches all available listings, filtered in JS —
 * matches the existing findMatches()/rentals.js pattern instead of a new
 * parametrized GROQ query. Fine at this catalog size; move filtering into
 * GROQ if the rental list grows into the hundreds.
 */

const SANITY_API_VERSION = 'v2024-01-01';

const RENTAL_FIELDS = `
  _id,
  "slug": slug.current,
  title,
  unitNumber,
  streetAddress,
  neighbourhood,
  neighbourhoodCustom,
  bedrooms,
  bathrooms,
  monthlyRent,
  shortDescription,
  pets,
  petsNote,
  applicationLink,
  availableDate,
  status
`;

export async function onRequestPost({ env, request }) {
  if (!env.SANITY_PROJECT_ID || !env.SANITY_DATASET) {
    return json({ error: 'Sanity not configured' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const mode = body.mode === 'lookup' ? 'lookup' : 'search';

  let listings;
  try {
    listings = await fetchListings(env);
  } catch (err) {
    console.error('voice/rentals fetch error:', err);
    return json({ error: 'Server error', detail: err && err.message }, 500);
  }

  if (mode === 'lookup') {
    const { slug, address, id } = body;
    let match = null;
    if (id) match = listings.find((r) => r.id === id);
    if (!match && slug) match = listings.find((r) => r.slug === slug);
    if (!match && address) {
      const needle = String(address).toLowerCase();
      match = listings.find((r) => r.address.toLowerCase().includes(needle));
    }
    if (!match) return json({ found: false });
    return json({ found: true, property: toVoiceShape(match) });
  }

  // mode "search"
  const bedrooms = toInt(body.bedrooms);
  const maxBudget = toInt(body.maxBudget);
  const neighbourhood = body.neighbourhood ? String(body.neighbourhood).toLowerCase() : '';
  const pets = body.pets || 'none';

  let matches = listings.filter((r) => {
    if (bedrooms != null && r.bedrooms < bedrooms) return false;
    if (maxBudget != null && r.monthlyRent > maxBudget + 200) return false;
    if (neighbourhood && !r.neighbourhood.toLowerCase().includes(neighbourhood)) return false;
    if (!petsCompatible(pets, r.pets)) return false;
    return true;
  });

  if (matches.length < 3) {
    matches = listings.filter((r) => {
      if (maxBudget != null && r.monthlyRent > maxBudget + 400) return false;
      if (bedrooms != null && r.bedrooms < Math.max(0, bedrooms - 1)) return false;
      return true;
    });
  }

  return json({
    count: Math.min(matches.length, 3),
    properties: matches.slice(0, 3).map(toVoiceShape)
  });
}

function petsCompatible(requested, listingPets) {
  if (requested === 'none') return true;
  if (requested === 'cat' || requested === 'cats') return listingPets !== 'none';
  if (requested === 'small-dog') return listingPets === 'all';
  if (requested === 'large-dog' || requested === 'multiple') return listingPets === 'all';
  return true;
}

async function fetchListings(env) {
  const query = `*[_type == "rental" && status == "available"] | order(featured desc, _createdAt desc) { ${RENTAL_FIELDS} }`;
  const url = `https://${env.SANITY_PROJECT_ID}.api.sanity.io/${SANITY_API_VERSION}/data/query/${env.SANITY_DATASET}?query=${encodeURIComponent(query)}&perspective=published`;
  const headers = {};
  if (env.SANITY_API_TOKEN) headers['Authorization'] = `Bearer ${env.SANITY_API_TOKEN}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    console.error('Sanity error:', res.status, text);
    throw new Error(`Sanity fetch failed (${res.status})`);
  }
  const data = await res.json();
  return (data.result || []).map(normalize);
}

function normalize(r) {
  const parts = [r.unitNumber, r.streetAddress].filter(Boolean);
  return {
    id: r._id,
    slug: r.slug || '',
    title: r.title || '',
    address: parts.join(' — '),
    neighbourhood: (r.neighbourhood === 'Custom' && r.neighbourhoodCustom) ? r.neighbourhoodCustom : (r.neighbourhood || ''),
    bedrooms: r.bedrooms ?? 0,
    bathrooms: r.bathrooms ?? 0,
    monthlyRent: r.monthlyRent || 0,
    pets: r.pets || 'none',
    petsNote: r.petsNote || '',
    shortDescription: r.shortDescription || '',
    applicationLink: r.applicationLink || '',
    availableDate: r.availableDate || null,
    status: r.status || 'available'
  };
}

// Prospect-safe shape only — never includes internalNotes or any field not
// queried above (internalNotes isn't in RENTAL_FIELDS at all, so it can
// never leak here regardless of downstream changes).
function toVoiceShape(r) {
  return {
    id: r.id,
    title: r.title,
    address: r.address,
    neighbourhood: r.neighbourhood,
    rent: r.monthlyRent,
    bedrooms: r.bedrooms,
    bathrooms: r.bathrooms,
    pets: r.pets,
    availableDate: r.availableDate,
    shortDescription: r.shortDescription,
    applicationLink: r.applicationLink || undefined,
    slug: r.slug
  };
}

function toInt(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
