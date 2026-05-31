# SEO Playground — Local SEO Dashboard

> **Work in progress** — new DataForSEO endpoints are being added progressively.

SEO Playground is a self-hosted dashboard that lets you run SEO and local SEO queries directly against the [DataForSEO API](https://dataforseo.com/). Every search is saved locally in a SQLite database, so you can browse your history and revisit results without making additional API calls. There is no cloud infrastructure involved — everything runs on your machine.

If you find this useful, consider supporting the project:

[![Buy Me A Coffee](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/paulmassendari)
[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/paulmassendari)

## Screenshots

![Local Finder — Grid Search](public/screenshot-local-finder.png)
*Local Finder: grid search showing local rankings across a geographic area*

![Rank Tracker](public/screenshot-rank-tracker.png)
*Rank Tracker: monitor keyword positions over time for any domain*

![Google Reviews Analysis](public/review-analysis-screenshot.png)
*Google Reviews: rating distribution, monthly review chart, and rating goal calculator*

## Features

- **Rank Tracker** — Track keyword positions over time for any domain
- **SERP Checker** — Analyze Google organic results with target domain highlighting
- **Ranked Keywords** — Discover what keywords a domain ranks for
- **Keyword Overview** — Metrics (volume, CPC, competition) for a list of keywords
- **Keyword Data** — Google Ads & Bing keyword research
- **Keyword Difficulty** — Bulk difficulty scores via DataForSEO Labs
- **Keyword Ideas** — Keyword ideas from a seed with volume, difficulty and intent
- **Search Intent** — Classify keywords by search intent (informational, navigational, commercial, transactional)
- **Related Keywords** — Related keyword suggestions from a seed keyword
- **Competitors** — Find competing domains in the SERPs
- **Domain Intersection** — Common keywords between two domains
- **Historical Rank** — Ranking history overview for a domain
- **Domain Categories** — Thematic categories for any domain
- **Subdomains** — Top subdomains by organic traffic
- **Traffic Estimation** — Bulk organic traffic estimate for a list of domains
- **Page Intersection (Labs)** — Keywords shared between multiple pages
- **Backlinks** — Full backlink profile: list, referring domains, anchors, referring networks, history
- **Backlinks Page Intersection** — Pages linking to multiple of your targets simultaneously
- **Backlinks Domain Intersection** — Domains linking to you and a competitor
- **Bulk Backlinks / Bulk Referring Domains** — Aggregated backlink metrics for a domain list
- **Local Finder** — Local business listings with grid search for geographic visibility analysis
- **Geo-Grid Ranking** — Ranking heatmap across a geographic grid of points
- **On-Page Site Audit** — Full site crawl with pages, links, resources, duplicate tags and non-indexable pages
- **On-Page Instant Pages** — Instant single-page audit without crawling
- **Microdata Analysis** — Structured data inspection for any crawled URL
- **Content Parsing** — Quality score, readability (ARI), word count, meta tags, content blocks
- **Google Reviews** — Fetch and analyze Google Business reviews: rating distribution, monthly chart, and rating goal calculator
- **AI Optimization** — Visibility in AI-generated answers
- **Reddit Mentions** — Discover Reddit threads linking to or discussing your URLs
- **Top Searches** — Local search trends
- **Settings** — Store your DataForSEO credentials and defaults locally

## Requirements

- Node.js 18+
- A [DataForSEO](https://dataforseo.com/) account (API key)

## Getting Started

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and go to **Settings** to enter your DataForSEO API credentials.

## Docker

```bash
# Build and start
docker compose up --build

# The database is persisted in ./data/seo-playground.db
```

## Configuration

All settings (API credentials, default location, language, coordinates, domain) are stored locally in `seo-playground.db` (SQLite). No `.env` file is needed — configure everything from the Settings page.

## Data Storage

Search history and results are cached locally in `seo-playground.db`. The database is created automatically on first run.

## Tech Stack

- [Next.js 15](https://nextjs.org/) — App Router, Server Actions
- [React 19](https://react.dev/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — local SQLite storage
- [Leaflet](https://leafletjs.com/) — maps
- [Lucide React](https://lucide.dev/) — icons

## Changelog

### 2026-05-31

- **Fix Labs API field mappings** — corrected response parsing for Keyword Ideas (`keyword_properties.keyword_difficulty`, flat structure with no `keyword_data` wrapper), Search Intent (`keyword_intent.label` and `secondary_keyword_intents` array), Subdomains (removed unsupported `order_by` parameter), and Traffic Estimation (removed non-existent position columns, added Paid KWs column)
- **Fix Keyword Ideas request** — endpoint requires `keywords` as an array, not a single `keyword` string
- **Remove Next.js dev indicator** — `devIndicators: false` in next.config.ts
- **Update banner translated to English**
- **Keyword Difficulty** — fixed remaining French strings

### 2026-05-30

- **Labs endpoints** — added Keyword Ideas, Search Intent, Page Intersection, Subdomains, Traffic Estimation
- **Domain Analytics** — added Categories page
- **OnPage** — added Site Audit tabs: Links, Resources, Duplicate Tags, Non-Indexable; added Content Parsing standalone page
- **Backlinks** — added Referring Networks, Page Intersection, Domain Intersection, History (with sparkline charts), Bulk Backlinks, Bulk Referring Domains
- **Fix microdata `field.value.join is not a function`** — DataForSEO returns `value` and `types` as strings in some responses; added `Array.isArray()` guards
- **Fix microdata "page not submitted"** — URL mismatch due to redirect normalization; fetch actual crawled URL from `on_page/pages` first
- **Docker support** — added Dockerfile, `.dockerignore`, and `docker-compose.yml` with persistent SQLite volume
- **Auto-refresh** — Site Audit page polls automatically while a crawl is in progress
- **UI redesign** — sidebar overhaul (blue active state, readable nav labels, section grouping), header cleanup, smooth scroll, focus rings
- **All UI text translated to English**

### Earlier

- **Google Reviews** — async task flow, rating distribution, monthly chart, rating goal calculator
- **On-Page Instant Pages** — full single-page audit via DataForSEO live endpoint
- **Geo-Grid Ranking** — heatmap across a geographic grid, async task polling
- **Site Audit fixes** — resolved INSERT OR REPLACE data wipe bug and invalid `order_by` parameter causing crawls to never complete
- **Initial release** — Rank Tracker, SERP Checker, Ranked Keywords, Keyword Overview, Keyword Data, Keyword Difficulty, Related Keywords, Competitors, Domain Intersection, Historical Rank, Backlinks, Local Finder, On-Page, AI Optimization, Reddit, Top Searches

## License

MIT
