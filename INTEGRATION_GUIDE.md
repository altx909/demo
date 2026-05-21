# Krishna / One Tree Property — Backend Integration Guide

Three pieces of backend work to wire up before the quiz and listings go fully live. Do them in order — each phase depends on the one before it.

**Phase 1.** GoHighLevel (GHL) — create custom fields + get API access. *No code.*
**Phase 2.** Cloudflare Pages Function for the quiz webhook — receives quiz submissions, pushes them into GHL with proper field mapping and tag logic.
**Phase 3.** Buildium API integration — pull live rental listings into the site through another Cloudflare Pages Function.

A short verification checklist at the bottom.

---

## Phase 1 — GoHighLevel setup (Inbound Webhook approach)

We're using GHL's **Inbound Webhook trigger** instead of the API token method. Simpler setup, no API key needed, and Krishna can adjust the field mapping later inside GHL without touching code.

### 1.1 Add the new custom fields

You already have some fields under "Tenants/Buyers" and "Property Management" groups. The tenant rental quiz needs **8 new custom fields** to land cleanly. Add these under the **Tenants/Buyers** group:

| Field name | Field type | Options / format |
|---|---|---|
| `Looking-for type` | Dropdown (single) | Me · Me & my family · A group / roommates · Someone else |
| `Move-in timeline` | Dropdown (single) | Right away · Next 30 days · Next 60 days · Just browsing |
| `Household size` | Dropdown (single) | 1 · 2 · 3 · 4 · 5+ |
| `Pets` | Dropdown (single) | No pets · 1 cat · 2+ cats · Small dog · Medium/large dog · Multiple / other |
| `Bedrooms needed` | Dropdown (single) | Studio · 1 · 2 · 3 · 4+ |
| `Target rent budget` | Dropdown (single) | Under $1,000 · $1,000–1,500 · $1,500–2,000 · $2,000–2,500 · $2,500+ |
| `Income source` | Text (free text — quiz stores comma-separated values) | — |
| `Property of interest` | Text (stores listing ID like `b-001`) | — |

You already have **Preferred area** and **Currently renting?** — reuse those. The quiz writes a comma-separated list of neighbourhoods to *Preferred area*.

**How to add fields in GHL:**
Settings → Custom Fields → Add Field → pick the Group (Tenants/Buyers) → pick the field type → name it exactly as above.

### 1.2 Create the Inbound Webhook workflow

1. Go to **Automation → Workflows → New Workflow**
2. Name it: **Quiz Lead Intake** (or whatever makes sense)
3. **Add Trigger** → choose **Inbound Webhook**
4. GHL generates a unique webhook URL — looks like `https://services.leadconnectorhq.com/hooks/<long-id>`. **Copy it** — you'll paste it into Cloudflare in Phase 2.
5. Click **Sample Data** in the trigger config and paste this so GHL learns the payload shape:

```json
{
  "contact": {
    "firstName": "Test Tenant",
    "email": "test@example.com",
    "phone": "3065551234"
  },
  "customFields": {
    "looking_for_type": "me",
    "move_in_timeline": "now",
    "household_size": "2",
    "pets": "cat",
    "bedrooms_needed": "2",
    "target_rent_budget": "2000",
    "preferred_area": "Lawson Heights, Stonebridge",
    "income_source": "employment",
    "currently_renting": "lease",
    "property_of_interest": "b-001"
  },
  "tags": ["Tenant-HOT", "Has-Pets", "Pet-cat", "Source:Property-b-001"],
  "consent": { "newListingAlerts": true },
  "sourcePage": "rent-quiz"
}
```

After saving the sample, GHL can reference any of these values in subsequent workflow actions using template tags like `{{inboundWebhookRequest.contact.email}}` or `{{inboundWebhookRequest.customFields.move_in_timeline}}`.

### 1.3 Configure the workflow actions

Add these actions in order:

**Action 1 — Create/Update Contact**
- First Name: `{{inboundWebhookRequest.contact.firstName}}`
- Email: `{{inboundWebhookRequest.contact.email}}`
- Phone: `{{inboundWebhookRequest.contact.phone}}`
- Source: `{{inboundWebhookRequest.sourcePage}}`
- For each custom field, map: e.g., *Move-in timeline* ← `{{inboundWebhookRequest.customFields.move_in_timeline}}`

**Action 2 — Add Tags from payload**

The quiz already calculates the right tags (Tenant-HOT, Has-Pets, etc.) and ships them in the `tags` array. Add an **Add Tag** action and set the value to `{{inboundWebhookRequest.tags}}` — GHL will split on commas and apply each.

**Action 3 (optional) — Notify Krishna on hot leads**

Add an *If/Else* condition: *if `{{inboundWebhookRequest.customFields.move_in_timeline}}` equals `now`* → send Krishna an internal SMS or email with the lead details. This is the bit Krishna will most appreciate — instant pings on hot leads.

