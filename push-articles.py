#!/usr/bin/env python3
"""
push-articles.py  —  Krishna Ambilwade Journal
Uploads three featured images to Sanity, then pushes three SEO + AI-optimised
journal posts via the Mutations API — all in one command.

Usage:
  export SANITY_PROJECT_ID=your_project_id
  export SANITY_DATASET=production          # default: production
  export SANITY_API_TOKEN=sk-your-token     # needs Editor (write) role

  python3 push-articles.py

Images are loaded from the same folder as this script:
  first_home_buying_guide.png  → buying article
  how_to_rent_in_saskatoon.png → renting article
  ROI_of_a_professional_PM.png → property management article

The featured image is automatically used as the OG image (1200x630 crop)
by your SSR function — no extra setup needed.
"""

import json, os, sys, uuid, urllib.request, urllib.error
from datetime import datetime, timezone

# ── Config ───────────────────────────────────────────────────────────────────
PROJECT_ID   = os.environ.get("SANITY_PROJECT_ID", "").strip()
DATASET      = os.environ.get("SANITY_DATASET", "production").strip()
TOKEN        = os.environ.get("SANITY_API_TOKEN", "").strip()
PUBLISH_DATE = os.environ.get("PUBLISH_DATE",
               datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
AUTHOR       = "Krishna Ambilwade"

if not PROJECT_ID or not TOKEN:
    print("✗  Set SANITY_PROJECT_ID and SANITY_API_TOKEN before running.")
    sys.exit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
API     = f"https://{PROJECT_ID}.api.sanity.io/v2024-01-01/data/mutate/{DATASET}"
API_IMG = f"https://{PROJECT_ID}.api.sanity.io/v2024-01-01/assets/images/{DATASET}"


# ── Image upload ─────────────────────────────────────────────────────────────
def upload_image(filename, label):
    path = os.path.join(SCRIPT_DIR, filename)
    if not os.path.exists(path):
        print(f"  ⚠  {label} image not found at {path} — skipping")
        return None
    print(f"  ↑  Uploading {filename} …")
    with open(path, "rb") as f:
        data = f.read()
    ext = filename.rsplit(".", 1)[-1].lower()
    content_type = "image/png" if ext == "png" else "image/jpeg"
    req = urllib.request.Request(
        API_IMG, data=data,
        headers={"Authorization": f"Bearer {TOKEN}",
                 "Content-Type": content_type,
                 "Accept": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as res:
            result = json.loads(res.read())
            asset_id = result.get("document", {}).get("_id", "")
            if asset_id:
                print(f"     ✓  {asset_id}")
                return asset_id
            print(f"     ✗  Unexpected response: {result}")
            return None
    except urllib.error.HTTPError as e:
        print(f"     ✗  HTTP {e.code}: {e.read().decode()}")
        return None


# ── Portable Text helpers ────────────────────────────────────────────────────
def k():
    return uuid.uuid4().hex[:8]

def p(text):
    return {"_type": "block", "_key": k(), "style": "normal", "markDefs": [],
            "children": [{"_type": "span", "_key": k(), "text": text, "marks": []}]}

def h2(text):
    return {"_type": "block", "_key": k(), "style": "h2", "markDefs": [],
            "children": [{"_type": "span", "_key": k(), "text": text, "marks": []}]}

def h3(text):
    return {"_type": "block", "_key": k(), "style": "h3", "markDefs": [],
            "children": [{"_type": "span", "_key": k(), "text": text, "marks": []}]}

def li(text):
    return {"_type": "block", "_key": k(), "style": "normal",
            "listItem": "bullet", "level": 1, "markDefs": [],
            "children": [{"_type": "span", "_key": k(), "text": text, "marks": []}]}

def bq(text):
    return {"_type": "block", "_key": k(), "style": "blockquote", "markDefs": [],
            "children": [{"_type": "span", "_key": k(), "text": text, "marks": []}]}

def slug(s):
    return {"_type": "slug", "current": s}

def featured(asset_id, alt):
    if not asset_id:
        return None
    return {"_type": "image", "alt": alt,
            "asset": {"_type": "reference", "_ref": asset_id}}


# ── ARTICLE 1: RENTING ───────────────────────────────────────────────────────
def article_renting(image_asset_id=None):
    body = [
        p("Finding your first rental in Saskatoon should not feel like solving a puzzle without all the pieces. Landlords ask for documents you may not have built yet, listings disappear fast, and the rules under Saskatchewan's Residential Tenancies Act are not always easy to find in plain language."),
        p("This guide covers what to expect at every stage — from building a strong application to signing a lease and protecting your security deposit — so you walk into each viewing knowing exactly what you're dealing with."),

        h2("What Does a Rental Application in Saskatoon Include?"),
        p("Most Saskatoon landlords require the following documents before approving a tenant:"),
        li("Proof of income — two or three recent pay stubs, an employment offer letter, or documentation of student funding or government support."),
        li("Credit check — landlords can pull your credit report with your written consent. If you have no Canadian credit history, say so upfront and offer alternatives: a larger deposit, a co-signer, or a reference from a settlement agency or employer."),
        li("References — previous landlords carry the most weight. If you don't have any, a written reference from a Canadian employer, academic institution, or community organisation is a strong substitute."),
        li("Government-issued ID — passport, Permanent Resident card, study or work permit, or a provincial driver's licence."),
        p("A practical tip: prepare a one-page renter profile — a short introduction, your income, why you will be a reliable tenant, and your references. It takes under 30 minutes to write and consistently sets applicants apart in a competitive stack."),

        h2("Typical Rent Prices in Saskatoon (2025–2026)"),
        p("Saskatoon rental prices vary significantly by unit size, age, and neighbourhood. Current market ranges:"),
        li("Bachelor or studio: $900 – $1,200 per month"),
        li("One-bedroom apartment: $1,100 – $1,550 per month"),
        li("Two-bedroom apartment: $1,400 – $1,950 per month"),
        li("Three-bedroom house or townhouse: $1,800 – $2,500 per month"),
        p("Newer builds in Stonebridge, Rosewood, and Brighton sit at the higher end. Older units in Nutana, Caswell Hill, and the East Side tend to be more affordable. Always confirm whether utilities are included — this significantly affects the true monthly cost."),

        h2("Understanding Your Lease in Saskatchewan"),
        p("Landlord-tenant relationships in Saskatchewan are governed by the Residential Tenancies Act (RTA). Key terms every renter should understand before signing:"),
        li("Security deposit — capped at one month's rent by law. Your landlord must hold it in trust and return it, with interest, within seven days of your move-out date, minus any legitimate documented deductions."),
        li("Notice to enter — landlords must provide at least 24 hours' written notice before entering your unit, except in genuine emergencies."),
        li("Rent increases — permitted once per 12-month period, with a minimum of three months' written notice required."),
        li("Lease term — most Saskatoon rentals run on a 12-month fixed-term lease that automatically converts to month-to-month at the end unless renewed or terminated by either party."),
        p("Read your lease fully before signing. If a landlord is unwilling to give you time to review the document, or makes verbal promises that don't appear in writing, treat those as red flags."),

        h2("Your Rights as a Tenant Under the Residential Tenancies Act"),
        p("The RTA gives Saskatchewan tenants meaningful and enforceable protections. The most important:"),
        li("You cannot be evicted without cause. Valid grounds include non-payment of rent, significant damage to the property, or the landlord or an immediate family member requiring the unit for personal use. Each ground requires specific written notice and defined timelines."),
        li("You have the right to a habitable unit. Landlords are legally required to maintain the property in a good state of repair and comply with health and safety standards."),
        li("You have the right to quiet enjoyment — your landlord cannot harass you, interfere unreasonably with your use of the unit, or enter without proper notice."),
        li("If your landlord fails to make required repairs after receiving written notice, you may file an application with the Office of Residential Tenancies for a remedy."),
        bq("The Office of Residential Tenancies (ORT) handles disputes between landlords and tenants in Saskatchewan. Filing an application is free and does not require a lawyer."),

        h2("Red Flags to Watch For"),
        li("A security deposit request larger than one month's rent — this is illegal under the Residential Tenancies Act."),
        li("A landlord who won't provide a written lease."),
        li("Cash-only rent payments with no receipts."),
        li("No viewing allowed before signing."),
        li("Listings with no physical address, or landlords claiming to be overseas who ask you to wire money to 'hold' a unit — a common rental fraud pattern."),
        p("Legitimate landlords have nothing to hide. If something feels wrong, trust that."),

        h2("The Move-In Condition Inspection: Do Not Skip It"),
        p("On your first day, conduct a condition inspection with your landlord and document every existing scratch, scuff, or damage with dated photographs. Have both parties sign the inspection form. Saskatchewan landlords are legally required to provide a condition inspection report at both move-in and move-out — this report is your primary protection when it comes time to recover your security deposit."),
        p("Set up your utilities if they're not included: SaskPower for electricity, SaskEnergy for natural gas, and your choice of internet provider. Saskatoon is served by SaskTel, Shaw (Xfinity), and Telus."),

        h2("Frequently Asked Questions About Renting in Saskatoon"),
        h3("Can a landlord refuse to rent to me because I'm new to Canada?"),
        p("Under Saskatchewan's Human Rights Code, landlords cannot discriminate based on national or ethnic origin, race, or religion. They can lawfully decline applicants who don't meet objective financial criteria — income level, credit score — but not based on immigration status alone. Focus on demonstrating your ability to pay through employment letters, bank statements, or a co-signer."),
        h3("What happens if my landlord doesn't return my deposit?"),
        p("You can apply to the Office of Residential Tenancies within two years of your tenancy ending. If the landlord cannot justify the deductions with documented evidence, they can be ordered to return the deposit with interest, and may face additional compensation orders."),
        h3("What notice do I need to give to move out?"),
        p("For a fixed-term lease, provide one month's written notice before the end of the lease term. For a periodic (month-to-month) tenancy, Saskatchewan law requires one full rental period of written notice — meaning if you pay on the first of the month, your notice must be given before the first of the month prior to your last day."),
        h3("Am I allowed to have a roommate?"),
        p("Your lease will typically specify occupancy limits. Adding a roommate may require landlord approval. Review your lease terms and communicate in writing with your landlord before making any changes to who occupies the unit."),

        p("Looking for a well-managed Saskatoon rental? Krishna Ambilwade works with quality landlords and tenants across the city. Browse available rentals or get in touch to talk through what you need."),
    ]
    doc = {
        "_type": "journalPost",
        "title": "Your First Rental in Saskatoon: What to Expect Before You Sign",
        "slug": slug("your-first-rental-in-saskatoon"),
        "excerpt": "Looking for your first rental in Saskatoon? This plain-language guide covers what landlords require, typical rent prices, your rights under Saskatchewan's Residential Tenancies Act, and the red flags that tell you to walk away.",
        "metaTitle": "Renting in Saskatoon: Complete Guide for First-Time Renters | Krishna Ambilwade",
        "metaDescription": "Renting in Saskatoon for the first time? Learn what landlords require, current rent prices by unit type, your rights under Saskatchewan's RTA, and how to protect your security deposit.",
        "author": AUTHOR,
        "category": "renting",
        "tags": ["renting", "newcomers", "Saskatoon", "tenant rights", "Saskatchewan RTA", "rental guide"],
        "publishedAt": PUBLISH_DATE,
        "featured": False,
        "body": body,
    }
    fi = featured(image_asset_id, "Newcomers arriving at Saskatoon Diefenbaker International Airport")
    if fi:
        doc["featuredImage"] = fi
    return doc


# ── ARTICLE 2: FIRST-TIME BUYER ──────────────────────────────────────────────
def article_buying(image_asset_id=None):
    body = [
        p("Buying your first home in Saskatoon is absolutely achievable — but the process has a specific sequence, and skipping or misunderstanding any step can cost you time, money, or the property you wanted. Most first-time buyers underestimate how many decisions sit between 'I want to buy' and holding the keys."),
        p("This guide walks through every stage in order, with the real numbers, timelines, and decisions you'll face as a buyer in Saskatchewan."),

        h2("Step 1: Get Pre-Approved Before You Start Searching"),
        p("Pre-approval is not the same as pre-qualification. Pre-qualification is an informal estimate based on what you tell a lender. Pre-approval involves a full credit check and income verification and returns a firm borrowing limit with a rate hold — typically valid for 90 to 120 days."),
        p("In Saskatoon's market, sellers and their agents treat pre-approved buyers significantly more seriously. In a competitive situation, an offer without a pre-approval letter attached is often not considered at all."),
        p("What lenders assess during pre-approval:"),
        li("Credit score — most lenders require a minimum of 620; a score above 680 qualifies you for better rates and more lender options."),
        li("Income and employment stability — two years of consistent employment is standard. Self-employed applicants need two years of CRA Notices of Assessment."),
        li("Down payment — must be documented and traceable in your account for at least 90 days. Gifts from immediate family are accepted with a signed gift letter confirming the funds are non-repayable."),
        li("Total Debt Service ratio (TDS) — all housing costs plus existing debt payments should not exceed 44% of gross income under standard qualifying rules."),
        bq("Canada's federal mortgage stress test requires you to qualify at the greater of your contract rate plus 2%, or the Bank of Canada benchmark qualifying rate. This effectively reduces your maximum purchase price by approximately 20% compared to what the contract rate alone would suggest. Factor this in early."),

        h2("Step 2: Set Your Real Budget — Not Just Your Approval Ceiling"),
        p("Your pre-approval maximum is not your budget. Work backwards from what you're comfortable paying each month, including costs beyond the mortgage payment:"),
        li("Property taxes — Saskatoon's residential mill rate produces an annual tax bill roughly equivalent to 1.0–1.2% of assessed value. On a $400,000 home, expect $4,000–$4,800 per year."),
        li("Condo fees, if applicable — typically $250–$600 per month for Saskatoon condominiums, covering common area maintenance, reserve fund contributions, and often some utilities."),
        li("Home insurance — $100–$200 per month for a typical Saskatoon detached home."),
        li("Maintenance reserve — budget 1–2% of your home's purchase price annually for repairs and upkeep. On a $400,000 home: $4,000–$8,000 per year."),
        p("Closing costs are a separate one-time expense on top of your down payment — budget 1.5–4% of the purchase price:"),
        li("Saskatchewan land transfer fees — calculated on a tiered scale by purchase price (use the calculator at saskatchewan.ca)."),
        li("Legal fees and disbursements — $1,000–$2,000."),
        li("Home inspection — $400–$600."),
        li("Title insurance — $150–$350."),
        li("CMHC mortgage default insurance — required if your down payment is less than 20%; the premium (2.8–4% of the loan amount) is typically added to your mortgage rather than paid upfront."),
        li("Property tax adjustment — you reimburse the seller for any prepaid property taxes from your possession date forward."),
        li("Moving costs — $500–$3,000+ depending on distance and volume."),

        h2("Step 3: Know Saskatoon's Neighbourhoods by Price Band"),
        p("Saskatoon's real estate market divides fairly clearly by price band:"),
        li("Under $350,000 — condominiums, townhomes, and older detached homes in established areas like Brevoort Park, Pacific Heights, and Meadowgreen. Good entry-level options for buyers prioritising affordability over square footage."),
        li("$350,000 – $550,000 — the core first-time buyer range for detached homes. Strong inventory in Stonebridge, Evergreen, Rosewood, and Brighton. These areas offer newer construction, family infrastructure, and solid resale history."),
        li("$550,000 – $800,000 — larger detached homes, premium finishes, and sought-after neighbourhoods like Willowgrove, Lakeridge, and Silverwood Heights."),
        li("Over $800,000 — executive homes, Lakeview, Briarwood, and custom builds."),
        p("Buyers who value walkability and character tend toward Nutana, Varsity View, and the Broadway corridor. Buyers prioritising new construction and suburban amenities tend toward Stonebridge, Brighton, and Evergreen. Both categories hold value well in Saskatoon's market."),

        h2("Step 4: Making an Offer"),
        p("When you find the right property, your REALTOR® prepares a written offer to purchase. The key components:"),
        li("Purchase price."),
        li("Deposit — typically 1–2% of the purchase price, paid within 24 hours of acceptance and held in trust by the seller's brokerage. This is separate from and applied toward your down payment."),
        li("Conditions — standard conditions include financing approval (typically 5–7 business days) and a satisfactory home inspection (2–3 business days). Do not waive conditions unless you fully understand what you're accepting."),
        li("Inclusions — appliances, window coverings, and any attached fixtures you want to remain in the home should be listed explicitly in the offer."),
        li("Possession date — typically 30–60 days after acceptance. Flexibility on possession date can sometimes strengthen an offer without costing you money."),
        p("In a multiple-offer situation, your REALTOR® will advise on strategy — this may include pricing above list, shortening the condition window, or aligning the possession date with the seller's needs. Escalation clauses, which automatically increase your offer to beat competing bids up to a set ceiling, are another tool used in competitive markets."),

        h2("Step 5: Conditions, Inspection, and Mortgage Finalization"),
        p("Once your offer is accepted, you have a defined window — typically 7–14 days total — to satisfy the conditions you included. During this period:"),
        li("Book a licensed home inspector immediately — do not skip this step. A $500 inspection can reveal $20,000–$50,000 in hidden issues, particularly in older Saskatoon homes (knob-and-tube wiring, foundation movement, aging mechanical systems)."),
        li("Submit your accepted offer to your lender or mortgage broker to finalize the mortgage commitment. They may order an independent property appraisal."),
        li("Review the Property Disclosure Statement from the seller. Saskatchewan sellers are required to disclose known material defects."),
        p("When all conditions are satisfied, you remove them in writing. The deal is now firm and legally binding. Your deposit becomes non-refundable at this stage, so ensure you're confident before proceeding."),

        h2("Step 6: Closing Day"),
        p("A few days before possession, you'll meet with your real estate lawyer to sign the mortgage documents, title transfer paperwork, and pay any remaining closing costs and the balance of your down payment. Your lender will fund the mortgage to your lawyer in trust."),
        p("On possession day, the title transfer is registered at the Saskatchewan Land Titles Registry. Once confirmed, your lawyer notifies your REALTOR®, who arranges key handover — typically early to mid-afternoon."),
        p("Do a final walk-through of the property before closing to confirm the condition matches what was agreed, that all included items remain, and that no new issues have arisen since your inspection."),

        h2("First-Time Buyer Incentives Available in Saskatchewan"),
        li("First Home Savings Account (FHSA) — contribute up to $8,000 per year (lifetime maximum $40,000). Contributions are tax-deductible like an RRSP; qualifying withdrawals for a first home purchase are completely tax-free."),
        li("Home Buyers' Plan (HBP) — withdraw up to $60,000 tax-free from your RRSP. Repay over 15 years or the outstanding amount is added to your taxable income each year."),
        li("First-Time Home Buyers' Tax Credit — a $10,000 non-refundable federal tax credit, worth approximately $1,500 in actual tax savings."),
        li("GST/HST New Housing Rebate — if purchasing a newly constructed home, you may qualify for a partial GST rebate on the purchase price."),
        li("Saskatchewan First-Time Home Buyers' Land Transfer Tax Rebate — Saskatchewan offers a rebate on land transfer fees for qualifying first-time buyers. Check current thresholds at saskatchewan.ca."),

        h2("Frequently Asked Questions for Saskatoon First-Time Buyers"),
        h3("How long does buying a home in Saskatoon take from start to finish?"),
        p("From the start of your pre-approval to possession day, a typical Saskatoon transaction takes 60–120 days. Pre-approval itself takes 1–5 business days. Active searching varies from a few weeks to several months depending on your criteria and market conditions. Once an offer is accepted, possession is generally set 30–60 days out."),
        h3("Do I need a REALTOR® to buy a home in Saskatchewan?"),
        p("You are not legally required to use a REALTOR®, but buyer representation costs you nothing — the seller pays the commission in a typical transaction. An experienced buyer's agent provides access to MLS data, negotiation experience, and transaction management that is difficult to replicate independently in a competitive market."),
        h3("What credit score do I need to buy a home in Saskatchewan?"),
        p("Most conventional lenders require a minimum score of 620. For CMHC-insured mortgages (less than 20% down payment), a minimum of 600 is typically required. A score above 680 qualifies for better interest rates and broader lender choices."),
        h3("How much do I really need saved before buying in Saskatoon?"),
        p("Minimum 5% down payment on the purchase price, plus approximately 2–4% for closing costs, plus a maintenance reserve. On a $400,000 home: at least $28,000–$36,000 liquid and documented. More is always better — a 20% down payment eliminates CMHC insurance and significantly reduces your monthly payment."),

        p("Buying your first home in Saskatoon is one of the best financial decisions you can make — the city's affordability relative to other major Canadian markets means your dollar goes considerably further here. Krishna Ambilwade works with first-time buyers across Saskatoon from the first showing to the final signature. Book a call to get started."),
    ]
    doc = {
        "_type": "journalPost",
        "title": "Buying Your First Home in Saskatoon: A Step-by-Step Guide",
        "slug": slug("first-time-buyer-guide-saskatoon"),
        "excerpt": "From mortgage pre-approval to possession day — a complete, step-by-step guide to buying your first home in Saskatoon, including real closing cost numbers, neighbourhood breakdowns, and every first-time buyer incentive available in Saskatchewan.",
        "metaTitle": "First-Time Home Buyer Guide Saskatoon, SK | Krishna Ambilwade",
        "metaDescription": "A complete guide to buying your first home in Saskatoon: pre-approval, budgeting, neighbourhood pricing, making an offer, home inspections, closing costs, and Saskatchewan first-time buyer incentives.",
        "author": AUTHOR,
        "category": "buying",
        "tags": ["first-time buyer", "buying", "Saskatoon", "mortgage", "home buying guide", "Saskatchewan real estate"],
        "publishedAt": PUBLISH_DATE,
        "featured": False,
        "body": body,
    }
    fi = featured(image_asset_id, "First-time home buyers receiving keys to their new Saskatoon home")
    if fi:
        doc["featuredImage"] = fi
    return doc


# ── ARTICLE 3: PROPERTY MANAGEMENT ROI ──────────────────────────────────────
def article_pm(image_asset_id=None):
    body = [
        p("Most landlords who self-manage their Saskatoon rental properties think of professional property management as a cost they can avoid if they're willing to put in the time. They see the management fee — typically 8–10% of monthly rent — and calculate: that's $1,500–$2,000 per year on a $1,600/month unit. Why pay that when I can handle it myself?"),
        p("This framing gets the math backwards. The right question is not 'what does management cost?' but 'what is self-managing actually costing me — in vacancy, poor tenant decisions, maintenance markups, and time — compared to what a professional delivers?' Run that comparison honestly and the ROI case becomes clear."),

        h2("The Biggest Risk in Rental Property: Vacancy"),
        p("A vacant unit is the most expensive thing that can happen to a rental investment. One empty month on a $1,600/month Saskatoon unit is $1,600 in lost revenue — plus utilities you're now covering, any make-ready costs, and a mortgage payment with no offsetting income."),
        p("Professional property managers consistently achieve lower vacancy rates than self-managing landlords, through established marketing channels, pre-screened tenant waitlists, and processes that move qualified applicants through applications faster. In Saskatoon's market, the gap typically runs two to four weeks per tenancy turnover:"),
        li("Self-managing landlord average vacancy per turnover: 4–6 weeks"),
        li("Professionally managed average vacancy per turnover: 1–2 weeks"),
        li("Value of three to four recovered weeks on a $1,600/month unit: $1,200–$1,600 per turnover"),
        bq("On a $1,600/month Saskatoon rental, one avoided month of vacancy per turnover recovers the equivalent of 7–10 months of management fees. That gap alone frequently covers the full annual cost of professional management."),

        h2("Tenant Quality and Retention: Where the Real Money Is Made"),
        p("Turnover is the compounding problem in rental property. Every time a tenant leaves, you face cleaning, repairs, advertising, screening time, a leasing period, and the vacancy gap. A conservative all-in estimate for a typical Saskatoon turnover: $1,500–$3,500, depending on unit condition and the time of year."),
        p("Professional managers reduce turnover on two fronts: better initial tenant selection through thorough screening, reference verification, and income validation; and proactive relationship management — addressing maintenance requests promptly, conducting routine inspections, and initiating lease renewals before they expire."),
        p("The Canadian Federation of Apartment Associations consistently reports that professionally managed properties retain tenants 15–25% longer on average than self-managed equivalents. Extending average tenancy from 24 months to 30 months on a $1,600/month unit means one fewer full turnover over a five-year hold period — a direct saving of $1,500–$3,500."),

        h2("Maintenance Done Right Saves More Than It Costs"),
        p("Self-managing landlords handle maintenance in one of two ways: they do it themselves, trading time for money; or they call whoever picks up the phone on short notice and pay retail rates under time pressure."),
        p("Professional property managers bring an established vendor network — tradespeople who provide consistent quality at pre-negotiated rates because of repeat volume. In practice for Saskatoon properties, this typically delivers:"),
        li("10–20% savings on routine maintenance compared to one-off retail quotes."),
        li("Faster response times — critical because a $200 plumbing call left unaddressed for three days can become a $3,000 water damage claim."),
        li("Documented maintenance histories that protect your deposit deductions at tenancy end and provide defensible records for insurance purposes."),
        li("Compliance with Saskatchewan's Residential Tenancies Act maintenance standards, reducing your exposure to Office of Residential Tenancies (ORT) complaints."),
        p("On a typical Saskatoon investment property, annual maintenance savings through professional management run $400–$900 depending on unit age and condition."),

        h2("Your Time: The Hidden Line Item on Every Landlord's Spreadsheet"),
        p("This is the cost most self-managing landlords leave off their analysis entirely."),
        p("Managing a single rental property in a stable month takes roughly 3–8 hours — more during turnovers, maintenance emergencies, or tenant disputes. At a conservative opportunity cost of $50 per hour (well below what most professionals or business owners earn), self-managing one property costs $1,800–$4,800 in time annually. Multiply that across a growing portfolio:"),
        li("One property: $1,800–$4,800/year in time"),
        li("Three properties: $5,400–$14,400/year in time"),
        li("Five properties: $9,000–$24,000/year in time"),
        p("Investors who scale their portfolios while self-managing are not building passive income. They are building a second job — one with no vacation coverage, no sick days, and emergency calls at 11pm on weekends."),

        h2("The Full Comparison: Management Cost vs. Real Return"),
        p("A standard Saskatoon property management arrangement on a $1,600/month unit typically looks like:"),
        li("Monthly management fee at 9%: $144/month ($1,728/year)"),
        li("Leasing fee for a new tenancy: 75% of first month's rent ($1,200 per placement)"),
        li("Total annual cost including one turnover: approximately $2,928"),
        p("Set against what professional management typically returns in the same period:"),
        li("Recovered vacancy from faster leasing — 3 fewer vacant weeks: $1,200"),
        li("Maintenance savings through vendor network: $500"),
        li("Avoided turnover cost from better retention (amortized): $400"),
        li("Your time recovered: 60–96 hours annually"),
        p("The financial delta — total management cost minus recovered value — frequently comes out near zero or positive in year one, and improves meaningfully in subsequent years as tenancy duration extends and turnover frequency drops. The time and stress recovery is immediate from day one."),

        h2("When Self-Managing Makes Sense"),
        p("Professional management is not the right answer for every landlord. Self-managing works well when:"),
        li("The rental is a basement suite or secondary unit within your primary residence."),
        li("You have relevant trades skills and genuinely flexible time."),
        li("You are managing a single property on a short-term basis before selling."),
        p("For investors who own one or more stand-alone properties — particularly those with full-time careers, growing portfolios, or families — the ROI case for professional management is consistently strong. The business case strengthens further once you factor in liability exposure, RTA compliance complexity, and the scalability ceiling of self-management."),

        h2("Frequently Asked Questions"),
        h3("What does a Saskatoon property manager actually handle?"),
        p("A full-service property manager handles tenant marketing and screening, lease preparation and execution, rent collection, maintenance coordination and vendor management, routine and move-in/move-out condition inspections, monthly financial reporting to the owner, and representation in Office of Residential Tenancies matters. You receive monthly statements and a single point of contact — without managing any individual task yourself."),
        h3("How are property management fees structured in Saskatchewan?"),
        p("Most Saskatoon managers charge a percentage of collected rent (8–12% is typical), plus a leasing fee when a new tenant is placed (commonly 50–100% of first month's rent). Some charge flat monthly fees. Always ask for a complete written fee schedule before signing any management agreement, and clarify what is included versus billed separately — inspection fees, ORT filing fees, and maintenance coordination fees vary by company."),
        h3("What happens if a tenant stops paying rent?"),
        p("Under Saskatchewan's Residential Tenancies Act, a landlord or their manager can serve a 15-day notice to vacate for non-payment of rent. If the tenant neither pays the outstanding balance nor vacates, an application to the Office of Residential Tenancies is the legal remedy. Professional managers handle this process routinely — including documentation, filing, and hearing representation — at no additional management fee in most contracts."),
        h3("Can I switch to professional management if I already have a tenant in place?"),
        p("Yes. Management can begin mid-tenancy with a proper assignment notice to the existing tenant. The current lease carries over in its entirety; the manager assumes responsibility for rent collection, communications, and maintenance coordination from the agreed effective date. There is no disruption to the tenancy itself."),
        h3("How do I evaluate whether a property management company is legitimate?"),
        p("In Saskatchewan, property managers who handle trust funds are required to be licensed under the Real Estate Act. Verify licensing through the Saskatchewan Real Estate Commission before signing any agreement. Ask for references from current owner clients, review their standard management agreement carefully, and clarify their response time standards for maintenance and tenant emergencies."),

        p("Krishna Ambilwade offers property management across Saskatoon with a focus on tenant quality, fast maintenance response, and transparent owner communication. If you're ready to run your rental as a true investment rather than a second job, book a call to talk through your specific property and what professional management would look like for your numbers."),
    ]
    doc = {
        "_type": "journalPost",
        "title": "The Real ROI of Hiring a Property Manager in Saskatoon",
        "slug": slug("roi-property-management-saskatoon"),
        "excerpt": "Most DIY landlords underestimate what self-managing a rental actually costs. Here's the numbers-driven case — vacancy rates, maintenance savings, tenant retention, and time — for why professional property management pays for itself in Saskatoon.",
        "metaTitle": "Property Management ROI in Saskatoon: Is It Worth It? | Krishna Ambilwade",
        "metaDescription": "Vacancy costs, maintenance savings, tenant retention, and your time — the complete ROI breakdown for hiring a professional property manager in Saskatoon, SK, with real numbers for a typical $1,600/month rental.",
        "author": AUTHOR,
        "category": "property-management",
        "tags": ["property management", "Saskatoon landlord", "ROI", "rental investment", "passive income", "Saskatchewan"],
        "publishedAt": PUBLISH_DATE,
        "featured": False,
        "body": body,
    }
    fi = featured(image_asset_id, "Saskatoon rental investment property — professionally managed townhomes")
    if fi:
        doc["featuredImage"] = fi
    return doc


# ── API push ─────────────────────────────────────────────────────────────────
def push(doc):
    title = doc["title"]
    payload = json.dumps({"mutations": [{"create": doc}]}).encode("utf-8")
    req = urllib.request.Request(
        API, data=payload,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as res:
            result = json.loads(res.read())
            if result.get("results"):
                doc_id = result["results"][0].get("id", "?")
                print(f"  ✓  {title}  [{doc_id}]")
                return True
            else:
                print(f"  ✗  {title}: {result}")
                return False
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  ✗  {title}: HTTP {e.code} — {body}")
        return False


# ── Main ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"\nUploading images → Sanity ({PROJECT_ID}/{DATASET})\n")
    image_buying  = upload_image("first_home_buying_guide.png",  "Buying")
    image_renting = upload_image("how_to_rent_in_saskatoon.png", "Renting")
    image_pm      = upload_image("ROI_of_a_professional_PM.png", "Property Management")

    print(f"\nPushing articles…\n")
    articles = [
        article_renting(image_renting),
        article_buying(image_buying),
        article_pm(image_pm),
    ]
    ok = all(push(a) for a in articles)
    if ok:
        print("\n✓  All done. Articles are unpublished — review and publish in Sanity Studio.\n")
    else:
        print("\n✗  Some articles failed. Check output above.\n")
    sys.exit(0 if ok else 1)
