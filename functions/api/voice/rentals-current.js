/**
 * POST /api/voice/rentals-current
 *
 * Zero-parameter MVP fallback for the GHL Voice AI Custom Action: returns
 * ALL currently available Sanity rentals as one plain-text block the AI can
 * read from during a live call, instead of relying on GHL to correctly pass
 * search parameters (see /api/voice/rentals, which needs those and has
 * proven unreliable coming from GHL's Custom Action). No request body is
 * required or read.
 *
 * Same Sanity query/fields as /api/voice/rentals and /api/rentals — just a
 * different, LLM-friendly response shape. Always live: queries Sanity fresh
 * on every request (normal Cloudflare/Sanity caching still applies).
 *
 * ponytail: small deliberate duplication of the fetch/normalize logic from
 * rentals.js rather than refactoring that file's internals to share code —
 * keeps the already-working parameterized endpoint untouched while this
 * ships fast. Fine at this size; consolidate if a third variant shows up.
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
  availableDate,
  status
`;

export async function onRequestPost({ env }) {
  if (!env.SANITY_PROJECT_ID || !env.SANITY_DATASET) {
    return json({ success: false, available_count: 0, available_rentals: '' }, 500);
  }

  let listings;
  try {
    listings = await fetchListings(env);
  } catch (err) {
    console.error('voice/rentals-current fetch error:', err);
    return json({ success: false, available_count: 0, available_rentals: '' }, 500);
  }

  return json({
    success: true,
    available_count: listings.length,
    available_rentals: formatForVoice(listings)
  });
}

// ponytail: deterministic house-number check, no LLM involved — mirrors
// schemas/rental.ts's looksLikeExactAddress(). Keep both in sync.
// (was missing from this file — formatForVoice() called it as if it
// were defined below, which would throw ReferenceError at runtime.)
function isSpecificAddress(value) {
  if (!value) return false;
  return /\d+\s+\S/.test(String(value).trim());
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
  return data.result || [];
}

// Prospect-safe only — internalNotes is never in RENTAL_FIELDS, so it can't
// leak here regardless of downstream changes.
function formatForVoice(listings) {
  if (listings.length === 0) return 'No rentals are currently available.';

  const blocks = listings.map((r, i) => {
    const parts = [r.unitNumber, r.streetAddress].filter(Boolean);
    const address = parts.join(' — ') || 'Address on request';
    const neighbourhood = (r.neighbourhood === 'Custom' && r.neighbourhoodCustom)
      ? r.neighbourhoodCustom
      : (r.neighbourhood || 'Not specified');
    // deterministic (non-LLM) address-quality signal, computed once here so
    // the model doesn't have to judge for itself whether an address is
    // real — see ABSOLUTE PROPERTY-FACT RULE / VIEWING BOOKING in the
    // agent prompt, which this reinforces rather than replaces.
    const exactAddressAvailable = isSpecificAddress(r.viewingAddress) || isSpecificAddress(r.streetAddress);
    const pets = petsText(r.pets, r.petsNote);
    const lines = [
      `PROPERTY ${i + 1}:`,
      `ID: ${r._id}`,
      `Address: ${address}`,
      `Public location: ${address}`,
      `Exact address available: ${exactAddressAvailable ? 'YES' : 'NO'}`,
      `Neighbourhood: ${neighbourhood}`,
      `Booking ready: ${exactAddressAvailable ? 'YES' : 'NO'}`,
      `Rent: $${r.monthlyRent || 0}/month`,
      `Bedrooms: ${r.bedrooms ?? 'N/A'}`,
      `Bathrooms: ${r.bathrooms ?? 'N/A'}`,
      `Pets: ${pets}`,
      `Available date: ${r.availableDate || 'Now'}`,
      `Description: ${r.shortDescription || 'N/A'}`
    ];
    return lines.join('\n');
  });

  return 'CURRENT AVAILABLE RENTALS:\n\n' + blocks.join('\n\n');
}

function petsText(pets, note) {
  const base = pets === 'all' ? 'All pets allowed'
    : pets === 'cats' ? 'Cats allowed, no dogs'
    : 'No pets';
  return note ? `${base} (${note})` : base;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
