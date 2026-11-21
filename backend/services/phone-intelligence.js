import { parsePhoneNumberFromString } from "libphonenumber-js/max";

export function analyzePhoneNumber(input, defaultCountry = "ID") {
  const raw = String(input ?? "").trim();
  if (!raw) {
    return { ok: false, error: "Nomor telepon wajib diisi." };
  }

  // Do not silently reinterpret arbitrary international numbers.
  const phone = parsePhoneNumberFromString(raw, defaultCountry);
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
