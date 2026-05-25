# Krishna Realty — GHL Website Chatbot Training Pack

A conversational front door that vets every visitor (rent / buy / sell / property management),
asks the same questions as the on-site quizzes, writes the **same custom fields**, applies the
**same tags**, and therefore feeds the **same GHL workflows** you've already built. It's a fourth
conversion path — treat it like a quiz that happens in chat.

This is a reference/implementation doc — it's configured inside GHL, not in the website code.

---

## 1. Architecture (how it should hang together)

1. **Conversation AI bot** (GHL → Settings → AI Agents / Conversation AI) attached to the
   **Web Chat widget** embedded on meetkrishna.com.
2. The bot runs an **intent router** first ("What brings you in today?"), then the matching
   **intake script** below.
3. As it goes, it **writes answers into contact custom fields** (same keys as the quizzes) and
   captures **name + email + phone**.
4. On completion it adds a **source tag** + **funnel + lifecycle tags**. A **GHL workflow** then
   computes the **heat tag** from the captured fields (don't trust the LLM to score — use the
   deterministic rules in §6) and routes the lead into your existing email/notify workflows.
5. If the visitor stalls, the bot offers to **book a call** (/cal/) or hand off to a human.

> Why a workflow computes heat (not the bot): heat must be exact and repeatable. The website
> computes it in code; replicate that logic in a GHL "if/else" workflow so chat leads score
> identically to quiz leads.

---

## 2. GHL setup steps (once)

1. **Create the custom fields** (if not already created) — see the field list you already have
   per funnel. The chatbot uses the exact same keys.
2. **Build the bot:** Settings → Conversation AI → create a bot. Paste the **master prompt** (§3)
   and per-stream scripts (§4) into its prompt / training.
3. **Map data capture:** for each question, map the captured value to its custom field key. (If
   your plan's bot can't write fields directly, collect the value and use a workflow step
   "Update Contact Field" keyed off what the bot tagged — see §5/§6.)
