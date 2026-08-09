// Taskforce — Side Panel v3.2
// Per-org task manager with status workflow, notes, dates, dashboard & export.
'use strict';

(function() {
const SCHEMA_VER = 2;
const STORAGE_PFX = 'sftasks';
const PREFS_KEY   = `${STORAGE_PFX}_prefs`;
const SETTINGS_KEY = `${STORAGE_PFX}_settings`;

const COLORS = ['#3B82F6','#10B981','#EF4444','#F59E0B','#8B5CF6','#EC4899','#14B8A6','#F97316'];
const PRIORITIES = {
  high:{label:'High',css:'high'}, medium:{label:'Med',css:'medium'}, low:{label:'Low',css:'low'}
};
const STATUSES = ['active','waiting','blocked','done'];
const CYCLE_STATUSES = ['active','waiting','blocked']; // chip cycles through these only; done is via ✓ button
const SF_DOMAINS = [
  /\.my\.salesforce\.com$/,/\.sandbox\.my\.salesforce\.com$/,/\.salesforce\.com$/,
  /\.lightning\.force\.com$/,/\.vf\.force\.com$/,/\.force\.com$/,/\.cloudforce\.com$/,
  /\.live\.site\.com$/,/\.salesforce-setup\.com$/,
];

const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);

// ═══════════════════════ DOM REFS ═══════════════════════

const D={
  // header
  viewOrg:$('#view-org'), viewDash:$('#view-dash'),
  orgName:$('#org-name'), orgEditBtn:$('#org-edit-btn'), orgEditInput:$('#org-edit-input'),
  orgEditSave:$('#org-edit-save'), orgEditCancel:$('#org-edit-cancel'),
  orgDisplay:$('#org-display'), orgEditRow:$('#org-edit-row'),
  btnMenu:$('#btn-menu'), btnSettings:$('#btn-settings'), exportMenu:$('#export-menu'), btnClearDone:$('#btn-clear-done'),
  // views
  stateNoOrg:$('#state-no-org'), dashboardView:$('#dashboard-view'),
  dashboardContent:$('#dashboard-content'), dashEmpty:$('#dash-empty'),
  orgView:$('#org-view'), taskList:$('#task-list'), stateEmpty:$('#state-empty'),
  // add form
  addForm:$('#add-form'), taskInput:$('#task-input'),
  btnPriority:$('#btn-priority'), priorityDropdown:$('#priority-dropdown'),
  btnColor:$('#btn-color'), colorPicker:$('#color-picker'),
  // footer
  taskCount:$('#task-count'),
  // filter
  filterSearch:$('#filter-search'), filterChips:$$('#filter-bar .filter-chip'),
  filterClear:$('#filter-clear'),
  // error
  stateError:$('#state-error'), errorMsg:$('#error-msg'), errorDismiss:$('#error-dismiss'),
};

// ═══════════════════════ STATE ═══════════════════════

let currentOrg=null, tasks=[];
let selectedPriority='medium', selectedColor=COLORS[0];
let viewMode='org';        // 'org' | 'dashboard'
let expandedTaskId=null;
let dragSrcIdx=null;
let orgSwitchSeq=0;
let saveTimer=null;

// Filter state
let filter={search:'', statuses:[], due:null}; // statuses: active/waiting/blocked/done, due: 'today'|'week'|'overdue'|null

// App settings state
const DEFAULT_SHORTCUTS = [
  { action: 'Move focus down', keys: ['J'] },
  { action: 'Move focus up', keys: ['K'] },
  { action: 'Open task detail', keys: ['Enter'] },
  { action: 'Focus search bar', keys: ['/'] },
  { action: 'Toggle status filter', keys: ['S'] },
  { action: 'Clear all filters', keys: ['Esc'] },
  { action: 'Cycle task status', keys: ['Ctrl', '.'] },
  { action: 'Open org switcher', keys: ['Ctrl', 'O'] },
  { action: 'Toggle due date filter', keys: ['D'] },
  { action: 'Quick-create task', keys: ['N'] }
];

let appSettings = {
  theme:'system', fontSize:13, statusColors:true, orgBadge:true,
  exportNotes:true, exportOrg:true, defaultOrg:'last', shortcuts: DEFAULT_SHORTCUTS
};

// ═══════════════════════ SETTINGS ═══════════════════════

async function loadSettings(){
  try{
    const r=await chrome.storage.local.get(SETTINGS_KEY);
    if(r[SETTINGS_KEY]){
      appSettings={...appSettings, ...r[SETTINGS_KEY]};
      if(!Array.isArray(appSettings.shortcuts)||!appSettings.shortcuts.length){
        appSettings.shortcuts = DEFAULT_SHORTCUTS;
      }
    }
  }catch(e){}
}

function getResolvedTheme(pref){
  if(pref==='light')return'light';if(pref==='dark')return'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
}

function applySettingsToUI(){
  const t=getResolvedTheme(appSettings.theme||'system');
  document.documentElement.setAttribute('data-theme', t);
  // Apply font size to document root and body
  if(appSettings.fontSize){
    document.documentElement.style.fontSize=appSettings.fontSize+'px';
    document.body.style.fontSize=appSettings.fontSize+'px';
  }
  // Status colors
  if(!appSettings.statusColors){
    document.documentElement.style.setProperty('--accent','var(--text-secondary)');
  }else{
    document.documentElement.style.removeProperty('--accent');
  }
}

// Listen for OS theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{
  if(appSettings.theme==='system')applySettingsToUI();
});

// Listen for settings changes from the settings page (live sync)
if(chrome.storage&&chrome.storage.onChanged){
  chrome.storage.onChanged.addListener((changes, area)=>{
    if(area==='local'&&changes[SETTINGS_KEY]){
      appSettings=changes[SETTINGS_KEY].newValue||appSettings;
      applySettingsToUI();
    }
  });
}

