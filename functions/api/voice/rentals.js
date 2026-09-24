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
 * mode "lookup":   { slug? | address? | id? } -> single listing (match_count 0 or 1)
 *
 * Response is flattened (property_1_*, property_2_*, property_3_*) rather
 * than a nested array — GHL Voice AI Custom Actions select response data by
 * fixed top-level path, and an array of objects isn't something its
 * selectedPaths config can point at. See ADR note in commit message.
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
const MAX_RESULTS = 3;

// ponytail: deterministic house-number check, no LLM involved — mirrors
// schemas/rental.ts's looksLikeExactAddress(). Keep both in sync.
function isSpecificAddress(value) {
  if (!value) return false;
  return /^\d+\s+\S/.test(String(value).trim());
}

const RENTAL_FIELDS = `
  _id,
  "slug": slug.current,
  title,
  unitNumber,
  streetAddress,
  viewingAddress,
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
    return json({ success: false, error: 'Sanity not configured' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const mode = body.mode === 'lookup' ? 'lookup' : 'search';

  let listings;
  try {
    listings = await fetchListings(env);
  } catch (err) {
    console.error('voice/rentals fetch error:', err);
    return json({ success: false, error: 'Server error', detail: err && err.message }, 500);
  }

  let matches;
  if (mode === 'lookup') {
    const { slug, address, id } = body;
    let match = null;
    if (id) match = listings.find((r) => r.id === id);
    if (!match && slug) match = listings.find((r) => r.slug === slug);
    if (!match && address) {
      const needle = String(address).toLowerCase();
      match = listings.find((r) => r.address.toLowerCase().includes(needle));
    }
    matches = match ? [match] : [];
  } else {
    // GHL's Custom Action sends 0 (not null/omitted) for an optional
    // number param the caller never gave a value for, so 0 has to mean
    // "not specified" here too, or every real listing gets budget-
    // filtered out by "rent > 0 + 200".
    const bedrooms = toInt(body.bedrooms);
    const maxBudget = toInt(body.maxBudget);
    const neighbourhood = body.neighbourhood ? String(body.neighbourhood).toLowerCase() : '';
    const pets = body.pets || 'none';

    matches = listings.filter((r) => {
      if (bedrooms && r.bedrooms < bedrooms) return false;
      if (maxBudget && r.monthlyRent > maxBudget + 200) return false;
      if (neighbourhood && !r.neighbourhood.toLowerCase().includes(neighbourhood)) return false;
      if (!petsCompatible(pets, r.pets)) return false;
      return true;
    });

    if (matches.length < MAX_RESULTS) {
      // Fallback: widen budget/bedrooms, but never show an incompatible pet
      // policy or a neighbourhood the caller explicitly ruled out.
      matches = listings.filter((r) => {
        if (maxBudget && r.monthlyRent > maxBudget + 400) return false;
        if (bedrooms && r.bedrooms < Math.max(0, bedrooms - 1)) return false;
        if (neighbourhood && !r.neighbourhood.toLowerCase().includes(neighbourhood)) return false;
        if (!petsCompatible(pets, r.pets)) return false;
        return true;
      });
    }
  }

  matches = matches.slice(0, MAX_RESULTS);

  const out = { success: true, mode, match_count: matches.length };
  for (let i = 0; i < MAX_RESULTS; i++) {
    Object.assign(out, flatFields(i + 1, matches[i] || null));
  }
  return json(out);
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
    // never exposed downstream — only used to compute bookingReady below.
    bookingReady: isSpecificAddress(r.viewingAddress) || isSpecificAddress(r.streetAddress),
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

// Prospect-safe, flat shape only — never internalNotes or any field not
// queried above (internalNotes isn't in RENTAL_FIELDS at all, so it can
// never leak here regardless of downstream changes). Empty strings (not
// missing keys) when a slot is unfilled, so every selectedPaths entry
// always resolves to something for GHL.
function flatFields(n, r) {
  const p = `property_${n}_`;
  return {
    [`${p}id`]: r ? r.id : '',
    [`${p}title`]: r ? r.title : '',
    [`${p}address`]: r ? r.address : '',
    [`${p}rent`]: r ? r.monthlyRent : '',
    [`${p}bedrooms`]: r ? r.bedrooms : '',
    [`${p}bathrooms`]: r ? r.bathrooms : '',
    [`${p}pets`]: r ? r.pets : '',
    [`${p}booking_ready`]: r ? (r.bookingReady ? 'YES' : 'NO') : '',
    [`${p}available_date`]: r ? (r.availableDate || '') : '',
    [`${p}slug`]: r ? r.slug : ''
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
