const pages = ["dashboard","search","mapping","reputation","reports","settings"];
const $ = (id) => document.getElementById(id);
const getHistory = () => { try { return JSON.parse(localStorage.getItem("phoneIntelHistory") || "[]"); } catch { return []; } };
const saveHistory = (items) => localStorage.setItem("phoneIntelHistory", JSON.stringify(items.slice(0,30)));
function navigate(page){
  if(!pages.includes(page)) return;
  document.querySelectorAll(".page").forEach(el=>el.classList.toggle("active",el.id===`page-${page}`));
  document.querySelectorAll(".nav-item[data-page]").forEach(el=>el.classList.toggle("active",el.dataset.page===page));
  $("pageCrumb").textContent = ({dashboard:"Dashboard",search:"Phone Search",mapping:"Intelligence Mapping",reputation:"Reputation Analysis",reports:"Intelligence Reports",settings:"Settings"})[page];
  $("sidebar").classList.remove("open");
  window.scrollTo({top:0,behavior:"smooth"});
}
document.querySelectorAll("[data-page]").forEach(el=>el.addEventListener("click",()=>navigate(el.dataset.page)));
document.querySelectorAll("[data-go]").forEach(el=>el.addEventListener("click",()=>navigate(el.dataset.go)));
$("mobileMenu").addEventListener("click",()=>$("sidebar").classList.toggle("open"));

function normalizePhoneInput(raw){
  const cleaned = String(raw || "").trim().replace(/[^\d+]/g,"");
  if(!cleaned) return {ok:false,message:"Masukkan nomor telepon terlebih dahulu."};
  if(cleaned.includes("+") && !cleaned.startsWith("+")) return {ok:false,message:"Tanda + hanya boleh berada di awal nomor."};
  const digits=cleaned.replace(/\D/g,"");
  if(digits.length < 8 || digits.length > 15) return {ok:false,message:"Panjang nomor perlu diperiksa. Gunakan format nasional atau internasional."};
  return {ok:true,raw:cleaned};
}
async function requestPhoneAnalysis(raw){
  const config=window.PHONE_INTEL_CONFIG || {};
  const base=String(config.API_BASE_URL || "").replace(/\/$/,"");
  if(!base) return {mode:"local",message:"Backend belum dikonfigurasi. Input lolos pemeriksaan awal browser, tetapi metadata penomoran belum diverifikasi."};
  const response=await fetch(`${base}/api/phone/analyze`,{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone:raw})
  });
  const data=await response.json().catch(()=>({error:"Respons backend tidak dapat dibaca."}));
  if(!response.ok) throw new Error(data.error || "Analisis nomor gagal.");
  return {mode:"api",data};
}

async function startAnalysis(raw, errorId, previewId){
  const parsed=normalizePhoneInput(raw);
  $(errorId).textContent=parsed.ok?"":parsed.message;
  if(!parsed.ok) return;
  const submitButton = document.querySelector(`#${errorId}`).closest("form").querySelector('button[type="submit"]');
  const oldLabel=submitButton.textContent;
  submitButton.disabled=true;submitButton.textContent="Memeriksa...";
  try {
    const result=await requestPhoneAnalysis(parsed.raw);
    const number=result.mode==="api" ? result.data.e164 : parsed.raw;
    const history=getHistory();
    const item={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),number,createdAt:new Date().toISOString(),status:"Persiapan metadata",type:"Phone Intelligence"};
    history.unshift(item);saveHistory(history);renderDashboard();
    const target=previewId || "searchPreview";
    if(!previewId){navigate("search");$("fullPhoneInput").value=raw;}
    renderPhoneResult(target,result);
    if(!previewId) $("phoneInput").value="";
  } catch(error) {
    $(errorId).textContent=error.message || "Tidak dapat menghubungi backend.";
  } finally {
    submitButton.disabled=false;submitButton.textContent=oldLabel;
  }
}
function renderPhoneResult(targetId,result){
  const target=$(targetId);
  target.classList.remove("hidden");
  if(result.mode==="local"){
    target.innerHTML=`<h3>Pemeriksaan awal selesai</h3><p class="muted">${escapeHtml(result.message)}</p><p class="muted">Konfigurasikan API_BASE_URL pada <code>js/config.js</code> dan jalankan backend untuk metadata numbering plan yang otoritatif.</p>`;
    return;
  }
  const d=result.data;
  const rows=[
    ["Format internasional",d.internationalFormat],
    ["Format nasional",d.nationalFormat],
    ["Negara / wilayah",d.country || "Tidak teridentifikasi"],
    ["Kode panggilan",`+${d.countryCallingCode}`],
    ["Jenis nomor",d.numberType],
    ["Kemungkinan format",d.possible?"Mungkin":"Tidak sesuai"],
    ["Valid menurut metadata",d.valid?"Ya":"Tidak"]
  ];
  target.innerHTML=`<h3>Phone Intelligence · Metadata penomoran</h3><div class="metadata-grid">${rows.map(([k,v])=>`<div class="metadata-item"><small>${escapeHtml(k)}</small><strong>${escapeHtml(String(v))}</strong></div>`).join("")}</div><p class="metadata-note">${escapeHtml(d.metadataNote)}</p><span class="validation-tag">${escapeHtml(d.validation)}</span>`;
}

function renderDashboard(){
  const items=getHistory();
  $("statAnalyses").textContent=String(items.length).padStart(2,"0");
  $("statFindings").textContent="00";
  const recent=$("recentActivity"), reports=$("reportList");
  if(!items.length){
    recent.className="empty-state";recent.innerHTML='<div class="empty-icon">⌁</div><strong>Belum ada aktivitas</strong><p>Analisis yang Anda mulai akan muncul di sini.</p>';
    reports.className="empty-state";reports.innerHTML='<div class="empty-icon">▤</div><strong>Belum ada laporan</strong><p>Mulai analisis untuk membuat catatan awal.</p>';
    return;
  }
  recent.className="activity-list";recent.innerHTML=items.slice(0,4).map(item=>`<div class="quick-link"><span>⌕</span><div><strong>${escapeHtml(item.number)}</strong><small>${new Date(item.createdAt).toLocaleString("id-ID")} · ${item.status}</small></div><b>→</b></div>`).join("");
  reports.className="activity-list";reports.innerHTML=items.map(item=>`<div class="quick-link"><span>▤</span><div><strong>${escapeHtml(item.number)}</strong><small>${new Date(item.createdAt).toLocaleString("id-ID")} · ${item.type}</small></div><b>${item.status}</b></div>`).join("");
}
function escapeHtml(str){return String(str).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
$("clearHistory").addEventListener("click",()=>{if(confirm("Hapus seluruh riwayat lokal PHONE INTEL pada browser ini?")){localStorage.removeItem("phoneIntelHistory");renderDashboard();}});
if("serviceWorker" in navigator && location.protocol!=="file:"){window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(err=>console.warn("Service worker:",err)));}
renderDashboard();
