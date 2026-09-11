(() => {
const KEY="cea_cards_state_v2", OLDKEY="cea_cards_state_v1", DAY=86400000;
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const now=()=>Date.now(), today=()=>new Date().toISOString().slice(0,10);
const uid=()=>crypto.randomUUID?crypto.randomUUID():"id-"+Date.now()+"-"+Math.random().toString(36).slice(2);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const strip=s=>{const d=document.createElement("div");d.innerHTML=s||"";return d.textContent||""};
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));

function freshState(){
  const starter=window.CEA_STARTER?.cards||[];
  const names=[...new Set(starter.map(c=>c.deck))];
  const decks=names.map(name=>({id:uid(),name,createdAt:now()}));
  const map=Object.fromEntries(decks.map(d=>[d.name,d.id]));
  const cards=starter.map((s,i)=>({
    id:s.id||uid(),deckId:map[s.deck],front:s.front,back:s.back,tags:s.tags||"",
    source:s.source||"",state:"new",due:0,interval:0,stability:0,difficulty:clamp(Number(s.difficulty||2)+2,1,10),
    reps:0,lapses:0,lastReview:0,createdAt:now()+i,updatedAt:now()+i
  }));
  return {version:2,decks,cards,reviews:[],settings:{newLimit:30,reviewLimit:300,targetRetention:.90},lastReview:null};
}
function migrateV1(old){
  if(!old||!old.cards)return freshState();
  old.version=2;
  old.settings=Object.assign({newLimit:30,reviewLimit:300,targetRetention:.90},old.settings||{});
  old.cards.forEach(c=>{
    c.stability=Number(c.stability||Math.max(0,c.interval||0));
    c.difficulty=Number(c.difficulty||5);
    c.lastReview=Number(c.lastReview||0);
  });
  return old;
}
function load(){
  try{const x=localStorage.getItem(KEY);if(x)return JSON.parse(x);
      const old=localStorage.getItem(OLDKEY);return old?migrateV1(JSON.parse(old)):freshState();}
  catch(e){return freshState();}
}
let state=load(); const save=()=>localStorage.setItem(KEY,JSON.stringify(state));

