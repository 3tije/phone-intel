import { parsePhoneNumberFromString } from "libphonenumber-js/max";

const ALLOWED_ORIGIN = "https://3tije.github.io";
const MAX_SEARCH_RESULTS = 8;

function corsHeaders(origin) {
  const allowed = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(origin)
    }
  });
}

function analyzePhoneNumber(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return { ok: false, error: "Nomor telepon wajib diisi." };

  const phone = parsePhoneNumberFromString(raw, "ID");
  if (!phone) {
    return {
      ok: false,
      error: "Format nomor belum dapat dikenali. Gunakan format 08..., +62..., atau format internasional yang benar."
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
    validation: valid ? "VALID_NUMBERING_PLAN" : possible ? "POSSIBLE_BUT_NOT_CONFIRMED" : "INVALID_OR_UNLIKELY",
    metadataNote: "Validasi berdasarkan metadata rencana penomoran. Ini tidak membuktikan nomor aktif, siapa pemiliknya, operator saat ini, atau lokasi pengguna."
  };
}

function buildPublicQuery(phone, purpose) {
  // Search is intentionally constrained to public business-contact or scam-report context.
  // It does not perform person-name, address, account, or location lookups.
  const exact = `"${phone.number}"`;
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
      error: "Tavily API Key belum dikonfigurasi.",
      setupRequired: true
    };
  }

  const response = await fetch(
    "https://api.tavily.com/search",
    {
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
    }
  );

  if (!response.ok) {
    return {
      ok: false,
      status: "provider_error",
      error: `Tavily mengembalikan status ${response.status}. Periksa API Key dan kuota.`
    };
  }

  const payload = await response.json();

  const results = Array.isArray(payload?.results)
    ? payload.results
    : [];

  const findings = results.slice(0, MAX_SEARCH_RESULTS)
    .flatMap((item) => {
      const url = String(item?.url || "");

      if (!/^https?:\/\//i.test(url)) return [];

      return [{
        title: String(item?.title || "Tanpa judul").slice(0, 300),
        url,
        snippet: String(item?.content || "").slice(0, 700),
        sourceDomain: (() => {
          try {
            return new URL(url).hostname;
          } catch {
            return "";
          }
        })(),
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
    note: "Hasil berasal dari indeks web publik dan belum diverifikasi. Kemunculan nomor tidak membuktikan kepemilikan atau identitas seseorang. Periksa sumber asli sebelum menyimpan atau menyimpulkan."
  };
}


  const endpoint = new URL("https://api.search.brave.com/res/v1/web/search");
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("count", String(MAX_SEARCH_RESULTS));
  endpoint.searchParams.set("country", "ID");
  endpoint.searchParams.set("search_lang", "id");
  endpoint.searchParams.set("safesearch", "strict");
  endpoint.searchParams.set("text_decorations", "false");
  endpoint.searchParams.set("spellcheck", "false");

  const response = await fetch(endpoint.toString(), {
    headers: {
      "Accept": "application/json",
      "X-Subscription-Token": env.BRAVE_SEARCH_API_KEY
    }
  });

  if (!response.ok) {
    return {
      ok: false,
      status: "provider_error",
      error: `Penyedia pencarian mengembalikan status ${response.status}. Periksa konfigurasi dan kuota konektor.`
    };
  }

  const payload = await response.json();
  const results = Array.isArray(payload?.web?.results) ? payload.web.results : [];
  const findings = results.slice(0, MAX_SEARCH_RESULTS).flatMap((item) => {
    const url = String(item?.url || "");
    if (!/^https?:\/\//i.test(url)) return [];
    return [{
      title: String(item?.title || "Tanpa judul").slice(0, 300),
      url,
      snippet: String(item?.description || "").slice(0, 700),
      sourceDomain: (() => {
        try { return new URL(url).hostname; } catch { return ""; }
      })(),
      verificationStatus: "unverified",
      observedAt: new Date().toISOString()
    }];
  });

  return {
    ok: true,
    status: "review_required",
    purpose,
    query,
    resultCount: findings.length,
    findings,
    note: "Hasil berasal dari indeks web publik dan belum diverifikasi. Kemunculan nomor tidak membuktikan kepemilikan, identitas, hubungan, atau aktivitas nomor. Tinjau sumber asli dan dasar penggunaannya sebelum menyimpan atau menyimpulkan."
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({
        status: "ok",
        service: "PHONE INTEL API",
        version: "1.1.0",
        runtime: "cloudflare-workers",
        scope: "public-data-only",
        capabilities: ["phone-metadata", "public-source-discovery"]
      }, 200, origin);
    }

    if (request.method === "POST" && url.pathname === "/api/phone/analyze") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Request body harus berupa JSON yang valid." }, 400, origin);
      }

      const result = analyzePhoneNumber(body?.phone);
      return json(result, result.ok ? 200 : 400, origin);
    }

    if (request.method === "POST" && url.pathname === "/api/public/search") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Request body harus berupa JSON yang valid." }, 400, origin);
      }

      const phoneResult = analyzePhoneNumber(body?.phone);
      if (!phoneResult.ok || !phoneResult.valid) {
        return json({
          ok: false,
          error: phoneResult.error || "Nomor belum memenuhi validasi metadata penomoran."
        }, 400, origin);
      }

      const purpose = String(body?.purpose || "");
      if (!["business-contact", "spam-report"].includes(purpose)) {
        return json({
          ok: false,
          error: "Pilih tujuan business-contact atau spam-report."
        }, 400, origin);
      }

      try {
        const result = await searchPublicSources(phoneResult, purpose, env || {});
        const statusCode = result.ok ? 200 : result.status === "connector_not_configured" ? 503 : 502;
        return json({
          ...result,
          phone: {
            e164: phoneResult.e164,
            country: phoneResult.country,
            validation: phoneResult.validation
          }
        }, statusCode, origin);
      } catch {
        return json({
          ok: false,
          status: "provider_unavailable",
          error: "Konektor pencarian tidak dapat dihubungi. Coba kembali nanti."
        }, 502, origin);
      }
    }

    return json({ error: "Endpoint tidak ditemukan." }, 404, origin);
  }
};