// ═══════════════════════ KEYBOARD SHORTCUTS ═══════════════════════

function matchShortcut(e, keys){
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  const k = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (!['Control','Alt','Shift','Meta'].includes(k)) parts.push(k);
  // Normalize both sides for comparison
  const evtCombo = parts.join('+');
  const storedCombo = keys.map(k => k === '⌘' ? 'Ctrl' : k).join('+');
  return evtCombo === storedCombo;
}

function findShortcutAction(e){
  const shortcuts = appSettings.shortcuts || [];
  for (const s of shortcuts) {
    if (matchShortcut(e, s.keys)) return s.action;
  }
  return null;
}

function handleShortcut(action){
  switch(action){
    case 'Move focus down': {
      const items=Array.from(D.taskList.querySelectorAll('.task-item'));
      const cur=items.findIndex(el=>el.dataset.focused==='true');
      const next=cur===-1?0:Math.min(cur+1,items.length-1);
      items.forEach(el=>delete el.dataset.focused);
      if(items[next]){items[next].dataset.focused='true';items[next].scrollIntoView({block:'nearest'});items[next].style.outline='1px solid var(--accent)';}
      break;
    }
    case 'Move focus up': {
      const items=Array.from(D.taskList.querySelectorAll('.task-item'));
      const cur=items.findIndex(el=>el.dataset.focused==='true');
      const next=cur===-1?items.length-1:Math.max(cur-1,0);
      items.forEach(el=>delete el.dataset.focused);
      if(items[next]){items[next].dataset.focused='true';items[next].scrollIntoView({block:'nearest'});items[next].style.outline='1px solid var(--accent)';}
      break;
    }
    case 'Open task detail':
      if (expandedTaskId) { expandTask(null); }
      else {
        // Try focused task first, then hovered/visible
        const focused=D.taskList.querySelector('[data-focused="true"]');
        const el=focused||D.taskList.querySelector('.task-item');
        if(el){expandTask(el.dataset.id);delete el.dataset.focused;el.style.outline='';}
      }
      break;
    case 'Focus search bar':
      D.filterSearch.focus();
      break;
    case 'Toggle status filter':
      if (viewMode === 'org') D.filterChips[0]?.click();
      break;
    case 'Clear all filters':
      if (viewMode === 'org') clearFilters();
      break;
    case 'Cycle task status': {
      const targetId = expandedTaskId || D.taskList.querySelector('[data-focused="true"]')?.dataset.id || D.taskList.querySelector('.task-item')?.dataset.id;
      if (targetId) cycleStatus(targetId);
      break;
    }
    case 'Open org switcher':
      viewMode = 'dashboard'; setViewUI();
      break;
    case 'Toggle due date filter': {
      const todayChip = document.querySelector('[data-filter-due="today"]');
      if (todayChip) todayChip.click();
      break;
    }
    case 'Quick-create task':
      if (viewMode === 'org' && D.taskInput) D.taskInput.focus();
      break;
  }
}

document.addEventListener('keydown', e => {
  // Don't intercept when typing in inputs/textareas
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
  // Don't intercept when a button/select is focused (let native behavior work)
  if (e.target.closest('button') || e.target.closest('select')) return;
  const action = findShortcutAction(e);
  if (action) {
    e.preventDefault();
    handleShortcut(action);
  }
});

// ═══════════════════════ PREFERENCES ═══════════════════════

async function loadPrefs(){
  try{const r=await chrome.storage.local.get(PREFS_KEY);const p=r[PREFS_KEY];
    if(p){if(p.selectedPriority&&PRIORITIES[p.selectedPriority])selectedPriority=p.selectedPriority;
    if(p.selectedColor&&COLORS.includes(p.selectedColor))selectedColor=p.selectedColor;}
  }catch(e){}
}
async function savePrefs(){
  try{await chrome.storage.local.set({[PREFS_KEY]:{selectedPriority,selectedColor}});}catch(e){}
}
function applyPrefs(){
  const p=PRIORITIES[selectedPriority];
  D.btnPriority.innerHTML=`<span class="prio-dot ${p.css}"></span> ${p.label}`;
  D.btnPriority.dataset.priority=selectedPriority;
  D.btnColor.style.backgroundColor=selectedColor;
}

// ═══════════════════════ ERROR ═══════════════════════

let errTmr=null;
function showError(m){D.errorMsg.textContent=m;D.stateError.classList.remove('hidden');
  clearTimeout(errTmr);errTmr=setTimeout(()=>D.stateError.classList.add('hidden'),5000);}

// ═══════════════════════ ORG DETECTION ═══════════════════════

function parseOrgFromUrl(url){
  let h;try{h=new URL(url).hostname.toLowerCase()}catch{return null}
  if(!SF_DOMAINS.some(r=>r.test(h)))return null;
  let p=h.split('.')[0];if(p.includes('--'))p=p.split('--')[0];
  let l=p.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  if(l.length>30)l=l.substring(0,28)+'…';
  return{key:h.replace(/\./g,'_'),label:l,isCustom:false};
}
async function detectOrg(){
  try{const[t]=await chrome.tabs.query({active:true,currentWindow:true});
    return t&&t.url?parseOrgFromUrl(t.url):null;
  }catch{return null}
}
async function loadOrgLabel(org){
  try{const r=await chrome.storage.local.get(`${STORAGE_PFX}_meta_${org.key}`);
    const m=r[`${STORAGE_PFX}_meta_${org.key}`];
    if(m&&m.label){org.label=m.label;org.isCustom=!!m.customLabel;}
  }catch(e){}
}
async function saveOrgLabel(org){
  try{await chrome.storage.local.set({[`${STORAGE_PFX}_meta_${org.key}`]:{label:org.label,customLabel:true}})}catch(e){}
}