**Action 4 (optional) — Special handling for sensitive cases**

If `{{inboundWebhookRequest.customFields.income_source}}` contains `social-assistance` → add internal task for manual review. Krishna decides case-by-case rather than auto-routing.

**Publish the workflow** when done.

### 1.4 Test the webhook directly

Before wiring it to the site, test the workflow accepts data:

```bash
curl -X POST <YOUR_WEBHOOK_URL> \
  -H "Content-Type: application/json" \
  -d '{"contact":{"firstName":"Test","email":"test@example.com","phone":"3065551234"},"customFields":{"move_in_timeline":"now","bedrooms_needed":"2"},"tags":["Tenant-HOT","Test"],"sourcePage":"manual-test"}'
```

Check GHL → Contacts → you should see a "Test" contact with the tags applied. If it works, you're ready for Phase 2.

---

## Phase 2 — Cloudflare Pages Function (webhook forwarder)

Since the site is on Cloudflare Pages, anything in `/functions/` becomes a live API endpoint automatically. We use a tiny function to forward quiz submissions to the GHL webhook — this hides the webhook URL from the public and lets us add anti-spam later.

### 2.1 Set environment variable in Cloudflare Pages

1. Workers & Pages → your `demo` project → **Settings → Environment variables**
2. Add one **production** variable:
   - `GHL_WEBHOOK_URL` = the webhook URL you copied from Phase 1.2
3. Click **Save** — Cloudflare will rebuild the site.

### 2.2 Create the Cloudflare Pages Function

In your local repo, create this file:

**`functions/api/quiz-submit.js`**

```js
/**
 * POST /api/quiz-submit
 * Forwards a quiz payload from the front-end to the GHL Inbound Webhook.
 */
export async function onRequestPost({ request, env }) {
  try {
    const payload = await request.json();

    if (!payload?.contact?.email) {
      return new Response(JSON.stringify({ error: 'Email required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const ghlRes = await fetch(env.GHL_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!ghlRes.ok) {
      const errText = await ghlRes.text();
      console.error('GHL webhook error:', errText);
      return new Response(JSON.stringify({ error: 'GHL webhook failed' }), {
        status: 502, headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('quiz-submit error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

That's the entire backend. Hides the webhook URL, validates the email is present, forwards to GHL. Cleaner than the API token version.

### 2.3 Wire the front-end to call it

In both quiz files (`otp/rent/index.html` and `otp/rent/property/index.html`), replace the placeholder `submitToBackend()` function with a real fetch:

```js
async function submitToBackend(payload) {
  try {
    const res = await fetch('/api/quiz-submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Submission failed');
    return await res.json();
  } catch (err) {
    console.error('Quiz submission error:', err);
    return null;
  }
}
```

Tell me when GHL is set up and I'll do this swap for you across both quiz files.

### 2.4 Deploy & test

```bash
cd ~/demo
git add functions/
git commit -m "Add quiz-submit Cloudflare Pages Function"
git push
```

After Cloudflare rebuilds, test:

1. Go through the quiz on the live site
2. Open browser DevTools → **Network** tab → submit the final step
3. Look for the request to `/api/quiz-submit` — should return `200 OK`
4. Check GHL → Contacts — your test entry should appear with all the right tags and custom fields populated

---

## Phase 3 — Buildium API for live rental listings

### 3.1 Get Buildium API credentials

1. Log into Buildium → **Settings → Application Settings → API Keys**
2. Create a new API key with at least these scopes:
   - **Read Rentals** (units, properties, photos, leasing info)
3. Save the **Client ID** and **Client Secret** securely.

Buildium uses OAuth-style header authentication. The Worker will handle this.

### 3.2 Add Buildium environment variables to Cloudflare

In the same Cloudflare Pages settings page (Settings → Environment variables):

- `BUILDIUM_CLIENT_ID` = your Client ID
- `BUILDIUM_CLIENT_SECRET` = your Client Secret

### 3.3 Create the Buildium listings function

**`functions/api/rentals.js`**

```js
/**
 * GET /api/rentals
 * Fetches active rental listings from Buildium, normalizes them to the
 * site's standard shape, and caches for 15 minutes.
 */
