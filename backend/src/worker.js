
import { parsePhoneNumberFromString } from "libphonenumber-js/max";

const ALLOWED_ORIGIN = "https://3tije.github.io";
const MAX_SEARCH_RESULTS = 8;
const API_VERSION = "1.3.0";
const SESSION_DAYS = 7;

// ==========================================
// CORS & RESPONSE
// ==========================================

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders()
    }
  });
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// ==========================================
// SECURITY & OWNER SESSION
// ==========================================

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function hashToken(token) {
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(hash))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function authenticate(request, env) {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match || !env.DB) return null;

  const tokenHash = await hashToken(match[1]);
  const now = new Date().toISOString();

  return await env.DB.prepare(`
    SELECT id, expires_at
    FROM owner_sessions
    WHERE token_hash = ?
      AND expires_at > ?
    LIMIT 1
  `).bind(tokenHash, now).first();
}

async function login(request, env) {
  if (!env.DB || !env.OWNER_PASSWORD) {
    return json({
      ok: false,
      error: "Konfigurasi login belum lengkap."
    }, 503);
  }

  const body = await readBody(request);

  if (!body || typeof body.password !== "string") {
    return json({
      ok: false,
      error: "Password wajib diisi."
    }, 400);
  }

  if (body.password !== env.OWNER_PASSWORD) {
    return json({
      ok: false,
      error: "Password tidak sesuai."
    }, 401);
  }

  const token = randomToken();
  const tokenHash = await hashToken(token);
  const id = crypto.randomUUID();

  const createdAt = new Date();
  const expiresAt = new Date(
    createdAt.getTime() + SESSION_DAYS * 86400000
  );

  await env.DB.prepare(`
    DELETE FROM owner_sessions
    WHERE expires_at <= ?
  `).bind(createdAt.toISOString()).run();

  await env.DB.prepare(`
    INSERT INTO owner_sessions
      (id, token_hash, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).bind(
    id,
    tokenHash,
    createdAt.toISOString(),
    expiresAt.toISOString()
  ).run();

  return json({
    ok: true,
    token,
    expiresAt: expiresAt.toISOString()
  });
}

async function logout(request, env) {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (match && env.DB) {
    const tokenHash = await hashToken(match[1]);

    await env.DB.prepare(`
      DELETE FROM owner_sessions
      WHERE token_hash = ?
    `).bind(tokenHash).run();
  }

  return json({ ok: true, message: "Sesi telah diakhiri." });
}

// ==========================================
// PHONE NUMBER VALIDATION
// ==========================================

function analyzePhoneNumber(input) {
  const raw = String(input ?? "").trim();

  if (!raw) {
    return { ok: false, error: "Nomor telepon wajib diisi." };
  }

  const phone = parsePhoneNumberFromString(raw, "ID");

  if (!phone) {
    return {
      ok: false,
      error: "Format nomor belum dapat dikenali."
    };
  }

  const possible = phone.isPossible();
  const valid = phone.isValid();

  return {
    ok: true,
    input: raw,
    e164: phone.number,
    country: phone.country ?? null,
    countryCallingCode: phone.countryCallingCode,
    nationalNumber: phone.nationalNumber,
    internationalFormat: phone.formatInternational(),
    nationalFormat: phone.formatNational(),
    numberType: phone.getType() ?? "UNKNOWN",
    possible,
    valid,
    validation: valid
      ? "VALID_NUMBERING_PLAN"
      : possible
        ? "POSSIBLE_BUT_NOT_CONFIRMED"
        : "INVALID_OR_UNLIKELY",
    metadataNote:
      "Validasi metadata tidak membuktikan nomor aktif, pemilik, operator, atau lokasi pengguna."
  };
}

// ==========================================
// SAVE PHONE ANALYSIS TO D1
// ==========================================

async function saveAnalysis(env, phone) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO phone_analyses
      (id, phone_e164, country, validation, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    id,
    phone.e164,
    phone.country || null,
    phone.validation,
    createdAt
  ).run();

  return { id, createdAt };
}

// ==========================================
// TAVILY PUBLIC SEARCH
// ==========================================

function buildPublicQuery(phone, purpose) {
  const exact = `"${phone.e164}"`;

  if (purpose === "business-contact") {
    return `${exact} (kontak resmi OR contact OR customer service OR layanan pelanggan)`;
  }

  if (purpose === "spam-report") {
    return `${exact} (spam OR scam OR fraud OR penipuan OR nomor mencurigakan)`;
  }

  return null;
}

async function searchPublicSources(phone, purpose, env) {
  const query = buildPublicQuery(phone, purpose);

  if (!query) {
    return {
      ok: false,
      status: "invalid_purpose",
      error: "Tujuan pencarian tidak didukung."
    };
  }

  if (!env.TAVILY_API_KEY) {
    return {
      ok: false,
      status: "connector_not_configured",
      error: "Tavily API Key belum dikonfigurasi."
    };
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.TAVILY_API_KEY}`
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      topic: "general",
      max_results: MAX_SEARCH_RESULTS,
      include_answer: false,
      include_raw_content: false,
      country: "indonesia"
    })
  });

  if (!response.ok) {
    return {
      ok: false,
      status: "provider_error",
      error: `Tavily mengembalikan status ${response.status}.`
    };
  }

  const payload = await response.json();
  const results = Array.isArray(payload?.results)
    ? payload.results
    : [];

  const findings = results.slice(0, MAX_SEARCH_RESULTS).flatMap(item => {
    const url = String(item?.url || "");

    if (!/^https?:\/\//i.test(url)) return [];

    let sourceDomain = "";

    try {
      sourceDomain = new URL(url).hostname;
    } catch {}

    return [{
      title: String(item?.title || "Tanpa judul").slice(0, 300),
      url,
      snippet: String(item?.content || "").slice(0, 700),
      sourceDomain,
      verificationStatus: "unverified",
      observedAt: new Date().toISOString()
    }];
  });

  return {
    ok: true,
    status: "review_required",
    provider: "Tavily",
    purpose,
    query,
    resultCount: findings.length,
    findings,
    note:
      "Hasil berasal dari indeks web publik dan belum diverifikasi. Kemunculan nomor tidak membuktikan identitas atau kepemilikan seseorang."
  };
}