// ═══════════════════════ MIGRATION ═══════════════════════

function migrateV1(task){
  // v1: { id, title, priority, color, completed, createdAt, order }
  // v3: { id, title, priority, color, status, dueDate, notes, createdAt, completedAt, order }
  return{
    id:task.id, title:task.title, priority:task.priority||'medium',
    color:task.color||COLORS[0],
    status:task.completed?'done':'active',
    dueDate:null, notes:'',
    createdAt:task.createdAt||Date.now(),
    completedAt:task.completed?Date.now():null,
    order:task.order??0
  };
}
function storageKey(org){return`${STORAGE_PFX}_v${SCHEMA_VER}_${org.key}`;}

// ═══════════════════════ STORAGE ═══════════════════════

async function loadTasks(){
  if(!currentOrg){tasks=[];return}
  const k=storageKey(currentOrg);
  try{
    const r=await chrome.storage.local.get([k,`${STORAGE_PFX}_v1_${currentOrg.key}`]);
    let data=r[k];
    // Try v1 migration
    if(!data||!data.tasks){const v1=r[`${STORAGE_PFX}_v1_${currentOrg.key}`];
      if(v1&&Array.isArray(v1)){data={_schemaVer:SCHEMA_VER,_updatedAt:Date.now(),tasks:v1.map(migrateV1)};}
      else if(v1&&v1.tasks){data={_schemaVer:SCHEMA_VER,_updatedAt:Date.now(),tasks:v1.tasks.map(migrateV1)};}
    }
    if(data&&Array.isArray(data.tasks)){
      tasks=data.tasks.filter(t=>t&&typeof t.id==='string'&&typeof t.title==='string');
      // Backfill missing fields for v2→v3
      tasks.forEach(t=>{
        if(!t.status)t.status=t.completed?'done':'active';
        if(!t.dueDate)t.dueDate=null;
        if(t.notes===undefined)t.notes='';
        if(t.completedAt===undefined)t.completedAt=t.completed?t.createdAt:null;
        delete t.completed;
      });
    }else{tasks=[];}
    tasks.sort((a,b)=>(a.order??0)-(b.order??0));
  }catch(e){tasks=[];showError('Failed to load tasks.');}
}

async function saveTasks(){
  if(!currentOrg)return;const k=storageKey(currentOrg);
  tasks.forEach((t,i)=>{t.order=i});
  try{await chrome.storage.local.set({[k]:{_schemaVer:SCHEMA_VER,_updatedAt:Date.now(),tasks}})}
  catch(e){showError('Failed to save. Check storage space.');}
}
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveTasks(),300);}
async function saveNow(){clearTimeout(saveTimer);await saveTasks();}

// ═══════════════════════ DASHBOARD (all orgs) ═══════════════════════

async function loadAllOrgData(){
  const all=await chrome.storage.local.get(null);
  const orgs={};
  for(const[k,v]of Object.entries(all)){
    if(!k.startsWith(`${STORAGE_PFX}_v${SCHEMA_VER}_`))continue;
    const orgKey=k.replace(`${STORAGE_PFX}_v${SCHEMA_VER}_`,'');
    if(!v||!Array.isArray(v.tasks))continue;
    orgs[orgKey]={tasks:v.tasks,_updatedAt:v._updatedAt};
  }
  // load metadata labels
  for(const ok of Object.keys(orgs)){
    const mk=`${STORAGE_PFX}_meta_${ok}`;
    const mr=all[mk];
    if(mr&&mr.label)orgs[ok].label=mr.label;else{
      // derive from key
      orgs[ok].label=ok.replace(/_/g,'.').replace(/\.my\.salesforce\.com.*/,'').replace(/\.lightning\.force\.com.*/,'').replace(/\.force\.com.*/,'').replace(/--/g,' ').replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
    }
  }
  return orgs;
}

function renderDashboard(data){
  D.dashboardContent.innerHTML='';
  const entries=Object.entries(data).sort(([,a],[,b])=>(b._updatedAt||0)-(a._updatedAt||0));
  if(entries.length===0){D.dashEmpty.classList.remove('hidden');return}
  D.dashEmpty.classList.add('hidden');
  // Subtitle hint
  const hint=ce('div');hint.style.cssText='font-size:0.7692rem;color:var(--text-muted);margin-bottom:6px;text-align:center';
  hint.textContent='Click an org card to view & edit all tasks';
  D.dashboardContent.appendChild(hint);
  for(const[orgKey,org]of entries){
    const active=org.tasks.filter(t=>t.status!=='done');
    const counts={active:active.filter(t=>t.status==='active').length,waiting:active.filter(t=>t.status==='waiting').length,blocked:active.filter(t=>t.status==='blocked').length};
    const top3=active.slice(0,3);
    const card=ce('div','dash-card');
    card.addEventListener('click',e=>{
      // Don't switch if clicking on a priority chip
      if(e.target.closest('.dash-prio-chip'))return;
      switchToOrgView(orgKey);
    });
    // header
    const hdr=ce('div','dash-card-header');
    hdr.appendChild(ce('span','dash-card-org',org.label));
    const cnts=ce('div','dash-card-counts');
    if(counts.active){const activeCnt=ce('span','dash-count');const dot=ce('span','dash-count-dot active');activeCnt.appendChild(dot);activeCnt.appendChild(document.createTextNode(' '+counts.active));cnts.appendChild(activeCnt);}
    if(counts.waiting){const waitCnt=ce('span','dash-count');const dot=ce('span','dash-count-dot waiting');waitCnt.appendChild(dot);waitCnt.appendChild(document.createTextNode(' '+counts.waiting));cnts.appendChild(waitCnt);}
    if(counts.blocked){const blockCnt=ce('span','dash-count');const dot=ce('span','dash-count-dot blocked');blockCnt.appendChild(dot);blockCnt.appendChild(document.createTextNode(' '+counts.blocked));cnts.appendChild(blockCnt);}
    hdr.appendChild(cnts);card.appendChild(hdr);
    if(top3.length){
      const list=ce('div','dash-task-list');
      top3.forEach(t=>{
        const ri=ce('div','dash-task-item');
        const prio=PRIORITIES[t.priority]||PRIORITIES.medium;
        const prioChip=ce('span',`dash-prio-chip ${prio.css}`,prio.label);
        prioChip.title='Click to change priority';
        prioChip.style.cssText='cursor:pointer;font-size:0.6923rem;font-weight:700;text-transform:uppercase;padding:1px 4px;border-radius:3px;margin-right:5px;flex-shrink:0';
        prioChip.addEventListener('click',async e=>{
          e.stopPropagation();
          const vals=['high','medium','low'];
          const idx=vals.indexOf(t.priority);const next=vals[(idx+1)%3];
          t.priority=next;
          // Save to storage
          const k=`${STORAGE_PFX}_v${SCHEMA_VER}_${orgKey}`;
          try{const r=await chrome.storage.local.get(k);const d=r[k];
            if(d&&d.tasks){const ti=d.tasks.find(x=>x.id===t.id);if(ti)ti.priority=next;await chrome.storage.local.set({[k]:d});}
          }catch(e){}
          // Re-render dashboard
          refreshDashboard();
        });
        ri.appendChild(prioChip);
        ri.appendChild(ce('span','',t.title));
        list.appendChild(ri);
      });
      if(active.length>3){const more=ce('div','dash-task-item');more.appendChild(ce('span','','+ '+(active.length-3)+' more'));list.appendChild(more);}
      card.appendChild(list);
    }
    D.dashboardContent.appendChild(card);
  }
}

