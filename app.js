const KEY="bcc_attendance_final_v2";
const AUTH_KEY="bcc_admin_account_v1";

const DEFAULT_GRADE_COMPONENTS=[
  {key:"quiz",label:"Quiz",weight:15,items:["Quiz 1","Quiz 2","Quiz 3","Quiz 4"]},
  {key:"activity",label:"Activity",weight:15,items:["Activity 1","Activity 2","Activity 3","Activity 4"]},
  {key:"summative",label:"Summative",weight:10,optional:true,items:["Summative 1","Summative 2"]},
  {key:"exam",label:"Exam",weight:30,items:["Midterm Exam","Final Exam"]},
  {key:"performance",label:"Performance Task",weight:20,items:["Performance Task"]},
  {key:"attendance",label:"Attendance",weight:10,auto:true}
];
function defaultGradeWeights(){const w={};DEFAULT_GRADE_COMPONENTS.forEach(c=>w[c.key]=c.weight);return w}
const emptyDB={
  sections:[],
  students:[],
  attendance:{},
  grades:{},
  settings:{schoolName:"BCC Student",adminName:"Administrator",academicYear:"2026 - 2027",academicTerm:"1st Semester",useAttendanceGrade:true,gradeWeights:defaultGradeWeights(),attendanceSchedule:{default:[1,2,3,4,5],years:{},sections:{}},theme:"dark"}
};
function getAllGradeComponents(){
  const s=db?.settings||{},weights=s.gradeWeights||{},en=s.gradeEnabled||{},mx=s.gradeMax||{};
  return DEFAULT_GRADE_COMPONENTS.map(c=>({...c,
    weight:Number.isFinite(Number(weights[c.key]))?Number(weights[c.key]):c.weight,
    enabled:c.optional?en[c.key]!==false:true,
    max:c.auto?[]:c.items.map((_,i)=>{const v=Number(mx[c.key]?.[i]);return v>0?v:100})}));
}
function getGradeComponents(){return getAllGradeComponents().filter(c=>c.enabled)}
function componentMax(key){return getAllGradeComponents().find(c=>c.key===key)?.max||[]}
function ensureGradeSettings(){
  db.settings=db.settings||{};
  db.settings.gradeWeights=db.settings.gradeWeights||{};
  DEFAULT_GRADE_COMPONENTS.forEach(c=>{if(db.settings.gradeWeights[c.key]===undefined)db.settings.gradeWeights[c.key]=c.weight});
  const en=db.settings.gradeEnabled=(db.settings.gradeEnabled&&typeof db.settings.gradeEnabled==="object")?db.settings.gradeEnabled:{};
  DEFAULT_GRADE_COMPONENTS.filter(c=>c.optional).forEach(c=>{if(typeof en[c.key]!=="boolean")en[c.key]=true});
  const mx=db.settings.gradeMax=(db.settings.gradeMax&&typeof db.settings.gradeMax==="object")?db.settings.gradeMax:{};
  DEFAULT_GRADE_COMPONENTS.filter(c=>!c.auto).forEach(c=>{const cur=Array.isArray(mx[c.key])?mx[c.key]:[];mx[c.key]=c.items.map((_,i)=>{const v=Number(cur[i]);return v>0?v:100})});
  const total=getAllGradeComponents().filter(c=>c.enabled).reduce((a,c)=>a+Number(c.weight||0),0);
  if(Math.abs(total-100)>0.001) db.settings.gradeWeights=defaultGradeWeights();
  db.settings.theme=db.settings.theme||"dark";
  const sch=db.settings.attendanceSchedule=db.settings.attendanceSchedule||{};
  const clean=a=>Array.isArray(a)?[...new Set(a.map(Number).filter(n=>n>=0&&n<=6))].sort():[];
  sch.default=clean(sch.default).length?clean(sch.default):[1,2,3,4,5];
  sch.years=sch.years&&typeof sch.years==="object"?sch.years:{};
  sch.sections=sch.sections&&typeof sch.sections==="object"?sch.sections:{};
  Object.keys(sch.years).forEach(k=>{const c=clean(sch.years[k]);if(c.length)sch.years[k]=c;else delete sch.years[k]});
  Object.keys(sch.sections).forEach(k=>{const c=clean(sch.sections[k]);if(c.length)sch.sections[k]=c;else delete sch.sections[k]});
}
let db=loadDB();
ensureGradeSettings();
const GRADE_COMPONENTS=getGradeComponents();
function refreshGradeComponents(){GRADE_COMPONENTS.splice(0,GRADE_COMPONENTS.length,...getGradeComponents())}
function attendanceGradeOn(){return true}
function activeComponents(){refreshGradeComponents();return GRADE_COMPONENTS}
/* Attendance class days (0=Sun ... 6=Sat). Priority: Section setting > Year Level setting > Default (Mon-Fri). */
const DAY_ORDER=[1,2,3,4,5,6,0],DAY_SHORT=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],DAY_LONG=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
function scheduleFor(student){
  const sch=db?.settings?.attendanceSchedule||{default:[1,2,3,4,5],years:{},sections:{}};
  if(student){
    if(sch.sections?.[student.section]?.length)return sch.sections[student.section];
    if(sch.years?.[student.year]?.length)return sch.years[student.year];
  }
  return sch.default?.length?sch.default:[1,2,3,4,5];
}
function dayOfISO(date){const [y,m,d]=String(date).split("-").map(Number);return new Date(y,(m||1)-1,d||1).getDay()}
function scheduleLabel(days){
  const set=DAY_ORDER.filter(d=>days.includes(d));
  if(set.length===7)return "Mon–Sun";
  const runs=[];let run=[];
  DAY_ORDER.forEach(d=>{if(days.includes(d))run.push(d);else{if(run.length)runs.push(run);run=[]}});if(run.length)runs.push(run);
  return runs.map(r=>r.length===1?DAY_SHORT[r[0]]:r.length===2?`${DAY_SHORT[r[0]]} & ${DAY_SHORT[r[1]]}`:`${DAY_SHORT[r[0]]}–${DAY_SHORT[r[r.length-1]]}`).join(", ");
}
function isClassDay(student,date){return scheduleFor(student).includes(dayOfISO(date))}
function computeAttendanceScore(id){
  const days=scheduleFor(db.students.find(x=>x.id===id));
  let present=0,total=0;
  Object.entries(db.attendance).forEach(([date,rec])=>{
    const st=rec[id];
    if((st==="Present"||st==="Absent")&&days.includes(dayOfISO(date))){total++;if(st==="Present")present++}
  });
  return total?Math.round((present/total)*10000)/100:0;
}
function scoreFor(id,key){return key==="attendance"?computeAttendanceScore(id):getScore(id,key)}

let account=loadAccount();
let importRows=[];
let importFileName="";