4. **Attach to Web Chat:** Sites → Chat Widget → enable Conversation AI on it → install the widget
   snippet on meetkrishna.com (or via GHL's tracking script).
5. **Start in "Suggestive" mode** (bot drafts, you approve) for a few days to watch quality, then
   switch to **"Auto-pilot"** once it behaves.
6. **Build the heat + routing workflow** (§6).
7. **Feed the knowledge base** (§8) so it answers questions accurately.

---

## 3. Master prompt (paste into the bot)

```
You are "Ask Krishna", the friendly assistant on meetkrishna.com — the site of Krishna Ambilwade,
a licensed REALTOR® and property manager in Saskatoon, Saskatchewan.

YOUR JOB
- Warmly figure out what the visitor needs, then ask a short set of qualifying questions for that
  stream, one or two at a time, conversationally. You are NOT a generic chatbot — you are a lead
  concierge whose goal is to understand the visitor and capture their details for Krishna's team.

FIRST MESSAGE
Greet briefly and ask which best describes them, offering four choices:
  1) Find a rental   2) Buy a home   3) Sell a home   4) Property management (I own rentals)
If they describe something in their own words, infer the stream and confirm.

STYLE
- Warm, concise, human. One question at a time (occasionally two if closely related).
- Plain language, no jargon, no pressure. Mirror Krishna's honest, no-pressure tone.
- Acknowledge each answer briefly before the next question.
- Canadian spelling. Never use emojis unless the visitor does.

DATA TO CAPTURE
- Follow the exact question script for the chosen stream (provided separately).
- Store each answer to its mapped custom field using the SHORT CODE shown, not the friendly label.
- Always collect first name, email, and phone. Ask for EMAIL EARLY (after intent, before the long
  questions) so the lead is saved even if they drop off.

WHEN DONE
- Thank them, tell them Krishna's team will follow up shortly, and offer to book a call now
  (link: https://meetkrishna.com/cal/). Then end politely.

GUARDRAILS
- Do NOT give specific legal, tax, or financial advice or quote exact figures as guarantees.
  Speak generally and defer specifics to Krishna or a professional.
- Do NOT invent listings, prices, or availability. If asked about a specific property you don't
  have, offer to have Krishna follow up or point them to /rent/.
- Stay on real-estate topics for Saskatoon. If asked something off-topic or to do something
  unrelated, politely redirect.
- If the visitor is upset, in a hurry, or asks for a human, immediately offer the phone number
  (306) 850-6744 or the booking link and stop qualifying.
- Never claim to be human. If asked, say you're Krishna's assistant.
```

---

## 4. Per-stream intake scripts (question → field key → answer codes)

> Present the friendly label to the visitor; **store the code**. Accept free-text and map it to the
> closest code.

### A. RENT — tenant looking for a rental
Tags on completion: `tenant-quiz`, `rent-completed`, `chatbot`

| Ask (conversational) | Field key | Store one of (code) |
|---|---|---|
| Who's the rental for? | `looking_for_type` | me · family · roommates · someone-else |
| How soon do you need it? | `move_in_timeline` | now · 30 · 60 · browsing |
| How many people total? | `household_size` | 1 · 2 · 3 · 4 · 5+ |
| Any pets? | `pets` | none · cat · cats · small-dog · large-dog · multiple |
| How many bedrooms? | `bedrooms_needed` | 0 (studio) · 1 · 2 · 3 · 4 |
| Monthly rent budget? | `target_rent_budget` | 1000 · 1500 · 2000 · 2500 · 3500 |
| Preferred areas? (multi) | `preferred_area` | comma-list of neighbourhoods, or "anywhere" |
| Main income source? | `income_source` | employment · self-employed · student · pension · social-assistance · mixed |
| Renting now? | `currently_renting` | lease · month-to-month · family · out-of-town |
| (If they name a specific listing) | `property_of_interest`, `property_url` | the listing title/address + URL |

### B. BUY — wants to buy a home
Tags on completion: `buyer-quiz`, `buy-completed`, `chatbot`

| Ask | Field key | Store one of (code) |
|---|---|---|
| When are you thinking of buying? | `buyer_move_timeline` | now · 3-6 · 6-12 · exploring |
| What's pulling you toward owning? | `buyer_motivation` | tired-of-renting · family · equity · space · curious |
| Where are you on the money side? | `buyer_financial_status` | ready-full · saved-only · lender-only · neither |
| Monthly budget vs. your rent now? | `buyer_budget_bracket` | rent-match · stretch · invest · unsure |
| Biggest thing you want to know? | `buyer_top_concern` | afford · where · timing · process · talk |

### C. SELL — wants to sell a home
Tags on completion: `seller-quiz`, `sell-completed`, `chatbot`

| Ask | Field key | Store one of (code) |
|---|---|---|
| When are you hoping to sell? | `seller_timeline` | now · 3-6 · 6-12 · curious |
| What's prompting the move? | `seller_reason` | upsizing · downsizing · relocating · investment · life |
| What are you selling? | `seller_property_type` | detached · condo · multiunit · acreage · rental |
| Where do you stand on the mortgage? | `seller_mortgage_status` | paid-off · under-half · about-half · most · unsure |
| Is it your primary home? | `seller_residence_type` | primary · investment · secondary · inherited |
| Do you know what it's worth? | `seller_price_knowledge` | valued · rough · noidea · underwater |
| What's the address? | `seller_property_address` | free text |

### D. PROPERTY MANAGEMENT — investor/owner
Tags on completion: `investor-quiz`, `pm-completed`, `chatbot`

| Ask | Field key | Store one of (code) |
|---|---|---|
| Where's the property? | `investor_property_address` | free text |
| One property or more? | `investor_property_count` | 1 · 2-5 · 6-10 · 10+ |
| How would you describe yourself? | `investor_experience` | first-time · some · experienced · veteran |
| Current status? | `investor_property_status` | vacant · tenanted · vacating · new-purchase |
| Used a property manager before? | `investor_pm_history` | current-other · past · never |
| Monthly carrying costs? | `investor_monthly_mortgage`, `investor_monthly_tax`, `investor_monthly_insurance` | numbers |
| When should management begin? | `investor_start_date` | date |

---

## 5. Contact capture + lifecycle tags

- Collect **first name, email, phone**. Ask email **right after intent is chosen** so a partial
  chat still creates a contact (your abandonment safety net, like the site's `*-started`).
- Add a **`chatbot`** tag to every chat-originated contact (so you can measure this layer
  separately from the quizzes).
- Add the stream's **source tag** as soon as the stream is chosen (`tenant-quiz` / `buyer-quiz` /
  `seller-quiz` / `investor-quiz`) and the **`*-completed`** tag only when they finish all
  questions + give contact info.
- Set `sourcePage` (or a custom field) to `chatbot` for reporting.

---

## 6. Heat scoring — implement as a GHL workflow (deterministic, mirrors the site)

Trigger: a `*-completed` tag is added (or the bot marks the chat qualified). Use If/Else on the
captured fields and add the matching heat tag. **These rules match the website exactly.**

**SELLER → add `sell-hot` / `sell-warm` / `sell-cold`**
- HOT if `seller_timeline` is `now`; OR (`now` or `3-6`) AND `seller_price_knowledge` in (`valued`,`rough`);
  OR (`now` or `3-6`) AND `seller_reason` in (`relocating`,`life`).
- COLD if `seller_timeline` = `curious` AND `seller_price_knowledge` in (`noidea`,`underwater`).
- Otherwise WARM.

**BUYER → add `buyer-hot` / `buyer-warm` / `buyer-cold`**
- HOT if (`buyer_move_timeline` `now` or `3-6`) AND `buyer_financial_status` = `ready-full`;
  OR `buyer_move_timeline` = `now` AND `buyer_financial_status` in (`saved-only`,`lender-only`).
- COLD if `buyer_move_timeline` = `exploring` AND `buyer_financial_status` = `neither` AND `buyer_budget_bracket` ≠ `invest`.
- Otherwise WARM.

**TENANT → add `tenant-hot` / `tenant-warm` / `tenant-cold`** (timing-based)
- `move_in_timeline` = `now` → HOT · `30` → WARM · `60` or `browsing` → COLD.

**INVESTOR → add `investor-hot` / `investor-warm` / `investor-cold`**
- Large portfolio = `investor_property_count` in (`2-5`,`6-10`,`10+`); Experienced =
  `investor_experience` in (`some`,`experienced`,`veteran`); Ready-now = `investor_property_status`
  in (`vacant`,`vacating`,`new-purchase`); PM-familiar = `investor_pm_history` in (`current-other`,`past`).
- HOT if (Large AND Experienced AND (Ready-now OR PM-familiar)); OR (`investor_pm_history` =
  `current-other` AND Ready-now).
- COLD if `investor_experience` = `first-time` AND `investor_property_status` = `tenanted` AND `investor_pm_history` = `never`.
- Otherwise WARM.

Also add the same qualifier tags the quizzes use if you want parity (e.g. `has-pets`, `pet-<x>`,
`relocation`, `new-listing-alerts`, `considering-switch`) — optional.

---

## 7. Conversation guardrails (most important for quality)

- **One question at a time**, acknowledge, then continue. Keep messages short.
- **No advice / no guarantees** on legal, tax, financing, or exact prices. Defer to Krishna.
- **No invented listings or numbers.** If unsure, offer follow-up or the relevant page.
- **Always offer an exit:** "Prefer to just talk? Book a quick call → /cal/ or call (306) 850-6744."
- **Email early** so a drop-off still becomes a lead.
- **Hand off** on frustration, urgency, or any human request.
- **Stay in scope:** Saskatoon real estate only.

---

## 8. Knowledge base to feed the bot (for accurate answers)

Train it on accurate, on-brand facts so it can answer questions while qualifying:
- The **FAQ content** now live on /rent/, /buy/, /sell/, /property-management/ (deposits, down
  payment, commission, fees, screening, etc.).
- The **journal articles** (newcomer rental guide, first-time buyer guide, "is now a good time to
  sell"). Point the bot's knowledge base at these URLs or paste the text.
- Core facts: licensed REALTOR® + property manager, Saskatoon & area, (306) 850-6744,
  info@meetkrishna.com, percentage-based PM pricing with no flat fees / zero markup.

---

## 9. QA test checklist (before Auto-pilot)

Run each stream end-to-end and confirm in GHL:
- [ ] Rent path → correct fields populated with **codes** (not labels), `tenant-quiz` + `rent-completed` + `chatbot` + correct heat tag.
- [ ] Buy path → `buyer_*` fields + tags + heat.
- [ ] Sell path → `seller_*` fields + address + tags + heat.
- [ ] PM path → `investor_*` fields + tags + heat.
- [ ] Email captured early; a deliberately abandoned chat still creates a contact with the source tag.
- [ ] Off-topic question → polite redirect. Request for a human → phone/booking offered.
- [ ] Asked for legal/tax/price guarantee → declines and defers appropriately.
- [ ] Heat tags match what the website quiz would produce for the same answers (spot-check 2–3 per stream).
- [ ] `chatbot` tag present so you can report on this channel separately.

---

## 10. Notes & honest caveats

- GHL's Conversation AI capabilities vary by plan/version. If your bot can't write custom fields
  directly from the conversation, the reliable pattern is: bot collects + tags the stream → a
  workflow parses/sets fields and computes heat (§6). The deterministic heat logic should ALWAYS
  live in a workflow, not the LLM.
- Keep the bot in Suggestive mode until you've watched ~20–30 real chats.
- This bot does not replace the on-page quizzes — it's an additional path. Both write the same
  data, and GHL dedupes by email, so a visitor who does both just gets enriched.
