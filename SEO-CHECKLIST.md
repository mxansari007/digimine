# SEO checklist — Digimine

What we shipped in code, and what you need to do at your end. Everything below is in **priority order** — start at the top and work down.

---

## 0. One-time configuration (do this first)

These are env vars / repo-level toggles. Without them the SEO meta we generate still works, but URLs default to `https://digimine.com`.

### 0.1 Set the canonical origin in Vercel
Add this env var on every environment (Production, Preview, Development):

```
NEXT_PUBLIC_SITE_URL = https://digimine.com
```

Use the **exact** scheme + host you want indexed. Pick one of `www.digimine.com` or `digimine.com` and stick to it forever. The other should 301 to it (set up the redirect in your DNS / Vercel).

### 0.2 Drop a default OG image
Put a 1200×630 PNG at `apps/web/public/og-default.png`. This is the fallback social-share image used when a page doesn't specify its own. Keep file size under 1 MB.

### 0.3 Drop a logo
Put a square logo at `apps/web/public/logo.png`. Used in the Organization JSON-LD that ships on every page. 512×512 or larger.

### 0.4 Verify your favicon
`apps/web/public/favicon.ico` exists. Optionally add a 180×180 `apple-touch-icon.png` for iOS bookmarks — Next.js picks it up automatically.

---

## 1. Google Search Console (this drives 80 % of your organic traffic insight)

### 1.1 Verify the domain
- Open <https://search.google.com/search-console> → **Add property** → **Domain** (preferred — covers `www.`, `m.`, etc.).
- Verify via your DNS (TXT record). Cloudflare / Route 53 / GoDaddy — pick whoever owns your DNS.
- Domain verification = best, because URL-prefix verification only covers one host.

### 1.2 Submit the sitemap
Once verified, in GSC → **Sitemaps** → enter:

```
sitemap.xml
```

Google will start crawling `https://digimine.com/sitemap.xml`. Watch the "Discovered URLs" number tick up over 24–72 hours.

### 1.3 Request indexing on top pages
Manually use **URL Inspection → Request Indexing** for:
- `/`
- `/for-teachers`
- `/for-institutes`
- `/articles`
- Top 5–10 articles or courses you want ranked.

Don't spam this — only your real top pages, otherwise Google ignores future requests.

### 1.4 Set up Bing Webmaster Tools
<https://www.bing.com/webmasters>. Same drill — verify, submit sitemap. Bing has Cortana + DuckDuckGo downstream so it's worth 30 minutes.

---

## 2. Analytics

### 2.1 Add Google Analytics 4
You already have Facebook Pixel wired in. Add GA4 the same way:
1. Create a GA4 property at <https://analytics.google.com>.
2. Get the Measurement ID (`G-XXXXXXXXXX`).
3. Add `NEXT_PUBLIC_GA_MEASUREMENT_ID` env var.
4. Add the gtag script to `apps/web/src/app/layout.tsx` (next to `FacebookPixel`).

### 2.2 Set up conversion events
Mark these as conversions in GA4:
- `sign_up` (after register success)
- `subscribe_paid` (after Razorpay webhook returns paid)
- `enroll_class` (student joins a class)
- `start_test`, `complete_test`
- `article_read_5min` (custom event for engaged article reads)

### 2.3 Optional: GSC ↔ GA4 link
GSC → Settings → Associations → link to GA4 so Search Console keywords show up in GA reports.

---

## 3. Content strategy (this is what actually moves rankings)

### 3.1 Pick 10 "money" keywords
Pick the 10 search terms a parent / student / teacher would type and you want to rank for. Examples for Digimine:
- "neet mock test free"
- "jee main daily quiz"
- "online platform for coaching institute"
- "cbse class 10 maths test"
- "physics formula sheet pdf"

Each one should map to **one** dedicated article or landing page. Don't dilute by hitting the same keyword from many pages.

### 3.2 Write articles around those keywords
Use the new `/admin/articles` builder. For each money keyword:
- **Meta title**: include the keyword near the start, 50–60 chars.
- **Meta description**: include the keyword, 150–160 chars, end with a verb.
- **H1**: the keyword (slightly varied).
- **First 100 words**: should restate the question and partially answer it.
- **At least 1,500 words** for competitive keywords. Yes, length helps.
- **Internal links**: link to 2–3 of your courses/quizzes/tests from inside the article.
- **External links**: link out to 1–2 high-authority sources (NCERT, official exam sites). It's a trust signal.
- **Focus keyword** field — set this so future SEO audits can sanity-check.
- **Featured image**: set a cover with the keyword in the file name (`neet-mock-test-strategy.png` not `IMG_1234.png`).