const OPEN_EYE_PATH=`<path d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"/><path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>`;
const CLOSED_EYE_PATH=`<path d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 1-4.243-4.243m4.242 4.242L9.88 9.88"/>`;
const SUN_ICON=`<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="3.5"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"></path></svg>`;
const MOON_ICON=`<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.7 15.2A8.7 8.7 0 0 1 8.8 3.3 8.8 8.8 0 1 0 20.7 15.2Z"></path></svg>`;
function setPasswordIcon(btn,visible){const icon=btn?.querySelector(".eye-icon");if(!icon)return;icon.innerHTML=visible?CLOSED_EYE_PATH:OPEN_EYE_PATH;icon.setAttribute("focusable","false");btn.setAttribute("aria-label",visible?"Hide password":"Show password");btn.setAttribute("aria-pressed",String(visible));btn.title=visible?"Hide password":"Show password"}
function togglePassword(id,btn){const input=document.getElementById(id);if(!input||!btn)return;const visible=input.type==="text";input.type=visible?"password":"text";setPasswordIcon(btn,!visible);input.focus();try{input.setSelectionRange(input.value.length,input.value.length)}catch(e){}} 
function initPasswordToggles(){document.querySelectorAll(".password-toggle").forEach(btn=>{const inputId=btn.getAttribute("onclick")?.match(/togglePassword\('([^']+)'/)?.[1];const input=inputId&&document.getElementById(inputId);if(input)setPasswordIcon(btn,input.type==="text")})}

function clone(o){return JSON.parse(JSON.stringify(o))}
function loadDB(){
  try{
    const d=JSON.parse(localStorage.getItem(KEY))||clone(emptyDB);
    d.grades=d.grades||{};
    const savedW=(d.settings||{}).gradeWeights;
    d.settings={...emptyDB.settings,...(d.settings||{}),gradeWeights:savedW?{summative:0,...savedW}:defaultGradeWeights()};
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
function toast(msg){const t=document.getElementById("toast");if(!t)return;t.textContent=msg;t.classList.remove("hidden");clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.add("hidden"),2200)}
function setAuthMessage(id,message,type="error"){const el=document.getElementById(id);if(!el)return;el.textContent=message;el.className=`auth-message ${message?type:""}`;if(message)el.classList.remove("hidden");else el.classList.add("hidden")}
function isLoggedIn(){return sessionStorage.getItem("bcc_session")==="1"}

function boot(){
  applyTheme(db.settings.theme||"dark");
  initThemeControls();
  initPasswordToggles();
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
  if(password.length<6){setAuthMessage("setupMessage","Password must contain at least 6 characters.","error");return}
  if(password!==confirm){setAuthMessage("setupMessage","Passwords do not match.","error");return}
  saveAccount({name,username,password});
  db.settings.adminName=name;saveDB();
  sessionStorage.setItem("bcc_session","1");openApp();
};
document.getElementById("loginForm").onsubmit=e=>{
  e.preventDefault();
  const u=document.getElementById("username").value.trim(),p=document.getElementById("password").value;
  if(account&&u===account.username&&p===account.password){setAuthMessage("loginMessage","","success");sessionStorage.setItem("bcc_session","1");openApp()}
  else setAuthMessage("loginMessage","Incorrect username or password. Please check your credentials and try again.","error");
};
document.getElementById("logoutBtn").onclick=()=>{sessionStorage.removeItem("bcc_session");location.reload()};

function init(){
  applyTheme(db.settings.theme||"dark");
  initThemeControls();
  initPasswordToggles();
  initMobileNavigation();
  const loader=document.getElementById("pageLoader"); if(loader){loader.classList.remove("hidden");setTimeout(()=>loader.classList.add("hidden"),650);}
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
  if(page==="grades"){renderGrades();requestAnimationFrame(()=>{const sc=document.querySelector("#grades .grade-scroll");if(sc)sc.scrollLeft=0;});}
  if(page==="sections")renderSections();
  if(page==="reports")renderReports();
  window.scrollTo({top:0,left:0,behavior:"auto"});
}
function renderAcademicPeriod(){
  const year=db.settings.academicYear||"2026 - 2027";
  const term=db.settings.academicTerm||"1st Semester";
  const y=document.getElementById("academicYearDisplay"),t=document.getElementById("academicTermDisplay");
  if(y)y.textContent=year; if(t)t.textContent=term;
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
function renderAll(){ensureGradeSettings();refreshGradeComponents();populateSections();renderDashboard();renderAttendance();renderStudents();renderSections();renderReports();renderGrades();renderGradingSettingsUI();renderAttendanceScheduleSummary();document.getElementById("schoolName").value=db.settings.schoolName||"BCC Student";document.getElementById("adminNameSetting").value=db.settings.adminName||account?.name||"Administrator";document.getElementById("academicYearSetting").value=db.settings.academicYear||"2026 - 2027";document.getElementById("academicTermSetting").value=db.settings.academicTerm||"1st Semester";renderAcademicPeriod();const attChk=document.getElementById("useAttendanceGrade");if(attChk){attChk.checked=true;attChk.disabled=true}}
function toggleAttendanceGrading(checked){
  db.settings.useAttendanceGrade=true;saveDB();
  const el=document.getElementById("useAttendanceGrade");if(el)el.checked=true;
  renderGrades();renderDashboard();toast("Attendance is always included at 10% in the final grade");
}
function getFilteredStudents(section="",search="",status=""){
  const q=search.toLowerCase();
  return db.students.filter(s=>{
    const st=s.status||"Active";
    return (!section||s.section===section)&&(!status||st===status)&&(!q||`${s.id} ${s.name} ${s.contact||""}`.toLowerCase().includes(q));
  }).sort((a,b)=>a.section.localeCompare(b.section)||a.name.localeCompare(b.name))
}

/* Generic column sorting -------------------------------------------------- */
const sortState={students:{key:null,dir:1},grades:{key:null,dir:1},attendance:{key:null,dir:1},reports:{key:null,dir:1}};
let gradePage=1;
let gradePageSize=5;
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
  renderAtRiskWidget();
}
function statusPill(st){return `<span class="status ${st.toLowerCase()}">${st}</span>`}
function renderAttendance(){
  const date=document.getElementById("attendanceDate").value||todayISO(),sec=document.getElementById("attendanceSection").value,search=document.getElementById("attendanceSearch").value,rec=db.attendance[date]||{};
  let rows=getFilteredStudents(sec,search,"Active");
  rows=applySort(rows,sortState.attendance,(s,key)=>key==="status"?(rec[s.id]||"Unmarked"):s[key]);
  const counts={Present:0,Absent:0,Unmarked:0}; rows.forEach(s=>counts[rec[s.id]||"Unmarked"]++);
  const total=rows.length,marked=counts.Present+counts.Absent,rate=marked?Math.round(counts.Present/marked*100):0;
  const summary=document.getElementById("attendanceQuickSummary");
  if(summary) summary.innerHTML=`<div class="attendance-stat present-stat"><b>${counts.Present}</b><span>Present</span></div><div class="attendance-stat absent-stat"><b>${counts.Absent}</b><span>Absent</span></div><div class="attendance-stat unmarked-stat"><b>${counts.Unmarked}</b><span>Unmarked</span></div><div class="attendance-stat rate-stat"><b>${rate}%</b><span>Attendance Rate</span></div><div class="attendance-progress"><div><span>Progress</span><b>${marked}/${total} checked</b></div><div class="progress"><i style="width:${total?Math.round(marked/total*100):0}%"></i></div></div>`;
  document.getElementById("attendanceTable").innerHTML=rows.map((s,i)=>{const st=rec[s.id]||"Unmarked";return `<tr tabindex="0" data-student-id="${escAttr(s.id)}"><td data-label="#">${i+1}</td><td data-label="Student ID">${esc(s.id)}</td><td data-label="Student"><b class="name-link" onclick="openProfileModal('${escAttr(s.id)}')">${esc(s.name)}</b></td><td data-label="Section">${esc(s.section)}</td><td data-label="Status"><button class="status-button ${st.toLowerCase()}" title="Click to cycle status" onclick="cycleAttendance('${escAttr(s.id)}')">${st}</button>${isClassDay(s,date)?"":`<small class="offday-tag" title="This weekday is not in the class schedule, so it does not count toward the attendance grade">Not a class day</small>`}</td><td class="actions" data-label="Action"><button class="primary" onclick="setAttendance('${escAttr(s.id)}','Present')">✓ Present</button><button class="danger" onclick="setAttendance('${escAttr(s.id)}','Absent')">✕ Absent</button><button class="ghost" onclick="setAttendance('${escAttr(s.id)}','Unmarked')">↺</button></td></tr>`}).join("")||'<tr><td colspan="6" class="empty">No active students match the selected filters.</td></tr>';
  updateSortIndicators("attendanceTableEl",sortState.attendance);
  const note=document.getElementById("attendanceScheduleNote");
  if(note){
    const labels=[...new Set(rows.map(s=>scheduleLabel(scheduleFor(s))))];
    const off=rows.filter(s=>!isClassDay(s,date)).length;
    note.innerHTML=`📅 <b>Class days:</b> ${labels.length?labels.map(esc).join(" • "):scheduleLabel(scheduleFor(null))}`+(off?` — <span class="offday-warn">${DAY_LONG[dayOfISO(date)]} is not a class day for ${off} of ${rows.length} listed student${rows.length===1?"":"s"}; those records will not count toward the attendance grade.</span>`:"");
  }
}
document.getElementById("attendanceDate").onchange=renderAttendance;
document.getElementById("attendanceSection").onchange=renderAttendance;
document.getElementById("attendanceSearch").oninput=renderAttendance;
document.addEventListener("keydown",e=>{
  if(document.getElementById("attendance")?.classList.contains("hidden"))return;
  const row=document.activeElement?.closest?.("tr[data-student-id]"); if(!row)return;
  if(e.key.toLowerCase()==="p"){e.preventDefault();setAttendance(row.dataset.studentId,"Present")}
  if(e.key.toLowerCase()==="a"){e.preventDefault();setAttendance(row.dataset.studentId,"Absent")}
  if(e.key.toLowerCase()==="u"){e.preventDefault();setAttendance(row.dataset.studentId,"Unmarked")}
});
function setAttendance(id,status){
  const d=document.getElementById("attendanceDate").value||todayISO();db.attendance[d]??={};
  if(status==="Unmarked") delete db.attendance[d][id]; else db.attendance[d][id]=status;
  if(db.attendance[d]&&Object.keys(db.attendance[d]).length===0) delete db.attendance[d];
  saveDB();renderAttendance();renderDashboard();toast(status==="Unmarked"?"Attendance reset to Unmarked":`Attendance updated: ${status}`);
}
function cycleAttendance(id){
  const d=document.getElementById("attendanceDate").value||todayISO(), current=(db.attendance[d]||{})[id]||"Unmarked";
  setAttendance(id,current==="Unmarked"?"Present":current==="Present"?"Absent":"Unmarked");
}
function markUnmarkedAs(status){
  const d=document.getElementById("attendanceDate").value||todayISO();db.attendance[d]??={};
  const students=getFilteredStudents(document.getElementById("attendanceSection").value,document.getElementById("attendanceSearch").value,"Active");
  let changed=0; students.forEach(s=>{if(!db.attendance[d][s.id]){db.attendance[d][s.id]=status;changed++}});
  saveDB();renderAttendance();renderDashboard();toast(`${changed} unmarked student${changed===1?"":"s"} set to ${status}`);
}
function clearFilteredAttendance(){
  const d=document.getElementById("attendanceDate").value||todayISO();
  if(!db.attendance[d])return toast("Nothing to unmark");
  getFilteredStudents(document.getElementById("attendanceSection").value,document.getElementById("attendanceSearch").value,"Active").forEach(s=>delete db.attendance[d][s.id]);
  if(Object.keys(db.attendance[d]).length===0)delete db.attendance[d];
  saveDB();renderAttendance();renderDashboard();toast("Filtered students are now Unmarked");
}
function markAll(status){
  const d=document.getElementById("attendanceDate").value||todayISO();db.attendance[d]??={};
  getFilteredStudents(document.getElementById("attendanceSection").value,document.getElementById("attendanceSearch").value,"Active").forEach(s=>{if(status==="Unmarked")delete db.attendance[d][s.id];else db.attendance[d][s.id]=status});
  if(Object.keys(db.attendance[d]).length===0)delete db.attendance[d];
  saveDB();renderAttendance();renderDashboard();toast(`${status} applied to filtered students`);
}

/* Grades ------------------------------------------------------------------ */
function round2(n){return Math.round((Number(n)||0)*100)/100}
function componentDef(key){return DEFAULT_GRADE_COMPONENTS.find(c=>c.key===key)}
/* Item scores are raw points (e.g. 18 out of 20). Each item's highest possible score is set in Grading Options. */
function rawItems(id,key){
  const n=componentDef(key)?.items?.length||1,v=(db.grades[id]||{})[key];
  if(Array.isArray(v))return Array.from({length:n},(_,i)=>Math.max(0,Number(v[i])||0));
  if(typeof v==="number")return Array(n).fill(Math.max(0,v));
  return Array(n).fill(0);
}
function getItems(id,key){const mx=componentMax(key);return rawItems(id,key).map((v,i)=>Math.min(v,mx[i]||100))}
/* Component score (0-100) = total of the item scores / total of the highest possible scores x 100 */
function getScore(id,key){
  if(key==="bonus"){const b=(db.grades[id]||{}).bonus;return typeof b==="number"?b:0}
  const items=getItems(id,key),mx=componentMax(key),over=mx.reduce((a,b)=>a+b,0);
  return over?round2(items.reduce((a,b)=>a+b,0)/over*100):0;
}
function rawTotLabel(id,c){const it=getItems(id,c.key);return `${+it.reduce((a,b)=>a+b,0).toFixed(2)}/${c.max.reduce((a,b)=>a+b,0)}`}
function computeTotal(id){return Math.round((activeComponents().reduce((sum,c)=>sum+(Number(scoreFor(id,c.key))||0)*(c.weight/100),0)+(Number(getScore(id,"bonus"))||0))*100)/100}
function computeAverage(id){return computeTotal(id)}
function getStanding(id){
  const override=(db.grades[id]||{}).override;
  if(override)return override;
  return computeAverage(id)>=75?"Passing":"At Risk";
}
function setScore(id,key,raw,idx){
  let v=parseFloat(raw);if(isNaN(v))v=0;
  const max=key==="bonus"?50:(componentMax(key)[idx||0]||100);
  v=Math.max(0,Math.min(max,v));
  db.grades[id]??={};
  if(key==="bonus")db.grades[id][key]=v;
  else{const items=getItems(id,key);items[idx||0]=v;db.grades[id][key]=items}
  saveDB();renderGrades();toast("Grade saved");
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
    case "attendance":return computeAttendanceScore(s.id);
    default:return getScore(s.id,key);
  }
}
function renderGrades(){
  const comps=activeComponents();
  const ths=document.querySelectorAll("#gradesTableEl thead th[data-sort]");
  comps.forEach(c=>{const th=[...ths].find(x=>x.dataset.sort===c.key);if(th)th.innerHTML=`${esc(c.label)}<br><small>${Number(c.weight)}%${c.auto?"":` • ${c.max.reduce((a,b)=>a+b,0)} pts`}</small>`});
  {const keys=new Set(comps.map(c=>c.key));ths.forEach(th=>{if(DEFAULT_GRADE_COMPONENTS.some(c=>c.key===th.dataset.sort))th.style.display=keys.has(th.dataset.sort)?"":"none"})}
  const secEl=document.getElementById("gradeSection"),searchEl=document.getElementById("gradeSearch");
  if(!secEl||!searchEl)return;
  document.getElementById("gradesTableEl").classList.add("show-attendance");

  let allRows=getFilteredStudents(secEl.value,searchEl.value,"Active");
  allRows=applySort(allRows,sortState.grades,gradeSortValue);
  const totalPages=Math.max(1,Math.ceil(allRows.length/gradePageSize));
  gradePage=Math.min(Math.max(1,gradePage),totalPages);
  const start=(gradePage-1)*gradePageSize;
  const rows=allRows.slice(start,start+gradePageSize);

  document.getElementById("gradesTable").innerHTML=rows.map(s=>{
    const total=computeTotal(s.id),avg=computeAverage(s.id),standing=getStanding(s.id),override=(db.grades[s.id]||{}).override||"";
    const cells=GRADE_COMPONENTS.map(c=>{
      const val=scoreFor(s.id,c.key);
      return c.auto
        ? `<td class="attendance-col" data-label="${esc(c.label)}"><b>${val.toFixed(2)}</b><br><small class="muted">auto • ${c.weight}% • ${esc(scheduleLabel(scheduleFor(s)))}</small></td>`
        : (c.items.length===1
          ? `<td data-label="${esc(c.label)}"><input class="grade-input" type="number" min="0" max="${c.max[0]}" step="0.01" value="${getItems(s.id,c.key)[0]}" onchange="setScore('${escAttr(s.id)}','${c.key}',this.value)"><small class="weight-label">${c.weight}% • /${c.max[0]}</small></td>`
          : `<td data-label="${esc(c.label)}"><button type="button" class="comp-cell" onclick="openScoreModal('${escAttr(s.id)}')" title="${esc(c.items.map((l,i)=>l+": "+getItems(s.id,c.key)[i]+"/"+c.max[i]).join(" • "))}"><b>${val.toFixed(2)}</b><small class="comp-items">${rawTotLabel(s.id,c)} pts</small><small class="weight-label">${c.weight}%</small></button></td>`);
    }).join("");
    const decisionCell=`<td class="actions grade-row-actions">
      <button class="secondary compact-action" onclick="openScoreModal('${escAttr(s.id)}')" title="Edit all scores">✎ <span>Scores</span></button>
      <select class="grade-select compact-standing" onchange="setStandingOverride('${escAttr(s.id)}',this.value)" aria-label="Standing override for ${escAttr(s.name)}">
        <option value="" ${!override?"selected":""}>Auto</option>
        <option value="Passing" ${override==="Passing"?"selected":""}>Pass</option>
        <option value="At Risk" ${override==="At Risk"?"selected":""}>Risk</option>
      </select>
      <button class="danger compact-action" onclick="toggleDropStudent('${escAttr(s.id)}')" title="Drop out student">Drop</button>
    </td>`;
    return `<tr><td>${esc(s.id)}</td><td><b class="name-link" onclick="openProfileModal('${escAttr(s.id)}')">${esc(s.name)}</b></td><td>${esc(s.section)}</td>${cells}<td class="grade-total"><b>${total.toFixed(2)}</b></td><td><b>${avg.toFixed(2)}</b></td><td><span class="status ${standing==="Passing"?"present":"absent"}">${standing}</span></td>${decisionCell}</tr>`;
  }).join("")||'<tr><td colspan="'+(comps.length+7)+'" class="empty">No active students match the selected filters.</td></tr>';

  const totals=allRows.map(s=>computeTotal(s.id));
  const passing=allRows.filter(s=>getStanding(s.id)==="Passing").length;
  const risk=allRows.length-passing;
  const avg=totals.length?totals.reduce((a,b)=>a+b,0)/totals.length:0;
  const top=totals.length?Math.max(...totals):0;
  const setStat=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val};
  setStat("gradeStatStudents",allRows.length);
  setStat("gradeStatPassing",passing);
  setStat("gradeStatRisk",risk);
  setStat("gradeStatPassingRate",allRows.length?`${((passing/allRows.length)*100).toFixed(1)}%`:"0%");
  setStat("gradeStatRiskRate",allRows.length?`${((risk/allRows.length)*100).toFixed(1)}%`:"0%");
  setStat("gradeStatAverage",avg.toFixed(2));
  setStat("gradeStatTop",top.toFixed(2));
  updateGradePagination(allRows.length,totalPages,start);
  updateSortIndicators("gradesTableEl",sortState.grades);
}
function updateGradePagination(total,totalPages,startIndex){
  const el=document.getElementById("gradePagination");
  if(!el)return;
  const from=total?startIndex+1:0, to=Math.min(startIndex+gradePageSize,total);
  const buttons=[];
  buttons.push(`<button type="button" class="page-nav" ${gradePage<=1?"disabled":""} onclick="setGradePage(1)" aria-label="First page">«</button>`);
  buttons.push(`<button type="button" class="page-nav" ${gradePage<=1?"disabled":""} onclick="setGradePage(${gradePage-1})" aria-label="Previous page">‹</button>`);
  const windowSize=5;
  let first=Math.max(1,gradePage-2),last=Math.min(totalPages,first+windowSize-1);
  first=Math.max(1,last-windowSize+1);
  for(let i=first;i<=last;i++)buttons.push(`<button type="button" class="page-number ${i===gradePage?"active":""}" onclick="setGradePage(${i})" aria-current="${i===gradePage?"page":"false"}">${i}</button>`);
  buttons.push(`<button type="button" class="page-nav" ${gradePage>=totalPages?"disabled":""} onclick="setGradePage(${gradePage+1})" aria-label="Next page">›</button>`);
  buttons.push(`<button type="button" class="page-nav" ${gradePage>=totalPages?"disabled":""} onclick="setGradePage(${totalPages})" aria-label="Last page">»</button>`);
  el.innerHTML=`<div class="grade-page-count">Showing <b>${from}–${to}</b> of <b>${total}</b> students</div><div class="grade-page-controls">${buttons.join("")}<label class="rows-page">Rows <select onchange="setGradePageSize(this.value)"><option value="5" ${gradePageSize===5?"selected":""}>5</option><option value="10" ${gradePageSize===10?"selected":""}>10</option><option value="20" ${gradePageSize===20?"selected":""}>20</option><option value="50" ${gradePageSize===50?"selected":""}>50</option></select></label></div>`;
}
function setGradePage(page){gradePage=Number(page)||1;renderGrades();}
function setGradePageSize(size){gradePageSize=Math.max(1,Number(size)||5);gradePage=1;renderGrades()}

function clearGradeFilters(){const s=document.getElementById("gradeSection"),q=document.getElementById("gradeSearch");if(s)s.value="";if(q)q.value="";gradePage=1;renderGrades();}
document.getElementById("gradeSection").onchange=()=>{gradePage=1;renderGrades()};
document.getElementById("gradeSearch").oninput=()=>{gradePage=1;renderGrades()};
function exportGrades(){
  const rows=getFilteredStudents(document.getElementById("gradeSection").value,document.getElementById("gradeSearch").value,"Active").map(s=>{
    const o={"Student ID":s.id,"Student Name":s.name,Section:s.section};
    GRADE_COMPONENTS.forEach(c=>o[c.label]=scoreFor(s.id,c.key).toFixed(2));
    o["Final Grade"]=computeTotal(s.id).toFixed(2);o["Standing"]=getStanding(s.id);
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
    GRADE_COMPONENTS.filter(c=>!c.auto).forEach(c=>{const it=getItems(s.id,c.key);c.items.forEach((lab,i)=>o[`${lab} (/${c.max[i]})`]=it[i])});
    o["Plus Points"]=getScore(s.id,"bonus");
    if(attendanceGradeOn())o["Attendance (auto — do not edit)"]=computeAttendanceScore(s.id).toFixed(2);
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
    GRADE_COMPONENTS.filter(c=>!c.auto).forEach(c=>{
      const legacy=c.items.length>1?firstValue(r,[c.label,c.key]):"";
      const arr=c.items.map((lab,i)=>{const v=firstValue(r,[`${lab} (/${c.max[i]})`,lab]);const src=v!==""?v:legacy;return src===""?null:Math.max(0,Math.min(c.max[i],parseFloat(src)||0))});
      if(arr.some(x=>x!==null))o[c.key]=arr;
    });
    const bonus=firstValue(r,["Plus Points","Bonus"]);if(bonus!=="")o.bonus=Math.max(0,Math.min(50,parseFloat(bonus)||0));
    return o;
  }).filter(Boolean);
}
function renderGradeImportPreview(){
  const box=document.getElementById("gradeImportPreview"),btn=document.getElementById("gradeImportConfirmBtn");box.classList.remove("hidden");
  if(!gradeImportRows.length){box.innerHTML='<div class="empty">No matching Student IDs were found. Use the downloaded template and keep the Student ID column unchanged.</div>';btn.disabled=true;return;}
  box.innerHTML=`<div class="import-preview-head"><b>Import preview</b><span>${gradeImportRows.length} student record${gradeImportRows.length===1?"":"s"} will be updated</span></div><div class="table-wrap"><table><thead><tr><th>#</th><th>Student ID</th><th>Name</th>${GRADE_COMPONENTS.map(c=>`<th>${esc(c.label)}</th>`).join("")}<th>Plus Points</th></tr></thead><tbody>${gradeImportRows.slice(0,12).map((r,i)=>{const s=db.students.find(x=>x.id===r.id);return `<tr><td>${i+1}</td><td>${esc(r.id)}</td><td><b>${esc(s?.name||"")}</b></td>${GRADE_COMPONENTS.map(c=>`<td>${r[c.key]!==undefined?r[c.key].map(x=>x===null?"—":x).join(" · "):"—"}</td>`).join("")}<td>${r.bonus!==undefined?r.bonus:"—"}</td></tr>`}).join("")}</tbody></table></div>${gradeImportRows.length>12?`<small class="muted">Showing first 12 of ${gradeImportRows.length} records.</small>`:""}`;
  btn.disabled=false;
}
function commitGradeImport(){
  let updated=0;
  gradeImportRows.forEach(r=>{
    db.grades[r.id]??={};
    GRADE_COMPONENTS.filter(c=>!c.auto).forEach(c=>{if(r[c.key]!==undefined){const cur=getItems(r.id,c.key);r[c.key].forEach((v,i)=>{if(v!==null)cur[i]=v});db.grades[r.id][c.key]=cur}});
    if(r.bonus!==undefined)db.grades[r.id].bonus=r.bonus;
    updated++;
  });
  saveDB();closeModal("gradeImportModal");renderGrades();toast(`Import complete: ${updated} student score record${updated===1?"":"s"} updated`);gradeImportRows=[];
}

/* Quick score-entry modal (mobile-friendly) --------------------------------- */
function openScoreModal(id){
  const st=db.students.find(x=>x.id===id);if(!st)return;
  document.getElementById("scoreModalId").value=id;
  document.getElementById("scoreModalName").textContent=st.name;
  document.getElementById("scoreModalMeta").textContent=`${st.id} • ${st.section}`;
  const wrap=document.getElementById("scoreModalFields");
  wrap.innerHTML=GRADE_COMPONENTS.filter(c=>!c.auto).map(c=>{
    const it=getItems(id,c.key),maxTot=c.max.reduce((x,y)=>x+y,0);
    return `<div class="score-group"><div class="score-group-head"><b>${esc(c.label)}</b><small>${c.weight}% • <span data-raw="${c.key}">${+it.reduce((x,y)=>x+y,0).toFixed(2)}</span>/${maxTot} pts = <span class="score-group-avg" data-avg="${c.key}">${getScore(id,c.key).toFixed(2)}</span>%</small></div><div class="score-group-grid">`
      +c.items.map((lab,i)=>`<label>${esc(lab)} <small>(0–${c.max[i]})</small><input type="number" min="0" max="${c.max[i]}" step="0.01" inputmode="decimal" data-key="${c.key}" data-idx="${i}" data-max="${c.max[i]}" value="${it[i]}"></label>`).join("")+`</div></div>`;
  }).join("")
    +`<div class="score-group"><div class="score-group-head"><b>Attendance</b><small>${(GRADE_COMPONENTS.find(c=>c.auto)||{weight:0}).weight}% • auto from Present/Absent on class days (${esc(scheduleLabel(scheduleFor(st)))})</small></div><div class="score-group-grid"><label>Attendance Score<input type="number" value="${computeAttendanceScore(id).toFixed(2)}" disabled></label></div></div>`;
  updateScoreModalPreview(id);
  document.getElementById("scoreModal").classList.remove("hidden");
  wrap.querySelector("input:not([disabled])")?.focus();
}
function readScoreModalItems(){
  const vals={};
  document.querySelectorAll("#scoreModalFields input[data-key]").forEach(i=>{
    (vals[i.dataset.key]??=[])[Number(i.dataset.idx)]=Math.max(0,Math.min(Number(i.dataset.max)||100,parseFloat(i.value)||0));
  });
  return vals;
}
function updateScoreModalPreview(id){
  id=id||document.getElementById("scoreModalId").value;
  const vals=readScoreModalItems();let total=0;
  GRADE_COMPONENTS.forEach(c=>{
    let score;
    if(c.auto)score=computeAttendanceScore(id);
    else{const arr=vals[c.key]||[],got=arr.reduce((a,b)=>a+(b||0),0),mt=c.max.reduce((a,b)=>a+b,0);score=mt?got/mt*100:0;const el=document.querySelector(`#scoreModalFields [data-avg="${c.key}"]`);if(el)el.textContent=score.toFixed(2);const rw=document.querySelector(`#scoreModalFields [data-raw="${c.key}"]`);if(rw)rw.textContent=+got.toFixed(2)}
    total+=score*(c.weight/100);
  });
  total+=getScore(id,"bonus");
  total=round2(total);
  document.getElementById("scoreModalTotal").textContent=total.toFixed(2);
  document.getElementById("scoreModalAverage").textContent=total.toFixed(2);
  document.getElementById("scoreModalStanding").textContent=total>=75?"Passing":"At Risk";
}
function saveScoreModal(){
  const id=document.getElementById("scoreModalId").value;if(!id)return;
  const vals=readScoreModalItems();
  db.grades[id]??={};
  Object.keys(vals).forEach(k=>{db.grades[id][k]=Array.from(vals[k],v=>v||0)});
  saveDB();closeModal("scoreModal");renderGrades();renderDashboard();toast("Scores saved");
}
(function bindScoreModalEvents(){
  const fields=document.getElementById("scoreModalFields");if(!fields)return;
  fields.addEventListener("input",()=>updateScoreModalPreview());
  fields.addEventListener("keydown",e=>{
    if(e.key==="Enter"){
      e.preventDefault();
      const inputs=[...fields.querySelectorAll("input:not([disabled])")],idx=inputs.indexOf(e.target);
      if(idx>-1&&idx<inputs.length-1)inputs[idx+1].focus();else saveScoreModal();
    }
  });
})();

/* Student quick-profile modal ------------------------------------------------ */
function openProfileModal(id){
  const s=db.students.find(x=>x.id===id);if(!s)return;
  let present=0,absent=0;
  Object.values(db.attendance).forEach(rec=>{const st=rec[id];if(st==="Present")present++;else if(st==="Absent")absent++});
  const totalDays=present+absent,rate=totalDays?Math.round((present/totalDays)*10000)/100:null;
  const active=(s.status||"Active")==="Active";
  const total=computeTotal(id),avg=computeAverage(id),standing=getStanding(id);
  document.getElementById("profileModalName").textContent=s.name;
  document.getElementById("profileModalMeta").textContent=`${s.id} • ${s.section} • ${s.year||"—"}`;
  document.getElementById("profileModalStatus").innerHTML=`<span class="status ${active?"present":"dropped"}">${active?"Active":"Dropped"}</span>`;
  document.getElementById("profileModalBody").innerHTML=`
    <div class="profile-grid">
      <div class="profile-box"><span>Attendance Rate</span><b>${rate===null?"—":rate.toFixed(2)+"%"}</b><small>${present} Present • ${absent} Absent</small></div>
      <div class="profile-box"><span>Grade Average</span><b>${avg.toFixed(2)}</b><small>Total ${total.toFixed(2)} • ${standing}</small></div>
    </div>
    <div class="profile-list">
      <div><span>Gender</span><b>${esc(s.gender||"—")}</b></div>
      <div><span>Contact</span><b>${esc(s.contact||"—")}</b></div>
      ${GRADE_COMPONENTS.map(c=>`<div><span>${esc(c.label)}</span><b>${getScore(id,c.key)}</b></div>`).join("")}
      ${attendanceGradeOn()?`<div><span>Attendance Score</span><b>${computeAttendanceScore(id).toFixed(2)}</b></div>`:""}
      <div><span>Plus Points</span><b>${getScore(id,"bonus")}</b></div>
    </div>`;
  document.getElementById("profileModalActions").innerHTML=`
    <button class="secondary" onclick="closeModal('profileModal');editStudent('${escAttr(id)}')">Edit Student</button>
    <button class="secondary" onclick="closeModal('profileModal');openScoreModal('${escAttr(id)}')">✎ Edit Scores</button>`;
  document.getElementById("profileModal").classList.remove("hidden");
}

/* Dashboard — students needing attention (low average or low attendance) ---- */
function renderAtRiskWidget(){
  const box=document.getElementById("atRiskList");if(!box)return;
  const active=db.students.filter(s=>(s.status||"Active")==="Active");
  const flagged=active.map(s=>{
    let present=0,total=0;
    Object.values(db.attendance).forEach(rec=>{const st=rec[s.id];if(st){total++;if(st==="Present")present++}});
    const rate=total?present/total*100:null;
    const avg=computeAverage(s.id),standing=getStanding(s.id);
    const reasons=[];
    if(standing==="At Risk")reasons.push(`Average ${avg.toFixed(1)}`);
    if(rate!==null&&rate<80)reasons.push(`Attendance ${rate.toFixed(0)}%`);
    return reasons.length?{s,reasons,rank:(standing==="At Risk"?0:100)+(rate!==null?rate:100)}:null;
  }).filter(Boolean).sort((a,b)=>a.rank-b.rank).slice(0,8);
  box.innerHTML=flagged.length?flagged.map(f=>`<div class="risk-row"><div><b class="name-link" onclick="openProfileModal('${escAttr(f.s.id)}')">${esc(f.s.name)}</b><small>${esc(f.s.section)}</small></div><div class="risk-tags">${f.reasons.map(r=>`<span class="risk-tag">${esc(r)}</span>`).join("")}</div></div>`).join("")
    :'<div class="empty">No students currently flagged — nice work!</div>';
}
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
    return `<tr><td data-label="#">${i+1}</td><td data-label="Student ID">${esc(s.id)}</td><td data-label="Name"><b class="name-link" onclick="openProfileModal('${escAttr(s.id)}')">${esc(s.name)}</b></td><td data-label="Gender">${esc(s.gender)}</td><td data-label="Section">${esc(s.section)}</td><td data-label="Year Level">${esc(s.year)}</td><td data-label="Contact">${esc(s.contact||"—")}</td><td data-label="Status"><span class="status ${active?"present":"dropped"}">${active?"Active":"Dropped"}</span></td><td data-label="Dropped On">${droppedOn}</td><td class="actions" data-label="Actions"><button class="secondary" onclick="editStudent('${escAttr(s.id)}')">Edit</button>${dropBtn}<button class="danger" onclick="deleteStudent('${escAttr(s.id)}')">Delete</button></td></tr>`;
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
  document.getElementById("reportsTable").innerHTML=rows.map(r=>`<tr><td data-label="Date">${r.date}</td><td data-label="Student ID">${esc(r.id)}</td><td data-label="Name"><b class="name-link" onclick="openProfileModal('${escAttr(r.id)}')">${esc(r.name)}</b></td><td data-label="Section">${esc(r.section)}</td><td data-label="Status">${statusPill(r.status)}</td></tr>`).join("")||'<tr><td colspan="5" class="empty">No attendance records match the selected filters.</td></tr>';
  updateSortIndicators("reportsTableEl",sortState.reports);
}
document.getElementById("reportFrom").onchange=renderReports;document.getElementById("reportTo").onchange=renderReports;document.getElementById("reportSection").onchange=renderReports;document.getElementById("reportStatus").onchange=renderReports;

function xlsxReady(){if(typeof XLSX==="undefined"){alert("Excel export requires an internet connection for the spreadsheet library. You can still use the system and make a JSON backup.");return false}return true}
function gradingComputationRows(){
  const comps=activeComponents();
  return comps.map(c=>({Component:c.label,"Weight (%)":Number(c.weight),Calculation:c.auto?"Automatically calculated from attendance records":`(${c.items.map((l,i)=>`${l} /${c.max[i]}`).join(" + ")}) ÷ ${c.max.reduce((a,b)=>a+b,0)} total points × 100 × ${Number(c.weight)}%`})).concat([{Component:"TOTAL","Weight (%)":comps.reduce((a,c)=>a+Number(c.weight),0),Calculation:"Final Grade = weighted sum of all components"}]);
}
function appendGradingSheet(wb){XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(gradingComputationRows()),"Grading Computation");}
function downloadXlsx(rows,name,sheet="Report"){
  if(!xlsxReady())return;
  if(!rows.length)return alert("There is no data to export.");
  const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,sheet);appendGradingSheet(wb);XLSX.writeFile(wb,`${name}_${todayISO()}.xlsx`);
}
function exportAttendanceFiltered(){
  const date=document.getElementById("attendanceDate").value||todayISO(),sec=document.getElementById("attendanceSection").value,search=document.getElementById("attendanceSearch").value,rec=db.attendance[date]||{};
  const students=getFilteredStudents(sec,search);
  const rows=students.map(s=>({Date:date,"Student ID":s.id,"Student Name":s.name,Section:s.section,"Year Level":s.year,Contact:s.contact||"",Status:rec[s.id]||"Unmarked","Attendance %":computeAttendanceScore(s.id).toFixed(2),"Final Grade":computeAverage(s.id).toFixed(2),Standing:getStanding(s.id)}));
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
    GRADE_COMPONENTS.filter(c=>!c.auto).forEach(c=>{const it=getItems(s.id,c.key);c.items.forEach((lab,i)=>o[`${lab} (/${c.max[i]})`]=it[i]);o[c.label+" (%)"]=getScore(s.id,c.key)});
    if(attendanceGradeOn())o["Attendance"]=computeAttendanceScore(s.id).toFixed(2);
    o["Plus Points"]=getScore(s.id,"bonus");o["Total"]=computeTotal(s.id).toFixed(2);o["Average"]=computeAverage(s.id).toFixed(2);o["Standing"]=getStanding(s.id);
    return o;
  });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(gradesRows.length?gradesRows:[{"Student ID":""}]),"Grades");
  appendGradingSheet(wb);
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
    GRADE_COMPONENTS.filter(c=>!c.auto).forEach(c=>o[c.label]=getScore(s.id,c.key));
    if(attendanceGradeOn())o["Attendance"]=computeAttendanceScore(s.id).toFixed(2);
    o["Plus Points"]=getScore(s.id,"bonus");o["Total"]=computeTotal(s.id).toFixed(2);o["Average"]=computeAverage(s.id).toFixed(2);o["Standing"]=getStanding(s.id);
    return o;
  });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(gradesRows.length?gradesRows:[{"Student ID":""}]),"Grades");
  appendGradingSheet(wb);
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
function renderGradingSettingsUI(){
  const grid=document.getElementById("gradeWeightGrid"),formula=document.getElementById("gradeFormulaText");
  if(!grid)return;
  const all=getAllGradeComponents(),comps=all.filter(c=>c.enabled);
  grid.innerHTML=all.map(c=>c.enabled
    ?`<div><b>${esc(c.label)}</b><span>${Number(c.weight)}%</span>${c.auto?"":`<small class="muted">${c.max.reduce((a,b)=>a+b,0)} pts • ${c.items.length} item${c.items.length===1?"":"s"}</small>`}</div>`
    :`<div class="is-off"><b>${esc(c.label)}</b><span>Off</span><small class="muted">Not counted</small></div>`).join("");
  if(formula)formula.textContent=comps.map(c=>`${c.label} × ${Number(c.weight)}%`).join(" + ")+". Each component = total score ÷ highest possible total × 100. Teachers can set the highest score of every item (10, 20, 50, 100 or any value). The weights of the components that are On add up to 100, so the Final Grade is out of 100. Attendance is calculated automatically from attendance records.";
}
function openGradingSettings(){
  const box=document.getElementById("gradingInputs");if(!box)return;
  box.innerHTML=getAllGradeComponents().map(c=>{
    const sub=c.auto?"Auto-calculated from attendance":esc(c.items.join(" + "));
    const toggle=c.optional?`<label class="cfg-toggle"><input type="checkbox" data-enable-key="${c.key}" ${c.enabled?"checked":""}><span>${c.enabled?"On":"Off"}</span></label>`:"";
    const maxes=c.auto?"":`<div class="cfg-max"><div class="cfg-max-head"><span>Highest possible score per item</span><select class="cfg-preset" data-preset-key="${c.key}" aria-label="Quick set highest score for ${escAttr(c.label)}"><option value="">Quick set…</option><option value="10">All items out of 10</option><option value="20">All items out of 20</option><option value="50">All items out of 50</option><option value="100">All items out of 100</option></select></div><div class="cfg-max-grid">${c.items.map((lab,i)=>`<label>${esc(lab)}<input type="number" min="1" step="1" data-max-key="${c.key}" data-max-idx="${i}" value="${c.max[i]}"></label>`).join("")}</div></div>`;
    return `<div class="grade-cfg ${c.enabled?"":"is-off"}"><div class="cfg-head"><span class="cfg-title"><b>${esc(c.label)}</b><small>${sub}</small></span>${toggle}<div class="weight-input"><input type="number" min="0" max="100" step="0.01" data-weight-key="${c.key}" value="${Number(c.weight)}" ${c.enabled?"":"disabled"}><b>%</b></div></div>${maxes}</div>`;
  }).join("");
  updateGradingTotal();document.getElementById("gradingSettingsModal").classList.remove("hidden");
}
(function bindGradingEditor(){
  const box=document.getElementById("gradingInputs");if(!box)return;
  box.addEventListener("input",e=>{if(e.target.matches("[data-weight-key]"))updateGradingTotal()});
  box.addEventListener("change",e=>{
    const t=e.target;
    if(t.matches("[data-enable-key]")){
      const cfg=t.closest(".grade-cfg"),w=cfg.querySelector("[data-weight-key]");
      w.disabled=!t.checked;cfg.classList.toggle("is-off",!t.checked);t.nextElementSibling.textContent=t.checked?"On":"Off";
      if(t.checked&&!(Number(w.value)>0))w.value=componentDef(t.dataset.enableKey)?.weight||10;
      autoBalanceWeights();
    }else if(t.matches("[data-preset-key]")&&t.value){
      box.querySelectorAll(`[data-max-key="${t.dataset.presetKey}"]`).forEach(i=>i.value=t.value);t.value="";
    }
  });
})();
function autoBalanceWeights(){
  const ins=[...document.querySelectorAll("#gradingInputs [data-weight-key]")].filter(i=>!i.disabled);
  if(!ins.length)return;
  const vals=ins.map(i=>Math.max(0,Number(i.value)||0)),sum=vals.reduce((a,b)=>a+b,0);
  const out=vals.map(v=>sum>0?Math.round(v*10000/sum)/100:Math.round(10000/ins.length)/100);
  const diff=Math.round((100-out.reduce((a,b)=>a+b,0))*100)/100;
  if(diff){const k=out.indexOf(Math.max(...out));out[k]=Math.round((out[k]+diff)*100)/100}
  ins.forEach((i,n)=>i.value=out[n]);updateGradingTotal();
}
function updateGradingTotal(){
  const inputs=[...document.querySelectorAll("#gradingInputs input[data-weight-key]")].filter(i=>!i.disabled);
  const total=inputs.reduce((a,i)=>a+Number(i.value||0),0);
  const el=document.getElementById("gradingTotal");if(!el)return;
  el.textContent=`Total Weight (components that are On): ${total.toFixed(2)}% ${Math.abs(total-100)<0.001?"✓ Ready to save":"• Must equal 100% — use Auto-balance"}`;
  el.classList.toggle("valid",Math.abs(total-100)<0.001);el.classList.toggle("invalid",Math.abs(total-100)>=0.001);
}
function resetGradingWeights(){
  const d=defaultGradeWeights();
  document.querySelectorAll("#gradingInputs .grade-cfg").forEach(cfg=>{
    cfg.classList.remove("is-off");
    const w=cfg.querySelector("[data-weight-key]");w.disabled=false;w.value=d[w.dataset.weightKey]??0;
    const t=cfg.querySelector("[data-enable-key]");if(t){t.checked=true;t.nextElementSibling.textContent="On"}
    cfg.querySelectorAll("[data-max-key]").forEach(i=>i.value=100);
  });
  updateGradingTotal();
}
function saveGradingSettings(){
  const weights={},enabled={},maxes={};let total=0,bad=false;
  document.querySelectorAll("#gradingInputs input[data-weight-key]").forEach(i=>{const v=Math.max(0,Math.min(100,Number(i.value||0)));weights[i.dataset.weightKey]=v;if(!i.disabled)total+=v});
  document.querySelectorAll("#gradingInputs input[data-enable-key]").forEach(t=>enabled[t.dataset.enableKey]=t.checked);
  document.querySelectorAll("#gradingInputs input[data-max-key]").forEach(i=>{const v=parseFloat(i.value);if(!(v>0))bad=true;(maxes[i.dataset.maxKey]??=[])[Number(i.dataset.maxIdx)]=v});
  if(bad)return alert("Every item needs a highest possible score greater than 0 (for example 10, 20, 50 or 100).");
  if(Math.abs(total-100)>0.001){alert(`Grading weights of the components that are On must total exactly 100%. Current total: ${total.toFixed(2)}%.`);return}
  let over=0;
  Object.keys(db.grades).forEach(id=>Object.keys(maxes).forEach(k=>{if(db.grades[id][k]===undefined)return;if(rawItems(id,k).some((v,i)=>v>maxes[k][i]))over++}));
  if(over&&!confirm(`${over} saved score record${over===1?"":"s"} ${over===1?"is":"are"} higher than the new highest possible score. Those scores will be lowered to the new maximum. Continue?`))return;
  if(over)Object.keys(db.grades).forEach(id=>Object.keys(maxes).forEach(k=>{if(db.grades[id][k]===undefined)return;const raw=rawItems(id,k);if(raw.some((v,i)=>v>maxes[k][i]))db.grades[id][k]=raw.map((v,i)=>Math.min(v,maxes[k][i]))}));
  db.settings.gradeWeights=weights;db.settings.gradeEnabled=enabled;db.settings.gradeMax=maxes;
  saveDB();refreshGradeComponents();renderGradingSettingsUI();renderGrades();renderDashboard();closeModal("gradingSettingsModal");toast("Grading computation updated");
}
function applyTheme(theme){
  theme=theme==="light"?"light":"dark";
  db.settings=db.settings||{};
  db.settings.theme=theme;
  document.documentElement.dataset.theme=theme;
  const meta=document.getElementById("themeColorMeta");
  if(meta)meta.setAttribute("content",theme==="dark"?"#0d1411":"#0caf57");
  const isDark=theme==="dark";
  const label=isDark?"Switch to light mode":"Switch to dark mode";
  document.querySelectorAll("[data-theme-action]").forEach(b=>{b.innerHTML=isDark?SUN_ICON:MOON_ICON;b.title=label;b.setAttribute("aria-label",label);b.setAttribute("aria-pressed",String(isDark));});
  const b=document.getElementById("themeToggle");
  if(b){b.innerHTML=isDark?SUN_ICON:MOON_ICON;b.title=label;b.setAttribute("aria-label",label);b.setAttribute("aria-pressed",String(isDark));}
}
function toggleTheme(){
  const current=document.documentElement.dataset.theme==="dark"?"dark":"light";
  const next=current==="dark"?"light":"dark";
  db.settings.theme=next;saveDB();applyTheme(next);
  toast(next==="dark"?"Dark mode enabled":"Light mode enabled");
}
function initThemeControls(){
  document.querySelectorAll("[data-theme-action]").forEach(b=>{
    if(b.dataset.bound)return;
    b.dataset.bound="1";
    b.addEventListener("click",toggleTheme);
  });
  const b=document.getElementById("themeToggle");
  if(b&&!b.dataset.bound){b.dataset.bound="1";b.addEventListener("click",toggleTheme)}
}