async function switchToOrgView(orgKey){
  // Try to find and activate a tab matching this org
  try{
    const tabs=await chrome.tabs.query({});
    const match=tabs.find(t=>{
      try{const h=new URL(t.url).hostname.toLowerCase();return h.replace(/\./g,'_')===orgKey}catch{return false}
    });
    if(match)await chrome.tabs.update(match.id,{active:true});
  }catch(e){}
  // Switch view and refresh
  viewMode='org';setViewUI();expandTask(null);
  await refreshOrg();
}

// ═══════════════════════ EXPORT ═══════════════════════

function copyActiveAsList(){
  const active=tasks.filter(t=>t.status!=='done');
  if(!active.length){showError('No active tasks to copy.');return}
  const lines=active.map(t=>{
    const prio=PRIORITIES[t.priority]||PRIORITIES.medium;
    const status=t.status==='blocked'?' [BLOCKED]':t.status==='waiting'?' [WAITING]':'';
    return`• [${prio.label}]${status} ${t.title}`;
  });
  navigator.clipboard.writeText(lines.join('\n')).catch(()=>showError('Copy failed.'));
  showError('Copied '+active.length+' tasks to clipboard.'); // reuse error as toast
}

function exportJSON(orgOnly){
  const data=orgOnly?{[storageKey(currentOrg)]:{tasks}}:{};
  if(!orgOnly){
    // Collect all orgs via storage scan — we need to re-read
    chrome.storage.local.get(null).then(all=>{
      const out={};
      for(const[k,v]of Object.entries(all)){
        if(!k.startsWith(`${STORAGE_PFX}_v${SCHEMA_VER}_`))continue;
        out[k]={tasks:v.tasks,_updatedAt:v._updatedAt};
      }
      downloadJSON(orgOnly?`${currentOrg.label}.json`:'sftasks-all-orgs.json',orgOnly?data:out);
    });
  }else{
    data[storageKey(currentOrg)].tasks=tasks;
    downloadJSON(`${currentOrg.label.replace(/[^a-z0-9]/gi,'_')}.json`,data);
  }
}

