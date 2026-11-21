import { parsePhoneNumberFromString } from "libphonenumber-js/max";

const ALLOWED_ORIGIN = "https://3tije.github.io";

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

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({
        status: "ok",
        service: "PHONE INTEL API",
        version: "1.0.0",
        runtime: "cloudflare-workers",
        scope: "public-data-only"
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

    return json({ error: "Endpoint tidak ditemukan." }, 404, origin);
  }
};