function initMobileNavigation(){
  const btn=document.getElementById("mobileMenuBtn"),sidebar=document.getElementById("sidebar"),backdrop=document.getElementById("sidebarBackdrop");
  if(!btn||!sidebar||!backdrop||btn.dataset.bound)return;
  btn.dataset.bound="1";
  const close=()=>{sidebar.classList.remove("mobile-open");backdrop.classList.add("hidden");btn.setAttribute("aria-expanded","false");document.body.classList.remove("nav-open")};
  btn.addEventListener("click",()=>{const open=sidebar.classList.toggle("mobile-open");backdrop.classList.toggle("hidden",!open);btn.setAttribute("aria-expanded",String(open));document.body.classList.toggle("nav-open",open)});
  backdrop.addEventListener("click",close);
  document.querySelectorAll(".nav").forEach(n=>n.addEventListener("click",()=>{if(window.innerWidth<=900)close()}));
}


function saveSettings(){
  const school=document.getElementById("schoolName").value.trim()||"BCC Student",name=document.getElementById("adminNameSetting").value.trim()||"Administrator";
  const academicYear=document.getElementById("academicYearSetting")?.value.trim()||"2026 - 2027";
  const academicTerm=document.getElementById("academicTermSetting")?.value||"1st Semester";
  db.settings.schoolName=school;db.settings.adminName=name;db.settings.academicYear=academicYear;db.settings.academicTerm=academicTerm;saveDB();
  document.getElementById("adminDisplay").textContent=name;document.getElementById("adminAvatar").textContent=name.charAt(0).toUpperCase();renderAcademicPeriod();toast("Settings saved");
}
function closeModal(id){document.getElementById(id).classList.add("hidden")}
window.addEventListener("keydown",e=>{
  if(e.key==="Escape"){closeModal("studentModal");closeModal("sectionModal");closeModal("importModal");closeModal("gradeImportModal");closeModal("scoreModal");closeModal("profileModal");closeModal("gradingSettingsModal")}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();const q=document.getElementById("gradeSearch");if(q&&!document.getElementById("grades").classList.contains("hidden")){q.focus();q.select()}}
});

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


