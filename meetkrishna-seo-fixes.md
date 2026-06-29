# meetkrishna.com — SEO Redirect Fixes

**Goal:** Make Google see one clean version of every page so it stops flagging redirect issues and starts indexing your full site.

---

## Fix 1 — Trailing slash consistency (WordPress)
*Do this yourself — takes 2 minutes*

1. Log in to your WordPress dashboard
2. Go to **Settings → Permalinks**
3. Whatever is currently selected, just click **Save Changes** without changing anything
   - This forces WordPress to regenerate its rewrite rules and pick one trailing-slash format consistently
4. Done

---

## Fix 2 — Add a trailing slash redirect in Cloudflare
*Takes 5 minutes in the same Cloudflare screen you showed me*

1. Go to **Cloudflare → your domain → Rules → Redirect Rules**
2. Click **Create rule**
3. Fill in:
   - **Rule name:** Strip trailing slash
   - **When incoming requests match:** Custom filter expression
   - **Field:** URI Path
   - **Operator:** matches regex
   - **Value:** `^(.*[^/])/+$`
4. Under **Then:**
   - **Type:** Dynamic 301 redirect
   - **Expression:** `concat("https://meetkrishna.com", regex_replace(http.request.uri.path, "^(.*[^/])/+$", "${1}"), http.request.uri.query == "" ? "" : concat("?", http.request.uri.query))`
5. Click **Deploy**

> If this feels too technical, skip it and just do Fix 1 — WordPress usually handles this on its own after you save permalinks.

---

## Fix 3 — Clean your XML sitemap
*Takes 5 minutes — very important*

Your sitemap tells Google which pages to crawl. If it lists `www.` or `http://` URLs, Google keeps discovering the wrong versions.

**If you use Rank Math or Yoast SEO:**
1. Go to your plugin settings → Sitemap
2. Find the sitemap URL (usually `meetkrishna.com/sitemap.xml`) — open it in your browser
3. Scan through the URLs — every single one should start with `https://meetkrishna.com/` (no www, no http)
4. If you see www or http versions, go to your plugin's General Settings and make sure the site URL is set to `https://meetkrishna.com` (no www)

**If you're not sure what plugin you're using:**
- Ask your developer, or search your WordPress plugins list for "SEO" or "Sitemap"

---

## Fix 4 — Tell Google you've fixed it
*Do this after Fixes 1–3 are done*

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Click **Indexing → Pages**
3. Click **"Page with redirect"**
4. Click **Validate Fix** button at the top
5. Google will re-crawl your site over the next 1–2 weeks and the count should drop to zero

---

## What to hand to your developer

If you want to hand this off, send them this message:

> "Please do the following for meetkrishna.com:
> 1. Confirm WordPress permalink settings are saved and trailing slashes are consistent
> 2. Check that the XML sitemap at meetkrishna.com/sitemap.xml contains only https://meetkrishna.com URLs (no www, no http)
> 3. Do a find-replace in the database to update any internal links that still use http:// or www.meetkrishna.com
> 4. Optionally add a Cloudflare redirect rule to strip trailing slashes
> Once done, hit Validate Fix in Google Search Console under Pages → Page with redirect."

---

## After this is done — your next SEO priorities

| Priority | Action | Impact |
|----------|--------|--------|
| 1 | Fix 26 "discovered, not indexed" pages — add content (300+ words) to thin pages | High |
| 2 | Set up / complete Google Business Profile for Saskatoon | High |
| 3 | Build neighbourhood pages (Stonebridge, Willowgrove, etc.) | Medium |
| 4 | Submit clean sitemap in Search Console → Sitemaps | Medium |
