# PHONE INTEL V1.1 — Public Source Discovery

## Stage 1 scope
This stage adds a backend-only discovery endpoint. The existing V1.0 frontend and UI are intentionally unchanged.

### Endpoint
`POST /api/public/search`

Request:
```json
{
  "phone": "081234567890",
  "purpose": "spam-report"
}
```

Allowed purposes:
- `business-contact`: search for publicly published official business/service contact references.
- `spam-report`: search for public spam/scam/fraud complaint references.

### Provider
The Cloudflare Worker uses Brave Search API. Set `BRAVE_SEARCH_API_KEY` as a Worker secret. Never put the key in frontend files or repository content.

### Response semantics
Every returned result has `verificationStatus: "unverified"`. The result is a lead for human review, not evidence of ownership or identity. A phone number appearing in a public page does not prove who owns or currently uses it.

If no API secret is configured, the endpoint returns HTTP 503 with `connector_not_configured`. It does not return simulated findings.

### Deployment
1. Keep the existing Worker service and GitHub repository.
2. Replace `backend/src/worker.js` with this version.
3. Add Worker secret `BRAVE_SEARCH_API_KEY` in Cloudflare.
4. Deploy from the existing Cloudflare Workers & Pages Git integration.
5. Test `/api/health`, then test `/api/public/search` with a valid number and one allowed purpose.

### Not included in Stage 1
- Frontend controls or UI changes.
- Persistent storage of search results.
- Identity resolution or personal-profile lookup.
- Private contact books, leaked datasets, private accounts, messaging content or precise location lookup.
- Automated reputation scoring.

### Production gates
Before wider deployment, add authentication, rate limiting, abuse monitoring, per-investigation authorization, audit logs, retention/deletion controls and a provider terms/privacy review.
