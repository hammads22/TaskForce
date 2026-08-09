// Taskforce — Settings Page JS
'use strict';

(function(){
const SETTINGS_KEY = 'sftasks_settings';
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// ── Default settings ──
const DEFAULTS = {
  theme: 'system',
  fontSize: 13,
  density: 'compact',
  statusColors: true,
  orgBadge: true,
  exportNotes: true,
  exportOrg: true,
  defaultOrg: 'last',
  shortcuts: [
    { action: 'Move focus down', keys: ['J'] },
    { action: 'Move focus up', keys: ['K'] },
    { action: 'Open task detail', keys: ['Enter'] },
    { action: 'Focus search bar', keys: ['/'] },
    { action: 'Toggle status filter', keys: ['S'] },
    { action: 'Clear all filters', keys: ['Esc'] },
    { action: 'Cycle task status', keys: ['Ctrl', '.'] },
    { action: 'Open org switcher', keys: ['Ctrl', 'O'] },
    { action: 'Toggle due date filter', keys: ['D'] },
    { action: 'Quick-create task', keys: ['N'] },
  ]
};

let settings = JSON.parse(JSON.stringify(DEFAULTS));

// ── Theme ──
function getResolvedTheme(pref) {
  if (pref === 'light') return 'light';
  if (pref === 'dark') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(pref) {
  const resolved = getResolvedTheme(pref);
  document.documentElement.setAttribute('data-theme', resolved);
  settings.theme = pref;
  save();
  // Update both the header quick-toggle and segmented control
  $$('.theme-quick-btn, .theme-seg-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === pref));
}

// Only fire on actual theme button clicks, NOT on <html data-theme>
document.addEventListener('click', e => {
  const btn = e.target.closest('button[data-theme]');
  if (btn) {
    applyTheme(btn.dataset.theme);
    showToast('Theme: ' + (btn.dataset.theme === 'system' ? 'System' : btn.dataset.theme.charAt(0).toUpperCase() + btn.dataset.theme.slice(1)));
  }
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (settings.theme === 'system') applyTheme('system');
});

// ── Tabs ──
$$('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.tab-btn').forEach(b => b.classList.remove('active'));
    $$('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $('#panel-' + btn.dataset.tab).classList.add('active');
  });
});

// ── Font size (applies to the whole settings page + preview) ──
const slider = $('#font-size-slider');
const preview = $('#preview-card');
const fontVal = $('#font-size-value');
const labels = { 11: $('#label-sm'), 13: $('#label-default'), 15: $('#label-lg'), 17: $('#label-xl') };

function applyFontSize(v) {
  document.body.style.fontSize = v + 'px';
  document.documentElement.style.fontSize = v + 'px';
  preview.style.fontSize = v + 'px';
  fontVal.textContent = v + 'px';
  Object.entries(labels).forEach(([px, el]) => el.classList.toggle('active-label', parseInt(px) === v));
}

slider.addEventListener('input', () => {
  const v = parseInt(slider.value);
  applyFontSize(v);
  settings.fontSize = v;
  save();
});

// ── Toast ──
let toastTimer;
function showToast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

// ── Toggles ──
$$('.toggle-switch input').forEach(cb => {
  cb.addEventListener('change', () => {
    const id = cb.id;
    if (id === 'toggle-status-colors') settings.statusColors = cb.checked;
    if (id === 'toggle-org-badge') settings.orgBadge = cb.checked;
    if (id === 'toggle-export-notes') settings.exportNotes = cb.checked;
    if (id === 'toggle-export-org') settings.exportOrg = cb.checked;
    save();
    const label = cb.closest('.toggle-row')?.querySelector('.toggle-label')?.textContent || 'Setting';
    showToast(label + ': ' + (cb.checked ? 'On' : 'Off'));
  });
});

// ── Select ──
$('#default-org').addEventListener('change', e => {
  settings.defaultOrg = e.target.value;
  save();
  showToast('Default org: ' + e.target.selectedOptions[0].textContent);
});

// ── Custom bindings ──
function renderBindings() {
  const container = $('#custom-bindings');
  container.innerHTML = '';

  settings.shortcuts.forEach((bind, idx) => {
    const row = document.createElement('div');
    row.className = 'binding-form';

    const select = document.createElement('select');
    select.className = 'binding-action-select';
    DEFAULTS.shortcuts.forEach(db => {
      const opt = document.createElement('option');
      opt.value = db.action;
      opt.textContent = db.action;
      if (db.action === bind.action) opt.selected = true;
      select.appendChild(opt);
    });

    const capture = document.createElement('div');
    capture.className = 'binding-key-capture';
    capture.tabIndex = 0;
    capture.setAttribute('role', 'button');
    capture.textContent = bind.keys.join(' + ');

    capture.addEventListener('click', () => capture.focus());
    capture.addEventListener('keydown', e => {
      e.preventDefault();
      e.stopPropagation();
      const keys = [];
      if (e.ctrlKey) keys.push('Ctrl');
      if (e.altKey) keys.push('Alt');
      if (e.shiftKey) keys.push('Shift');
      if (e.metaKey) keys.push('⌘');
      const k = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
      if (!['Control','Alt','Shift','Meta'].includes(k)) keys.push(k);

      capture.classList.remove('listening');
      capture.textContent = keys.join(' + ');
      bind.keys = keys;

      const conflict = settings.shortcuts.find((b, i) => i !== idx && b.keys.join('+') === keys.join('+'));
      const existing = row.querySelector('.binding-conflict');
      if (existing) existing.remove();
      if (conflict) {
        const warn = document.createElement('div');
        warn.className = 'binding-conflict';
        warn.textContent = '⚠ Already bound to "' + conflict.action + '"';
        row.appendChild(warn);
      }
      save();
      showToast('Rebound "' + bind.action + '" to ' + keys.join(' + '));
    });

    capture.addEventListener('focus', () => { capture.classList.add('listening'); capture.textContent = '⋯'; });
    capture.addEventListener('blur', () => { capture.classList.remove('listening'); capture.textContent = bind.keys.join(' + '); });

    const resetBtn = document.createElement('button');
    resetBtn.className = 'binding-reset';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => {
      bind.keys = [...DEFAULTS.shortcuts[idx].keys];
      save();
      renderBindings();
      showToast('Reset "' + bind.action + '" to default');
    });

    row.appendChild(select);
    row.appendChild(capture);
    row.appendChild(resetBtn);
    container.appendChild(row);
  });
}

