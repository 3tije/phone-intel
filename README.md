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