function elapsedDays(c){return c.lastReview?Math.max(0,(now()-c.lastReview)/DAY):0}
function retrievability(c){
  if(c.state==="new"||!c.stability)return 1;
  return 1/(1+elapsedDays(c)/(9*Math.max(.05,c.stability)));
}
function intervalForStability(S){
  const R=clamp(Number(state.settings.targetRetention||.9),.8,.97);
  return Math.max(1,Math.round(9*S*(1/R-1)));
}
function fmtInterval(days){
  if(days<1/24)return Math.max(1,Math.round(days*24*60))+"m";
  if(days<1)return Math.max(1,Math.round(days*24))+"h";
  if(days<30)return Math.round(days)+"d";
  if(days<365)return Math.round(days/30)+"mo";
  return (days/365).toFixed(1)+"y";
}
function preview(c,rating){
  if(rating===1)return {delay:1/1440,label:"1m",S:Math.max(.15,c.stability*.45||.15),D:clamp((c.difficulty||5)+.8,1,10)};
  if(c.state==="new"||!c.stability){
    const init={2:.7,3:2.5,4:5.5}[rating];
    const S=init*(11-(c.difficulty||5))/6;
    const days=rating===2?10/1440:intervalForStability(S);
    return {delay:days,label:fmtInterval(days),S,D:clamp((c.difficulty||5)-.25*(rating-3),1,10)};
  }
  const R=retrievability(c), D=c.difficulty||5, S=Math.max(.15,c.stability);
  const rf={2:.55,3:1,4:1.35}[rating];
  const growth=1+rf*(11-D)*Math.pow(S,-.18)*(Math.exp(1.6*(1-R))-1);
  const newS=Math.max(S*(rating===2?1.05:growth),S+.05);
  const newD=clamp(D-.35*(rating-3)+.04*(5-D),1,10);
  const days=intervalForStability(newS);
  return {delay:days,label:fmtInterval(days),S:newS,D:newD};
}
function schedule(c,rating){
  const p=preview(c,rating), before=JSON.parse(JSON.stringify(c));
  c.reps=(c.reps||0)+1;c.lastReview=now();c.updatedAt=now();c.difficulty=p.D;c.stability=p.S;
  if(rating===1){c.lapses=(c.lapses||0)+1;c.state="learning";}
  else c.state="review";
  c.interval=p.delay;c.due=now()+p.delay*DAY;
  state.lastReview={card:before,reviewCount:state.reviews.length};
  state.reviews.push({id:uid(),cardId:c.id,deckId:c.deckId,rating,at:now(),retrievability:retrievability(before),after:{stability:c.stability,difficulty:c.difficulty,interval:c.interval}});
  save();
}
function dueFor(deckId=null){
  const t=now(), cs=state.cards.filter(c=>!deckId||c.deckId===deckId);
  const review=cs.filter(c=>c.state!=="new"&&c.due<=t).sort((a,b)=>a.due-b.due).slice(0,state.settings.reviewLimit);
  const news=cs.filter(c=>c.state==="new").sort((a,b)=>a.createdAt-b.createdAt).slice(0,state.settings.newLimit);
  return [...review,...news];
}
function weakest(limit=40){
  return state.cards.slice().sort((a,b)=>{
    const score=c=>(c.lapses||0)*3+(c.difficulty||5)+(1-retrievability(c))*4-(c.state==="new"?2:0);
    return score(b)-score(a);
  }).slice(0,limit);
}
function retentionText(){
  const rs=state.reviews.slice(-250); if(!rs.length)return "—";
  return Math.round(100*rs.filter(r=>r.rating>1).length/rs.length)+"%";
}
function masteryOf(cs){
  if(!cs.length)return 0;
  return cs.reduce((s,c)=>s+(c.state==="new"?0:clamp((c.stability||0)/21,0,1)),0)/cs.length;
}
function switchView(v){
  $$(".view").forEach(x=>x.classList.remove("active"));$("#view-"+v).classList.add("active");
  $$(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===v));
  if(v==="decks")renderDecks();if(v==="browse")renderBrowse();if(v==="stats")renderStats();
  if(v==="study"&&!study.queue.length)startStudy();
}
function renderDecks(){
  const list=$("#deckList");list.innerHTML="";
  state.decks.forEach(d=>{
    const cs=state.cards.filter(c=>c.deckId===d.id), due=cs.filter(c=>c.state!=="new"&&c.due<=now()).length, fresh=cs.filter(c=>c.state==="new").length;
    const m=Math.round(masteryOf(cs)*100);
    const el=document.createElement("div");el.className="deck";
    el.innerHTML=`<div><h4>${esc(d.name)}</h4><p>${cs.length} cartes · maîtrise ${m}%</p><div class="counts"><span class="pill">${due} dues</span><span class="pill">${fresh} nouvelles</span></div></div><button class="primary deck-study" data-id="${d.id}" type="button">Étudier</button>`;
    list.appendChild(el);
  });
  $$(".deck-study").forEach(b=>b.addEventListener("click",()=>startStudy(b.dataset.id)));
  $("#dueCount").textContent=state.cards.filter(c=>c.state!=="new"&&c.due<=now()).length;
  $("#newCount").textContent=state.cards.filter(c=>c.state==="new").length;
  $("#retentionMini").textContent=retentionText();
  $("#masteryMini").textContent=Math.round(masteryOf(state.cards)*100)+"%";
}
let study={queue:[],index:0,revealed:false,label:"Tous les decks"};
function startStudy(deckId=null,mode="due"){
  study.queue=mode==="weak"?weakest(40):dueFor(deckId);study.index=0;study.revealed=false;
  study.label=mode==="weak"?"Faiblesses":(state.decks.find(d=>d.id===deckId)?.name||"Tous les decks");
  switchView("study");showCard();
}
function current(){return study.queue[study.index]||null}
function showCard(){
  const c=current(), empty=!c;$("#studyEmpty").classList.toggle("hidden",!empty);$("#studyArea").classList.toggle("hidden",empty);
  if(empty)return;
  $("#studyDeckName").textContent=study.label;$("#studyState").textContent=c.state==="new"?"NOUVELLE":c.state.toUpperCase();
  $("#studyProgress").textContent=`${study.index+1} / ${study.queue.length}`;
  $("#retrievability").textContent=c.state==="new"?"nouvelle":Math.round(retrievability(c)*100)+"%";
  $("#cardFront").innerHTML=c.front;$("#cardBack").innerHTML=c.back;$("#cardBack").classList.add("hidden");
  $("#showAnswerBtn").classList.remove("hidden");$("#gradeRow").classList.add("hidden");study.revealed=false;
}
function reveal(){
  const c=current();if(!c)return;$("#cardBack").classList.remove("hidden");$("#showAnswerBtn").classList.add("hidden");$("#gradeRow").classList.remove("hidden");
  [1,2,3,4].forEach(r=>$("#i"+r).textContent=preview(c,r).label);study.revealed=true;
}
function grade(r){const c=current();if(!c)return;schedule(c,Number(r));study.index++;showCard()}
function undo(){
  if(!state.lastReview)return;const old=state.lastReview.card, idx=state.cards.findIndex(c=>c.id===old.id);if(idx>=0)state.cards[idx]=old;
  state.reviews=state.reviews.slice(0,state.lastReview.reviewCount);state.lastReview=null;save();startStudy(null);
}
function deckOptions(){
  const opts=state.decks.map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join("");
  $("#cardDeck").innerHTML=opts;$("#deckFilter").innerHTML='<option value="">Tous les decks</option>'+opts;
}
function renderBrowse(){
  deckOptions();const q=$("#searchCards").value.trim().toLowerCase(),df=$("#deckFilter").value;const list=$("#cardList");list.innerHTML="";
  const rows=state.cards.filter(c=>(!df||c.deckId===df)&&(!q||(strip(c.front)+" "+strip(c.back)+" "+c.tags).toLowerCase().includes(q))).slice(0,500);
  rows.forEach(c=>{const d=state.decks.find(x=>x.id===c.deckId);const b=document.createElement("button");b.className="card-row";b.type="button";
    b.innerHTML=`<h4>${esc(strip(c.front).slice(0,120))}</h4><p>${esc(strip(c.back).slice(0,150))}</p><div class="meta">${esc(d?.name||"")} · ${c.state} · D ${Number(c.difficulty||5).toFixed(1)} · S ${Number(c.stability||0).toFixed(1)}d</div>`;
    b.addEventListener("click",()=>openCard(c.id));list.appendChild(b)});
  if(!rows.length)list.innerHTML='<div class="empty"><p>Aucune carte.</p></div>';
}
function openCard(id=null){
  deckOptions();const c=id?state.cards.find(x=>x.id===id):null;$("#cardDialogTitle").textContent=c?"Modifier":"Nouvelle carte";$("#editCardId").value=c?.id||"";
  $("#cardDeck").value=c?.deckId||state.decks[0]?.id||"";$("#frontInput").value=c?strip(c.front):"";$("#backInput").value=c?strip(c.back):"";$("#tagsInput").value=c?.tags||"";$("#deleteCardBtn").classList.toggle("hidden",!c);$("#cardDialog").showModal();
}
function saveCard(){
  const id=$("#editCardId").value,f=$("#frontInput").value.trim(),b=$("#backInput").value.trim();if(!f||!b)return;
  if(id){const c=state.cards.find(x=>x.id===id);Object.assign(c,{deckId:$("#cardDeck").value,front:esc(f).replace(/\n/g,"<br>"),back:esc(b).replace(/\n/g,"<br>"),tags:$("#tagsInput").value.trim(),updatedAt:now()})}
  else state.cards.push({id:uid(),deckId:$("#cardDeck").value,front:esc(f).replace(/\n/g,"<br>"),back:esc(b).replace(/\n/g,"<br>"),tags:$("#tagsInput").value.trim(),state:"new",due:0,interval:0,stability:0,difficulty:5,reps:0,lapses:0,lastReview:0,createdAt:now(),updatedAt:now()});
  save();renderBrowse();renderDecks();
}
function deleteCard(){const id=$("#editCardId").value;if(!id)return;state.cards=state.cards.filter(c=>c.id!==id);save();$("#cardDialog").close();renderBrowse();renderDecks()}
function newDeck(){const n=$("#deckNameInput").value.trim();if(!n)return;state.decks.push({id:uid(),name:n,createdAt:now()});save();$("#deckNameInput").value="";renderDecks()}
function parseTSV(t){return t.replace(/^\uFEFF/,"").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>{const p=l.split("\t");return p.length>=2?{front:p[0],back:p[1],tags:p[2]||""}:null}).filter(Boolean)}
async function importTSV(file){
  const xs=parseTSV(await file.text());if(!xs.length){alert("Aucune carte valide.");return}const name=prompt("Nom du deck :",file.name.replace(/\.[^.]+$/,""))||"Import";const d={id:uid(),name,createdAt:now()};state.decks.push(d);
  xs.forEach(x=>state.cards.push({id:uid(),deckId:d.id,front:x.front,back:x.back,tags:x.tags,state:"new",due:0,interval:0,stability:0,difficulty:5,reps:0,lapses:0,lastReview:0,createdAt:now(),updatedAt:now()}));save();renderDecks();alert(xs.length+" cartes importées.");
}
function renderStats(){
  const rs=state.reviews, t=today();$("#studiedToday").textContent=rs.filter(r=>new Date(r.at).toISOString().slice(0,10)===t).length;$("#retention").textContent=retentionText();$("#mastery").textContent=Math.round(masteryOf(state.cards)*100)+"%";
  const dates=[...new Set(rs.map(r=>new Date(r.at).toISOString().slice(0,10)))].sort().reverse();let streak=0,d=new Date();for(let i=0;i<365;i++){const k=d.toISOString().slice(0,10);if(dates.includes(k))streak++;else if(i>0)break;d=new Date(d.getTime()-DAY)}$("#streak").textContent=streak;
  const dm=$("#deckMastery");dm.innerHTML=state.decks.map(d=>{const cs=state.cards.filter(c=>c.deckId===d.id),m=Math.round(masteryOf(cs)*100);return `<div class="bar-row"><span>${esc(d.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${m}%"></div></div><b>${m}%</b></div>`}).join("");
  const bins=[["New",c=>c.state==="new"],["≤1d",c=>c.state!=="new"&&c.interval<=1],["2–7d",c=>c.interval>1&&c.interval<=7],["8–30d",c=>c.interval>7&&c.interval<=30],[">30d",c=>c.interval>30]], vals=bins.map(([n,f])=>[n,state.cards.filter(f).length]),mx=Math.max(1,...vals.map(v=>v[1]));
  $("#intervalBars").innerHTML=vals.map(([n,v])=>`<div class="bar-row"><span>${n}</span><div class="bar-track"><div class="bar-fill" style="width:${100*v/mx}%"></div></div><b>${v}</b></div>`).join("");
  $("#newLimit").value=state.settings.newLimit;$("#reviewLimit").value=state.settings.reviewLimit;$("#targetRetention").value=String(state.settings.targetRetention||.9);
}
function exportBackup(){const b=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="cea-cards-"+today()+".json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
async function restore(file){try{const x=JSON.parse(await file.text());if(!x.cards||!x.decks)throw 0;state=migrateV1(x);save();renderDecks();renderBrowse();renderStats();alert("Sauvegarde restaurée.")}catch(e){alert("Sauvegarde invalide.")}}

$$(".nav-btn").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.view)));
$("#studyAllBtn").addEventListener("click",()=>startStudy());$("#weakBtn").addEventListener("click",()=>startStudy(null,"weak"));$("#studyBack").addEventListener("click",()=>switchView("decks"));$("#studyEmptyBack").addEventListener("click",()=>switchView("decks"));
$("#showAnswerBtn").addEventListener("click",reveal);$("#flashcard").addEventListener("click",()=>{if(!study.revealed)reveal()});$$(".grade").forEach(b=>b.addEventListener("click",()=>grade(b.dataset.grade)));$("#undoBtn").addEventListener("click",undo);
$("#newDeckBtn").addEventListener("click",()=>$("#deckDialog").showModal());$("#deckForm").addEventListener("submit",e=>{if(e.submitter?.value==="default")newDeck()});
$("#addCardBtn").addEventListener("click",()=>openCard());$("#cardForm").addEventListener("submit",e=>{if(e.submitter?.id==="saveCardBtn")saveCard()});$("#deleteCardBtn").addEventListener("click",deleteCard);
$("#searchCards").addEventListener("input",renderBrowse);$("#deckFilter").addEventListener("change",renderBrowse);$("#tsvImport").addEventListener("change",e=>{const f=e.target.files[0];if(f)importTSV(f);e.target.value=""});
$("#saveSettings").addEventListener("click",()=>{state.settings.newLimit=clamp(Number($("#newLimit").value)||0,0,250);state.settings.reviewLimit=clamp(Number($("#reviewLimit").value)||0,0,9999);state.settings.targetRetention=clamp(Number($("#targetRetention").value)||.9,.8,.97);save();renderStats();renderDecks();alert("Réglages enregistrés.")});
$("#exportBtn").addEventListener("click",exportBackup);$("#restoreInput").addEventListener("change",e=>{const f=e.target.files[0];if(f)restore(f);e.target.value=""});
$("#installBtn").addEventListener("click",()=>$("#installDialog").showModal());$("#closeInstall").addEventListener("click",()=>$("#installDialog").close());
window.addEventListener("keydown",e=>{if(!$("#view-study").classList.contains("active")||e.target.matches("input,textarea,select"))return;if(e.code==="Space"&&!study.revealed){e.preventDefault();reveal()}if(study.revealed&&/^Digit[1-4]$/.test(e.code))grade(Number(e.code.slice(-1)))});
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});

