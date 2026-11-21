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


## Stage 2 — Phone Intelligence Engine
Backend endpoint:
- `POST /api/phone/analyze`
- Request JSON: `{"phone":"081234567890"}`
- Response includes E.164, national/international formatting, country, calling code, possible/valid flags, and numbering-plan type.

The endpoint uses `libphonenumber-js` metadata. It does **not** determine subscriber identity, live status, current carrier, GPS location, or who is using the phone. Number portability and allocation changes mean carrier inference from prefixes is not reliable.

Configure the frontend by setting `API_BASE_URL` in `js/config.js` to the deployed backend origin. Keep this URL public; never place API secrets there.

For local development, start the backend in `backend/` with `npm install && npm run dev`, then set `API_BASE_URL` to `http://localhost:8787` in `js/config.js`. Serve the frontend on the configured CORS origin (default `http://localhost:8888`).
