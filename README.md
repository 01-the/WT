# TRMNL Watchtower Study Plugin (GitHub Actions version)

No Cloudflare account needed — GitHub Actions does the scraping on a
schedule and commits the result into this repo; TRMNL polls the file
directly. Everything lives in one place.

**Tradeoff vs. the Cloudflare Worker version:** this needs the repo to
be **public**, since TRMNL's polling can't authenticate to pull from a
private repo. The only thing that ends up in the repo is the scraped
JSON (title, subheadings, review questions — the same info visible on
jw.org itself), not anything private of yours.

Verified: `scripts/test-parse.mjs` runs the actual production parser
(`parseArticleHtml` from `scripts/scrape.mjs`) against a realistic
fixture (`scripts/fixture.html`) and checks 11 assertions — song
numbers, theme scripture with correctly-paired curly quotes, the FOCUS
line, subheadings (with the boxed sections correctly excluded), and
all 3 review questions. All pass. I can't fetch wol.jw.org from this
sandbox to test against the *live* site (it's outside my network
allowlist here), so the one thing worth double-checking after your
first real run is that the output looks sane — see Step 4 below.

## Setup

### 1. Create the repo

- github.com → New repository → **Public** → create it empty (no README/gitignore).
- On your machine (or in GitHub's web UI's "upload files"):
  ```bash
  git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
  cd YOUR_REPO
  # copy in: .github/, scripts/, package.json
  git add .
  git commit -m "Initial commit"
  git push
  ```

### 2. Run it once manually

- Repo → **Actions** tab → "Update Watchtower Study data" → **Run workflow**.
- Wait ~15 seconds, check it went green.
- Confirm `data/watchtower.json` now exists in the repo with this
  week's article data.
- If it fails: click into the failed run's logs. Since this is regex-based
  scraping against wol.jw.org's actual markup (which I couldn't test
  live from here), a failure almost certainly means jw.org's HTML
  differs from what `scripts/scrape.mjs` expects in one spot — the
  error message will tell you which extraction step failed, and the
  fix is usually a one-line regex tweak in that function.

### 3. Set up the TRMNL plugin

- TRMNL → Plugins → Private Plugin → New.
- Strategy: **Polling**.
- Polling URL: `https://cdn.jsdelivr.net/gh/YOUR_USERNAME/YOUR_REPO@main/data/watchtower.json`
  (jsDelivr fronts your repo with a proper CDN — more reliable for
  repeated polling than raw.githubusercontent.com, and the workflow
  purges its cache after every commit so updates show up promptly).
- Refresh interval: 720 min.
- Save → Force Refresh → Edit Markup → confirm "Your Variables" is populated.
- Paste in the four files from `trmnl/` (`full.liquid`,
  `half_horizontal.liquid`, `half_vertical.liquid`, `quadrant.liquid`)
  into their matching views.

### 4. Sanity-check the first real output

Open `data/watchtower.json` in the repo after step 2 and skim it — does
`title` look like an actual article title, do `subheadings` look like
real section headers (not stray box titles), does `review_questions`
have 3 entries? If something looks off, that's the field to fix in
`scripts/scrape.mjs`.

## How the schedule works

Runs daily at 20:00 UTC (`.github/workflows/update-watchtower.yml`) —
not just weekly — so if one run fails (e.g. jw.org hiccups), it
self-heals the next day rather than leaving you a week stale. You can
also trigger it manually anytime from the Actions tab.

## Files

- `scripts/scrape.mjs` — the scraper. `parseArticleHtml()` is the pure,
  testable parsing logic; `main()` does the actual fetch + file write.
- `scripts/test-parse.mjs` — test suite, run automatically before every
  scrape in CI so a broken parser fails loudly instead of silently
  committing bad data.
- `scripts/fixture.html` — realistic sample markup for the test suite.
- `data/watchtower.json` — the output TRMNL polls. Created by the first
  workflow run.
- `trmnl/*.liquid` — the four TRMNL layout templates.
- `.github/workflows/update-watchtower.yml` — the scheduler.
