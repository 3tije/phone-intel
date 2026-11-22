
const pages = ["dashboard", "search", "mapping", "reputation", "reports", "settings"];

const $ = (id) => document.getElementById(id);

const getHistory = () => {
  try {
    return JSON.parse(localStorage.getItem("phoneIntelHistory") || "[]");
  } catch {
    return [];
  }
};

const saveHistory = (items) => {
  localStorage.setItem("phoneIntelHistory", JSON.stringify(items.slice(0, 30)));
};

// ==========================================
// NAVIGATION
// ==========================================

function navigate(page) {
  if (!pages.includes(page)) return;

  document.querySelectorAll(".page").forEach(el => {
    el.classList.toggle("active", el.id === `page-${page}`);
  });

  document.querySelectorAll(".nav-item[data-page]").forEach(el => {
    el.classList.toggle("active", el.dataset.page === page);
  });

  $("pageCrumb").textContent = ({
    dashboard: "Dashboard",
    search: "Phone Search",
    mapping: "Intelligence Mapping",
    reputation: "Reputation Analysis",
    reports: "Intelligence Reports",
    settings: "Settings"
  })[page];

  $("sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-page]").forEach(el => {
  el.addEventListener("click", () => navigate(el.dataset.page));
});

document.querySelectorAll("[data-go]").forEach(el => {
  el.addEventListener("click", () => navigate(el.dataset.go));
});

$("mobileMenu").addEventListener("click", () => {
  $("sidebar").classList.toggle("open");
});

// ==========================================
// PHONE INPUT
// ==========================================

function normalizePhoneInput(raw) {
  const cleaned = String(raw || "").trim().replace(/[^\d+]/g, "");

  if (!cleaned) {
    return { ok: false, message: "Masukkan nomor telepon terlebih dahulu." };
  }

  if (cleaned.includes("+") && !cleaned.startsWith("+")) {
    return { ok: false, message: "Tanda + hanya boleh berada di awal nomor." };
  }

  const digits = cleaned.replace(/\D/g, "");

  if (digits.length < 8 || digits.length > 15) {
    return { ok: false, message: "Panjang nomor perlu diperiksa." };
  }

  return { ok: true, raw: cleaned };
}

// ==========================================
// API CONFIGURATION
// ==========================================

function getApiBase() {
  const config = window.PHONE_INTEL_CONFIG || {};
  return String(config.API_BASE_URL || "").replace(/\/+$/, "");
}

async function callApi(endpoint, payload) {
  const base = getApiBase();

  if (!base) {
    throw new Error("API_BASE_URL belum dikonfigurasi.");
  }

  const response = await fetch(`${base}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({
    error: "Respons backend tidak dapat dibaca."
  }));

  if (!response.ok) {
    throw new Error(data.error || `API Error ${response.status}`);
  }

  return data;
}

// ==========================================
// PHONE METADATA
// ==========================================

async function requestPhoneAnalysis(raw) {
  return await callApi("/api/phone/analyze", {
    phone: raw
  });
}

// ==========================================
// PUBLIC SOURCE SEARCH - TAVILY
// ==========================================

async function requestPublicSearch(phone, purpose) {
  return await callApi("/api/public/search", {
    phone: phone,
    purpose: purpose
  });
}

// ==========================================
// START ANALYSIS
// ==========================================

async function startAnalysis(raw, errorId, previewId) {

  const parsed = normalizePhoneInput(raw);

  $(errorId).textContent = parsed.ok ? "" : parsed.message;

  if (!parsed.ok) return;

  const form = $(errorId).closest("form");
  const submitButton = form.querySelector('button[type="submit"]');

  const oldLabel = submitButton.textContent;

  submitButton.disabled = true;
  submitButton.textContent = "Memeriksa...";

  try {

    const result = await requestPhoneAnalysis(parsed.raw);

    const historyItem = {
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now()),

      number: result.e164,
      createdAt: new Date().toISOString(),
      status: "Metadata selesai",
      type: "Phone Intelligence",
      findingsCount: 0
    };

    const history = getHistory();

    history.unshift(historyItem);

    saveHistory(history);

    renderDashboard();

    const target = previewId || "searchPreview";

    if (!previewId) {
      navigate("search");
      $("fullPhoneInput").value = raw;
    }

    renderPhoneResult(
      target,
      result,
      historyItem
    );

    if (!previewId) {
      $("phoneInput").value = "";
    }

  } catch (error) {

    $(errorId).textContent =
      error.message || "Tidak dapat menghubungi backend.";

  } finally {

    submitButton.disabled = false;
    submitButton.textContent = oldLabel;

  }
}

// ==========================================
// RENDER PHONE METADATA
// ==========================================

function renderPhoneResult(targetId, data, historyItem) {

  const target = $(targetId);

  target.classList.remove("hidden");

  const rows = [
    ["Format internasional", data.internationalFormat],
    ["Format nasional", data.nationalFormat],
    ["Negara / wilayah", data.country || "Tidak teridentifikasi"],
    ["Kode panggilan", `+${data.countryCallingCode}`],
    ["Jenis nomor", data.numberType],
    ["Kemungkinan format", data.possible ? "Mungkin" : "Tidak sesuai"],
    ["Valid menurut metadata", data.valid ? "Ya" : "Tidak"]
  ];

  let html = `
    <h3>Phone Intelligence · Metadata Penomoran</h3>

    <div class="metadata-grid">
      ${rows.map(([key, value]) => `
        <div class="metadata-item">
          <small>${escapeHtml(key)}</small>
          <strong>${escapeHtml(String(value ?? "-"))}</strong>
        </div>
      `).join("")}
    </div>

    <p class="metadata-note">
      ${escapeHtml(data.metadataNote || "")}
    </p>

    <span class="validation-tag">
      ${escapeHtml(data.validation || "")}
    </span>
  `;

  if (data.valid) {

    html += `
      <div class="public-search-panel">

        <h3>Public Source Discovery</h3>

        <p class="muted">
          Pilih jenis pencarian untuk menemukan referensi
          dari sumber web publik.
        </p>

        <div class="search-action-buttons">

          <button
            type="button"
            class="button button-primary"
            data-search-purpose="business-contact">
            Cari Kontak Resmi
          </button>

          <button
            type="button"
            class="button"
            data-search-purpose="spam-report">
            Cari Laporan Spam
          </button>

        </div>

        <div id="${targetId}-results-business-contact"></div>

        <div id="${targetId}-results-spam-report"></div>

      </div>
    `;

  } else {

    html += `
      <div class="notice">
        Nomor belum memenuhi validasi metadata.
        Pencarian sumber publik tidak dijalankan.
      </div>
    `;

  }

  target.innerHTML = html;

  if (data.valid) {

    target.querySelectorAll("[data-search-purpose]").forEach(button => {

      button.addEventListener("click", async () => {

        const purpose = button.dataset.searchPurpose;

        const output = $(
          `${targetId}-results-${purpose}`
        );

        await runPublicSearch(
          data.e164,
          purpose,
          button,
          output,
          historyItem.id
        );

      });

    });

  }

  updateSearchStep(2);
}

// ==========================================
// PUBLIC SEARCH EXECUTION
// ==========================================

async function runPublicSearch(
  phone,
  purpose,
  button,
  output,
  historyId
) {

  const oldLabel = button.textContent;

  button.disabled = true;
  button.textContent = "Mencari sumber...";

  output.innerHTML = `
    <div class="result-preview">
      <p>Menghubungi konektor pencarian sumber publik...</p>
    </div>
  `;

  try {

    const result = await requestPublicSearch(
      phone,
      purpose
    );

    renderPublicFindings(output, result);

    const history = getHistory();

    const item = history.find(x => x.id === historyId);

    if (item) {

      item.findingsCount =
        (item.findingsCount || 0) + result.resultCount;

      item.status = "Pencarian sumber selesai";

      saveHistory(history);

      renderDashboard();
    }

    updateSearchStep(3);

  } catch (error) {

    output.innerHTML = `
      <div class="notice">
        <strong>Pencarian belum berhasil</strong>
        <p>${escapeHtml(error.message)}</p>
        <p>Periksa koneksi backend dan konfigurasi Tavily.</p>
      </div>
    `;

  } finally {

    button.disabled = false;
    button.textContent = oldLabel;

  }
}

// ==========================================
// RENDER PUBLIC FINDINGS
// ==========================================

function renderPublicFindings(target, result) {

  const findings = Array.isArray(result.findings)
    ? result.findings
    : [];

  let html = `
    <div class="public-findings">

      <h3>Hasil Pencarian Sumber Publik</h3>

      <div class="metadata-grid">

        <div class="metadata-item">
          <small>Provider</small>
          <strong>${escapeHtml(result.provider || "Tavily")}</strong>
        </div>

        <div class="metadata-item">
          <small>Jumlah temuan</small>
          <strong>${findings.length}</strong>
        </div>

        <div class="metadata-item">
          <small>Status</small>
          <strong>Review Required</strong>
        </div>

        <div class="metadata-item">
          <small>Tujuan pencarian</small>
          <strong>${escapeHtml(result.purpose || "-")}</strong>
        </div>

      </div>

      <p class="metadata-note">
        Query: ${escapeHtml(result.query || "")}
      </p>
  `;

  if (!findings.length) {

    html += `
      <div class="empty-state">
        <strong>Belum ada temuan</strong>
        <p>Tidak ditemukan referensi yang sesuai dengan query.</p>
      </div>
    `;

  } else {

    html += `<div class="finding-list">`;

    findings.forEach((item, index) => {

      const url = String(item.url || "");

      html += `
        <article class="finding-card">

          <div class="finding-heading">

            <span class="panel-tag">
              SOURCE ${index + 1}
            </span>

            <span class="validation-tag">
              UNVERIFIED
            </span>

          </div>

          <h4>${escapeHtml(item.title || "Tanpa judul")}</h4>

          <p class="finding-domain">
            ${escapeHtml(item.sourceDomain || "")}
          </p>

          <p class="finding-snippet">
            ${escapeHtml(item.snippet || "Tidak ada cuplikan.")}
          </p>

          <a
            href="${escapeHtml(url)}"
            target="_blank"
            rel="noopener noreferrer">
            Buka Sumber Asli →
          </a>

          <small class="finding-date">
            ${escapeHtml(item.observedAt || "")}
          </small>

        </article>
      `;

    });

    html += `</div>`;

  }

  html += `
      <p class="metadata-note">
        ${escapeHtml(result.note || "")}
      </p>

    </div>
  `;

  target.innerHTML = html;
}

// ==========================================
// SEARCH STEP INDICATOR
// ==========================================

function updateSearchStep(activeNumber) {

  const steps = document.querySelectorAll(
    "#page-search .step-indicator .step"
  );

  steps.forEach((step, index) => {

    step.classList.toggle(
      "active",
      index < activeNumber
    );

  });

}

// ==========================================
// DASHBOARD
// ==========================================

function renderDashboard() {

  const items = getHistory();

  $("statAnalyses").textContent =
    String(items.length).padStart(2, "0");

  const totalFindings = items.reduce(
    (sum, item) => sum + (item.findingsCount || 0),
    0
  );

  $("statFindings").textContent =
    String(totalFindings).padStart(2, "0");

  const recent = $("recentActivity");
  const reports = $("reportList");

  if (!items.length) {

    recent.className = "empty-state";

    recent.innerHTML = `
      <div class="empty-icon">⌁</div>
      <strong>Belum ada aktivitas</strong>
      <p>Analisis yang Anda mulai akan muncul di sini.</p>
    `;

    reports.className = "empty-state";

    reports.innerHTML = `
      <div class="empty-icon">▤</div>
      <strong>Belum ada laporan</strong>
      <p>Mulai analisis untuk membuat catatan awal.</p>
    `;

    return;
  }

  recent.className = "activity-list";

  recent.innerHTML = items.slice(0, 4).map(item => `

    <div class="quick-link">
      <span>⌕</span>

      <div>
        <strong>${escapeHtml(item.number)}</strong>

        <small>
          ${new Date(item.createdAt).toLocaleString("id-ID")}
          · ${escapeHtml(item.status)}
        </small>
      </div>

      <b>→</b>
    </div>

  `).join("");

  reports.className = "activity-list";

  reports.innerHTML = items.map(item => `

    <div class="quick-link">
      <span>▤</span>

      <div>
        <strong>${escapeHtml(item.number)}</strong>

        <small>
          ${new Date(item.createdAt).toLocaleString("id-ID")}
          · ${escapeHtml(item.type)}
        </small>
      </div>

      <b>${item.findingsCount || 0} temuan</b>
    </div>

  `).join("");

}

// ==========================================
// HTML SAFETY
// ==========================================

function escapeHtml(str) {

  return String(str).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);

}

// ==========================================
// FORM CONNECTION
// ==========================================

$("quickSearch").addEventListener("submit", event => {

  event.preventDefault();

  startAnalysis(
    $("phoneInput").value,
    "phoneError"
  );

});

$("fullSearch").addEventListener("submit", event => {

  event.preventDefault();

  startAnalysis(
    $("fullPhoneInput").value,
    "fullPhoneError",
    "searchPreview"
  );

});

// ==========================================
// CLEAR HISTORY
// ==========================================

$("clearHistory").addEventListener("click", () => {

  if (confirm(
    "Hapus seluruh riwayat lokal PHONE INTEL pada browser ini?"
  )) {

    localStorage.removeItem("phoneIntelHistory");

    renderDashboard();

  }

});

// ==========================================
// SERVICE WORKER
// ==========================================

if (
  "serviceWorker" in navigator &&
  location.protocol !== "file:"
) {

  window.addEventListener("load", () => {

    navigator.serviceWorker.register("sw.js", {
      scope: "./"
    }).catch(error => {

      console.warn("Service worker:", error);

    });

  });

}

// ==========================================
// INITIALIZATION
// ==========================================

renderDashboard();