function downloadJSON(filename,data){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function importJSON(){
  const input=document.createElement('input');
  input.type='file';input.accept='.json';
  input.addEventListener('change',async ()=>{
    const file=input.files[0];if(!file)return;
    try{
      const text=await file.text();
      const data=JSON.parse(text);
      let imported=0,skipped=0,overwritten=0;
      // Support both single-org and all-orgs export formats
      for(const[k,v]of Object.entries(data)){
        if(!k.startsWith(`${STORAGE_PFX}_v${SCHEMA_VER}_`)||!v||!Array.isArray(v.tasks))continue;
        // Merge with existing tasks for this org
        const existing=await chrome.storage.local.get(k);
        const oldTasks=existing[k]?.tasks||[];
        const oldMap=new Map(oldTasks.map(t=>[t.id,t]));
        const newTasks=[...oldTasks];
        for(const t of v.tasks){
          if(!t.id||!t.title)continue;
          if(oldMap.has(t.id)){
            // Overwrite existing task
            const idx=newTasks.findIndex(x=>x.id===t.id);
            if(idx>-1){newTasks[idx]=t;overwritten++;}
          }else{newTasks.push(t);imported++;}
        }
        newTasks.forEach((t,i)=>{t.order=i});
        await chrome.storage.local.set({[k]:{_schemaVer:SCHEMA_VER,_updatedAt:Date.now(),tasks:newTasks}});
      }
      if(imported||overwritten){
        const parts=[];
        if(imported)parts.push(`${imported} imported`);
        if(overwritten)parts.push(`${overwritten} updated`);
        showError(`Import complete: ${parts.join(', ')}.`);
      }else{showError('No valid tasks found in file.');}
      // Refresh current org view
      if(viewMode==='org'&&currentOrg)await refreshOrg();
      if(viewMode==='dashboard')refreshDashboard();
    }catch(e){showError('Failed to parse file. Make sure it\'s a Taskforce JSON export.');}
  });
  input.click();
}

// ═══════════════════════ TASK CRUD ═══════════════════════

function makeTask(title){
  return{id:crypto.randomUUID(),title:title.trim(),priority:selectedPriority,color:selectedColor,
    status:'active',dueDate:null,notes:'',createdAt:Date.now(),completedAt:null,order:tasks.length};
}

async function addTask(title){
  if(!currentOrg||!title.trim())return;
  const t=makeTask(title);tasks.push(t);await saveTasks();
  appendTaskDOM(t,tasks.length-1);updateCounts();hideEmptyState();
}
async function deleteTask(id){
  const idx=tasks.findIndex(t=>t.id===id);if(idx===-1)return;
  tasks.splice(idx,1);await saveTasks();removeTaskDOM(id);updateCounts();
  if(!tasks.length)showEmptyState();
}
async function updateTask(id,changes){
  const t=tasks.find(t=>t.id===id);if(!t)return;
  Object.assign(t,changes);
  // Set completedAt when marking done
  if(changes.status==='done'&&!t.completedAt)t.completedAt=Date.now();
  if(changes.status&&changes.status!=='done')t.completedAt=null;
  await saveTasks();
  // Only full re-render on status changes (moves between sections)
  if(changes.status!==undefined){
    if(viewMode==='org')fullRenderOrg();
  }else{
    // Notes/due date changes don't need re-render — values are already in the DOM
    updateCounts();
  }
}
async function clearDone(){
  if(!tasks.some(t=>t.status==='done'))return;
  tasks=tasks.filter(t=>t.status!=='done');await saveTasks();
  if(viewMode==='org')fullRenderOrg();updateCounts();
}
async function moveTask(fromIdx,toIdx){
  if(fromIdx===toIdx)return;
  const[m]=tasks.splice(fromIdx,1);tasks.splice(toIdx,0,m);
  await saveTasks();reorderDOM(fromIdx,toIdx);
}

// ═══════════════════════ TASK EXPAND ═══════════════════════

function expandTask(id){
  expandedTaskId=id;
  // Close all expansions
  $$('.task-item').forEach(el=>el.classList.remove('expanded'));
  if(id){
    const el=D.taskList.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if(el){el.classList.add('expanded');
      // populate fields
      const t=tasks.find(t=>t.id===id);if(!t)return;
      const due=el.querySelector('.task-due-input');if(due)due.value=t.dueDate||'';
      const notes=el.querySelector('.task-notes');if(notes)notes.value=t.notes||'';
      // highlight active status
      el.querySelectorAll('.status-opt').forEach(o=>{
        o.classList.toggle('active-status',o.dataset.status===t.status);
      });
    }
  }
}

// ═══════════════════════ TARGETED DOM ═══════════════════════

function appendTaskDOM(task,idx){
  const el=createTaskElement(task,idx);const sep=D.taskList.querySelector('.task-separator');
  sep?D.taskList.insertBefore(el,sep):D.taskList.appendChild(el);
  el.style.opacity='0';el.style.transform='translateY(-6px)';
  requestAnimationFrame(()=>{el.style.transition='opacity .15s,transform .15s';el.style.opacity='1';el.style.transform='';});
}
function removeTaskDOM(id){
  const el=D.taskList.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if(!el)return;el.style.transition='opacity .1s,transform .1s';el.style.opacity='0';el.style.transform='translateX(16px)';
  el.addEventListener('transitionend',()=>el.remove(),{once:true});
}
function reorderDOM(fromIdx,toIdx){
  const items=Array.from(D.taskList.querySelectorAll('.task-item'));
  if(fromIdx>=items.length||toIdx>=items.length)return;
  const el=items[fromIdx];const sep=D.taskList.querySelector('.task-separator');
  if(toIdx>=items.length-1){sep?D.taskList.insertBefore(el,sep):D.taskList.appendChild(el);}
  else{const ref=toIdx>fromIdx?items[toIdx+1]:items[toIdx];D.taskList.insertBefore(el,ref);}
  D.taskList.querySelectorAll('.task-item').forEach((c,i)=>{c.dataset.index=i});
}

function updateCounts(){
  const allActive=tasks.filter(t=>t.status!=='done').length;
  const filtered=getFilteredTasks().filter(t=>t.status!=='done').length;
  let txt=allActive===0?'All done 🎉':`${allActive} active task${allActive!==1?'s':''}`;
  if(hasActiveFilters()&&filtered!==allActive)txt+=` · ${filtered} shown`;
  D.taskCount.textContent=txt;
  D.btnClearDone.style.display=tasks.some(t=>t.status==='done')?'':'none';
}
function hideEmptyState(){D.stateEmpty.classList.add('hidden')}
function showEmptyState(){D.stateEmpty.classList.remove('hidden')}

// ═══════════════════════ FILTERING ═══════════════════════

function getFilteredTasks(){
  let filtered=tasks;
  // Text search: title or notes
  if(filter.search){
    const q=filter.search.toLowerCase();
    filtered=filtered.filter(t=>t.title.toLowerCase().includes(q)||(t.notes||'').toLowerCase().includes(q));
  }
  // Status filter: if any statuses selected, show only those
  if(filter.statuses.length>0){
    filtered=filtered.filter(t=>filter.statuses.includes(t.status));
  }
  // Due date filters
  if(filter.due){
    const now=new Date();now.setUTCHours(0,0,0,0);
    if(filter.due==='today'){
      const today=new Date().toISOString().slice(0,10);
      filtered=filtered.filter(t=>t.dueDate===today);
    }else if(filter.due==='week'){
      const end=new Date(now);end.setUTCDate(end.getUTCDate()+7);
      filtered=filtered.filter(t=>{
        if(!t.dueDate)return false;
        const d=new Date(t.dueDate+'T00:00:00.000Z');
        return d>=now&&d<=end;
      });
    }else if(filter.due==='overdue'){
      const todayS=new Date().toISOString().slice(0,10);
      filtered=filtered.filter(t=>t.dueDate&&t.dueDate<todayS);
    }
  }
  return filtered;
}

function hasActiveFilters(){
  return filter.search!==''||filter.statuses.length>0||filter.due!==null;
}

function clearFilters(){
  filter={search:'',statuses:[],due:null};
  D.filterSearch.value='';
  D.filterChips.forEach(c=>c.classList.remove('on'));
  D.filterClear.style.display='none';
  if(viewMode==='org')fullRenderOrg();
}

function fullRenderOrg(){
  while(D.taskList.firstChild)D.taskList.removeChild(D.taskList.firstChild);
  if(!currentOrg){showEmptyState();return}
  const allFiltered=getFilteredTasks();
  const active=allFiltered.filter(t=>t.status!=='done'),done=allFiltered.filter(t=>t.status==='done');
  if(tasks.length===0){showEmptyState();}else if(allFiltered.length===0&&hasActiveFilters()){renderNoFilterMatch();}else{hideEmptyState();}
  active.forEach((t,i)=>D.taskList.appendChild(createTaskElement(t,i)));
  if(done.length){
    const sep=ce('div','task-separator',`Done (${done.length})`);D.taskList.appendChild(sep);
    done.forEach((t,i)=>D.taskList.appendChild(createTaskElement(t,active.length+i)));
  }
  updateCounts();
  // Re-expand if needed
  if(expandedTaskId)expandTask(expandedTaskId);
}

function renderNoFilterMatch(){
  const el=ce('div','state-message');el.style.flex='none';el.style.padding='32px 20px';
  el.appendChild(ce('div','state-icon','🔍'));
  el.appendChild(ce('p','','No tasks match these filters.'));
  D.taskList.appendChild(el);
}

// ═══════════════════════ TASK ELEMENT BUILDER ═══════════════════════

function createTaskElement(task,index){
  const isDone=task.status==='done';
  const el=ce('div');el.className=`task-item status-${task.status}${expandedTaskId===task.id?' expanded':''}`;
  el.dataset.index=index;el.dataset.id=task.id;el.draggable=false;

  // ── Row ──
  const row=ce('div','task-row');
  row.addEventListener('click',e=>{
    if(e.target.closest('.task-btn')||e.target.closest('.status-chip'))return;
    expandTask(expandedTaskId===task.id?null:task.id);
  });

  // Drag handle
  const handle=ce('span','drag-handle','⋮⋮');if(isDone)handle.style.cursor='default';row.appendChild(handle);

  // Color dot
  const dot=ce('span','task-color-dot');dot.style.backgroundColor=task.color;row.appendChild(dot);

  // Status chip
  const sc=ce('span',`status-chip ${task.status}`,task.status.charAt(0).toUpperCase()+task.status.slice(1));
  sc.addEventListener('click',e=>{e.stopPropagation();cycleStatus(task.id);});row.appendChild(sc);

  // Priority badge
  const prio=PRIORITIES[task.priority]||PRIORITIES.medium;
  const badge=ce('span',`task-prio ${prio.css}`,prio.label);row.appendChild(badge);

  // Title
  const titleEl=ce('span','task-title',task.title);titleEl.title=task.title;row.appendChild(titleEl);

  // Due date inline
  if(task.dueDate){
    const due=formatDueDate(task.dueDate);
    if(due){
      const dEl=ce('span',`due-date-inline ${due.css}`,due.text);
      dEl.title=task.dueDate;row.appendChild(dEl);
    }
  }

  // Expand indicator
  const expBtn=ce('button','task-btn expand',expandedTaskId===task.id?'▴':'▾');
  expBtn.title=expandedTaskId===task.id?'Collapse':'Expand';
  expBtn.addEventListener('click',e=>{e.stopPropagation();expandTask(expandedTaskId===task.id?null:task.id);});

  // Actions
  const actions=ce('div','task-actions');
  const doneBtn=ce('button','task-btn done',isDone?'↩':'✓');
  doneBtn.title=isDone?'Reopen':'Mark done';
  doneBtn.addEventListener('click',e=>{e.stopPropagation();updateTask(task.id,{status:isDone?'active':'done'});});
  actions.appendChild(doneBtn);
  const delBtn=ce('button','task-btn delete','✕');
  delBtn.title='Delete';delBtn.addEventListener('click',e=>{e.stopPropagation();deleteTask(task.id);});
  actions.appendChild(delBtn);actions.appendChild(expBtn);
  row.appendChild(actions);el.appendChild(row);

  // ── Expand area ──
  const exp=ce('div','task-expand');

  // Status row
  const statusRow=ce('div','expand-row');
  statusRow.appendChild(ce('label','','Status:'));
  const statusGrp=ce('div','status-select-row');
  ['active','waiting','blocked'].forEach(s=>{
    const btn=ce('span',`status-opt ${s}-s`+(s===task.status?' active-status':''),s.charAt(0).toUpperCase()+s.slice(1));
    btn.dataset.status=s;btn.addEventListener('click',()=>updateTask(task.id,{status:s}));
    statusGrp.appendChild(btn);
  });
  statusRow.appendChild(statusGrp);exp.appendChild(statusRow);

  // Due date row
  const dueRow=ce('div','expand-row');
  dueRow.appendChild(ce('label','','Due:'));
  const dueInput=ce('input','task-due-input');dueInput.type='date';dueInput.value=task.dueDate||'';
  dueInput.addEventListener('change',()=>updateTask(task.id,{dueDate:dueInput.value||null}));
  dueInput.addEventListener('click',e=>e.stopPropagation());
  dueRow.appendChild(dueInput);exp.appendChild(dueRow);

  // Notes
  const notesArea=ce('textarea','task-notes');notesArea.placeholder='Notes…';notesArea.value=task.notes||'';
  notesArea.addEventListener('input',()=>{/* save on blur */});
  notesArea.addEventListener('blur',()=>{if(notesArea.value!==(task.notes||''))updateTask(task.id,{notes:notesArea.value});});
  notesArea.addEventListener('click',e=>e.stopPropagation());
  exp.appendChild(notesArea);

  el.appendChild(exp);

  // Drag events
  if(!isDone){
    el.addEventListener('dragstart',handleDragStart);el.addEventListener('dragover',handleDragOver);
    el.addEventListener('drop',handleDrop);el.addEventListener('dragend',handleDragEnd);
    handle.addEventListener('mousedown',()=>{el.draggable=true});
    handle.addEventListener('dragend',()=>{el.draggable=false});
  }
  return el;
}

function formatDueDate(d){
  if(!d)return null;
  // Parse as UTC midnight to avoid timezone drift
  const dueDate=new Date(d+'T00:00:00.000Z');
  const now=new Date();now.setUTCHours(0,0,0,0);
  const diff=Math.ceil((dueDate.getTime()-now.getTime())/86400000);
  if(diff<0)return{text:'Overdue',css:'overdue'};
  if(diff===0)return{text:'Today',css:'today'};
  if(diff===1)return{text:'Tomorrow',css:'soon'};
  if(diff<=5)return{text:`in ${diff}d`,css:'soon'};
  return null;
}

function cycleStatus(id){
  const t=tasks.find(t=>t.id===id);if(!t)return;
  const idx=CYCLE_STATUSES.indexOf(t.status);
  if(idx===-1)return; // already 'done', don't cycle
  const next=CYCLE_STATUSES[(idx+1)%CYCLE_STATUSES.length];
  updateTask(id,{status:next});
}

function ce(tag,cls,text){
  const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;
}

// ═══════════════════════ DRAG & DROP ═══════════════════════

function handleDragStart(e){if(!currentOrg||hasActiveFilters()){e.preventDefault();return}dragSrcIdx=parseInt(this.dataset.index,10);this.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain','');}
function handleDragOver(e){e.preventDefault();e.dataTransfer.dropEffect='move';this.classList.add('drag-over');}
function handleDrop(e){e.preventDefault();e.stopPropagation();this.classList.remove('drag-over');const ti=parseInt(this.dataset.index,10);if(dragSrcIdx!==null&&dragSrcIdx!==ti)moveTask(dragSrcIdx,ti);dragSrcIdx=null;}
function handleDragEnd(){this.classList.remove('dragging');this.draggable=false;$$('.task-item').forEach(el=>el.classList.remove('drag-over'));dragSrcIdx=null;}

// ═══════════════════════ UI HELPERS ═══════════════════════

function setViewUI(){
  D.viewOrg.classList.toggle('active',viewMode==='org');
  D.viewDash.classList.toggle('active',viewMode==='dashboard');
  D.orgView.classList.toggle('hidden',viewMode!=='org');
  D.dashboardView.classList.toggle('hidden',viewMode!=='dashboard');
  D.stateNoOrg.classList.add('hidden');
  if(viewMode==='dashboard'){D.addForm.style.display='none';$('#filter-bar').style.display='none';refreshDashboard();}
  else{D.addForm.style.display='';$('#filter-bar').style.display='';}
}

async function refreshDashboard(){
  const data=await loadAllOrgData();renderDashboard(data);
}

// ═══════════════════════ COLOR PICKER ═══════════════════════

function buildColorPicker(){
  COLORS.forEach((c,i)=>{
    const o=ce('div');o.className='color-option'+(i===0?' active':'');o.style.backgroundColor=c;o.dataset.color=c;
    o.addEventListener('click',()=>selectColor(c,o));D.colorPicker.appendChild(o);
  });
}
function selectColor(color,el){
  selectedColor=color;D.btnColor.style.backgroundColor=color;
  D.colorPicker.querySelectorAll('.color-option').forEach(o=>o.classList.remove('active'));
  if(el)el.classList.add('active');D.colorPicker.classList.add('hidden');savePrefs();
}

// ═══════════════════════ EVENTS ═══════════════════════

function setupEvents(){
  // Form
  D.addForm.addEventListener('submit',e=>{e.preventDefault();addTask(D.taskInput.value);D.taskInput.value='';D.taskInput.focus();});
  D.taskInput.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();addTask(D.taskInput.value);D.taskInput.value='';}});

  // Priority
  D.btnPriority.addEventListener('click',e=>{e.stopPropagation();D.priorityDropdown.classList.toggle('hidden');D.colorPicker.classList.add('hidden');});
  D.priorityDropdown.querySelectorAll('.dropdown-item').forEach(item=>{item.addEventListener('click',e=>{e.stopPropagation();const p=item.dataset.priority;selectedPriority=p;const prio=PRIORITIES[p];D.btnPriority.innerHTML=`<span class="prio-dot ${prio.css}"></span> ${prio.label}`;D.btnPriority.dataset.priority=p;D.priorityDropdown.classList.add('hidden');savePrefs();});});

  // Color
  D.btnColor.addEventListener('click',e=>{e.stopPropagation();const r=D.btnColor.getBoundingClientRect();D.colorPicker.style.position='fixed';D.colorPicker.style.top=(r.bottom+3)+'px';D.colorPicker.style.left=Math.min(r.left,window.innerWidth-140)+'px';D.colorPicker.classList.toggle('hidden');D.priorityDropdown.classList.add('hidden');});

  // Close dropdowns on outside click
  document.addEventListener('click',()=>{D.priorityDropdown.classList.add('hidden');D.colorPicker.classList.add('hidden');D.exportMenu.classList.add('hidden');});

  // Filter bar
  let filterDebounce=null;
  D.filterSearch.addEventListener('input',()=>{
    filter.search=D.filterSearch.value.trim();
    clearTimeout(filterDebounce);
    filterDebounce=setTimeout(()=>{if(viewMode==='org')fullRenderOrg();},200);
    D.filterClear.style.display=hasActiveFilters()?'':'none';
  });
  D.filterChips.forEach(chip=>{
    chip.addEventListener('click',()=>{
      const s=chip.dataset.filterStatus, d=chip.dataset.filterDue;
      if(s){
        const idx=filter.statuses.indexOf(s);
        if(idx>-1)filter.statuses.splice(idx,1);else filter.statuses.push(s);
        chip.classList.toggle('on',idx===-1);
      }
      if(d){
        if(filter.due===d){filter.due=null;chip.classList.remove('on');}
        else{filter.due=d;D.filterChips.forEach(c=>{if(c.dataset.filterDue)c.classList.toggle('on',c.dataset.filterDue===d);});}
      }
      if(viewMode==='org')fullRenderOrg();
      D.filterClear.style.display=hasActiveFilters()?'':'none';
    });
  });
  D.filterClear.addEventListener('click',()=>clearFilters());

  // View toggle
  D.viewOrg.addEventListener('click',()=>{viewMode='org';setViewUI();expandTask(null);if(currentOrg)refreshOrg();});
  D.viewDash.addEventListener('click',()=>{viewMode='dashboard';setViewUI();});

  // Export menu
  D.btnMenu.addEventListener('click',e=>{e.stopPropagation();D.exportMenu.classList.toggle('hidden');});
  $('#export-copy-list').addEventListener('click',()=>{D.exportMenu.classList.add('hidden');copyActiveAsList();});
  $('#export-json-org').addEventListener('click',()=>{D.exportMenu.classList.add('hidden');exportJSON(true);});
  $('#export-json-all').addEventListener('click',()=>{D.exportMenu.classList.add('hidden');exportJSON(false);});
  $('#import-json').addEventListener('click',()=>{D.exportMenu.classList.add('hidden');importJSON();});

  // Settings
  D.btnSettings.addEventListener('click',()=>{chrome.runtime.openOptionsPage();});

  // Clear done
  D.btnClearDone.addEventListener('click',()=>clearDone());
  D.errorDismiss.addEventListener('click',()=>D.stateError.classList.add('hidden'));

  // Org rename
  D.orgEditBtn.addEventListener('click',showOrgEdit);D.orgEditSave.addEventListener('click',saveOrgEdit);
  D.orgEditCancel.addEventListener('click',cancelOrgEdit);
  D.orgEditInput.addEventListener('keydown',e=>{if(e.key==='Enter')saveOrgEdit();if(e.key==='Escape')cancelOrgEdit();});

  // Tab listeners
  if(chrome.tabs&&chrome.tabs.onActivated)chrome.tabs.onActivated.addListener(()=>{if(viewMode==='org')refreshOrg();});
}

