/**
 * GET /api/rentals
 *
 * Fetches all "available" rental listings from Sanity, normalizes them
 * to the shape the front-end already expects, and caches for 5 minutes.
 *
 * Required Cloudflare environment variables:
 *   SANITY_PROJECT_ID  (e.g., u9fnmai5)
 *   SANITY_DATASET     (e.g., production)
 *   SANITY_API_TOKEN   (Viewer-role token from sanity.io)
 */

const SANITY_API_VERSION = 'v2024-01-01';

const RENTAL_FIELDS = `
  _id,
  "slug": slug.current,
  title,
  unitNumber,
  streetAddress,
  neighbourhood,
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

export async function onRequestGet({env, request}) {
  const cache = caches.default;
  const cacheKey = new Request(request.url, request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  if (!env.SANITY_PROJECT_ID || !env.SANITY_DATASET) {
    return json({error: 'Sanity not configured'}, 500);
  }

  const query = `*[_type == "rental" && status == "available"] | order(featured desc, _createdAt desc) { ${RENTAL_FIELDS} }`;
  const url = `https://${env.SANITY_PROJECT_ID}.api.sanity.io/${SANITY_API_VERSION}/data/query/${env.SANITY_DATASET}?query=${encodeURIComponent(query)}&perspective=published`;

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
    const listings = (data.result || []).map(normalize);
    const body = JSON.stringify({listings, count: listings.length});

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
    console.error('rentals fetch error:', err);
    return json({error: 'Server error', detail: err && err.message}, 500);
  }
}

/* ============================================
   NORMALIZATION — Sanity → front-end shape
   The rent page + property page rely on these field names.
   ============================================ */

function normalize(r) {
  return {
    id: r._id,
    slug: r.slug || '',
    title: r.title || '',
    unitNumber: r.unitNumber || '',
    address: formatAddress(r),
    streetAddress: r.streetAddress || '',
    postalCode: r.postalCode || '',
    neighbourhood: r.neighbourhood || '',
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
  // Sanity image CDN supports query params for on-the-fly resizing + format
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