### 3.3 Don't index thin pages
Anything under 300 words isn't going to rank. Use the **noIndex** toggle in the article builder if you have to publish thin content (announcements, redirects, etc.).

### 3.4 Update old content quarterly
Republishing a 2024 article in 2026 with refreshed numbers and a new modified-date gives Google a fresh signal. The article builder writes `updatedAt` automatically.

### 3.5 Internal linking
Every article should link to 2–3 other articles + 1 course/test. Every course should link to 1 article that summarises the syllabus. This compounds.

---

## 4. Backlinks (off-site SEO)

Backlinks are still the strongest ranking signal. Aim for 1 quality link per month.

### 4.1 Easy wins
- **Quora answers**: answer 5 questions in your niche per month. Link to the relevant article. Don't spam.
- **Reddit**: same — `r/JEE`, `r/NEET`, `r/IndianStudents`. Mods will smell promo from 100 m; provide value first.
- **YouTube descriptions**: if you upload explainer videos, put the article URL in the description.
- **Wikipedia**: if there's a relevant article missing a citation, your article might fit. Wiki is `nofollow` but still drives traffic.
- **Submit to directories**: Educational platform directories like LearnDirectory, TopOnlineCoaching, etc.

### 4.2 Higher effort, higher reward
- **Guest posts**: write for established edtech blogs (TestBook, BYJU's Voice, Unacademy blog) — exchange byline link.
- **Partnerships with coaching centres**: trade testimonials / mentions.
- **PR for milestones**: when you hit 10k students or launch institute mode, pitch The Ken, YourStory, IndianStartupNews.

### 4.3 Don't buy backlinks
Cheap backlink packages from Fiverr or PBNs will tank your rankings within a year. Not worth it.

---

## 5. Technical SEO health checks (do monthly)

### 5.1 Run a Lighthouse audit
Chrome DevTools → Lighthouse → Mobile + Performance/SEO/Accessibility. Aim for:
- Performance ≥ 80
- SEO ≥ 95
- Accessibility ≥ 90
- Best practices ≥ 90

Common Performance wins:
- Convert remaining `<img>` tags to `next/image` (gives free WebP + lazy-load + width/height).
- Move heavy client-side dashboards behind code splitting.
- Self-host or preload critical fonts.

### 5.2 Test rich results
For every JSON-LD type we emit (Course, Product, Quiz, Article, Event, FAQ, Breadcrumb, Organization, WebSite):

<https://search.google.com/test/rich-results>

Paste a URL. Fix any warnings (usually a missing image or short description).

### 5.3 Mobile-friendly test
<https://search.google.com/test/mobile-friendly> — should pass everywhere. Mobile-first indexing means this is the source of truth.

### 5.4 Crawl error monitoring
GSC → Indexing → Pages. Anything in the "Why pages aren't indexed" section needs attention. Common causes:
- 404s from broken internal links
- Soft 404s (page loads but says "not found")
- `noindex` left on by accident
- Duplicate canonical issues

### 5.5 Core Web Vitals
GSC → Experience → Core Web Vitals. Targets:
- **LCP** (Largest Contentful Paint) < 2.5s
- **INP** (Interaction to Next Paint) < 200ms (replaces FID in 2024+)
- **CLS** (Cumulative Layout Shift) < 0.1

---

## 6. Per-page authoring tips (for whoever writes content)

When you create a course / test / quiz / article in the admin, do this:

### Title (slug becomes the URL — don't change it after publish)
- Lead with the keyword.
- Keep under 60 chars.
- Avoid year if you'll have to update it (`Best NEET tips` not `Best NEET tips 2026`).

### Meta description
- 150–160 chars. Google clips longer.
- Include the keyword once, naturally.
- End with a verb / call-to-action ("Practice now", "Free download", "Read the full guide").

### URL slug
- All lowercase, hyphen-separated.
- 3–6 words max.
- No stop words ("the", "a", "of") unless needed for clarity.
- ✓ `neet-mock-test-strategy`
- ✗ `the-best-neet-mock-test-strategy-for-2026`

### Image alt text
- Descriptive, not keyword-stuffed.
- ✓ "Student practicing NEET mock test on laptop"
- ✗ "neet mock test free best 2026 india"

### Heading hierarchy
- One `<h1>` per page (the article title).
- Sub-sections start at `<h2>`. Sub-sub at `<h3>`. Don't skip levels.

### Internal links
- Link 2–3 related courses/quizzes from each article.
- Use descriptive anchor text ("our NEET physics test series") not "click here".

---

## 7. What we shipped — at a glance

In the codebase right now:

- **`/sitemap.xml`** — dynamic, pulls every published course/test/quiz/contest/product/article from Firestore. Updates within 1 hour of any new publish.
- **`/robots.txt`** — allows search, disallows app routes (`/admin`, `/dashboard`, `/teacher`, `/institute`, `/api`). Blocks GPTBot / CCBot / Google-Extended by default (LLM crawlers).
- **Site-wide JSON-LD** — Organization + WebSite (with SearchAction so Google can show a sitelinks search box).
- **Per-page metadata** — title, description, canonical, OpenGraph, Twitter card on every listing page (`/courses`, `/tests`, `/quizzes`, `/contests`, `/articles`, `/marketplace`, `/products`, `/for-teachers`, `/for-institutes`).
- **Per-page metadata + JSON-LD on detail pages** — Course / LearningResource / Quiz / Event / Product (with offer + aggregateRating when reviews exist) / Article. Plus BreadcrumbList on every detail page.
- **FAQ JSON-LD** on `/for-teachers` and `/for-institutes` (drives the "People also ask" carousel).
- **Article SEO builder** in admin — every article gets focus keyword, meta title / description, canonical override, OG image override, schema.org type picker, noindex toggle.
- **Markdown import** for articles — including frontmatter SEO fields, so a content team can author offline and bulk-upload.

---

## 8. Quick deploy checklist after this change

```bash
firebase deploy --only firestore:rules,firestore:indexes
git push origin <your-branch>   # Vercel auto-deploys
```

Then in Vercel:
1. Set `NEXT_PUBLIC_SITE_URL` env var.
2. Drop `og-default.png` and `logo.png` into `apps/web/public/`.

After deploy:
1. Visit `https://digimine.com/sitemap.xml` and `https://digimine.com/robots.txt` — both should render.
2. GSC → Sitemaps → submit `sitemap.xml`.
3. Run Rich Results Test on `/`, `/for-institutes`, one course detail, one article — fix any warnings.

---

## 9. Roadmap — nice-to-have, not blocking

These would move the needle further but aren't critical day-one:

- **Server-rendered article body** — currently the detail page is a server component for SEO (good). But the listing page (`/articles`) is client. Convert it to a server component fetching the first page server-side for faster LCP and crawler-friendliness.
- **Image CDN** — switch from raw `<img>` tags to `next/image` site-wide. Free WebP + responsive sizes + lazy-loading.
- **AMP for articles** — Google has wound down AMP for most queries; skip unless you target Discover.
- **Hreflang** — when you launch Hindi-language pages, add `<link rel="alternate" hreflang="hi-IN">` pairs.
- **Search-action endpoint** — `/marketplace?q=...` already exists; the `WebSite` JSON-LD already references it for sitelinks search box. After GSC indexes the site, this can start showing.
- **Pagination meta** — `/articles?page=2` etc. should emit `rel=prev` / `rel=next` if you add pagination.
- **News sitemap** — if articles go heavy on news (`category: "tech-news"`, `category: "exam-update"`), add a `/news-sitemap.xml` for Google News.
- **Schema.org `Course.hasCourseInstance.instructor`** — once teacher profiles are filled, expose the teacher as `Person` on the course JSON-LD.
- **AggregateOffer for test series** — when a series bundles multiple tests at different prices, switch from `Offer` to `AggregateOffer`.

---

## 10. Don't do these (they'll hurt you)

- ❌ Don't keyword-stuff. Modern Google penalises it.
- ❌ Don't duplicate content across pages. If two URLs serve the same content, pick one canonical and 301 the other.
- ❌ Don't copy other sites' content. Even if rewritten, Google catches it via embedding similarity.
- ❌ Don't use auto-generated AI content without review. Google's helpful-content update specifically targets low-effort AI dumps.
- ❌ Don't change slugs after publish without setting up a 301 redirect.
- ❌ Don't use `noindex` on content you want ranked.
- ❌ Don't disable JavaScript-rendered content in robots.txt or `<meta>` — Googlebot needs to render to see your interactive pages.