// ═══════════════════════ ORG EDIT ═══════════════════════

function showOrgEdit(){D.orgDisplay.classList.add('hidden');D.orgEditRow.classList.remove('hidden');D.orgEditInput.value=currentOrg?currentOrg.label:'';D.orgEditInput.focus();D.orgEditInput.select();}
function cancelOrgEdit(){D.orgDisplay.classList.remove('hidden');D.orgEditRow.classList.add('hidden');}
async function saveOrgEdit(){const v=D.orgEditInput.value.trim();if(v&&currentOrg){currentOrg.label=v;currentOrg.isCustom=true;D.orgName.textContent=v;await saveOrgLabel(currentOrg);}D.orgDisplay.classList.remove('hidden');D.orgEditRow.classList.add('hidden');}

// ═══════════════════════ ORG SWITCHING ═══════════════════════

async function refreshOrg(){
  const seq=++orgSwitchSeq;
  const org=await detectOrg();if(seq!==orgSwitchSeq)return;
  if(!org){setNoOrg();return;}
  if(currentOrg&&currentOrg.key===org.key)return;
  await loadOrgLabel(org);if(seq!==orgSwitchSeq)return;
  if(saveTimer){clearTimeout(saveTimer);await saveTasks();}
  currentOrg=org;D.orgName.textContent=org.label;
  D.orgDisplay.classList.remove('hidden');D.orgEditRow.classList.add('hidden');
  D.stateNoOrg.classList.add('hidden');D.addForm.style.display='';
  expandTask(null);clearFilters();
  if(seq!==orgSwitchSeq)return;
  await loadTasks();if(seq!==orgSwitchSeq)return;
  fullRenderOrg();
}
function setNoOrg(){
  currentOrg=null;tasks=[];
  D.orgName.textContent='No org detected';D.stateNoOrg.classList.remove('hidden');
  D.stateEmpty.classList.add('hidden');D.addForm.style.display='none';
  while(D.taskList.firstChild)D.taskList.removeChild(D.taskList.firstChild);
  D.taskCount.textContent='';
}

// ═══════════════════════ LIFECYCLE ═══════════════════════

document.addEventListener('visibilitychange',()=>{if(document.hidden&&saveTimer){clearTimeout(saveTimer);saveTasks();}});

// ═══════════════════════ BOOT ═══════════════════════

async function init(){
  buildColorPicker();await loadPrefs();applyPrefs();
  await loadSettings();applySettingsToUI();
  // Sync color picker UI
  const ci=COLORS.indexOf(selectedColor);
  D.colorPicker.querySelectorAll('.color-option').forEach((o,i)=>o.classList.toggle('active',i===ci));
  D.btnColor.style.backgroundColor=selectedColor;
  setupEvents();setViewUI();
  if(viewMode==='org')await refreshOrg();
}
init();
})();
