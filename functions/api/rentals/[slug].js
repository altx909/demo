/**
 * GET /api/rentals/[slug]
 *
 * Fetches a single rental by its slug. Returns the same normalized shape
 * as /api/rentals so the property detail page can use either source.
 * Cached 5 minutes.
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
  postalCode,
  propertyType,
  floor,
  yearBuilt,
  bedrooms,
  bathrooms,
  sqft,
  monthlyRent,
  securityDeposit,
  petDeposit,
  applicationFee,
  leaseLengthOptions,
  "heroImage": heroImage.asset->url,
  "gallery": gallery[].asset->url,
  "floorPlanImage": floorPlanImage.asset->url,
  virtualTourUrl,
  shortDescription,
  fullDescription,
  highlights,
  inSuiteAmenities,
  buildingAmenities,
  communityAmenities,
  utilitiesIncluded,
  utilitiesTenantPaid,
  pets,
  petsNote,
  parking,
  parkingStalls,
  laundry,
  furnished,
  heating,
  airConditioning,
  smokingAllowed,
  "nearby": nearby[]{name, distance},
  applicationRequirements,
  applicationLink,
  availableDate,
  promotions,
  featured,
  status
`;

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

  // GROQ — match by slug.current, also fall back to _id for legacy ?id=<docId>
  const query = `*[_type == "rental" && (slug.current == $slug || _id == $slug)][0] { ${RENTAL_FIELDS} }`;
  const params_qs = `&%24slug=${encodeURIComponent(JSON.stringify(slug))}`;
  const url = `https://${env.SANITY_PROJECT_ID}.api.sanity.io/${SANITY_API_VERSION}/data/query/${env.SANITY_DATASET}?query=${encodeURIComponent(query)}${params_qs}&perspective=published`;

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
    if (!data.result) {
      return json({error: 'Rental not found'}, 404);
    }

    const listing = normalize(data.result);
    const body = JSON.stringify({listing});

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
    console.error('rental fetch error:', err);
    return json({error: 'Server error', detail: err && err.message}, 500);
  }
}

/* Identical helpers to /api/rentals — duplicated rather than imported so each
   function file is self-contained for Cloudflare Pages Functions. */

function normalize(r) {
  return {
    id: r._id,
    slug: r.slug || '',
    title: r.title || '',
    unitNumber: r.unitNumber || '',
    address: formatAddress(r),
    streetAddress: r.streetAddress || '',
    postalCode: r.postalCode || '',
    neighbourhood: (r.neighbourhood === 'Custom' && r.neighbourhoodCustom)
      ? r.neighbourhoodCustom
      : (r.neighbourhood || ''),
    type: r.propertyType || 'Apartment',
    floor: r.floor || null,
    yearBuilt: r.yearBuilt || null,
    beds: r.bedrooms ?? 0,
    baths: r.bathrooms ?? 0,
    sqft: r.sqft || 0,
    price: r.monthlyRent || 0,
    deposit: r.securityDeposit || r.monthlyRent || 0,
    petDeposit: r.petDeposit || null,
    applicationFee: r.applicationFee || null,
    leaseLength: (r.leaseLengthOptions && r.leaseLengthOptions[0]) || '12 months',
    leaseLengthOptions: r.leaseLengthOptions || [],
    image: addImageParams(r.heroImage, 1600),
    gallery: (r.gallery || []).filter(Boolean).map((u) => addImageParams(u, 1600)),
    floorPlan: addImageParams(r.floorPlanImage, 1600),
    virtualTourUrl: r.virtualTourUrl || '',
    shortDescription: r.shortDescription || '',
    description: parseDescription(r.fullDescription),
    highlights: r.highlights || [],
    inSuiteAmenities: r.inSuiteAmenities || [],
    buildingAmenities: r.buildingAmenities || [],
    communityAmenities: r.communityAmenities || [],
    included: r.utilitiesIncluded || [],
    tenantPaid: r.utilitiesTenantPaid || [],
    pets: r.pets || 'none',
    petsNote: r.petsNote || '',
    parking: r.parking || '',
    parkingStalls: r.parkingStalls || 0,
    laundry: r.laundry || '',
    furnished: !!r.furnished,
    heating: r.heating || '',
    airConditioning: !!r.airConditioning,
    smokingAllowed: !!r.smokingAllowed,
    nearby: r.nearby || [],
    applicationRequirements: r.applicationRequirements || [],
    applicationLink: r.applicationLink || '',
    available: formatAvailable(r.availableDate, r.status),
    promotions: r.promotions || [],
    featured: !!r.featured,
    status: r.status || 'available'
  };
}

function formatAddress(r) {
  const parts = [r.unitNumber, r.streetAddress].filter(Boolean);
  return parts.join(' — ');
}

function formatAvailable(date, status) {
  if (status === 'rented') return 'Rented';
  if (status === 'coming-soon') return 'Coming Soon';
  if (!date) return 'Available Now';
  const d = new Date(date);
  const now = new Date();
  if (d <= now) return 'Available Now';
  return `Available ${d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}`;
}

function addImageParams(url, width) {
  if (!url) return '';
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}w=${width}&auto=format&fit=crop&q=80`;
}

function parseDescription(blocks) {
  if (!blocks || !Array.isArray(blocks)) return [];
  return blocks
    .map((block) => {
      if (block._type === 'block' && block.children) {
        return block.children.map((c) => c.text || '').join('');
      }
      return '';
    })
    .filter(Boolean);
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json'}
  });
}
