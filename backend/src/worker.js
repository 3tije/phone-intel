import { parsePhoneNumberFromString } from "libphonenumber-js/max";
const ORIGIN = "https://3tije.github.io";
const MAX = 10;
const VERSION = "1.6.0";
const SESSION_DAYS = 7;
const cors=()=>({"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Methods":"GET, POST, DELETE, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization","Access-Control-Max-Age":"86400","Vary":"Origin"});
const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...cors()}});
async function read(r){try{return await r.json()}catch{return null}}
function token(){let b=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...b)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/ ,"")}
async function hash(t){let h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(t));return Array.from(new Uint8Array(h)).map(x=>x.toString(16).padStart(2,"0")).join("")}
async function authenticate(r,e){let m=(r.headers.get("Authorization")||"").match(/^Bearer\s+(.+)$/i);if(!m||!e.DB)return null;return e.DB.prepare("SELECT id, expires_at FROM owner_sessions WHERE token_hash=? AND expires_at>? LIMIT 1").bind(await hash(m[1]),new Date().toISOString()).first()}
async function login(r,e){if(!e.DB||!e.OWNER_PASSWORD)return json({ok:false,error:"Konfigurasi login belum lengkap. Pastikan D1 binding DB dan secret OWNER_PASSWORD tersedia."},503);let b=await read(r);if(!b||typeof b.password!=="string")return json({ok:false,error:"Password wajib diisi."},400);if(b.password!==e.OWNER_PASSWORD)return json({ok:false,error:"Password tidak sesuai."},401);let t=token(),now=new Date(),expires=new Date(now.getTime()+SESSION_DAYS*86400000);await e.DB.prepare("DELETE FROM owner_sessions WHERE expires_at<=?").bind(now.toISOString()).run();await e.DB.prepare("INSERT INTO owner_sessions(id,token_hash,created_at,expires_at) VALUES(?,?,?,?)").bind(crypto.randomUUID(),await hash(t),now.toISOString(),expires.toISOString()).run();return json({ok:true,token:t,expiresAt:expires.toISOString()})}
async function logout(r,e){let m=(r.headers.get("Authorization")||"").match(/^Bearer\s+(.+)$/i);if(m&&e.DB)await e.DB.prepare("DELETE FROM owner_sessions WHERE token_hash=?").bind(await hash(m[1])).run();return json({ok:true,message:"Sesi telah diakhiri."})}
function analyze(input){let raw=String(input??"").trim();if(!raw)return{ok:false,error:"Nomor telepon wajib diisi."};let p=parsePhoneNumberFromString(raw,"ID");if(!p)return{ok:false,error:"Format nomor belum dapat dikenali."};let possible=p.isPossible(),valid=p.isValid();return{ok:true,input:raw,e164:p.number,country:p.country??null,countryCallingCode:p.countryCallingCode,nationalNumber:p.nationalNumber,internationalFormat:p.formatInternational(),nationalFormat:p.formatNational(),numberType:p.getType()??"UNKNOWN",possible,valid,validation:valid?"VALID_NUMBERING_PLAN":possible?"POSSIBLE_BUT_NOT_CONFIRMED":"INVALID_OR_UNLIKELY",metadataNote:"Validasi metadata tidak membuktikan nomor aktif, pemilik, operator, atau lokasi pengguna."}}
async function saveAnalysis(e,p){let id=crypto.randomUUID(),createdAt=new Date().toISOString();await e.DB.prepare("INSERT INTO phone_analyses(id,phone_e164,country,validation,created_at) VALUES(?,?,?,?,?)").bind(id,p.e164,p.country||null,p.validation,createdAt).run();return{id,createdAt}}
function makeQueries(p,purpose){
 const digits=String(p.e164||"").replace(/\D/g,"");
 const national=String(p.nationalFormat||"").trim();
 const intl=String(p.internationalFormat||"").trim();
 const terms=purpose==="business-contact"
  ? '(WhatsApp OR "contact" OR "customer service" OR "kontak" OR "layanan pelanggan")'
  : '(spam OR scam OR fraud OR penipuan OR "nomor spam" OR "nomor penipuan")';
 // Avoid quoting every complete number: search engines can miss pages that format it differently.
 const candidates=[
  `${digits} Indonesia ${terms}`,
  `${intl} ${terms}`,
  `${national} ${terms}`
 ];
 return [...new Set(candidates.map(x=>x.trim()).filter(x=>x.length>0))].slice(0,3);
}
function normalizeFoundNumber(v){
 let d=String(v||"").replace(/\D/g,"");
 if(d.startsWith("00"))d=d.slice(2);
 if(d.startsWith("0"))d="62"+d.slice(1);
 else if(d.startsWith("8"))d="62"+d;
 return d;
}
function containsTargetNumber(text,p){
 const target=normalizeFoundNumber(p.e164);
 if(!target)return false;
 // Extract number-like runs, then compare normalized digits to the E.164 target.
 const chunks=String(text||"").match(/\+?\d[\d\s()./-]{6,}\d/g)||[];
 return chunks.some(c=>{
  const found=normalizeFoundNumber(c);
  return found===target;
 });
}
function relevance(row,p){
 const title=String(row.title||"");
 const content=String(row.content||"");
 const raw=String(row.raw_content||"").slice(0,30000);
 const url=String(row.url||"");
 return containsTargetNumber(`${title}\n${content}\n${raw}\n${url}`,p)?100:0;
}
async function publicSearch(p,purpose,e){
 const queries=makeQueries(p,purpose);
 if(!queries.length)return{ok:false,status:"invalid_purpose",error:"Tujuan pencarian tidak didukung."};
 if(!e.TAVILY_API_KEY)return{ok:false,status:"connector_not_configured",error:"Tavily API Key belum dikonfigurasi."};
 const payloads=await Promise.all(queries.map(async query=>{
  const r=await fetch("https://api.tavily.com/search",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${e.TAVILY_API_KEY}`},body:JSON.stringify({query,search_depth:"advanced",topic:"general",max_results:MAX,include_answer:false,include_raw_content:"markdown",country:"indonesia"})});
  if(!r.ok)throw new Error(`Tavily mengembalikan status ${r.status}.`);
  return{query,data:await r.json()};
 }));
 const seen=new Set(),matches=[];
 for(const pack of payloads){
  for(const row of (Array.isArray(pack.data.results)?pack.data.results:[])){
   const url=String(row.url||"");
   if(!/^https?:\/\//i.test(url)||seen.has(url))continue;
   seen.add(url);
   const score=relevance(row,p);
   if(score<100)continue;
   let sourceDomain="";
   try{sourceDomain=new URL(url).hostname.toLowerCase()}catch{}
   matches.push({title:String(row.title||"Tanpa judul").slice(0,300),url,snippet:String(row.raw_content||row.content||"").slice(0,900),sourceDomain,verificationStatus:"unverified",observedAt:new Date().toISOString(),relevanceScore:score,matchedNumber:true});
  }
 }
 matches.sort((a,b)=>b.relevanceScore-a.relevanceScore);
 const findings=matches.slice(0,MAX);
 return{ok:true,status:findings.length?"exact_match_review_required":"no_exact_match",provider:"Tavily",purpose,queries,resultCount:findings.length,findings,summary:findings.length?`${findings.length} halaman memuat nomor target secara eksplisit. Tetap periksa konteks halaman dan sumber aslinya.`:"Belum ditemukan halaman yang memuat nomor target secara eksplisit pada cuplikan maupun konten yang dikembalikan Tavily. Hasil umum tidak ditampilkan sebagai kecocokan.",note:"Kecocokan teks hanya menunjukkan bahwa nomor muncul pada halaman publik. Ini bukan bukti kepemilikan, identitas, penggunaan aktif, atau hubungan seseorang dengan nomor tersebut."}
}
async function saveFindings(e,id,items){if(!items.length)return;await e.DB.batch(items.map(x=>e.DB.prepare("INSERT INTO public_findings(id,analysis_id,title,url,source_domain,snippet,verification_status,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),id,x.title,x.url,x.sourceDomain,x.snippet,x.verificationStatus,x.observedAt)))}
async function getHistory(e){let a=await e.DB.prepare("SELECT id,phone_e164,country,validation,created_at FROM phone_analyses ORDER BY created_at DESC LIMIT 100").all(),rows=a.results||[];if(!rows.length)return json({ok:true,analyses:[],findings:[]});let ids=rows.map(x=>x.id),marks=ids.map(()=>"?").join(","),f=await e.DB.prepare(`SELECT id,analysis_id,title,url,source_domain,snippet,verification_status,created_at FROM public_findings WHERE analysis_id IN (${marks}) ORDER BY created_at DESC`).bind(...ids).all();return json({ok:true,analyses:rows,findings:f.results||[]})}
async function deleteHistory(e){await e.DB.batch([e.DB.prepare("DELETE FROM public_findings"),e.DB.prepare("DELETE FROM intelligence_reports"),e.DB.prepare("DELETE FROM phone_analyses")]);return json({ok:true,message:"Riwayat analisis, temuan, dan laporan telah dihapus."})}

async function getMapping(e){
 const q=await e.DB.prepare(`SELECT a.id AS analysis_id,a.phone_e164,a.created_at AS analysis_created,f.id AS finding_id,f.title,f.url,f.source_domain,f.snippet,f.verification_status,f.created_at AS finding_created FROM phone_analyses a LEFT JOIN public_findings f ON f.analysis_id=a.id ORDER BY a.created_at DESC,f.created_at DESC LIMIT 500`).all();
 const rows=q.results||[], analyses=new Map(), domains=new Map(), findings=[];
 for(const r of rows){if(!analyses.has(r.analysis_id))analyses.set(r.analysis_id,{id:r.analysis_id,phone:r.phone_e164,createdAt:r.analysis_created,findings:[]});if(!r.finding_id)continue;
  const f={id:r.finding_id,analysisId:r.analysis_id,title:r.title,url:r.url,domain:r.source_domain||'domain tidak diketahui',snippet:r.snippet||'',verificationStatus:r.verification_status||'unknown',createdAt:r.finding_created};
  analyses.get(r.analysis_id).findings.push(f);findings.push(f);if(!domains.has(f.domain))domains.set(f.domain,[]);domains.get(f.domain).push(f);
 }
 const nodes=[],edges=[];for(const a of analyses.values()){nodes.push({id:'phone:'+a.id,type:'phone',label:a.phone,analysisId:a.id});for(const f of a.findings){nodes.push({id:'finding:'+f.id,type:'finding',label:f.title,domain:f.domain,verificationStatus:f.verificationStatus,url:f.url});edges.push({from:'phone:'+a.id,to:'finding:'+f.id,label:'temuan pada analisis yang sama'});}}
 return json({ok:true,analyses:[...analyses.values()],findings,nodes,edges,summary:{analyses:analyses.size,findings:findings.length,domains:domains.size}})
}
function reputationClass(f){const t=((f.title||'')+' '+(f.snippet||'')).toLowerCase();if(/penipuan|scam|fraud|phishing|tipu|rekening palsu|modus/.test(t))return'indikasi_laporan_penipuan';if(/spam|telemarketing|robocall|panggilan mengganggu/.test(t))return'indikasi_spam';if(/whatsapp|customer service|layanan pelanggan|kontak resmi|contact us/.test(t))return'referensi_kontak';return'temuan_umum'}
async function getReputation(e){
 const q=await e.DB.prepare(`SELECT a.id AS analysis_id,a.phone_e164,a.created_at AS analysis_created,f.id AS finding_id,f.title,f.url,f.source_domain,f.snippet,f.verification_status,f.created_at AS finding_created FROM phone_analyses a JOIN public_findings f ON f.analysis_id=a.id ORDER BY f.created_at DESC LIMIT 500`).all();
 const map=new Map();for(const r of(q.results||[])){let x=map.get(r.phone_e164);if(!x){x={phone:r.phone_e164,firstSeen:r.analysis_created,findings:[],domains:new Set(),categories:{indikasi_laporan_penipuan:0,indikasi_spam:0,referensi_kontak:0,temuan_umum:0}};map.set(r.phone_e164,x)}const category=reputationClass(r);x.categories[category]++;if(r.source_domain)x.domains.add(r.source_domain);x.findings.push({id:r.finding_id,title:r.title,url:r.url,domain:r.source_domain,snippet:r.snippet,verificationStatus:r.verification_status||'unknown',category,createdAt:r.finding_created})}
 const results=[...map.values()].map(x=>({phone:x.phone,firstSeen:x.firstSeen,totalFindings:x.findings.length,uniqueSources:x.domains.size,categories:x.categories,findings:x.findings,assessment:'REVIEW_REQUIRED',assessmentNote:'Klasifikasi otomatis berdasarkan kata pada cuplikan publik. Bukan penetapan reputasi, identitas, atau kesalahan pemilik nomor.'}));
 return json({ok:true,results,summary:{numbers:results.length,findings:results.reduce((n,x)=>n+x.totalFindings,0)}})
}
async function verifyFinding(e,b){const id=String(b?.findingId||'');const status=String(b?.status||'');if(!id||!['verified','corroborated','indicative','unverified'].includes(status))return json({ok:false,error:'ID temuan atau status verifikasi tidak valid.'},400);const r=await e.DB.prepare('UPDATE public_findings SET verification_status=? WHERE id=?').bind(status,id).run();if(!r.meta?.changes)return json({ok:false,error:'Temuan tidak ditemukan.'},404);return json({ok:true,findingId:id,verificationStatus:status})}

export default{async fetch(r,e){let u=new URL(r.url),path=u.pathname,m=r.method;if(m==="OPTIONS")return new Response(null,{status:204,headers:cors()});if(m==="GET"&&path==="/api/health")return json({ok:true,status:"ok",service:"PHONE INTEL API",version:VERSION,runtime:"cloudflare-workers",database:Boolean(e.DB),capabilities:["owner-authentication","phone-metadata","public-source-discovery","d1-persistence","history","history-delete","intelligence-mapping","reputation-analysis","finding-verification"]});if(m==="POST"&&path==="/api/auth/login")return login(r,e);if(m==="POST"&&path==="/api/auth/logout")return logout(r,e);if(!e.DB)return json({ok:false,error:"D1 binding DB belum tersedia."},503);if(!await authenticate(r,e))return json({ok:false,error:"Sesi tidak valid atau sudah berakhir. Silakan login."},401);
if(m==="POST"&&path==="/api/phone/analyze"){let b=await read(r);if(!b)return json({ok:false,error:"Request JSON tidak valid."},400);let p=analyze(b.phone);if(!p.ok)return json(p,400);let saved=await saveAnalysis(e,p);return json({...p,analysisId:saved.id,createdAt:saved.createdAt})}
if(m==="POST"&&path==="/api/public/search"){let b=await read(r);if(!b)return json({ok:false,error:"Request JSON tidak valid."},400);let p=analyze(b.phone);if(!p.ok||!p.valid)return json({ok:false,error:p.error||"Nomor tidak memenuhi validasi."},400);let purpose=String(b.purpose||"");if(!["business-contact","spam-report"].includes(purpose))return json({ok:false,error:"Tujuan pencarian tidak didukung."},400);let id=String(b.analysisId||"");if(id){let exists=await e.DB.prepare("SELECT id FROM phone_analyses WHERE id=? AND phone_e164=? LIMIT 1").bind(id,p.e164).first();if(!exists)return json({ok:false,error:"Data analisis tidak ditemukan."},404)}else id=(await saveAnalysis(e,p)).id;try{let result=await publicSearch(p,purpose,e);if(!result.ok)return json({...result,analysisId:id},result.status==="connector_not_configured"?503:502);await saveFindings(e,id,result.findings);return json({...result,analysisId:id,phone:{e164:p.e164,country:p.country,validation:p.validation}})}catch(err){console.error("PHONE INTEL SEARCH ERROR",err?.message);return json({ok:false,status:"provider_unavailable",analysisId:id,error:"Pencarian tidak dapat diselesaikan. Coba kembali nanti."},502)}}
if(m==="GET"&&path==="/api/intelligence/mapping")return getMapping(e);if(m==="GET"&&path==="/api/intelligence/reputation")return getReputation(e);if(m==="POST"&&path==="/api/findings/verification"){let b=await read(r);return verifyFinding(e,b)}if(m==="GET"&&path==="/api/history")return getHistory(e);if(m==="DELETE"&&path==="/api/history")return deleteHistory(e);return json({ok:false,error:"Endpoint tidak ditemukan."},404)}};