export async function onRequestGet({ env, request }) {
  const cache = caches.default;
  const cacheKey = new Request(request.url, request);
  let cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const headers = {
      'x-buildium-client-id': env.BUILDIUM_CLIENT_ID,
      'x-buildium-client-secret': env.BUILDIUM_CLIENT_SECRET,
      'Accept': 'application/json'
    };

    // 1. Get all rental listings currently marked Active in Buildium
    //    (endpoint name confirmed against Buildium API docs — adjust if their API version differs)
    const listingsRes = await fetch(
      'https://api.buildium.com/v1/rentals?statuses=Active&limit=100',
      { headers }
    );

    if (!listingsRes.ok) {
      const errText = await listingsRes.text();
      return new Response(JSON.stringify({ error: 'Buildium upstream failed', detail: errText }), {
        status: 502, headers: { 'Content-Type': 'application/json' }
      });
    }

    const rawListings = await listingsRes.json();

    // 2. Normalize each listing to OUR site's standard shape
    const listings = rawListings.map(b => ({
      id: `buildium-${b.Id}`,
      image: b.PrimaryImage?.Url || '',
      gallery: (b.Images || []).map(i => i.Url),
      price: b.Rent || 0,
      address: b.Address?.AddressLine1 || '',
      beds: b.Bedrooms || 0,
      baths: b.Bathrooms || 0,
      sqft: b.SquareFootage || 0,
      neighbourhood: b.Address?.Neighborhood || '',
      type: b.PropertyType || 'Apartment',
      available: b.AvailableDate ? `Available ${b.AvailableDate}` : 'Available Now',
      pets: mapPetPolicy(b.PetPolicy),
      parking: b.ParkingType || '',
      laundry: b.LaundryType || '',
      furnished: b.IsFurnished || false
    }));

    const body = JSON.stringify({ listings, count: listings.length });
    const response = new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=900' // 15 minutes
      }
    });

    await cache.put(cacheKey, response.clone());
    return response;

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error', detail: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

function mapPetPolicy(p) {
  if (!p) return 'none';
  const s = String(p).toLowerCase();
  if (s.includes('cat') && s.includes('dog')) return 'all';
  if (s.includes('cat')) return 'cats';
  if (s.includes('small dog')) return 'small-dogs';
  if (s.includes('dog')) return 'all';
  return 'none';
}
```

⚠️ **Note:** Buildium's actual property field names (e.g., `PrimaryImage`, `Rent`, `Bedrooms`) need to be verified against your specific Buildium account/API version. The first thing to do once the Worker deploys is hit `/api/rentals` and inspect the raw response — then adjust the mapping. I can help with this once you give me the API access.

### 3.4 Wire the rent page to fetch from this endpoint

In `otp/rent/index.html`, the `RENTALS` constant currently has hardcoded mock data. We'll swap it for a fetch:

```js
async function loadRentals() {
  try {
    const res = await fetch('/api/rentals');
    if (!res.ok) throw new Error('Failed to load rentals');
    const data = await res.json();
    return data.listings;
  } catch (err) {
    console.error('Rentals load error:', err);
    return []; // fall back to empty grid
  }
}

// Replace `const RENTALS = [...]` with:
let RENTALS = [];
loadRentals().then(listings => {
  RENTALS = listings;
  renderRentals();
  liveCount.textContent = `${RENTALS.length} available now`;
});
```

Same pattern for the property detail page.

### 3.5 Deploy & test

```bash
cd ~/demo
git add functions/
git commit -m "Add Buildium API integration"
git push
```

After rebuild, hit `demo-32n.pages.dev/api/rentals` directly in your browser — you should see JSON with all active Buildium listings. If it works, the rent page picks them up automatically on next reload.

---

## Verification checklist

When everything's done, you should be able to confirm:

- [ ] **GHL fields exist** — Settings → Custom Fields shows all 8 new fields under Tenants/Buyers
- [ ] **GHL workflow is published** — Automation → Workflows shows "Quiz Lead Intake" as Published
- [ ] **Webhook test from curl works** — the manual curl in Phase 1.4 creates a contact in GHL with tags applied
- [ ] **Quiz submission lands in GHL** — Complete a test quiz on the live site, then check Contacts → your test entry has correct tags + populated custom fields
- [ ] **Quiz on property page tags the property** — Submit from `/rent/property/?id=b-001` → contact has a `Source:Property-b-001` tag
- [ ] **Buildium endpoint returns listings** — `demo-32n.pages.dev/api/rentals` returns JSON with active listings
- [ ] **Rent page renders Buildium data** — Refresh `/rent/` and listings come from live Buildium API
- [ ] **Filters still work** — Search, bedrooms, budget, pets filters all work against live data
- [ ] **Detail pages still render** — Click any Buildium listing → detail page loads with correct property
- [ ] **Soft-fail when APIs are down** — If Buildium is unreachable, page shows graceful empty state instead of breaking

---

## What I need from you to move forward on the backend

1. **GHL Inbound Webhook URL** (Phase 1.2) — paste it to me once the workflow is set up
2. **Buildium Client ID + Secret** (Phase 3.1)
3. **Sample raw Buildium response** — once you have credentials, run a quick curl to `https://api.buildium.com/v1/rentals?statuses=Active&limit=1` and paste the JSON. That way I can verify the field name mapping in the normalizer

Once those three are in, I'll finish the wiring and we deploy the backend together.

In the meantime, we can keep building other pages (Property Management, Buy a Home, Sell with Confidence, About, Neighbourhoods) — they're all independent of this backend work.