// Reset all bindings
$('#reset-all-bindings').addEventListener('click', () => {
  settings.shortcuts = JSON.parse(JSON.stringify(DEFAULTS.shortcuts));
  save();
  renderBindings();
  showToast('All shortcuts reset to defaults');
});

// Export bindings
$('#export-bindings').addEventListener('click', () => {
  try {
    const blob = new Blob([JSON.stringify(settings.shortcuts, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'sftasks-shortcuts.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
    showToast('Keyboard config exported');
  } catch (e) { showToast('Export failed'); }
});

// Import bindings
$('#import-bindings').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (Array.isArray(imported) && imported.every(s => s.action && Array.isArray(s.keys))) {
          settings.shortcuts = imported;
          save();
          renderBindings();
          showToast('Keyboard config imported');
        } else {
          showToast('Invalid file format');
        }
      } catch (e) { showToast('Failed to parse file'); }
    };
    reader.readAsText(file);
  });
  input.click();
});

// ── Storage ──
function save() {
  try {
    chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  } catch (e) {}
}

async function load() {
  try {
    const r = await chrome.storage.local.get(SETTINGS_KEY);
    if (r[SETTINGS_KEY]) {
      const s = r[SETTINGS_KEY];
      settings = { ...DEFAULTS, ...s };
      if (!Array.isArray(settings.shortcuts)) settings.shortcuts = DEFAULTS.shortcuts;
    }
  } catch (e) {}
}

function applyUI() {
  // Theme
  const resolved = getResolvedTheme(settings.theme || 'system');
  document.documentElement.setAttribute('data-theme', resolved);
  $$('.theme-quick-btn, .theme-seg-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === settings.theme));

  // Font size
  const fs = settings.fontSize || 13;
  slider.value = fs;
  applyFontSize(fs);

  // Toggles
  $('#toggle-status-colors').checked = settings.statusColors;
  $('#toggle-org-badge').checked = settings.orgBadge;
  $('#toggle-export-notes').checked = settings.exportNotes;
  $('#toggle-export-org').checked = settings.exportOrg;

  // Select
  $('#default-org').value = settings.defaultOrg || 'last';

  // Bindings
  renderBindings();
}

// ── Init ──
async function init() {
  await load();
  applyUI();
}
init();

})();