// ===== Official annales exam mode =====
const EXAM_KEY="cea_cards_exam_state_v1";
const OFFICIAL_EXAMS=[
 {year:2023,date:"26 septembre 2023",questions:56,pdf:"https://www.institut-du-risk-management.fr/wp-content/uploads/2024/02/Sujet-QCM-2023.pdf",note:"Sujet officiel IRM — QCM de sélection 2023",sectionOrder:["finance","vie","stats","nonvie"]},
 {year:2024,date:"24 septembre 2024",questions:56,pdf:"https://www.institut-du-risk-management.fr/wp-content/uploads/2025/04/Annales-QCM-CEA-2025.pdf",note:"Sujet officiel IRM — épreuve du 24 septembre 2024",sectionOrder:["finance","stats","nonvie","vie"]},
 {year:2025,date:"23 septembre 2025",questions:56,pdf:"https://www.institut-du-risk-management.fr/wp-content/uploads/2026/04/Sujet-QCM-2025.pdf",note:"Sujet officiel IRM — QCM de sélection 2025",sectionOrder:["finance","stats","nonvie","vie"]}
];
const SECTION_NAMES={finance:"Maths financières",stats:"Statistiques",nonvie:"Non-vie",vie:"Vie"};
let examStore=(()=>{try{return JSON.parse(localStorage.getItem(EXAM_KEY)||'{"attempts":[],"drafts":{}}')}catch(e){return {attempts:[],drafts:{}}}})();
const saveExamStore=()=>localStorage.setItem(EXAM_KEY,JSON.stringify(examStore));
let examSession=null,examTimerHandle=null;

