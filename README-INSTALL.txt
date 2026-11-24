PHONE INTEL V1.4 — PAKET INTEGRASI

Isi paket:
- index.html: halaman login pemilik dan enam menu utama.
- js/app.js: autentikasi, sesi, analisis nomor, pencarian Tavily, riwayat D1, dan hapus riwayat.
- css/login-addon.css: tambahan gaya login; CSS utama tidak ditimpa.
- backend/src/worker.js: Worker API v1.4.0.
- sw.js: cache PWA v3 dengan network-first untuk HTML/JS/CSS.

PRA-SYARAT
1. Backup repo dan backend yang berjalan.
2. Pastikan js/config.js berisi URL Worker, misalnya:
   window.PHONE_INTEL_CONFIG = { API_BASE_URL: "https://phone-intel.b177tri.workers.dev" };
3. Cloudflare Worker memiliki D1 binding bernama DB ke phone_intel_db.
4. Runtime secrets Cloudflare bernama OWNER_PASSWORD dan TAVILY_API_KEY.
5. Jangan menaruh password/API key di frontend, GitHub, atau chat.

DEPLOY FRONTEND
- Ganti index.html.
- Ganti js/app.js.
- Tambahkan css/login-addon.css.
- Ganti sw.js.
- Pertahankan css/style.css, js/config.js, manifest.json, dan assets/icon.svg.
- Commit dan push ke GitHub Pages.

DEPLOY WORKER
- Ganti backend/src/worker.js.
- Dari folder backend jalankan: npm install
- Lalu: npx wrangler deploy

UJI
1. Buka https://3tije.github.io lalu login dengan owner password.
2. Uji analisis nomor yang memang boleh digunakan.
3. Jalankan pencarian sumber publik.
4. Pastikan riwayat muncul di Intelligence Reports.
5. Tombol Hapus riwayat menghapus seluruh phone_analyses, public_findings, dan intelligence_reports. Sesi owner tidak ikut dihapus.

CATATAN
- Token disimpan di sessionStorage tab ini. Reload tab dapat mempertahankan sesi; browser/perangkat lain perlu login lagi.
- Masa berlaku sesi 7 hari.
- Hasil Tavily belum diverifikasi dan tidak membuktikan identitas atau kepemilikan nomor.
- Pastikan tabel intelligence_reports tersedia di D1. Bila tabel belum ada atau nama tabel berbeda, query hapus riwayat harus disesuaikan sebelum dipakai.
- Jangan klik Hapus riwayat sebelum memastikan data lama memang boleh dihapus.
