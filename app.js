const KEY="bcc_attendance_final_v2";
const AUTH_KEY="bcc_admin_account_v1";

const emptyDB={
  sections:[],
  students:[],
  attendance:{},
  grades:{},
  settings:{schoolName:"BCC Student",adminName:"Administrator"}
};
const GRADE_COMPONENTS=[
  {key:"activity",label:"Activity"},
  {key:"quiz",label:"Quiz"},
  {key:"assignment",label:"Assignment"},
  {key:"performance",label:"Performance Task"},
  {key:"midterm",label:"Midterm Exam"},
  {key:"final",label:"Final Exam"}
];
let db=loadDB();
let account=loadAccount();
let importRows=[];
let importFileName="";

function clone(o){return JSON.parse(JSON.stringify(o))}
function loadDB(){
  try{
    const d=JSON.parse(localStorage.getItem(KEY))||clone(emptyDB);
    d.grades=d.grades||{};
    d.students=(d.students||[]).map(s=>({status:"Active",...s}));
    return d;
  }catch(e){return clone(emptyDB)}
}
function saveDB(){localStorage.setItem(KEY,JSON.stringify(db))}
function loadAccount(){try{return JSON.parse(localStorage.getItem(AUTH_KEY))||null}catch(e){return null}}
function saveAccount(a){localStorage.setItem(AUTH_KEY,JSON.stringify(a));account=a}
function todayISO(){const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function escAttr(s){return String(s??"").replace(/\\/g,"\\\\").replace(/'/g,"\\'")}
function toast(msg){const t=document.getElementById("toast");t.textContent=msg;t.classList.remove("hidden");clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.add("hidden"),2200)}
function isLoggedIn(){return sessionStorage.getItem("bcc_session")==="1"}

function boot(){
  if(!account){document.getElementById("setupScreen").classList.remove("hidden");return}
  if(isLoggedIn()){openApp();return}
  document.getElementById("loginScreen").classList.remove("hidden");
}
function openApp(){
  document.getElementById("setupScreen").classList.add("hidden");
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  init();
}
document.getElementById("setupForm").onsubmit=e=>{
  e.preventDefault();
  const name=document.getElementById("setupName").value.trim(), username=document.getElementById("setupUsername").value.trim(), password=document.getElementById("setupPassword").value, confirm=document.getElementById("setupConfirm").value;
  if(password.length<6)return alert("Password must contain at least 6 characters.");
  if(password!==confirm)return alert("Passwords do not match.");
  saveAccount({name,username,password});
  db.settings.adminName=name;saveDB();
  sessionStorage.setItem("bcc_session","1");openApp();
};
document.getElementById("loginForm").onsubmit=e=>{
  e.preventDefault();
  const u=document.getElementById("username").value.trim(),p=document.getElementById("password").value;
  if(account&&u===account.username&&p===account.password){sessionStorage.setItem("bcc_session","1");openApp()}
  else alert("Incorrect username or password.");
};
document.getElementById("logoutBtn").onclick=()=>{sessionStorage.removeItem("bcc_session");location.reload()};

function init(){
  document.getElementById("attendanceDate").value=todayISO();
  document.getElementById("reportFrom").value=todayISO();
  document.getElementById("reportTo").value=todayISO();
  document.getElementById("today").textContent=new Date().toLocaleDateString(undefined,{weekday:"long",year:"numeric",month:"short",day:"numeric"});
  document.getElementById("adminDisplay").textContent=db.settings.adminName||account?.name||"Administrator";
  document.getElementById("adminAvatar").textContent=(db.settings.adminName||account?.name||"A").charAt(0).toUpperCase();
  renderAll();
  initImportFeature();
  initGradeImportFeature();
}
document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>showPage(b.dataset.page));
function showPage(page){
  document.querySelectorAll(".page").forEach(x=>x.classList.add("hidden"));
  document.getElementById(page).classList.remove("hidden");
  document.querySelectorAll(".nav").forEach(x=>x.classList.toggle("active",x.dataset.page===page));
  if(page==="attendance")renderAttendance();
  if(page==="students")renderStudents();
  if(page==="grades")renderGrades();
  if(page==="sections")renderSections();
  if(page==="reports")renderReports();
  window.scrollTo({top:0,behavior:"smooth"});
}
function sectionOptions(select,includeAll=true){
  const old=select.value;
  let html=includeAll?'<option value="">All Sections</option>':"";
  html+=db.sections.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(s=>`<option value="${esc(s.name)}">${esc(s.name)}</option>`).join("");
  select.innerHTML=html;if([...select.options].some(o=>o.value===old))select.value=old;
}
function populateSections(){
  sectionOptions(document.getElementById("attendanceSection"));
  sectionOptions(document.getElementById("studentSectionFilter"));
  sectionOptions(document.getElementById("reportSection"));
  sectionOptions(document.getElementById("gradeSection"));
  const s=document.getElementById("sSection"),old=s.value;
  s.innerHTML=db.sections.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(x=>`<option value="${esc(x.name)}">${esc(x.name)}</option>`).join("");
  if([...s.options].some(o=>o.value===old))s.value=old;
}
function renderAll(){populateSections();renderDashboard();renderAttendance();renderStudents();renderSections();renderReports();renderGrades();document.getElementById("schoolName").value=db.settings.schoolName||"BCC Student";document.getElementById("adminNameSetting").value=db.settings.adminName||account?.name||"Administrator"}
function getFilteredStudents(section="",search="",status=""){
  const q=search.toLowerCase();
  return db.students.filter(s=>{
    const st=s.status||"Active";
    return (!section||s.section===section)&&(!status||st===status)&&(!q||`${s.id} ${s.name} ${s.contact||""}`.toLowerCase().includes(q));
  }).sort((a,b)=>a.section.localeCompare(b.section)||a.name.localeCompare(b.name))
}

/* Generic column sorting -------------------------------------------------- */
const sortState={students:{key:null,dir:1},grades:{key:null,dir:1},attendance:{key:null,dir:1},reports:{key:null,dir:1}};
function sortTable(table,key,renderFn){
  const st=sortState[table];
  if(st.key===key)st.dir*=-1;else{st.key=key;st.dir=1}
  renderFn();
}
function applySort(rows,state,getter){
  if(!state.key||state.key==="num")return rows;
  return rows.map((r,i)=>[r,i]).sort((A,B)=>{
    let av=getter(A[0],state.key),bv=getter(B[0],state.key);
    if(typeof av==="string")av=av.toLowerCase();
    if(typeof bv==="string")bv=bv.toLowerCase();
    if(av<bv)return -1*state.dir;
    if(av>bv)return 1*state.dir;
    return A[1]-B[1];
  }).map(p=>p[0]);
}
function updateSortIndicators(tableElId,state){
  const table=document.getElementById(tableElId);if(!table)return;
  table.querySelectorAll("thead th[data-sort]").forEach(th=>{
    th.classList.remove("sort-asc","sort-desc");
    if(th.dataset.sort===state.key)th.classList.add(state.dir===1?"sort-asc":"sort-desc");
  });
}
document.querySelectorAll("#attendanceTableEl thead th[data-sort]").forEach(th=>th.onclick=()=>sortTable("attendance",th.dataset.sort,renderAttendance));
document.querySelectorAll("#gradesTableEl thead th[data-sort]").forEach(th=>th.onclick=()=>sortTable("grades",th.dataset.sort,renderGrades));
document.querySelectorAll("#studentsTableEl thead th[data-sort]").forEach(th=>th.onclick=()=>sortTable("students",th.dataset.sort,renderStudents));
document.querySelectorAll("#reportsTableEl thead th[data-sort]").forEach(th=>th.onclick=()=>sortTable("reports",th.dataset.sort,renderReports));

function renderDashboard(){
  const date=todayISO(),rec=db.attendance[date]||{};
  const activeStudents=db.students.filter(s=>(s.status||"Active")==="Active");
  const total=activeStudents.length;
  const p=activeStudents.filter(s=>rec[s.id]==="Present").length,a=activeStudents.filter(s=>rec[s.id]==="Absent").length,u=Math.max(0,total-p-a);
  document.getElementById("statStudents").textContent=total;document.getElementById("statPresent").textContent=p;document.getElementById("statAbsent").textContent=a;document.getElementById("statSections").textContent=db.sections.length;
  document.getElementById("presentRate").textContent=total?`${Math.round(p/total*100)}% of registered`:"0% of registered";
  document.getElementById("absentRate").textContent=total?`${Math.round(a/total*100)}% of registered`:"0% of registered";
  const pct=total?Math.round(p/total*100):0;
  document.getElementById("dashboardAttendance").innerHTML=`
    <div class="mini-summary"><div class="summary-pill"><strong>${p}</strong> Present</div><div class="summary-pill"><strong>${a}</strong> Absent</div><div class="summary-pill"><strong>${u}</strong> Unmarked</div></div>
    <div class="progress"><i style="width:${pct}%"></i></div>
    <div style="font-size:10px;color:#7b8d85">${pct}% of registered students are marked present today.</div>`;
  const sections=db.sections.map(s=>({name:s.name,count:activeStudents.filter(x=>x.section===s.name).length})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
  document.getElementById("sectionSummary").innerHTML=sections.map((s,i)=>`<div class="section-row"><div class="section-row-head"><b>${esc(s.name)}</b><span class="section-count">${s.count} student${s.count===1?"":"s"}</span></div><div class="progress" style="margin:8px 0 0"><i style="width:${total?Math.round(s.count/total*100):0}%"></i></div></div>`).join("")||'<div class="empty">No sections registered yet.</div>';
}
function statusPill(st){return `<span class="status ${st.toLowerCase()}">${st}</span>`}
function renderAttendance(){
  const date=document.getElementById("attendanceDate").value||todayISO(),sec=document.getElementById("attendanceSection").value,search=document.getElementById("attendanceSearch").value,rec=db.attendance[date]||{};
  let rows=getFilteredStudents(sec,search,"Active");
  rows=applySort(rows,sortState.attendance,(s,key)=>key==="status"?(rec[s.id]||"Unmarked"):s[key]);
  document.getElementById("attendanceTable").innerHTML=rows.map((s,i)=>{const st=rec[s.id]||"Unmarked";return `<tr><td data-label="#">${i+1}</td><td data-label="Student ID">${esc(s.id)}</td><td data-label="Student"><b>${esc(s.name)}</b></td><td data-label="Section">${esc(s.section)}</td><td data-label="Status">${statusPill(st)}</td><td class="actions" data-label="Action"><button class="primary" onclick="setAttendance('${escAttr(s.id)}','Present')">Present</button><button class="danger" onclick="setAttendance('${escAttr(s.id)}','Absent')">Absent</button></td></tr>`}).join("")||'<tr><td colspan="6" class="empty">No active students match the selected filters.</td></tr>';
  updateSortIndicators("attendanceTableEl",sortState.attendance);
}
document.getElementById("attendanceDate").onchange=renderAttendance;
document.getElementById("attendanceSection").onchange=renderAttendance;
document.getElementById("attendanceSearch").oninput=renderAttendance;
function setAttendance(id,status){
  const d=document.getElementById("attendanceDate").value||todayISO();db.attendance[d]??={};db.attendance[d][id]=status;saveDB();renderAttendance();renderDashboard();toast(`Attendance updated: ${status}`);
}
function markAll(status){
  const d=document.getElementById("attendanceDate").value||todayISO();db.attendance[d]??={};getFilteredStudents(document.getElementById("attendanceSection").value,document.getElementById("attendanceSearch").value,"Active").forEach(s=>db.attendance[d][s.id]=status);saveDB();renderAttendance();renderDashboard();toast(`${status} applied to filtered students`);
}

/* Grades ------------------------------------------------------------------ */
function getScore(id,key){const v=(db.grades[id]||{})[key];return typeof v==="number"?v:0}
function computeTotal(id){return GRADE_COMPONENTS.reduce((sum,c)=>sum+getScore(id,c.key),0)+getScore(id,"bonus")}
function computeAverage(id){return computeTotal(id)/GRADE_COMPONENTS.length}
function getStanding(id){
  const override=(db.grades[id]||{}).override;
  if(override)return override;
  return computeAverage(id)>=75?"Passing":"At Risk";
}
function setScore(id,key,raw){
  let v=parseFloat(raw);if(isNaN(v))v=0;
  const max=key==="bonus"?50:100;
  v=Math.max(0,Math.min(max,v));
  db.grades[id]??={};db.grades[id][key]=v;saveDB();renderGrades();toast("Grade saved");
}
function setStandingOverride(id,value){
  db.grades[id]??={};db.grades[id].override=value||"";saveDB();renderGrades();
  toast(value?`Marked as ${value}`:"Standing set back to automatic");
}
function gradeSortValue(s,key){
  switch(key){
    case "id":return s.id;
    case "name":return s.name;
    case "section":return s.section;
    case "total":return computeTotal(s.id);
    case "average":return computeAverage(s.id);
    case "standing":return getStanding(s.id);
    default:return getScore(s.id,key);
  }
}
function renderGrades(){
  const secEl=document.getElementById("gradeSection"),searchEl=document.getElementById("gradeSearch");
  if(!secEl||!searchEl)return;
  let rows=getFilteredStudents(secEl.value,searchEl.value,"Active");
  rows=applySort(rows,sortState.grades,gradeSortValue);
  document.getElementById("gradesTable").innerHTML=rows.map(s=>{
    const total=computeTotal(s.id),avg=computeAverage(s.id),standing=getStanding(s.id),override=(db.grades[s.id]||{}).override||"";
    const cells=GRADE_COMPONENTS.map(c=>`<td><input class="grade-input" type="number" min="0" max="100" step="0.01" value="${getScore(s.id,c.key)}" onchange="setScore('${escAttr(s.id)}','${c.key}',this.value)"></td>`).join("");
    const bonusCell=`<td><input class="grade-input" type="number" min="0" max="50" step="0.01" value="${getScore(s.id,"bonus")}" onchange="setScore('${escAttr(s.id)}','bonus',this.value)"></td>`;
    const decisionCell=`<td class="actions">
      <button class="secondary" onclick="openScoreModal('${escAttr(s.id)}')">✎ Scores</button>
      <select class="grade-select" onchange="setStandingOverride('${escAttr(s.id)}',this.value)">
        <option value="" ${!override?"selected":""}>Auto</option>
        <option value="Passing" ${override==="Passing"?"selected":""}>Pass</option>
        <option value="At Risk" ${override==="At Risk"?"selected":""}>Fail</option>
      </select>
      <button class="danger" onclick="toggleDropStudent('${escAttr(s.id)}')">Drop Out</button>
    </td>`;
    return `<tr><td>${esc(s.id)}</td><td><b>${esc(s.name)}</b></td><td>${esc(s.section)}</td>${cells}${bonusCell}<td><b>${total.toFixed(2)}</b></td><td><b>${avg.toFixed(2)}</b></td><td><span class="status ${standing==="Passing"?"present":"absent"}">${standing}</span></td>${decisionCell}</tr>`;
  }).join("")||'<tr><td colspan="14" class="empty">No active students match the selected filters.</td></tr>';
  updateSortIndicators("gradesTableEl",sortState.grades);
}
document.getElementById("gradeSection").onchange=renderGrades;
document.getElementById("gradeSearch").oninput=renderGrades;
function exportGrades(){
  const rows=getFilteredStudents(document.getElementById("gradeSection").value,document.getElementById("gradeSearch").value,"Active").map(s=>{
    const o={"Student ID":s.id,"Student Name":s.name,Section:s.section};
    GRADE_COMPONENTS.forEach(c=>o[c.label]=getScore(s.id,c.key));
    o["Plus Points"]=getScore(s.id,"bonus");
    o["Total"]=computeTotal(s.id).toFixed(2);o["Average"]=computeAverage(s.id).toFixed(2);o["Standing"]=getStanding(s.id);
    return o;
  });
  downloadXlsx(rows,"BCC_Grades_Report","Grades");
}

/* Grade template download + bulk score import ------------------------------ */
function downloadGradeTemplate(){
  if(!xlsxReady())return;
  const sec=document.getElementById("gradeSection")?.value||"",search=document.getElementById("gradeSearch")?.value||"";
  const rows=getFilteredStudents(sec,search,"Active").map(s=>{
    const o={"Student ID":s.id,"Student Name":s.name,Section:s.section};
    GRADE_COMPONENTS.forEach(c=>o[c.label]=getScore(s.id,c.key));
    o["Plus Points"]=getScore(s.id,"bonus");
    return o;
  });
  if(!rows.length)return alert("No active students match the selected filters.");
  downloadXlsx(rows,sec?`BCC_Grade_Template_${sec.replace(/[^a-z0-9]+/gi,"_")}`:"BCC_Grade_Template","Grade Template");
  toast("Template downloaded — fill in scores, then use Import Scores");
}
let gradeImportRows=[];
function openGradeImportModal(){
  gradeImportRows=[];
  document.getElementById("gradeImportFile").value="";
  document.getElementById("gradeImportInfo").classList.add("hidden");
  document.getElementById("gradeImportPreview").classList.add("hidden");
  document.getElementById("gradeImportConfirmBtn").disabled=true;
  document.getElementById("gradeImportModal").classList.remove("hidden");
}
function initGradeImportFeature(){
  const input=document.getElementById("gradeImportFile"),drop=document.getElementById("gradeImportDrop");
  if(!input||!drop)return;
  input.onchange=e=>{if(e.target.files[0])handleGradeImportFile(e.target.files[0])};
  drop.onclick=()=>input.click();
  ["dragenter","dragover"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("dragging")}));
  ["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("dragging")}));
  drop.addEventListener("drop",e=>{const f=e.dataTransfer.files[0];if(f)handleGradeImportFile(f)});
}
async function handleGradeImportFile(file){
  const info=document.getElementById("gradeImportInfo");info.classList.remove("hidden");info.textContent=`Reading ${file.name}…`;
  try{
    const ext=file.name.toLowerCase().split(".").pop();
    if(!["xlsx","xls","csv"].includes(ext))throw new Error("Use an .xlsx, .xls, or .csv grade sheet.");
    const rows=await parseSpreadsheet(file);
    gradeImportRows=normalizeGradeRows(rows);
    renderGradeImportPreview();
    info.textContent=`${file.name} • ${gradeImportRows.length} matching student record${gradeImportRows.length===1?"":"s"} found`;
  }catch(err){gradeImportRows=[];document.getElementById("gradeImportConfirmBtn").disabled=true;info.textContent=`Could not read file: ${err.message||err}`;}
}
function normalizeGradeRows(rows){
  const idSet=new Set(db.students.map(s=>s.id));
  return rows.map(r=>{
    const id=firstValue(r,["Student ID","StudentID","ID"]);
    if(!id||!idSet.has(id))return null;
    const o={id};
    GRADE_COMPONENTS.forEach(c=>{const v=firstValue(r,[c.label,c.key]);if(v!=="")o[c.key]=Math.max(0,Math.min(100,parseFloat(v)||0))});
    const bonus=firstValue(r,["Plus Points","Bonus"]);if(bonus!=="")o.bonus=Math.max(0,Math.min(50,parseFloat(bonus)||0));
    return o;
  }).filter(Boolean);
}
function renderGradeImportPreview(){
  const box=document.getElementById("gradeImportPreview"),btn=document.getElementById("gradeImportConfirmBtn");box.classList.remove("hidden");
  if(!gradeImportRows.length){box.innerHTML='<div class="empty">No matching Student IDs were found. Use the downloaded template and keep the Student ID column unchanged.</div>';btn.disabled=true;return;}
  box.innerHTML=`<div class="import-preview-head"><b>Import preview</b><span>${gradeImportRows.length} student record${gradeImportRows.length===1?"":"s"} will be updated</span></div><div class="table-wrap"><table><thead><tr><th>#</th><th>Student ID</th><th>Name</th>${GRADE_COMPONENTS.map(c=>`<th>${esc(c.label)}</th>`).join("")}<th>Plus Points</th></tr></thead><tbody>${gradeImportRows.slice(0,12).map((r,i)=>{const s=db.students.find(x=>x.id===r.id);return `<tr><td>${i+1}</td><td>${esc(r.id)}</td><td><b>${esc(s?.name||"")}</b></td>${GRADE_COMPONENTS.map(c=>`<td>${r[c.key]!==undefined?r[c.key]:"—"}</td>`).join("")}<td>${r.bonus!==undefined?r.bonus:"—"}</td></tr>`}).join("")}</tbody></table></div>${gradeImportRows.length>12?`<small class="muted">Showing first 12 of ${gradeImportRows.length} records.</small>`:""}`;
  btn.disabled=false;
}
function commitGradeImport(){
  let updated=0;
  gradeImportRows.forEach(r=>{
    db.grades[r.id]??={};
    GRADE_COMPONENTS.forEach(c=>{if(r[c.key]!==undefined)db.grades[r.id][c.key]=r[c.key]});
    if(r.bonus!==undefined)db.grades[r.id].bonus=r.bonus;
    updated++;
  });
  saveDB();closeModal("gradeImportModal");renderGrades();toast(`Import complete: ${updated} student score record${updated===1?"":"s"} updated`);gradeImportRows=[];
}

/* Quick score-entry modal (mobile-friendly) --------------------------------- */
function openScoreModal(id){
  const s=db.students.find(x=>x.id===id);if(!s)return;
  document.getElementById("scoreModalId").value=id;
  document.getElementById("scoreModalName").textContent=s.name;
  document.getElementById("scoreModalMeta").textContent=`${s.id} • ${s.section}`;
  const wrap=document.getElementById("scoreModalFields");
  wrap.innerHTML=GRADE_COMPONENTS.map(c=>`<label>${esc(c.label)} <small>(0–100)</small><input type="number" min="0" max="100" step="0.01" inputmode="decimal" data-key="${c.key}" value="${getScore(id,c.key)}"></label>`).join("")
    +`<label>Plus Points <small>(0–50 bonus)</small><input type="number" min="0" max="50" step="0.01" inputmode="decimal" data-key="bonus" value="${getScore(id,"bonus")}"></label>`;
  updateScoreModalPreview();
  document.getElementById("scoreModal").classList.remove("hidden");
  wrap.querySelector("input")?.focus();
}
function updateScoreModalPreview(){
  const inputs=[...document.querySelectorAll("#scoreModalFields input")];
  let total=0;inputs.forEach(i=>total+=Math.max(0,parseFloat(i.value)||0));
  const avg=total/GRADE_COMPONENTS.length;
  document.getElementById("scoreModalTotal").textContent=total.toFixed(2);
  document.getElementById("scoreModalAverage").textContent=avg.toFixed(2);
  document.getElementById("scoreModalStanding").textContent=avg>=75?"Passing":"At Risk";
}
function saveScoreModal(){
  const id=document.getElementById("scoreModalId").value;if(!id)return;
  document.querySelectorAll("#scoreModalFields input").forEach(inp=>{
    let v=parseFloat(inp.value);if(isNaN(v))v=0;
    const max=inp.dataset.key==="bonus"?50:100;v=Math.max(0,Math.min(max,v));
    db.grades[id]??={};db.grades[id][inp.dataset.key]=v;
  });
  saveDB();closeModal("scoreModal");renderGrades();toast("Scores saved");
}
(function bindScoreModalEvents(){
  const fields=document.getElementById("scoreModalFields");if(!fields)return;
  fields.addEventListener("input",updateScoreModalPreview);
  fields.addEventListener("keydown",e=>{
    if(e.key==="Enter"){
      e.preventDefault();
      const inputs=[...fields.querySelectorAll("input")],idx=inputs.indexOf(e.target);
      if(idx>-1&&idx<inputs.length-1)inputs[idx+1].focus();else saveScoreModal();
    }
  });
})();

function studentSortValue(s,key){
  if(key==="status")return s.status||"Active";
  if(key==="droppedAt")return s.droppedAt||"";
  return s[key]||"";
}
function renderStudents(){
  let rows=getFilteredStudents(document.getElementById("studentSectionFilter").value,document.getElementById("studentSearch").value,document.getElementById("studentStatusFilter").value);
  rows=applySort(rows,sortState.students,studentSortValue);
  document.getElementById("studentsTable").innerHTML=rows.map((s,i)=>{
    const active=(s.status||"Active")==="Active";
    const dropBtn=active?`<button class="danger" onclick="toggleDropStudent('${escAttr(s.id)}')">Drop</button>`:`<button class="secondary" onclick="toggleDropStudent('${escAttr(s.id)}')">Reinstate</button>`;
    const droppedOn=s.droppedAt?new Date(s.droppedAt).toLocaleDateString():"—";
    return `<tr><td data-label="#">${i+1}</td><td data-label="Student ID">${esc(s.id)}</td><td data-label="Name"><b>${esc(s.name)}</b></td><td data-label="Gender">${esc(s.gender)}</td><td data-label="Section">${esc(s.section)}</td><td data-label="Year Level">${esc(s.year)}</td><td data-label="Contact">${esc(s.contact||"—")}</td><td data-label="Status"><span class="status ${active?"present":"dropped"}">${active?"Active":"Dropped"}</span></td><td data-label="Dropped On">${droppedOn}</td><td class="actions" data-label="Actions"><button class="secondary" onclick="editStudent('${escAttr(s.id)}')">Edit</button>${dropBtn}<button class="danger" onclick="deleteStudent('${escAttr(s.id)}')">Delete</button></td></tr>`;
  }).join("")||'<tr><td colspan="10" class="empty">No students match the selected filters.</td></tr>';
  updateSortIndicators("studentsTableEl",sortState.students);
}
document.getElementById("studentSectionFilter").onchange=renderStudents;
document.getElementById("studentSearch").oninput=renderStudents;
document.getElementById("studentStatusFilter").onchange=renderStudents;
function toggleDropStudent(id){
  const s=db.students.find(x=>x.id===id);if(!s)return;
  const active=(s.status||"Active")==="Active";
  if(active){
    if(!confirm(`Mark ${s.name} as dropped? They will be hidden from Attendance and Grades until reinstated.`))return;
    s.status="Dropped";s.droppedAt=new Date().toISOString();
  }else{
    if(!confirm(`Reinstate ${s.name} as an active student?`))return;
    s.status="Active";delete s.droppedAt;
  }
  saveDB();renderAll();toast(active?"Student marked as dropped":"Student reinstated");
}
function openStudentModal(id=""){
  const modal=document.getElementById("studentModal"),s=db.students.find(x=>x.id===id);
  document.getElementById("editStudentId").value=id;document.getElementById("studentModalTitle").textContent=id?"Edit Student":"Add Student";
  document.getElementById("sId").value=s?.id||"";document.getElementById("sName").value=s?.name||"";document.getElementById("sGender").value=s?.gender||"Male";document.getElementById("sSection").value=s?.section||db.sections[0]?.name||"";document.getElementById("sYear").value=s?.year||"1st Year";document.getElementById("sContact").value=s?.contact||"";
  modal.classList.remove("hidden");
}
function editStudent(id){openStudentModal(id)}
document.getElementById("studentForm").onsubmit=e=>{
  e.preventDefault();
  const old=document.getElementById("editStudentId").value,existing=old?db.students.find(s=>s.id===old):null;
  const obj={id:document.getElementById("sId").value.trim(),name:document.getElementById("sName").value.trim(),gender:document.getElementById("sGender").value,section:document.getElementById("sSection").value,year:document.getElementById("sYear").value,contact:document.getElementById("sContact").value.trim(),status:existing?.status||"Active"};
  if(!obj.id||!obj.name||!obj.section)return;
  if(db.students.some(s=>s.id===obj.id&&s.id!==old))return alert("Student ID already exists.");
  if(old){const i=db.students.findIndex(s=>s.id===old);db.students[i]=obj}else db.students.push(obj);
  closeModal("studentModal");saveDB();renderAll();toast(old?"Student record updated":"Student registered successfully");
};
function deleteStudent(id){
  const s=db.students.find(x=>x.id===id);if(!s)return;
  if(confirm(`Delete ${s.name}? Their attendance and grade history will also be removed.`)){db.students=db.students.filter(x=>x.id!==id);Object.values(db.attendance).forEach(r=>delete r[id]);delete db.grades[id];saveDB();renderAll();toast("Student record deleted")}
}

function renderSections(){
  const sections=db.sections.map(s=>({s,count:db.students.filter(x=>x.section===s.name).length})).sort((a,b)=>b.count-a.count||a.s.name.localeCompare(b.s.name));
  document.getElementById("sectionCards").innerHTML=sections.map((x,i)=>`<div class="section-card"><span class="rank">#${i+1}</span><h3>${esc(x.s.name)}</h3><p>${esc(x.s.program||"No program specified")}</p><div class="count">${x.count}</div><small>Registered student${x.count===1?"":"s"}</small><div class="card-actions"><button class="secondary" onclick="exportSectionData('${escAttr(x.s.name)}')">Export Data</button><button class="danger" onclick="deleteSection('${escAttr(x.s.id)}')">Delete Section</button></div></div>`).join("")||'<div class="empty">No sections registered yet.</div>';
}
function openSectionModal(){document.getElementById("sectionName").value="";document.getElementById("sectionProgram").value="";document.getElementById("sectionModal").classList.remove("hidden")}
document.getElementById("sectionForm").onsubmit=e=>{
  e.preventDefault();const name=document.getElementById("sectionName").value.trim(),program=document.getElementById("sectionProgram").value.trim();
  if(db.sections.some(s=>s.name.toLowerCase()===name.toLowerCase()))return alert("A section with this name already exists.");
  db.sections.push({id:"SEC-"+Date.now(),name,program});const returnToImport=document.getElementById("sectionForm").dataset.returnToImport==="1";delete document.getElementById("sectionForm").dataset.returnToImport;closeModal("sectionModal");saveDB();renderAll();toast("Section created successfully");if(returnToImport){openImportModal();document.getElementById("importSectionSelect").value=name;}
};
function deleteSection(id){
  const s=db.sections.find(x=>x.id===id);if(!s)return;const count=db.students.filter(x=>x.section===s.name).length;
  if(count)return alert(`Cannot delete ${s.name}. It currently has ${count} registered student(s). Move or reassign the students first.`);
  if(confirm(`Delete section ${s.name}?`)){db.sections=db.sections.filter(x=>x.id!==id);saveDB();renderAll();toast("Section deleted")}
}

function getReportRows(){
  const from=document.getElementById("reportFrom").value,to=document.getElementById("reportTo").value,sec=document.getElementById("reportSection").value,status=document.getElementById("reportStatus").value,rows=[];
  Object.entries(db.attendance).forEach(([date,rec])=>{
    if(from&&date<from||to&&date>to)return;
    db.students.forEach(s=>{const st=rec[s.id];if(st&&(!sec||s.section===sec)&&(!status||st===status))rows.push({date,...s,status:st})})
  });
  return rows.sort((a,b)=>b.date.localeCompare(a.date)||a.section.localeCompare(b.section)||a.name.localeCompare(b.name));
}
function renderReports(){
  let rows=getReportRows();
  const p=rows.filter(r=>r.status==="Present").length,a=rows.filter(r=>r.status==="Absent").length;
  document.getElementById("reportSummary").innerHTML=`<div class="report-box"><span>Total Records</span><b>${rows.length}</b></div><div class="report-box"><span>Present</span><b>${p}</b></div><div class="report-box"><span>Absent</span><b>${a}</b></div><div class="report-box"><span>Attendance Rate</span><b>${rows.length?Math.round(p/rows.length*100):0}%</b></div>`;
  rows=applySort(rows,sortState.reports,(r,key)=>r[key]);
  document.getElementById("reportsTable").innerHTML=rows.map(r=>`<tr><td data-label="Date">${r.date}</td><td data-label="Student ID">${esc(r.id)}</td><td data-label="Name">${esc(r.name)}</td><td data-label="Section">${esc(r.section)}</td><td data-label="Status">${statusPill(r.status)}</td></tr>`).join("")||'<tr><td colspan="5" class="empty">No attendance records match the selected filters.</td></tr>';
  updateSortIndicators("reportsTableEl",sortState.reports);
}
document.getElementById("reportFrom").onchange=renderReports;document.getElementById("reportTo").onchange=renderReports;document.getElementById("reportSection").onchange=renderReports;document.getElementById("reportStatus").onchange=renderReports;

function xlsxReady(){if(typeof XLSX==="undefined"){alert("Excel export requires an internet connection for the spreadsheet library. You can still use the system and make a JSON backup.");return false}return true}
function downloadXlsx(rows,name,sheet="Report"){
  if(!xlsxReady())return;
  if(!rows.length)return alert("There is no data to export.");
  const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,sheet);XLSX.writeFile(wb,`${name}_${todayISO()}.xlsx`);
}
function exportAttendanceFiltered(){
  const date=document.getElementById("attendanceDate").value||todayISO(),sec=document.getElementById("attendanceSection").value,search=document.getElementById("attendanceSearch").value,rec=db.attendance[date]||{};
  const rows=getFilteredStudents(sec,search).map(s=>({Date:date,"Student ID":s.id,"Student Name":s.name,Section:s.section,"Year Level":s.year,Contact:s.contact||"",Status:rec[s.id]||"Unmarked"}));
  downloadXlsx(rows,"BCC_Daily_Attendance","Attendance");
}
function exportFilteredReport(){downloadXlsx(getReportRows().map(r=>({Date:r.date,"Student ID":r.id,"Student Name":r.name,Section:r.section,"Year Level":r.year,Status:r.status})),"BCC_Attendance_Report","Attendance Report")}
function exportStudents(){
  const sec=document.getElementById("studentSectionFilter").value,search=document.getElementById("studentSearch").value,status=document.getElementById("studentStatusFilter").value;
  const rows=getFilteredStudents(sec,search,status).map(s=>({"Student ID":s.id,"Full Name":s.name,Gender:s.gender,Section:s.section,"Year Level":s.year,Contact:s.contact||"",Status:s.status||"Active"}));
  downloadXlsx(rows,sec?`BCC_Student_Registry_${sec.replace(/[^a-z0-9]+/gi,"_")}`:"BCC_Student_Registry","Students");
}
function exportSectionData(name){
  if(!xlsxReady())return;
  const secStudents=db.students.filter(s=>s.section===name);
  if(!secStudents.length)return alert(`No students registered in ${name} yet.`);
  const wb=XLSX.utils.book_new();
  const studentsRows=secStudents.map(s=>({"Student ID":s.id,"Full Name":s.name,Gender:s.gender,"Year Level":s.year,Contact:s.contact||"",Status:s.status||"Active"}));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(studentsRows),"Students");
  const gradesRows=secStudents.filter(s=>(s.status||"Active")==="Active").map(s=>{
    const o={"Student ID":s.id,"Student Name":s.name};
    GRADE_COMPONENTS.forEach(c=>o[c.label]=getScore(s.id,c.key));
    o["Plus Points"]=getScore(s.id,"bonus");o["Total"]=computeTotal(s.id).toFixed(2);o["Average"]=computeAverage(s.id).toFixed(2);o["Standing"]=getStanding(s.id);
    return o;
  });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(gradesRows.length?gradesRows:[{"Student ID":""}]),"Grades");
  XLSX.writeFile(wb,`BCC_${name.replace(/[^a-z0-9]+/gi,"_")}_Data_${todayISO()}.xlsx`);
  toast(`${name} data downloaded`);
}
function exportMasterWorkbook(){
  if(!xlsxReady())return;
  if(!db.students.length&&!db.sections.length)return alert("There is no data to export yet.");
  const wb=XLSX.utils.book_new();
  const studentsRows=db.students.map(s=>({"Student ID":s.id,"Full Name":s.name,Gender:s.gender,Section:s.section,"Year Level":s.year,Contact:s.contact||"",Status:s.status||"Active","Dropped On":s.droppedAt?new Date(s.droppedAt).toLocaleDateString():""}));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(studentsRows.length?studentsRows:[{"Student ID":""}]),"Students");
  const sectionsRows=db.sections.map(sec=>({Section:sec.name,Program:sec.program||"",Registered:db.students.filter(s=>s.section===sec.name).length}));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(sectionsRows.length?sectionsRows:[{Section:""}]),"Sections");
  const attendanceRows=[];
  Object.entries(db.attendance).forEach(([date,rec])=>{db.students.forEach(s=>{const st=rec[s.id];if(st)attendanceRows.push({Date:date,"Student ID":s.id,"Student Name":s.name,Section:s.section,Status:st})})});
  attendanceRows.sort((a,b)=>b.Date.localeCompare(a.Date)||a.Section.localeCompare(b.Section));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(attendanceRows.length?attendanceRows:[{Date:""}]),"Attendance History");
  const gradesRows=db.students.map(s=>{
    const o={"Student ID":s.id,"Student Name":s.name,Section:s.section,Status:s.status||"Active"};
    GRADE_COMPONENTS.forEach(c=>o[c.label]=getScore(s.id,c.key));
    o["Plus Points"]=getScore(s.id,"bonus");o["Total"]=computeTotal(s.id).toFixed(2);o["Average"]=computeAverage(s.id).toFixed(2);o["Standing"]=getStanding(s.id);
    return o;
  });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(gradesRows.length?gradesRows:[{"Student ID":""}]),"Grades");
  const dropoutRows=db.students.filter(s=>(s.status||"Active")==="Dropped").map(s=>({"Student ID":s.id,"Full Name":s.name,Section:s.section,"Dropped On":s.droppedAt?new Date(s.droppedAt).toLocaleDateString():"",Average:computeAverage(s.id).toFixed(2)}));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(dropoutRows.length?dropoutRows:[{"Student ID":""}]),"Dropouts");
  XLSX.writeFile(wb,`BCC_Master_Data_${todayISO()}.xlsx`);
  toast("Merged workbook with all data downloaded");
}
function exportDropouts(){
  const rows=db.students.filter(s=>(s.status||"Active")==="Dropped").map(s=>({"Student ID":s.id,"Full Name":s.name,Gender:s.gender,Section:s.section,"Year Level":s.year,Contact:s.contact||"","Dropped On":s.droppedAt?new Date(s.droppedAt).toLocaleDateString():"",Average:computeAverage(s.id).toFixed(2)}));
  if(!rows.length)return alert("There are no dropped-out students to export.");
  downloadXlsx(rows,"BCC_Dropout_List","Dropouts");
}