/* Attendance schedule settings (days per week by Year Level and Section) ---------- */
let scheduleDraft=null;
function scheduleYears(){
  const base=["1st Year","2nd Year","3rd Year","4th Year"];
  const opts=[...document.querySelectorAll("#sYear option")].map(o=>o.value);
  const used=new Set(db.students.map(s=>s.year));
  return base.concat(opts.filter(y=>!base.includes(y)&&used.has(y)));
}
function renderAttendanceScheduleSummary(){
  const box=document.getElementById("attendanceScheduleSummary");if(!box)return;
  const sch=db.settings.attendanceSchedule;
  const items=[`<div><b>Default</b><span>${esc(scheduleLabel(sch.default))}</span></div>`]
    .concat(Object.keys(sch.years).sort().map(k=>`<div><b>${esc(k)}</b><span>${esc(scheduleLabel(sch.years[k]))}</span></div>`))
    .concat(Object.keys(sch.sections).sort((a,b)=>a.localeCompare(b)).map(k=>`<div><b>${esc(k)}</b><span>${esc(scheduleLabel(sch.sections[k]))}</span></div>`));
  box.innerHTML=items.join("");
}
function dayChips(scope,name,days){
  return DAY_ORDER.map(d=>`<label class="day-chip ${days.includes(d)?"on":""}"><input type="checkbox" class="sched-day" data-scope="${scope}" data-name="${escAttr(name)}" data-day="${d}" ${days.includes(d)?"checked":""}><span>${DAY_SHORT[d]}</span></label>`).join("");
}
function scheduleRow(scope,name,title,days,custom,note){
  return `<div class="sched-row"><div class="sched-name"><b>${esc(title)}</b><small>${custom?"Custom":note}</small></div><div class="sched-days">${dayChips(scope,name,days)}</div><select class="sched-preset" data-scope="${scope}" data-name="${escAttr(name)}" aria-label="Preset for ${escAttr(title)}"><option value="">Preset…</option><option value="mf">Mon–Fri</option><option value="ms">Mon–Sat</option><option value="msu">Mon–Sun</option>${scope==="default"?"":'<option value="inherit">Reset (inherit)</option>'}</select></div>`;
}
function renderScheduleEditor(){
  const box=document.getElementById("attendanceScheduleInputs");if(!box)return;
  const d=scheduleDraft,def=d.default;
  const secs=db.sections.slice().sort((a,b)=>a.name.localeCompare(b.name));
  box.innerHTML=`<div class="sched-group"><h4>Default (all students)</h4>${scheduleRow("default","","All students",def,true,"")}</div>`
    +`<div class="sched-group"><h4>By Year Level</h4>${scheduleYears().map(y=>scheduleRow("years",y,y,d.years[y]||def,!!d.years[y],"Uses default")).join("")}</div>`
    +`<div class="sched-group"><h4>By Section (A–Z) — overrides Year Level</h4>${secs.length?secs.map(s=>scheduleRow("sections",s.name,s.name,d.sections[s.name]||def,!!d.sections[s.name],"Uses Year Level / default")).join(""):'<p class="muted">No sections yet. Add sections first.</p>'}</div>`;
}
function openAttendanceSchedule(){
  scheduleDraft=clone(db.settings.attendanceSchedule);
  renderScheduleEditor();
  document.getElementById("attendanceScheduleModal").classList.remove("hidden");
}
function setDraftDays(scope,name,days){
  if(scope==="default")scheduleDraft.default=days;
  else if(days===null)delete scheduleDraft[scope][name];
  else scheduleDraft[scope][name]=days;
}
function effectiveDraftDays(scope,name){
  if(scope==="default")return scheduleDraft.default;
  return scheduleDraft[scope][name]||scheduleDraft.default;
}
(function bindScheduleEditor(){
  const box=document.getElementById("attendanceScheduleInputs");if(!box)return;
  box.addEventListener("change",e=>{
    const t=e.target,scope=t.dataset.scope,name=t.dataset.name;
    if(t.classList.contains("sched-day")){
      const day=Number(t.dataset.day);let days=effectiveDraftDays(scope,name).slice();
      days=t.checked?[...new Set([...days,day])]:days.filter(x=>x!==day);
      if(!days.length){toast("At least one class day is required");renderScheduleEditor();return}
      setDraftDays(scope,name,days.sort());renderScheduleEditor();
    }else if(t.classList.contains("sched-preset")&&t.value){
      const P={mf:[1,2,3,4,5],ms:[1,2,3,4,5,6],msu:[0,1,2,3,4,5,6]};
      setDraftDays(scope,name,t.value==="inherit"?null:P[t.value].slice());renderScheduleEditor();
    }
  });
})();
function saveAttendanceSchedule(){
  db.settings.attendanceSchedule=scheduleDraft;ensureGradeSettings();saveDB();
  closeModal("attendanceScheduleModal");renderAttendanceScheduleSummary();renderAttendance();renderGrades();renderDashboard();
  toast("Attendance schedule updated — attendance grades recalculated");
}
