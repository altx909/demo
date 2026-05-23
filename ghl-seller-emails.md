# Seller Quiz — GHL Email Flows

Reference copy for two emails in the **seller** workflow. Build the workflow in GHL; paste these in.
This is a reference doc only — not part of the website (safe to keep out of your git commit).

**Recommended trigger:** Contact tag `sell-completed` is added (fires only on a finished quiz).
If you also want to catch homepage-widget-only leads, trigger on tag `seller-quiz` instead, or add a
second path. Use a small wait/condition so abandoned leads (`sell-started` without `sell-completed`)
go to a separate nurture if you want.

> **Merge fields:** pick the exact token from GHL's field dropdown when composing — the keys below
> assume your custom fields use the same keys the quiz sends (`seller_timeline`, etc.). Set a
> fallback of `there` on `{{contact.first_name}}` so nameless homepage-widget leads still read well.

---

## EMAIL 1 — Seller confirmation (to the lead)

**From:** Krishna Ambilwade
**Reply-to:** info@meetkrishna.com

**Subject:** Thanks, {{contact.first_name}} — your home value request is in

**Preview text:** I'll be in touch shortly with your estimate. No pressure, ever.

**Body:**

Hi {{contact.first_name}},

Thanks for reaching out about your home — your request is in, and I'm on it.

Here's what happens next: I'll pull recent comparable sales in your Saskatoon neighbourhood and put
together a realistic estimate of what your home could sell for in today's market. Someone from my team
will follow up shortly to share it and answer any questions.

A couple of promises while you wait:

- No pressure. Plenty of people ask "what's it worth?" long before they're ready to sell — that's
  completely fine. You'll get straight answers either way.
- No spam. Your details stay private, and I'll only reach out about your home.

If you'd rather just talk it through, you're welcome to grab a time on my calendar:

**[ Book a call with Krishna ]** → https://meetkrishna.com/cal/

Talk soon,

**Krishna Ambilwade**
Saskatoon Real Estate · Property Management
(306) 850-6744 · info@meetkrishna.com

---

## EMAIL 2 — Internal notification (to Krishna's team)

**To:** your team inbox (e.g. info@meetkrishna.com / leads@…)
**From:** notifications@meetkrishna.com (or your sending domain)

**Subject:** New Seller Lead — {{contact.first_name}} {{contact.last_name}} ({{contact.seller_lead_heat}})

**Body:**

New seller lead from the website. Details below.

LEAD
- Name:    {{contact.first_name}} {{contact.last_name}}
- Email:   {{contact.email}}
- Phone:   {{contact.phone}}
- Heat:    {{contact.seller_lead_heat}}
- Source:  {{contact.sourcePage}}   (sell-landing = full quiz · home-valuation-widget = homepage form)

PROPERTY & ANSWERS
- Address:           {{contact.seller_property_address}}
- Timeline to sell:  {{contact.seller_timeline}}
- Reason for moving: {{contact.seller_reason}}
- Property type:     {{contact.seller_property_type}}
- Mortgage standing: {{contact.seller_mortgage_status}}
- Residence type:    {{contact.seller_residence_type}}
- Price knowledge:   {{contact.seller_price_knowledge}}
- Marketing opt-in:  {{contact.marketUpdates}}

NEXT STEP
HOT → call within the hour. WARM → call/text today. COLD → send the value estimate, light follow-up.

---
LEGEND (the quiz stores short codes)

Timeline:        now = next 3 months · 3-6 = 3–6 months · 6-12 = 6–12 months · curious = just curious about value
Reason:          upsizing · downsizing · relocating · investment = cashing in / financial · life = life change (family, retirement)
Property type:   detached · condo = condo/townhouse · multiunit = duplex/multi-unit · acreage = acreage/land · rental = investment property
Mortgage:        paid-off · under-half = owes <50% · about-half · most = owes most of value · unsure
Residence:       primary · investment = rental/investment · secondary = second home/cottage · inherited = estate sale
Price knowledge: valued = recently valued · rough = rough idea from nearby · noidea = wants to find out · underwater = worried owes more than worth
Heat:            HOT · WARM · COLD

---

## Setup notes

- If `{{contact.sourcePage}}` or `{{contact.marketUpdates}}` aren't mapped as custom fields, drop those
  two lines — they're nice-to-have, not required. (`sourcePage` and `consent.marketUpdates` come through
  in the webhook payload but may not be mapped to fields yet.)
- For homepage-widget leads, only Address + Email + Heat-less fields will be populated (the quiz
  questions weren't answered), so several lines will be blank — that's expected.
- Calendly link is still the placeholder `https://meetkrishna.com/cal/` — swap in the real one.
