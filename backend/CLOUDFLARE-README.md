# PHONE INTEL — Cloudflare Workers backend

This is the Cloudflare Workers entry point for the PHONE INTEL API.
The existing `server.js` Express backend is retained for local Node.js development.
Cloudflare deploys `src/worker.js` using `wrangler.jsonc`.

## Cloudflare Workers Builds settings
- Repository: `3tije/phone-intel`
- Root directory: `backend`
- Build command: `npm install`
- Deploy command: `npx wrangler deploy`
- Worker name: `phone-intel-api` (must match `wrangler.jsonc`)

Endpoints:
- `GET /api/health`
- `POST /api/phone/analyze` with JSON `{"phone":"081234567890"}`

CORS allows the GitHub Pages origin `https://3tije.github.io`.
The endpoint only validates numbering-plan metadata. It does not identify subscribers,
confirm that a number is active, infer current carrier, or locate a person.