function backupData(){
  const payload={version:2,exportedAt:new Date().toISOString(),database:db,administrator:account?{name:account.name,username:account.username}:null};
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}));a.download=`BCC_System_Backup_${todayISO()}.json`;a.click();toast("Backup downloaded");
}
function restoreData(e){
  const f=e.target.files[0];if(!f)return;const reader=new FileReader();
  reader.onload=()=>{
    try{
      const payload=JSON.parse(reader.result),incoming=payload.database||payload;
      if(!incoming||!Array.isArray(incoming.students)||!Array.isArray(incoming.sections)||typeof incoming.attendance!=="object")throw new Error();
      incoming.grades=incoming.grades||{};
      incoming.students=incoming.students.map(s=>({status:"Active",...s}));
      db=incoming;saveDB();renderAll();toast("Backup restored successfully");
    }catch(err){alert("The selected file is not a valid BCC system backup.")}
    e.target.value="";
  };reader.readAsText(f);
}
function saveSettings(){
  const school=document.getElementById("schoolName").value.trim()||"BCC Student",name=document.getElementById("adminNameSetting").value.trim()||"Administrator";
  db.settings.schoolName=school;db.settings.adminName=name;saveDB();document.getElementById("adminDisplay").textContent=name;document.getElementById("adminAvatar").textContent=name.charAt(0).toUpperCase();toast("Settings saved");
}
function closeModal(id){document.getElementById(id).classList.add("hidden")}
window.addEventListener("keydown",e=>{if(e.key==="Escape"){closeModal("studentModal");closeModal("sectionModal");closeModal("importModal");closeModal("gradeImportModal");closeModal("scoreModal")}});