// ==========================================
// SAVE FINDINGS TO D1
// ==========================================

async function saveFindings(env, analysisId, findings) {
  if (!findings.length) return;

  const statements = findings.map(item =>
    env.DB.prepare(`
      INSERT INTO public_findings
        (id, analysis_id, title, url, source_domain,
         snippet, verification_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      analysisId,
      item.title,
      item.url,
      item.sourceDomain,
      item.snippet,
      item.verificationStatus,
      item.observedAt
    )
  );

  await env.DB.batch(statements);
}

// ==========================================
// READ HISTORY FROM D1
// ==========================================

async function getHistory(env) {
  const analyses = await env.DB.prepare(`
    SELECT id, phone_e164, country, validation, created_at
    FROM phone_analyses
    ORDER BY created_at DESC
    LIMIT 100
  `).all();

  const rows = analyses.results || [];

  if (!rows.length) {
    return json({ ok: true, analyses: [], findings: [] });
  }

  const ids = rows.map(row => row.id);
  const placeholders = ids.map(() => "?").join(",");

  const findings = await env.DB.prepare(`
    SELECT id, analysis_id, title, url, source_domain,
           snippet, verification_status, created_at
    FROM public_findings
    WHERE analysis_id IN (${placeholders})
    ORDER BY created_at DESC
  `).bind(...ids).all();

  return json({
    ok: true,
    analyses: rows,
    findings: findings.results || []
  });
}

// ==========================================
// MAIN WORKER
// ==========================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    if (method === "GET" && path === "/api/health") {
      return json({
        ok: true,
        status: "ok",
        service: "PHONE INTEL API",
        version: API_VERSION,
        runtime: "cloudflare-workers",
        database: Boolean(env.DB),
        capabilities: [
          "owner-authentication",
          "phone-metadata",
          "public-source-discovery",
          "d1-persistence",
          "history"
        ]
      });
    }

    if (method === "POST" && path === "/api/auth/login") {
      return await login(request, env);
    }

    if (method === "POST" && path === "/api/auth/logout") {
      return await logout(request, env);
    }

    // All other API endpoints require owner authentication.

    if (!env.DB) {
      return json({
        ok: false,
        error: "D1 binding DB belum tersedia."
      }, 503);
    }

    const session = await authenticate(request, env);

    if (!session) {
      return json({
        ok: false,
        error: "Sesi tidak valid atau sudah berakhir. Silakan login."
      }, 401);
    }

    // PHONE ANALYSIS

    if (method === "POST" && path === "/api/phone/analyze") {
      const body = await readBody(request);

      if (!body) {
        return json({ error: "Request JSON tidak valid." }, 400);
      }

      const result = analyzePhoneNumber(body.phone);

      if (!result.ok) {
        return json(result, 400);
      }

      const saved = await saveAnalysis(env, result);

      return json({
        ...result,
        analysisId: saved.id,
        createdAt: saved.createdAt
      });
    }

    // PUBLIC SOURCE SEARCH

    if (method === "POST" && path === "/api/public/search") {
      const body = await readBody(request);

      if (!body) {
        return json({ error: "Request JSON tidak valid." }, 400);
      }

      const phone = analyzePhoneNumber(body.phone);

      if (!phone.ok || !phone.valid) {
        return json({
          ok: false,
          error: phone.error || "Nomor tidak memenuhi validasi."
        }, 400);
      }

      const purpose = String(body.purpose || "");

      if (!["business-contact", "spam-report"].includes(purpose)) {
        return json({
          ok: false,
          error: "Tujuan pencarian tidak didukung."
        }, 400);
      }

      let analysisId = String(body.analysisId || "");

      if (analysisId) {
        const existing = await env.DB.prepare(`
          SELECT id
          FROM phone_analyses
          WHERE id = ? AND phone_e164 = ?
          LIMIT 1
        `).bind(analysisId, phone.e164).first();

        if (!existing) {
          return json({
            ok: false,
            error: "Data analisis tidak ditemukan."
          }, 404);
        }
      } else {
        const saved = await saveAnalysis(env, phone);
        analysisId = saved.id;
      }

      try {
        const result = await searchPublicSources(phone, purpose, env);

        if (!result.ok) {
          return json({
            ...result,
            analysisId
          }, result.status === "connector_not_configured" ? 503 : 502);
        }

        await saveFindings(env, analysisId, result.findings);

        return json({
          ...result,
          analysisId,
          phone: {
            e164: phone.e164,
            country: phone.country,
            validation: phone.validation
          }
        });

      } catch (error) {
        console.error("PHONE INTEL SEARCH ERROR:", error?.message);

        return json({
          ok: false,
          status: "provider_unavailable",
          analysisId,
          error: "Pencarian tidak dapat diselesaikan. Coba kembali nanti."
        }, 502);
      }
    }

    // HISTORY

    if (method === "GET" && path === "/api/history") {
      return await getHistory(env);
    }

    return json({
      ok: false,
      error: "Endpoint tidak ditemukan."
    }, 404);
  }
};
