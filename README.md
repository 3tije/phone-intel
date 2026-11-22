# PHONE INTEL V1.0 — Foundation

PWA prototype for responsible OSINT research using lawful public sources.

## Baseline
- Frontend: static HTML/CSS/JavaScript, deployable to Netlify
- Backend: Node.js + Express
- Interface: Dark Intelligence
- Scope: public sources only
- Current status: UI prototype + local history + Indonesian phone normalization
- Not implemented: external search connectors, identity resolution, private data access, production authentication, PDF export

## Run frontend locally
Use any static server from the project root, for example:
```bash
npx serve .
```
Or install Netlify CLI and run:
```bash
npx netlify dev
```

## Run backend
```bash
cd backend
cp .env.example .env
npm install
npm run dev
```
Health check: `GET http://localhost:8787/api/health`

Normalize endpoint:
```bash
curl -X POST http://localhost:8787/api/phone/normalize \
  -H "Content-Type: application/json" \
  -d '{"phone":"081234567890"}'
```

## Netlify deployment
1. Push the project to a Git repository.
2. Import the repository into Netlify.
3. Set publish directory to the project root (`.`).
4. Configure a custom domain and HTTPS if required.
5. Deploy the backend separately to a Node.js-capable host.
6. Configure CORS and API base URL before connecting frontend to backend.

## Security gates before production
- Add authentication and role-based authorization.
- Keep API secrets on the server only.
- Review each source's terms, access method and lawful basis before enabling a connector.
- Store source URL, timestamp, excerpt, provenance and verification status for every finding.
- Add rate limiting, audit logging, retention/deletion controls and database row-level access policies.
- Do not scrape private contact books, leaked databases, private accounts, WhatsApp content or precise private location.
- Treat a phone-number mention as a lead, not proof of ownership or identity.

## Project structure
```text
phone-intel-v1/
├── index.html
├── manifest.json
├── sw.js
├── assets/
├── css/
├── js/
├── backend/
└── database/
```


## GitHub Pages compatibility fix
All frontend asset paths are relative to the repository base path. The manifest
uses `start_url: ./` and `scope: ./`; the service worker derives its cache paths
from its registration scope. This supports deployment at
`https://<user>.github.io/<repository>/` as well as a custom-domain root.
The frontend now loads `js/config.js` before `js/app.js`.


## V1.1 Stage 1 — Public Source Discovery (backend foundation)

The Cloudflare Worker now exposes:
- `POST /api/public/search`
- Purpose is required: `business-contact` or `spam-report`
- Input phone must pass Indonesian numbering-plan metadata validation.
- Search results are returned as unverified leads with title, URL, snippet, domain and observation time.
- The connector does not resolve subscriber identity, private accounts, home addresses or precise locations.

### Configure the search provider
The connector uses Brave Search API. Configure its API key as a Cloudflare Worker secret named `BRAVE_SEARCH_API_KEY` (never put the key in frontend JavaScript or commit it to Git).

Example local test after deployment:
```bash
curl -X POST "https://YOUR-WORKER.workers.dev/api/public/search" \\
  -H "Content-Type: application/json" \\
  -d '{"phone":"081234567890","purpose":"spam-report"}'
```

If the secret is not configured, the endpoint returns `503 connector_not_configured`. This is intentional; no fabricated or demo search results are returned.

Before production use, review the search provider's current plan, pricing, terms, data-processing terms and permitted use. Apply authentication, rate limiting, audit logs, retention limits and per-investigation authorization before exposing this endpoint to broad users.