boot();


/* Bulk Section Import ---------------------------------------------------- */
function initImportFeature(){
  const input=document.getElementById("sectionImportFile"),drop=document.getElementById("importDrop");
  if(!input||!drop)return;
  input.onchange=e=>{if(e.target.files[0]) handleImportFile(e.target.files[0])};
  drop.onclick=()=>input.click();
  ["dragenter","dragover"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("dragging")}));
  ["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("dragging")}));
  drop.addEventListener("drop",e=>{const f=e.dataTransfer.files[0];if(f)handleImportFile(f)});
}
function openImportModal(){
  if(!db.sections.length){
    if(confirm("No sections exist yet. Create a section now?")) openSectionModal();
    return;
  }
  populateImportSections();importRows=[];importFileName="";
  document.getElementById("sectionImportFile").value="";document.getElementById("importFileInfo").classList.add("hidden");
  document.getElementById("importPreview").classList.add("hidden");document.getElementById("importConfirmBtn").disabled=true;
  document.getElementById("importModal").classList.remove("hidden");
}
function populateImportSections(){
  const s=document.getElementById("importSectionSelect");
  s.innerHTML=db.sections.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(x=>`<option value="${esc(x.name)}">${esc(x.name)}</option>`).join("");
}
function createImportSection(){
  closeModal("importModal");openSectionModal();
  document.getElementById("sectionForm").dataset.returnToImport="1";
}
async function handleImportFile(file){
  importFileName=file.name;
  const info=document.getElementById("importFileInfo");info.classList.remove("hidden");info.textContent=`Reading ${file.name}…`;
  try{
    let rows=[];const ext=file.name.toLowerCase().split(".").pop();
    if(["xlsx","xls","csv"].includes(ext)) rows=await parseSpreadsheet(file);
    else if(ext==="docx") rows=await parseDocx(file);
    else if(ext==="pdf") rows=await parsePdf(file);
    else throw new Error("Unsupported file type.");
    importRows=normalizeImportRows(rows);
    renderImportPreview();
    info.textContent=`${file.name} • ${importRows.length} student record${importRows.length===1?"":"s"} detected`;
  }catch(err){importRows=[];document.getElementById("importConfirmBtn").disabled=true;info.textContent=`Could not read file: ${err.message||err}`;}
}
async function parseSpreadsheet(file){
  if(typeof XLSX==="undefined")throw new Error("Spreadsheet library is unavailable.");
  const data=await file.arrayBuffer(),wb=XLSX.read(data,{type:"array"});let rows=[];
  wb.SheetNames.forEach(name=>{const ws=wb.Sheets[name];rows=rows.concat(XLSX.utils.sheet_to_json(ws,{defval:"",raw:false}));});
  return rows;
}
async function parseDocx(file){
  if(typeof mammoth==="undefined")throw new Error("Word document reader is unavailable.");
  const r=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
  return textToRows(r.value);
}
async function parsePdf(file){
  const pdfjs=window.pdfjsLib;if(!pdfjs)throw new Error("PDF reader is unavailable.");
  pdfjs.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;let rows=[];
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i),content=await page.getTextContent(),lines={};
    content.items.forEach(item=>{const y=Math.round(item.transform[5]);const x=item.transform[4];(lines[y]??=[]).push({x,text:item.str.trim()})});
    Object.keys(lines).sort((a,b)=>Number(b)-Number(a)).forEach(y=>rows.push(lines[y].sort((a,b)=>a.x-b.x).map(x=>x.text).filter(Boolean)));
  }
  return rows;
}
function textToRows(text){
  return String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(line=>{
    const cells=line.split(/\t+|\s{2,}|\s*\|\s*/).map(x=>x.trim()).filter(Boolean);
    if(cells.length===1){const m=line.match(/^(\S+)\s+(.+)$/);return m?[{Student_ID:m[1],Full_Name:m[2]}][0]:{Full_Name:line};}
    return cells;
  });
}
function keyNorm(k){return String(k??"").toLowerCase().replace(/[^a-z0-9]/g,"")}
function firstValue(row,aliases){
  if(Array.isArray(row))return "";
  const map={};Object.keys(row).forEach(k=>map[keyNorm(k)]=row[k]);
  for(const a of aliases){const v=map[keyNorm(a)];if(v!==undefined&&String(v).trim()!=="")return String(v).trim();}
  return "";
}
function normalizeImportRows(rows){
  if(!rows.length)return [];
  // Spreadsheet/object rows: map common school roster column names.
  if(!Array.isArray(rows[0])){
    return rows.map((r,i)=>({id:firstValue(r,["Student ID","StudentID","ID","Learner ID","School ID","Student No","Student Number"])||`IMPORTED-${String(i+1).padStart(4,"0")}`,name:firstValue(r,["Full Name","Student Name","Name","Learner Name","Student"])||firstValue(r,["Last Name"]),gender:firstValue(r,["Gender","Sex"])||"",section:firstValue(r,["Section","Class","Block"])||document.getElementById("importSectionSelect").value,year:firstValue(r,["Year Level","Year","Grade Level","Grade","Level"])||"",contact:firstValue(r,["Contact","Contact Number","Phone","Mobile","Email","Contact / Email"])||""})).filter(r=>r.name);
  }
  // Array rows (text/PDF): detect header row when possible.
  let start=0,headers=rows[0].map(x=>keyNorm(x));
  const headerHits=headers.filter(x=>["studentid","id","studentno","studentnumber","fullname","name","studentname","gender","sex","section","year","yearlevel","grade","contact","phone","mobile"].includes(x)).length;
  if(headerHits>=2){start=1;return rows.slice(start).map((r,i)=>{const o={};headers.forEach((h,j)=>o[h]=r[j]??"");return {id:firstValue(o,["studentid","id","studentno","studentnumber"])||`IMPORTED-${String(i+1).padStart(4,"0")}`,name:firstValue(o,["fullname","name","studentname"])||String(r[1]||r[0]||"").trim(),gender:firstValue(o,["gender","sex"]),section:firstValue(o,["section","class","block"])||document.getElementById("importSectionSelect").value,year:firstValue(o,["year","yearlevel","grade"]),contact:firstValue(o,["contact","phone","mobile","email"])} }).filter(r=>r.name);
  }
  return rows.map((r,i)=>({id:String(r[0]||`IMPORTED-${String(i+1).padStart(4,"0")}`).trim(),name:String(r[1]||r[0]||"").trim(),gender:String(r[2]||"").trim(),section:String(r[3]||document.getElementById("importSectionSelect").value).trim(),year:String(r[4]||"").trim(),contact:String(r[5]||"").trim()})).filter(r=>r.name);
}
function renderImportPreview(){
  const box=document.getElementById("importPreview"),btn=document.getElementById("importConfirmBtn");box.classList.remove("hidden");
  if(!importRows.length){box.innerHTML='<div class="empty">No student rows were detected. Use a roster with columns such as Student ID and Full Name.</div>';btn.disabled=true;return;}
  const sec=document.getElementById("importSectionSelect").value;const existing=new Set(db.students.map(s=>s.id));const dup=importRows.filter(r=>existing.has(r.id)).length;
  box.innerHTML=`<div class="import-preview-head"><b>Import preview</b><span>${importRows.length} records • ${dup} existing IDs</span></div><div class="table-wrap"><table><thead><tr><th>#</th><th>Student ID</th><th>Name</th><th>Gender</th><th>Year</th><th>Section</th></tr></thead><tbody>${importRows.slice(0,12).map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.id)}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.gender||"—")}</td><td>${esc(r.year||"—")}</td><td>${esc(r.section||sec)}</td></tr>`).join("")}</tbody></table></div>${importRows.length>12?`<small class="muted">Showing first 12 of ${importRows.length} records.</small>`:""}`;
  btn.disabled=false;
}
function commitSectionImport(){
  const sec=document.getElementById("importSectionSelect").value;if(!sec)return alert("Select a section first.");
  let added=0,updated=0,skipped=0;const ids=new Set();
  importRows.forEach((r,i)=>{let id=String(r.id||`IMPORTED-${String(i+1).padStart(4,"0")}`).trim();if(ids.has(id)){skipped++;return}ids.add(id);const obj={id,name:String(r.name||"").trim(),gender:String(r.gender||"").trim(),section:sec,year:String(r.year||"").trim(),contact:String(r.contact||"").trim(),status:"Active"};if(!obj.name){skipped++;return}const existing=db.students.findIndex(s=>s.id===id);if(existing>=0){db.students[existing]={...db.students[existing],...obj};updated++}else{db.students.push(obj);added++}});
  saveDB();closeModal("importModal");renderAll();toast(`Import complete: ${added} added, ${updated} updated, ${skipped} skipped`);importRows=[];
}