function examSectionFor(exam,q){return exam.sectionOrder[Math.min(3,Math.floor((q-1)/14))]}
function renderAnnalesHome(){
 if(!$("#examYearList"))return;
 $("#annalesHome").classList.remove("hidden");$("#examRunner").classList.add("hidden");
 if(examTimerHandle){clearInterval(examTimerHandle);examTimerHandle=null}
 $("#examYearList").innerHTML=OFFICIAL_EXAMS.map(e=>{
   const d=examStore.drafts[String(e.year)],answered=d?Object.values(d.answers||{}).filter(Boolean).length:0;
   return `<div class="exam-year-card"><div><h3>Annale ${e.year}</h3><p>${e.date} · 3 h · ${e.questions} questions</p><div class="exam-year-meta"><span class="pill">4 matières</span><span class="pill">${answered?answered+" réponses sauvegardées":"nouvelle tentative"}</span></div></div><button class="primary start-official-exam" data-year="${e.year}" type="button">${answered?"Reprendre":"Commencer"}</button></div>`
 }).join("");
 $$(".start-official-exam").forEach(b=>b.addEventListener("click",()=>startOfficialExam(Number(b.dataset.year))));
 const hist=examStore.attempts.slice().reverse();
 $("#attemptHistory").innerHTML=hist.length?hist.map(a=>`<div class="attempt-row"><div><b>${a.year}</b> · ${new Date(a.submittedAt).toLocaleDateString("fr-FR")}<br><span class="muted">${a.answered}/${a.total} répondues · ${formatExamDuration(a.elapsedMs)}</span></div><div>${a.scoreText||"—"}</div></div>`).join(""):'<div class="muted">Aucune tentative terminée.</div>';
}
function startOfficialExam(year){
 const ex=OFFICIAL_EXAMS.find(e=>e.year===year);if(!ex)return;
 const saved=examStore.drafts[String(year)];
 examSession=saved&&saved.startedAt?JSON.parse(JSON.stringify(saved)):{year,startedAt:now(),answers:{},flags:{},current:1};
 examSession.year=year;
 $("#annalesHome").classList.add("hidden");$("#examRunner").classList.remove("hidden");
 $("#examYearTitle").textContent="Annale "+year;$("#officialPdfLink").href=ex.pdf;$("#examSourceNote").textContent=ex.note;
 bindExamRunner();renderExamQuestion();startExamClock();
}
function bindExamRunner(){
 const r=$("#examRunner");if(r.dataset.bound==="1")return;r.dataset.bound="1";
 $("#examExitBtn").addEventListener("click",()=>{saveExamDraft();renderAnnalesHome()});
 $("#prevExamQuestion").addEventListener("click",()=>moveExam(-1));$("#nextExamQuestion").addEventListener("click",()=>moveExam(1));
 $("#flagQuestionBtn").addEventListener("click",()=>{const q=examSession.current;examSession.flags[q]=!examSession.flags[q];saveExamDraft();renderExamQuestion()});
 $("#clearExamAnswer").addEventListener("click",()=>{delete examSession.answers[examSession.current];saveExamDraft();renderExamQuestion()});
 $$('input[name="examAnswer"]').forEach(inp=>inp.addEventListener("change",()=>{examSession.answers[examSession.current]=inp.value;saveExamDraft();renderExamProgress();renderExamGrid()}));
 $("#examSubmitBtn").addEventListener("click",()=>submitOfficialExam(false));
 $("#closeExamResult").addEventListener("click",()=>$("#examResultDialog").close());
 $("#examSectionSelect").addEventListener("change",()=>{const s=$("#examSectionSelect").value;if(s==="all")return;const ex=OFFICIAL_EXAMS.find(e=>e.year===examSession.year);for(let q=1;q<=ex.questions;q++)if(examSectionFor(ex,q)===s){examSession.current=q;renderExamQuestion();break}});
}
function saveExamDraft(){if(!examSession)return;examStore.drafts[String(examSession.year)]=examSession;saveExamStore()}
function moveExam(d){const ex=OFFICIAL_EXAMS.find(e=>e.year===examSession.year);examSession.current=Math.max(1,Math.min(ex.questions,examSession.current+d));saveExamDraft();renderExamQuestion()}
function renderExamQuestion(){
 const ex=OFFICIAL_EXAMS.find(e=>e.year===examSession.year),q=examSession.current,sec=examSectionFor(ex,q);
 $("#examQuestionNumber").textContent=`Question ${q} / ${ex.questions}`;$("#examQuestionSection").textContent=SECTION_NAMES[sec];
 $$('input[name="examAnswer"]').forEach(inp=>inp.checked=examSession.answers[q]===inp.value);
 $("#flagQuestionBtn").textContent=examSession.flags[q]?"⚑ Marquée":"⚐ Marquer";$("#prevExamQuestion").disabled=q===1;$("#nextExamQuestion").disabled=q===ex.questions;
 renderExamProgress();renderExamGrid();
}
function renderExamProgress(){const ex=OFFICIAL_EXAMS.find(e=>e.year===examSession.year),n=Object.values(examSession.answers).filter(Boolean).length;$("#examProgressFill").style.width=(100*n/ex.questions)+"%";$("#examProgressText").textContent=`${n}/${ex.questions} réponses · ${ex.questions-n} sans réponse`}
function renderExamGrid(){const ex=OFFICIAL_EXAMS.find(e=>e.year===examSession.year),g=$("#examQuestionGrid");g.innerHTML="";for(let q=1;q<=ex.questions;q++){const b=document.createElement("button");b.type="button";b.className="exam-q-btn";b.textContent=q;if(examSession.answers[q])b.classList.add("answered");if(examSession.flags[q])b.classList.add("flagged");if(q===examSession.current)b.classList.add("current");b.addEventListener("click",()=>{examSession.current=q;saveExamDraft();renderExamQuestion()});g.appendChild(b)}}
function startExamClock(){if(examTimerHandle)clearInterval(examTimerHandle);const tick=()=>{if(!examSession)return;const rem=Math.max(0,10800000-(now()-examSession.startedAt));$("#examTimer").textContent=formatExamDuration(rem);if(rem<=0){clearInterval(examTimerHandle);examTimerHandle=null;submitOfficialExam(true)}};tick();examTimerHandle=setInterval(tick,1000)}
function formatExamDuration(ms){ms=Math.max(0,ms);const t=Math.floor(ms/1000),h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60;return [h,m,s].map(x=>String(x).padStart(2,"0")).join(":")}
function submitOfficialExam(auto){
 if(!examSession)return;const ex=OFFICIAL_EXAMS.find(e=>e.year===examSession.year),answered=Object.values(examSession.answers).filter(Boolean).length,elapsed=now()-examSession.startedAt;
 if(!auto&&!confirm(`Terminer l'annale ${ex.year} ? ${answered}/${ex.questions} questions répondues.`))return;
 const attempt={id:uid(),year:ex.year,submittedAt:now(),startedAt:examSession.startedAt,elapsedMs:elapsed,total:ex.questions,answered,answers:examSession.answers,flags:examSession.flags,scoreText:"Corrigé officiel non publié"};
 examStore.attempts.push(attempt);delete examStore.drafts[String(ex.year)];saveExamStore();if(examTimerHandle){clearInterval(examTimerHandle);examTimerHandle=null}
 $("#examResultBody").innerHTML=`<div class="result-score-grid"><div class="result-score"><b>${answered}</b><span>répondues</span></div><div class="result-score"><b>${ex.questions-answered}</b><span>blanches</span></div><div class="result-score"><b>${formatExamDuration(elapsed).slice(0,5)}</b><span>temps</span></div></div><div class="result-note"><b>Pas de faux « corrigé officiel » :</b> l'IRM ne publie pas de correction. Tes réponses sont conservées. Si tu disposes d'une clé fiable, colle-la ci-dessous pour calculer le score automatiquement.</div><div class="manual-key-box"><p class="muted">Clé attendue : 56 lettres A–E. Espaces, virgules et retours à la ligne sont ignorés.</p><textarea id="manualAnswerKey" placeholder="Ex. A B C ..."></textarea><button id="scoreWithManualKey" class="primary wide" type="button">Calculer le score</button><div id="manualScoreResult"></div></div>`;
 $("#examResultDialog").showModal();
 setTimeout(()=>$("#scoreWithManualKey")?.addEventListener("click",()=>{const raw=$("#manualAnswerKey").value.toUpperCase().replace(/[^A-E]/g,"");if(raw.length!==ex.questions){$("#manualScoreResult").innerHTML=`<p class="muted">Clé invalide : ${raw.length}/${ex.questions} lettres détectées.</p>`;return}let score=0;const sec={finance:[0,0],stats:[0,0],nonvie:[0,0],vie:[0,0]};for(let q=1;q<=ex.questions;q++){const s=examSectionFor(ex,q);sec[s][1]++;if((attempt.answers[q]||"")===raw[q-1]){score++;sec[s][0]++}}attempt.score=score;attempt.scoreText=`${score}/${ex.questions} (${Math.round(100*score/ex.questions)}%)`;saveExamStore();$("#manualScoreResult").innerHTML=`<div class="result-score-grid"><div class="result-score"><b>${score}/${ex.questions}</b><span>score</span></div><div class="result-score"><b>${Math.round(100*score/ex.questions)}%</b><span>réussite</span></div><div class="result-score"><b>${ex.questions-score}</b><span>erreurs/blanches</span></div></div><div class="result-note">${Object.entries(sec).map(([s,v])=>`${SECTION_NAMES[s]} : <b>${v[0]}/${v[1]}</b>`).join("<br>")}</div>`}),0);
 examSession=null;
}

renderDecks();
})();