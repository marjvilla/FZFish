/* ── FZFish app.js ── */

// ── Constants ────────────────────────────────────────────────────────────────
const CLIENT_ID     = '239772949162-ctqj91o3e56lep520shlo1trhq0rv42r.apps.googleusercontent.com';
const SHEET_ID      = '1AviXu1_KPFRx158Af05qBmA-LCw2GhxJxvfZEFUCuqY';
const TAB_NAME      = 'Fish';
const DRIVE_FOLDER  = '1VTpNTlB-JMLPZNKzgm0IIXCRkk9Agzf7';
const SCOPES        = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file openid email';

// ── State ────────────────────────────────────────────────────────────────────
let tokenClient       = null;
let accessToken       = null;
let tokenExpiry       = 0;
let tokenResolvers    = [];
let sheetGid          = 0;
let currentUser       = '';

let fishData          = [];
let filtered          = [];
let activeStatuses    = new Set();   // empty = All
let activePosMarkers      = new Set();
let activeNegMarkers      = new Set();
let activeUnsortedMarkers = new Set();
let activeDpfMin      = null;
let activeDpfMax      = null;
let currentMarkers         = [];
let currentNegMarkers      = [];
let currentUnsortedMarkers = [];
let currentPhotoUrl   = null;
let originalPhotoUrl  = null;
let pendingPhotoFile  = null;
let currentThumbPos   = '50% 15%';
let editingId         = null;
let demoMode          = false;
let selectionMode     = false;
let selectedTankIds   = new Set();
let selectionContext  = null;   // null | { type:'experiment'|'experiment-remove', exp }
let lastSelectionIdx  = -1;
let lastSelectionWasAdd = true;
let scannerRunning    = false;
let scanForForm       = false;
let experiments       = [];
let currentExperiment = null;
let groupByColor      = false;
let pickerSelected    = new Set();
let sortDir           = -1;  // -1 = desc (newest first for dates), 1 = asc
let imgOff            = localStorage.getItem('fzfish-img-off') === 'true';

// A  B     C          D    E      F         G            H       I      J        K      L
// ID Line  Unsorted   Date Count  Location  PosMarkers   Status  Notes  Updated  Photo  NegMarkers
const COL = {
  tankId:     0, line:     1, unsorted:   2,
  age:        3, count:    4, location:   5,
  markers:    6, status:   7, notes:      8,
  updated:    9, photo:   10, negMarkers: 11,
  thumbPos:  12,
};

// ── Demo data ────────────────────────────────────────────────────────────────
const DEMO = [
  { tankId:'demo-1', line:'fli1:EGFP',     unsorted:[], age:'2025-01-10', count:12, location:'R1 S2', markers:['EGFP','fli1'],    negMarkers:[],        status:'Active',    notes:'Healthy, spawning well', photoUrl:'', updated:'2025-04-20' },
  { tankId:'demo-2', line:'gata1:DsRed x AB',   unsorted:[], age:'2025-02-01', count:8,  location:'R1A S3', markers:['DsRed','gata1'],  negMarkers:['fli1'],  status:'Breeding',  notes:'Set up breeding pair',   photoUrl:'', updated:'2025-04-22' },
  { tankId:'demo-3', line:'casper',            unsorted:[], age:'2024-12-05', count:3,  location:'R2B S3', markers:[],                 negMarkers:[],        status:'Low Stock', notes:'Need to expand',          photoUrl:'', updated:'2025-04-15' },
  { tankId:'demo-4', line:'mpeg1:mCherry', unsorted:[], age:'2025-03-15', count:20, location:'R2A S4', markers:[], negMarkers:['DsRed'], status:'Active',    notes:'mpeg?',                       photoUrl:'', updated:'2025-04-21' },
  { tankId:'demo-5', line:'AB WT',      unsorted:[], age:'2024-10-01', count:6,  location:'R3 S1', markers:[],                 negMarkers:[],        status:'Archived',  notes:'Retired breeders',        photoUrl:'', updated:'2025-03-10' },
  { tankId:'demo-6', line:'Tg(huc:GCaMP6s)',  unsorted:[], age:'2025-03-01', count:15, location:'N1 S1', markers:['GCaMP6s','huc'],  negMarkers:[],        status:'Nursery',   notes:'Imaging stock',           photoUrl:'', updated:'2025-04-23' },
];

// ── Location helpers ─────────────────────────────────────────────────────────
function parseLocation(str) {
  if (!str) return null;
  const s = str.trim();
  let m = s.match(/^[Rr](\d+)([ABab]?)\s*[Ss](\d+)$/);
  if (m) return { type: 'R', num: parseInt(m[1]), side: m[2].toUpperCase(), shelf: parseInt(m[3]) };
  m = s.match(/^[Nn](\d+)\s*[Ss](\d+)$/);
  if (m) return { type: 'N', num: parseInt(m[1]), side: '', shelf: parseInt(m[2]) };
  if (/^[Ii]ncubator$/i.test(s)) return { type: 'I', num: null, side: '', shelf: null };
  return null;
}

function formatLocation(type, num, shelf, side) {
  if (type === 'I') return 'Incubator';
  if (type === 'R') return `R${num}${side || ''} S${shelf}`;
  if (type === 'N') return `N${num} S${shelf}`;
  return '';
}

// ── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  if (imgOff) {
    document.getElementById('app')?.classList.add('img-off');
    ['img-toggle-btn', 'mob-img-btn'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.style.opacity = '0.4';
    });
  }
  if (localStorage.getItem('fzfish-demo') === 'true') { useDemoMode(); return; }

  // Restore session from sessionStorage if token still valid
  const storedToken  = sessionStorage.getItem('zb-token');
  const storedExpiry = parseInt(sessionStorage.getItem('zb-expiry') || '0');
  if (storedToken && Date.now() < storedExpiry) {
    accessToken  = storedToken;
    tokenExpiry  = storedExpiry;
    currentUser  = sessionStorage.getItem('zb-user') || '';
    waitForGIS(true);
    return;
  }

  waitForGIS(false);
});

function waitForGIS(autoConnect) {
  const poll = setInterval(() => {
    if (window.google?.accounts?.oauth2) {
      clearInterval(poll);
      initTokenClient();
      if (autoConnect) {
        Promise.all([fetchSheetGid(), fetchFromSheets()]).then(showApp).catch(() => {
          // Token may have expired silently; clear and show sign-in
          accessToken = null;
          sessionStorage.clear();
        });
      }
    }
  }, 100);
}

function initTokenClient() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (response) => {
      if (response.error) {
        tokenResolvers.forEach(r => r.reject(new Error(response.error)));
        tokenResolvers = [];
        const btn = document.getElementById('signin-btn');
        if (btn) { btn.disabled = false; btn.innerHTML = googleBtnHTML(); }
        return;
      }
      accessToken = response.access_token;
      tokenExpiry  = Date.now() + (response.expires_in - 60) * 1000;
      sessionStorage.setItem('zb-token',  accessToken);
      sessionStorage.setItem('zb-expiry', String(tokenExpiry));
      tokenResolvers.forEach(r => r.resolve());
      tokenResolvers = [];
    },
  });
}

function googleBtnHTML() {
  return `<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
    <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg> Sign in with Google`;
}

// ── Auth ─────────────────────────────────────────────────────────────────────
function ensureToken() {
  if (accessToken && Date.now() < tokenExpiry) return Promise.resolve();
  return new Promise((resolve, reject) => {
    tokenResolvers.push({ resolve, reject });
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

window.signIn = async function() {
  if (!tokenClient) { showToast('⚠️ Google Auth not ready yet, please wait…'); return; }
  const btn = document.getElementById('signin-btn');
  btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    await new Promise((resolve, reject) => {
      tokenResolvers.push({ resolve, reject });
      tokenClient.requestAccessToken({ prompt: 'select_account' });
    });
    await Promise.all([fetchSheetGid(), fetchFromSheets(), fetchUserInfo(), fetchExperiments()]);
    showApp();
  } catch(e) {
    btn.disabled = false; btn.innerHTML = googleBtnHTML();
  }
};

window.signOut = function() {
  if (accessToken) google.accounts.oauth2.revoke(accessToken, () => {});
  accessToken = null; tokenExpiry = 0; fishData = []; demoMode = false; currentUser = '';
  sessionStorage.clear();
  localStorage.removeItem('fzfish-demo');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('setup-overlay').classList.add('active');
  const btn = document.getElementById('signin-btn');
  btn.disabled = false; btn.innerHTML = googleBtnHTML();
};

window.useDemoMode = function() {
  demoMode = true;
  localStorage.setItem('fzfish-demo', 'true');
  fishData = DEMO.map((d, i) => ({ ...d, id: d.tankId, _rowIndex: i + 2 }));
  showApp();
  showToast('🐠 Demo mode active — data not saved');
};

function showApp() {
  document.getElementById('setup-overlay').classList.remove('active');
  document.getElementById('app').classList.remove('hidden');
  const signoutBtn = document.getElementById('signout-btn');
  if (signoutBtn) signoutBtn.textContent = demoMode ? 'Exit Demo' : 'Sign Out';
  renderAll();
  // Migration wizards are intentionally not auto-triggered.
  // Run manually via console if needed: checkLocationMigration() or checkUnsortedMigration()
}

async function fetchUserInfo() {
  try {
    const res  = await authFetch('https://www.googleapis.com/oauth2/v3/userinfo');
    const json = await res.json();
    currentUser = json.email || json.name || '';
    sessionStorage.setItem('zb-user', currentUser);
  } catch(e) { currentUser = ''; }
}

// ── Authenticated fetch ───────────────────────────────────────────────────────
async function authFetch(url, options = {}) {
  if (!accessToken || Date.now() > tokenExpiry) {
    showToast('⚠️ Session expired — please sign in again.');
    signOut(); throw new Error('No valid token');
  }
  return fetch(url, { ...options, headers: { ...options.headers, 'Authorization': `Bearer ${accessToken}` } });
}

// ── Google Sheets ─────────────────────────────────────────────────────────────
async function fetchSheetGid() {
  try {
    const res  = await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`);
    const json = await res.json();
    const sheet = (json.sheets || []).find(s => s.properties.title === TAB_NAME);
    sheetGid = sheet?.properties?.sheetId ?? 0;
  } catch(e) { console.warn('fetchSheetGid:', e.message); }
}

async function fetchFromSheets() {
  try {
    const res  = await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(TAB_NAME)}`);
    const json = await res.json();
    if (json.error) { showToast('❌ ' + json.error.message); return false; }
    const rows = json.values || [];
    fishData = rows.slice(1).map((r, i) => ({
      id:          r[COL.tankId]     || `row-${i+2}`,
      tankId:      r[COL.tankId]     || '',
      line:        r[COL.line]       || '',
      unsorted:    parseList(r[COL.unsorted]),
      age:         r[COL.age]        || '',
      count:       parseInt(r[COL.count]) || 0,
      location:    r[COL.location]   || '',
      markers:     parseList(r[COL.markers]),
      negMarkers:  parseList(r[COL.negMarkers]),
      status:      r[COL.status]     || 'Active',
      notes:       r[COL.notes]      || '',
      updated:     r[COL.updated]    || '',
      photoUrl:    normalizePhotoUrl(r[COL.photo] || ''),
      thumbPos:    r[COL.thumbPos]   || '',
      _rowIndex: i + 2,
    }));
    showToast('✅ Synced ' + fishData.length + ' tanks');
    return true;
  } catch(e) { showToast('❌ ' + e.message); return false; }
}

function parseList(val) {
  return val ? String(val).split(',').map(m => m.trim()).filter(Boolean) : [];
}

async function appendToSheets(record) {
  const res   = await authFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(TAB_NAME)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [recordToRow(record)] }) }
  );
  const json  = await res.json();
  const match = json.updates?.updatedRange?.match(/(\d+)$/);
  return match ? parseInt(match[1]) : null;
}

async function updateSheetRow(record, rowIndex) {
  await authFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(TAB_NAME + '!A' + rowIndex)}?valueInputOption=RAW`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [recordToRow(record)] }) }
  );
}

async function deleteSheetRow(rowIndex) {
  await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId: sheetGid, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex } } }] }),
  });
}

function recordToRow(r) {
  return [
    r.tankId, r.line, (r.unsorted || []).join(', '), r.age, r.count, r.location,
    (r.markers    || []).join(', '),
    r.status, r.notes,
    r.updated || new Date().toISOString().slice(0, 16).replace('T', ' '),
    r.photoUrl    || '',
    (r.negMarkers || []).join(', '),
    r.thumbPos    || '',
  ];
}

window.syncSheets = async function() {
  const btn = document.getElementById('sync-btn');
  btn.classList.add('spinning');
  if (demoMode) { await new Promise(r => setTimeout(r, 600)); btn.classList.remove('spinning'); showToast('🐠 Demo mode — nothing to sync'); return; }
  await fetchFromSheets(); await fetchExperiments(); renderAll(); btn.classList.remove('spinning');
};

// ── Experiments ──────────────────────────────────────────────────────────────
async function fetchExperiments() {
  if (demoMode) return;
  try {
    const res  = await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`);
    const json = await res.json();
    const reserved = new Set([TAB_NAME.toLowerCase(), 'changelog']);
    const expSheets = (json.sheets || []).map(s => s.properties).filter(p => !reserved.has(p.title.toLowerCase()));
    // Only store names/gids — tank IDs are loaded lazily when an experiment is opened
    experiments = expSheets.map(p => ({ name: p.title, gid: p.sheetId, tankIds: null, tankGroups: null }));
    renderExperimentsDropdown();
  } catch(e) { console.warn('fetchExperiments:', e.message); }
}

async function loadExpTankIds(tabName) {
  try {
    const r = await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(tabName)}!A2:B`);
    const d = await r.json();
    const rows   = d.values || [];
    const ids    = rows.map(row => row[0]).filter(Boolean);
    const groups = {};
    rows.forEach(row => { if (row[0] && row[1]) groups[row[0]] = row[1]; });
    return { ids, groups };
  } catch(e) { return { ids: [], groups: {} }; }
}

async function saveExpTankIds(tabName, tankIds, tankGroups = {}) {
  const range = `${encodeURIComponent(tabName)}!A2:B`;
  await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}:clear`,
    { method: 'POST', headers: {'Content-Type':'application/json'} });
  if (tankIds.length) {
    const values = tankIds.map(id => [id, tankGroups[id] || '']);
    await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?valueInputOption=RAW`,
      { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ values }) });
  }
}

function renderExperimentsDropdown() {
  const list = document.getElementById('experiments-list');
  if (!list) return;
  list.innerHTML = experiments.length
    ? experiments.map((exp, i) => `
        <button class="exp-dd-row${currentExperiment?.gid === exp.gid ? ' exp-dd-active' : ''}"
            onclick="enterExperiment(${i});closeExperimentsDropdown()">
          <span class="exp-dd-name">${esc(exp.name)}</span>
          <span class="exp-dd-count">${exp.tankIds === null ? '…' : exp.tankIds.length + ' tanks'}</span>
        </button>`).join('')
    : '<p class="exp-dd-empty">No experiments yet.</p>';
}

window.toggleExperimentsDropdown = function() {
  const dd = document.getElementById('experiments-dropdown');
  if (dd.classList.contains('hidden')) {
    renderExperimentsDropdown();
    const rect = document.getElementById('experiments-btn').getBoundingClientRect();
    dd.style.top   = (rect.bottom + 4) + 'px';
    dd.style.right = (window.innerWidth - rect.right) + 'px';
    dd.classList.remove('hidden');
  } else {
    dd.classList.add('hidden');
  }
};
window.closeExperimentsDropdown = function() {
  document.getElementById('experiments-dropdown')?.classList.add('hidden');
};

window.enterExperiment = async function(idx) {
  const exp = experiments[idx];
  if (!exp) return;

  // Lazy-load tank IDs the first time this experiment is opened
  if (exp.tankIds === null) {
    showToast('Loading experiment…');
    if (demoMode) {
      exp.tankIds   = [];
      exp.tankGroups = {};
    } else {
      const loaded  = await loadExpTankIds(exp.name);
      exp.tankIds   = loaded.ids;
      exp.tankGroups = loaded.groups;
    }
  }

  const validIds = new Set(fishData.map(f => f.tankId));
  const cleaned  = exp.tankIds.filter(id => validIds.has(id));
  if (cleaned.length !== exp.tankIds.length) {
    exp.tankIds = cleaned;
    if (!demoMode) saveExpTankIds(exp.name, cleaned, exp.tankGroups || {});
  }
  currentExperiment = exp;
  document.getElementById('experiment-bar').classList.remove('hidden');
  document.getElementById('exp-name-display').textContent = exp.name;
  document.getElementById('exp-name-input').classList.add('hidden');
  document.getElementById('exp-name-display').classList.remove('hidden');
  document.getElementById('filter-panel')?.classList.add('exp-mode');
  document.getElementById('filter-toggle-bar')?.classList.add('exp-mode');
  document.getElementById('app')?.classList.add('in-experiment');
  renderAll();
};

window.exitExperiment = function() {
  currentExperiment = null;
  groupByColor      = false;
  document.getElementById('group-color-btn')?.classList.remove('active');
  document.getElementById('experiment-bar').classList.add('hidden');
  document.getElementById('filter-panel')?.classList.remove('exp-mode');
  document.getElementById('filter-toggle-bar')?.classList.remove('exp-mode');
  document.getElementById('app')?.classList.remove('in-experiment');
  renderAll();
};

// ── Selection mode ────────────────────────────────────────────────────────────
window.enterSelectionMode = function(context) {
  selectionMode       = true;
  selectedTankIds     = new Set();
  selectionContext    = context || null;
  lastSelectionIdx    = -1;
  lastSelectionWasAdd = true;
  document.getElementById('selection-bar')?.classList.remove('hidden');
  document.getElementById('sel-mode-btn')?.classList.add('active');
  document.getElementById('mob-sel-btn')?.classList.add('active');
  document.getElementById('app')?.classList.add('selecting');
  updateSelectionBar();
  renderGrid();
};

// Routes ☑ button: remove mode inside an experiment, general mode outside
window.enterSelectionModeAuto = function() {
  if (selectionMode) { exitSelectionMode(); return; }
  if (currentExperiment) enterSelectionModeForRemoval();
  else enterSelectionMode(null);
};

window.toggleGroupByColor = function() {
  groupByColor = !groupByColor;
  document.getElementById('group-color-btn')?.classList.toggle('active', groupByColor);
  renderGrid();
};

const GROUP_COLORS = ['green', 'red', 'blue', 'yellow'];
const GROUP_LABELS = { green: '🟢', red: '🔴', blue: '🔵', yellow: '🟡' };

window.enterSelectionModeForGroup = function(color) {
  const exp = currentExperiment;
  if (!exp) return;
  enterSelectionMode({ type: 'experiment-group', exp, color });
};

window.assignGroupToSelected = async function() {
  const ctx = selectionContext;
  if (ctx?.type !== 'experiment-group') return;
  const { exp, color } = ctx;
  if (!exp.tankGroups) exp.tankGroups = {};
  [...selectedTankIds].forEach(id => {
    const fish = fishData.find(f => f.id === id);
    if (!fish) return;
    if (color === 'none') delete exp.tankGroups[fish.tankId];
    else exp.tankGroups[fish.tankId] = color;
  });
  const expIdx = experiments.findIndex(e => e.gid === exp.gid);
  if (expIdx !== -1) experiments[expIdx].tankGroups = exp.tankGroups;
  if (!demoMode) await saveExpTankIds(exp.name, exp.tankIds, exp.tankGroups);
  const n = selectedTankIds.size;
  showToast(color === 'none'
    ? `○ Cleared group for ${n} tank${n > 1 ? 's' : ''}`
    : `${GROUP_LABELS[color]} Group assigned to ${n} tank${n > 1 ? 's' : ''}`);
  exitSelectionMode();
};

window.enterSelectionModeForExperiment = function() {
  const exp = currentExperiment;
  if (!exp) return;
  exitExperiment();                                // show all tanks
  enterSelectionMode({ type: 'experiment', exp }); // enterSelectionMode resets selectedTankIds then calls renderGrid
  // Pre-select tanks already in this experiment so the user can see current membership
  if (exp.tankIds?.length) {
    exp.tankIds.forEach(tankId => {
      const fish = fishData.find(f => f.tankId === tankId);
      if (fish) selectedTankIds.add(fish.id);
    });
    updateSelectionBar();
    renderGrid(); // re-render now that selectedTankIds is populated
  }
};

window.enterSelectionModeForRemoval = function() {
  const exp = currentExperiment;
  if (!exp) return;
  enterSelectionMode({ type: 'experiment-remove', exp });
};

window.exitSelectionMode = function() {
  const prevContext = selectionContext;
  selectionMode       = false;
  selectedTankIds     = new Set();
  selectionContext    = null;
  lastSelectionIdx    = -1;
  lastSelectionWasAdd = true;
  closeAddToExpDropdown();
  document.getElementById('selection-bar')?.classList.add('hidden');
  document.getElementById('sel-mode-btn')?.classList.remove('active');
  document.getElementById('mob-sel-btn')?.classList.remove('active');
  document.getElementById('app')?.classList.remove('selecting');
  // Re-enter the experiment if we were in add or remove context
  if (prevContext?.type === 'experiment' || prevContext?.type === 'experiment-remove') {
    const idx = experiments.indexOf(prevContext.exp);
    if (idx !== -1) enterExperiment(idx);
    else renderAll();
  } else {
    renderAll();
  }
};

window.toggleCardSelection = function(id, idx, isShift) {
  if (isShift && lastSelectionIdx >= 0 && selectionMode) {
    // Range: apply the same add/remove operation as the anchor click
    const start = Math.min(lastSelectionIdx, idx);
    const end   = Math.max(lastSelectionIdx, idx);
    for (let i = start; i <= end; i++) {
      const f = filtered[i];
      if (!f) continue;
      if (lastSelectionWasAdd) selectedTankIds.add(f.id);
      else selectedTankIds.delete(f.id);
    }
    // Don't update lastSelectionIdx — keep anchor for chained shift-clicks
  } else {
    if (selectedTankIds.has(id)) { selectedTankIds.delete(id); lastSelectionWasAdd = false; }
    else                         { selectedTankIds.add(id);    lastSelectionWasAdd = true;  }
    lastSelectionIdx = (idx !== undefined) ? idx : -1;
  }
  // Update all card visuals in-place (no full re-render → preserves scroll)
  document.querySelectorAll('.fish-card').forEach(card => {
    const cardId = card.dataset.id;
    const sel    = selectedTankIds.has(cardId);
    card.classList.toggle('card-selected', sel);
    const dot = card.querySelector('.card-sel-dot');
    if (dot) dot.classList.toggle('card-sel-dot-on', sel);
  });
  updateSelectionBar();
};

function updateSelectionBar() {
  const n       = selectedTankIds.size;
  const confirm = document.getElementById('sel-confirm-btn');
  const remove  = document.getElementById('sel-remove-btn');
  const addWrap = document.getElementById('sel-add-exp-wrap');
  const del     = document.getElementById('sel-delete-btn');
  const label   = document.getElementById('sel-count-label');
  if (label) label.textContent = n === 1 ? '1 selected' : `${n} selected`;

  if (selectionContext?.type === 'experiment') {
    // Sync-tanks context: confirm saves current selection as experiment membership
    const expName = selectionContext.exp.name;
    if (confirm) { confirm.textContent = `✓ Save "${expName}" (${n})`; confirm.classList.remove('hidden'); }
    if (remove)  remove.classList.add('hidden');
    if (addWrap) addWrap.classList.add('hidden');
    if (del)     del.classList.add('hidden');
  } else if (selectionContext?.type === 'experiment-remove') {
    // Remove context: confirm button removes from experiment
    const expName = selectionContext.exp.name;
    if (remove)  { remove.textContent = `✕ Remove ${n} from "${expName}"`; remove.classList.toggle('hidden', n === 0); }
    if (confirm) confirm.classList.add('hidden');
    if (addWrap) addWrap.classList.add('hidden');
    if (del)     del.classList.add('hidden');
  } else if (selectionContext?.type === 'experiment-group') {
    // Group-assign context: confirm button assigns color
    const { color } = selectionContext;
    const colorLabel = color === 'none' ? '○ Clear group' : `${GROUP_LABELS[color]} Assign`;
    if (confirm) { confirm.textContent = `${colorLabel} (${n} tank${n !== 1 ? 's' : ''})`; confirm.className = `sel-btn${color !== 'none' ? ' btn-group-' + color : ''}`; confirm.classList.toggle('hidden', n === 0); confirm.onclick = assignGroupToSelected; }
    if (remove)  remove.classList.add('hidden');
    if (addWrap) addWrap.classList.add('hidden');
    if (del)     del.classList.add('hidden');
  } else {
    // General mode: add-to-experiment dropdown + delete
    if (confirm) confirm.classList.add('hidden');
    if (remove)  remove.classList.add('hidden');
    if (addWrap) addWrap.classList.toggle('hidden', n === 0);
    if (del)     del.classList.toggle('hidden', n === 0);
  }
}

// ── Add-to-experiment dropdown (general selection mode) ───────────────────────
function buildAddToExpDropdown() {
  const dd = document.getElementById('sel-add-exp-dd');
  if (!dd) return;
  if (!experiments.length) {
    dd.innerHTML = '<div class="sel-add-exp-empty">No experiments yet</div>';
    return;
  }
  dd.innerHTML = experiments.map(exp =>
    `<button class="sel-add-exp-row" onclick='addSelectedToExperiment(${JSON.stringify(exp.name)})'>${esc(exp.name)}</button>`
  ).join('');
}

let _addExpDdOpen = false;
// Which marker accordion sections are expanded in the mobile filter sheet
let mfExpanded = { pos: false, neg: false, uns: false };
// Which fields the search bar indexes (desktop only — mobile always uses defaults)
let searchFields = new Set(['line', 'tankId', 'notes']);
const SEARCH_FIELD_OPTS = [
  { key: 'line',     label: 'Line Name' },
  { key: 'tankId',   label: 'Tank ID'   },
  { key: 'notes',    label: 'Notes'     },
  { key: 'location', label: 'Location'  },
  { key: 'markers',  label: 'Markers'   },
  { key: 'status',   label: 'Status'    },
];
window.toggleAddToExpDropdown = function(e) {
  e.stopPropagation();
  const dd = document.getElementById('sel-add-exp-dd');
  if (!dd) return;
  _addExpDdOpen = !_addExpDdOpen;
  if (_addExpDdOpen) {
    buildAddToExpDropdown();
    dd.classList.remove('hidden');
    // Close when clicking outside
    setTimeout(() => document.addEventListener('click', closeAddToExpDropdown, { once: true }), 0);
  } else {
    dd.classList.add('hidden');
  }
};

function closeAddToExpDropdown() {
  _addExpDdOpen = false;
  document.getElementById('sel-add-exp-dd')?.classList.add('hidden');
}

// ── Search field selector (desktop only) ─────────────────────────────────────
function updateSearchFieldsBtn() {
  const btn = document.getElementById('search-fields-btn');
  if (!btn) return;
  const defaults = ['line', 'tankId', 'notes'];
  const isDefault = searchFields.size === defaults.length && defaults.every(k => searchFields.has(k));
  btn.textContent = isDefault ? 'Fields ▾' : `Fields · ${searchFields.size} ▾`;
  btn.classList.toggle('active', !isDefault);
}
window.toggleSearchFieldsDd = function(e) {
  e?.stopPropagation();
  const dd = document.getElementById('search-fields-dd');
  if (!dd) return;
  const opening = dd.classList.contains('hidden');
  dd.classList.toggle('hidden', !opening);
  if (opening) {
    dd.innerHTML = SEARCH_FIELD_OPTS.map(({ key, label }) => {
      const on = searchFields.has(key);
      return `<label class="sf-row">
        <input type="checkbox" ${on ? 'checked' : ''}
          onchange="toggleSearchField('${key}',this.checked)">
        <span>${label}</span>
      </label>`;
    }).join('');
    setTimeout(() => document.addEventListener('click', () => dd.classList.add('hidden'), { once: true }), 0);
  }
};
window.toggleSearchField = function(key, checked) {
  if (checked) {
    searchFields.add(key);
  } else {
    if (searchFields.size > 1) searchFields.delete(key); // always keep at least one
    else return; // don't uncheck the last one
  }
  updateSearchFieldsBtn();
  filterFish();
};

window.addSelectedToExperiment = async function(expName) {
  const exp = experiments.find(e => e.name === expName);
  if (!exp) return;
  if (exp.tankIds === null) {
    if (demoMode) { exp.tankIds = []; exp.tankGroups = {}; }
    else { const l = await loadExpTankIds(exp.name); exp.tankIds = l.ids; exp.tankGroups = l.groups; }
  }
  // selectedTankIds holds UUIDs (f.id) — map to tankId strings for experiment storage
  const tankIds = [...selectedTankIds]
    .map(uid => fishData.find(f => f.id === uid)?.tankId).filter(Boolean);
  const newIds = tankIds.filter(tid => !exp.tankIds.includes(tid));
  if (newIds.length) {
    exp.tankIds = [...exp.tankIds, ...newIds];
    if (!demoMode) await saveExpTankIds(exp.name, exp.tankIds, exp.tankGroups || {});
    showToast(`✅ Added ${newIds.length} tank${newIds.length > 1 ? 's' : ''} to "${expName}"`);
  } else {
    showToast('Already in that experiment');
  }
  exitSelectionMode();
};

window.confirmSelectionAction = async function() {
  if (selectionContext?.type === 'experiment') {
    // Sync experiment membership to exactly what's selected
    // selectedTankIds has UUIDs — convert to tankId strings
    const exp      = selectionContext.exp;
    const newList  = [...selectedTankIds]
      .map(uid => fishData.find(f => f.id === uid)?.tankId).filter(Boolean);
    const added    = newList.filter(tid => !exp.tankIds.includes(tid)).length;
    const removed  = exp.tankIds.filter(tid => !newList.includes(tid)).length;
    // Clean up group assignments for removed tanks
    exp.tankIds.filter(tid => !newList.includes(tid))
      .forEach(tid => { if (exp.tankGroups) delete exp.tankGroups[tid]; });
    exp.tankIds = newList;
    if (!demoMode) await saveExpTankIds(exp.name, exp.tankIds, exp.tankGroups || {});
    const parts = [];
    if (added)   parts.push(`+${added} added`);
    if (removed) parts.push(`−${removed} removed`);
    showToast(parts.length ? `✅ ${parts.join(', ')}` : '✅ No changes');
    exitSelectionMode();
  } else if (selectionContext?.type === 'experiment-remove') {
    // Remove tanks from experiment (not from sheet)
    const exp       = selectionContext.exp;
    // selectedTankIds has UUIDs — resolve to tankId strings
    const tankIds   = [...selectedTankIds]
      .map(uid => fishData.find(f => f.id === uid)?.tankId).filter(Boolean);
    const n = tankIds.length;
    if (!confirm(`Remove ${n} tank${n > 1 ? 's' : ''} from "${exp.name}"? This can't be undone.`)) return;
    // Purge group assignments (keyed by tankId)
    tankIds.forEach(tid => { if (exp.tankGroups) delete exp.tankGroups[tid]; });
    exp.tankIds    = exp.tankIds.filter(tid => !tankIds.includes(tid));
    const expIdx   = experiments.findIndex(e => e.gid === exp.gid);
    if (expIdx !== -1) { experiments[expIdx].tankIds = exp.tankIds; experiments[expIdx].tankGroups = exp.tankGroups; }
    if (!demoMode) await saveExpTankIds(exp.name, exp.tankIds, exp.tankGroups || {});
    showToast(`✕ Removed ${n} tank${n > 1 ? 's' : ''} from "${exp.name}"`);
    exitSelectionMode();
  }
};

window.deleteSelected = async function() {
  const n = selectedTankIds.size;
  if (!n) return;
  if (!confirm(`Delete ${n} tank${n > 1 ? 's' : ''} from inventory? This can't be undone.`)) return;
  const ids = [...selectedTankIds];
  for (const id of ids) {
    const fish = fishData.find(f => f.id === id);
    if (!fish) continue;
    if (fish.photoUrl && !demoMode) deleteDrivePhoto(fish.photoUrl);
    if (!demoMode) {
      await deleteSheetRow(fish._rowIndex);
      fishData.forEach(f => { if (f._rowIndex > fish._rowIndex) f._rowIndex--; });
      logChange('Deleted', fish, []);
    }
    fishData = fishData.filter(f => f.id !== id);
  }
  showToast(`🗑 Deleted ${ids.length} tank${ids.length > 1 ? 's' : ''}`);
  invalidateMarkerFreq();
  exitSelectionMode();
};

window.startRenameExp = function() {
  const input = document.getElementById('exp-name-input');
  input.value = currentExperiment.name;
  document.getElementById('exp-name-display').classList.add('hidden');
  input.classList.remove('hidden');
  input.focus(); input.select();
};

window.saveRenameExp = async function() {
  const input   = document.getElementById('exp-name-input');
  const display = document.getElementById('exp-name-display');
  const newName = input.value.trim();
  input.classList.add('hidden');
  display.classList.remove('hidden');
  if (!newName || newName === currentExperiment.name) { display.textContent = currentExperiment.name; return; }
  const oldName = currentExperiment.name;
  const idx = experiments.findIndex(e => e.gid === currentExperiment.gid);
  display.textContent = newName;
  currentExperiment.name = newName;
  if (idx !== -1) experiments[idx].name = newName;
  renderExperimentsDropdown();
  if (demoMode) return;
  try {
    await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ requests: [{ updateSheetProperties: { properties: { sheetId: currentExperiment.gid, title: newName }, fields: 'title' } }] }),
    });
  } catch(e) {
    showToast('❌ Rename failed');
    currentExperiment.name = oldName;
    if (idx !== -1) experiments[idx].name = oldName;
    display.textContent = oldName;
  }
};

window.createExperiment = async function() {
  closeExperimentsDropdown();
  const name = prompt('Experiment name:');
  if (!name?.trim()) return;
  const trimmed = name.trim();
  if (demoMode) {
    const exp = { name: trimmed, gid: Date.now(), tankIds: [], tankGroups: {} };
    experiments.push(exp);
    enterExperiment(experiments.length - 1);
    return;
  }
  try {
    showToast('Creating…');
    const r = await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: trimmed } } }] }),
    });
    const d     = await r.json();
    const props = d.replies[0].addSheet.properties;
    await authFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(trimmed)}!A1?valueInputOption=RAW`,
      { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ values: [['Tank ID', 'Group']] }) }
    );
    const exp = { name: props.title, gid: props.sheetId, tankIds: [], tankGroups: {} };
    experiments.push(exp);
    enterExperiment(experiments.length - 1);
  } catch(e) { showToast('❌ ' + e.message); }
};

window.deleteExperiment = async function() {
  if (!currentExperiment) return;
  if (!confirm(`Delete experiment "${currentExperiment.name}"? This can't be undone.`)) return;
  const exp = currentExperiment;
  exitExperiment();
  experiments = experiments.filter(e => e.gid !== exp.gid);
  renderExperimentsDropdown();
  if (demoMode) return;
  try {
    await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ requests: [{ deleteSheet: { sheetId: exp.gid } }] }),
    });
  } catch(e) { showToast('❌ Delete failed: ' + e.message); }
};

window.removeFromExperiment = function(tankId, event) {
  event.stopPropagation();
  if (!currentExperiment) return;
  if (!confirm(`Remove this tank from "${currentExperiment.name}"? This can't be undone.`)) return;
  if (currentExperiment.tankGroups) delete currentExperiment.tankGroups[tankId];
  currentExperiment.tankIds = currentExperiment.tankIds.filter(id => id !== tankId);
  const idx = experiments.findIndex(e => e.gid === currentExperiment.gid);
  if (idx !== -1) { experiments[idx].tankIds = currentExperiment.tankIds; experiments[idx].tankGroups = currentExperiment.tankGroups; }
  if (!demoMode) saveExpTankIds(currentExperiment.name, currentExperiment.tankIds, currentExperiment.tankGroups || {});
  renderAll();
};

// ── Tank picker ───────────────────────────────────────────────────────────────
let pickerActiveStatus     = null;
let pickerActivePosMarkers = new Set();
let pickerActiveNegMarkers = new Set();
let pickerSortDir          = 1;

window.openTankPicker = function() {
  if (!currentExperiment) return;
  pickerSelected         = new Set(currentExperiment.tankIds);
  pickerActiveStatus     = null;
  pickerActivePosMarkers = new Set();
  pickerActiveNegMarkers = new Set();
  pickerSortDir          = 1;
  document.getElementById('picker-search').value = '';
  document.getElementById('picker-sort').value   = 'line';
  const dirBtn = document.getElementById('picker-sort-dir-btn');
  if (dirBtn) dirBtn.textContent = '↑';
  buildPickerStatusChips();
  buildPickerMarkerDropdowns();
  renderPickerGrid();
  document.getElementById('tank-picker-overlay').classList.add('active');
  document.body.classList.add('modal-open');

  const grid = document.getElementById('picker-grid');
  if (grid && !grid._scrollListenerAttached) {
    grid._scrollListenerAttached = true;
    const closePickerDds = () => {
      document.getElementById('picker-pos-dd')?.classList.add('hidden');
      document.getElementById('picker-neg-dd')?.classList.add('hidden');
    };
    grid.addEventListener('touchstart', closePickerDds, { passive: true });
    grid.addEventListener('scroll',     closePickerDds, { passive: true });
  }
};

function buildPickerStatusChips() {
  const statuses = ['Active','Nursery','Incubator','Low Stock','Breeding','Archived'];
  const wrap = document.getElementById('picker-status-chips');
  if (!wrap) return;
  wrap.innerHTML = statuses.map(s =>
    `<button class="chip picker-status-chip${pickerActiveStatus === s ? ' active' : ''}"
      onclick="setPickerStatus('${s}')">${s}</button>`
  ).join('');
}

window.setPickerStatus = function(status) {
  pickerActiveStatus = pickerActiveStatus === status ? null : status;
  buildPickerStatusChips();
  renderPickerGrid();
};

window.togglePickerSortDir = function() {
  pickerSortDir *= -1;
  const btn = document.getElementById('picker-sort-dir-btn');
  if (btn) btn.textContent = pickerSortDir === 1 ? '↑' : '↓';
  renderPickerGrid();
  buildPickerFilterSheet();
};

function buildPickerMarkerDropdowns() {
  const posBtn = document.getElementById('picker-pos-btn');
  const negBtn = document.getElementById('picker-neg-btn');
  if (posBtn) posBtn.textContent = '+Markers' + (pickerActivePosMarkers.size ? ` (${pickerActivePosMarkers.size})` : '') + ' ▾';
  if (negBtn) negBtn.textContent = '−Markers' + (pickerActiveNegMarkers.size ? ` (${pickerActiveNegMarkers.size})` : '') + ' ▾';
}

window.togglePickerPosDropdown = function() {
  const dd = document.getElementById('picker-pos-dd');
  if (!dd.classList.contains('hidden')) { dd.classList.add('hidden'); return; }
  document.getElementById('picker-neg-dd').classList.add('hidden');
  const rect = document.getElementById('picker-pos-btn').getBoundingClientRect();
  dd.style.top  = (rect.bottom + 4) + 'px';
  dd.style.left = rect.left + 'px';
  dd.innerHTML  = buildPickerMarkerHtml(uniquePosMarkers(), pickerActivePosMarkers, 'togglePickerPosMarker');
  dd.classList.remove('hidden');
};

window.togglePickerNegDropdown = function() {
  const dd = document.getElementById('picker-neg-dd');
  if (!dd.classList.contains('hidden')) { dd.classList.add('hidden'); return; }
  document.getElementById('picker-pos-dd').classList.add('hidden');
  const rect = document.getElementById('picker-neg-btn').getBoundingClientRect();
  dd.style.top  = (rect.bottom + 4) + 'px';
  dd.style.left = rect.left + 'px';
  dd.innerHTML  = buildPickerMarkerHtml(uniqueNegMarkers(), pickerActiveNegMarkers, 'togglePickerNegMarker');
  dd.classList.remove('hidden');
};

function buildPickerMarkerHtml(markers, activeSet, toggleFn) {
  if (!markers.length) return '<p class="marker-dropdown-empty">No markers in inventory</p>';
  return markers.map(m => `
    <label class="marker-check">
      <input type="checkbox" value="${esc(m)}" ${activeSet.has(m) ? 'checked' : ''}
        onchange="${toggleFn}('${esc(m)}', this.checked)" />
      ${esc(m)}
    </label>`).join('');
}

window.togglePickerPosMarker = function(m, checked) {
  if (checked) pickerActivePosMarkers.add(m); else pickerActivePosMarkers.delete(m);
  buildPickerMarkerDropdowns();
  renderPickerGrid();
};

window.togglePickerNegMarker = function(m, checked) {
  if (checked) pickerActiveNegMarkers.add(m); else pickerActiveNegMarkers.delete(m);
  buildPickerMarkerDropdowns();
  renderPickerGrid();
};

window.closeTankPicker = function() {
  document.getElementById('tank-picker-overlay').classList.remove('active');
  document.getElementById('picker-filter-sheet').classList.remove('open');
  checkScrollLock();
};

window.openPickerFilters = function() {
  buildPickerFilterSheet();
  document.getElementById('picker-filter-sheet').classList.add('open');
};

window.closePickerFilters = function() {
  document.getElementById('picker-filter-sheet').classList.remove('open');
};

window.clearAllPickerFilters = function() {
  pickerActiveStatus     = null;
  pickerActivePosMarkers = new Set();
  pickerActiveNegMarkers = new Set();
  document.getElementById('picker-sort').value = 'line';
  buildPickerStatusChips();
  buildPickerMarkerDropdowns();
  updatePickerFilterCount();
  renderPickerGrid();
  buildPickerFilterSheet();
};

function updatePickerFilterCount() {
  const count = (pickerActiveStatus ? 1 : 0) + pickerActivePosMarkers.size + pickerActiveNegMarkers.size;
  const el = document.getElementById('picker-filter-active-count');
  if (el) el.textContent = count ? ` (${count})` : '';
}

function buildPickerFilterSheet() {
  const body = document.getElementById('picker-filter-body');
  if (!body) return;
  const statuses = ['Active','Nursery','Incubator','Low Stock','Breeding','Archived'];
  let html = '';

  // Status
  html += '<div class="mf-section"><div class="mf-section-title">Status</div>';
  html += `<button class="mf-row${!pickerActiveStatus ? ' mf-row-active' : ''}"
      onclick="pickerActiveStatus=null;buildPickerStatusChips();updatePickerFilterCount();renderPickerGrid();buildPickerFilterSheet()">
    <span class="mf-check">${!pickerActiveStatus ? '✓' : ''}</span>
    <span class="mf-row-label">All</span>
  </button>`;
  statuses.forEach(s => {
    const on = pickerActiveStatus === s;
    html += `<button class="mf-row${on ? ' mf-row-active' : ''}"
        onclick="setPickerStatus('${s}');updatePickerFilterCount();buildPickerFilterSheet()">
      <span class="mf-check">${on ? '✓' : ''}</span>
      <span class="mf-row-label">${s}</span>
    </button>`;
  });
  html += '</div>';

  // Sort
  const sv  = document.getElementById('picker-sort')?.value || 'line';
  const dir = pickerSortDir === 1 ? '↑' : '↓';
  html += `<div class="mf-section"><div class="mf-section-title">Sort</div>
    <div class="mf-sort-row">
      <select class="mf-sort-select"
          onchange="document.getElementById('picker-sort').value=this.value;filterPicker()">
        <option value="line"    ${sv==='line'    ?'selected':''}>Line</option>
        <option value="age"     ${sv==='age'     ?'selected':''}>Fert. Date</option>
        <option value="count"   ${sv==='count'   ?'selected':''}>Count</option>
        <option value="updated" ${sv==='updated' ?'selected':''}>Last Updated</option>
      </select>
      <button class="mf-dir-btn" onclick="togglePickerSortDir()">${dir}</button>
    </div>
  </div>`;

  // + Markers
  const pm = uniquePosMarkers();
  if (pm.length) {
    html += '<div class="mf-section"><div class="mf-section-title">+ Markers (present)</div>';
    pm.forEach(m => {
      const on = pickerActivePosMarkers.has(m);
      html += `<button class="mf-row${on ? ' mf-row-active' : ''}"
          onclick="togglePickerPosMarker('${esc(m)}',${!on});updatePickerFilterCount();buildPickerFilterSheet()">
        <span class="mf-check">${on ? '✓' : ''}</span>
        <span class="mf-row-label mf-marker-pos">${esc(m)}</span>
      </button>`;
    });
    html += '</div>';
  }

  // − Markers
  const nm = uniqueNegMarkers();
  if (nm.length) {
    html += '<div class="mf-section"><div class="mf-section-title">− Markers (absent)</div>';
    nm.forEach(m => {
      const on = pickerActiveNegMarkers.has(m);
      html += `<button class="mf-row${on ? ' mf-row-active' : ''}"
          onclick="togglePickerNegMarker('${esc(m)}',${!on});updatePickerFilterCount();buildPickerFilterSheet()">
        <span class="mf-check">${on ? '✓' : ''}</span>
        <span class="mf-row-label mf-marker-neg">${esc(m)}</span>
      </button>`;
    });
    html += '</div>';
  }

  body.innerHTML = html;
  updatePickerFilterCount();
}

window.filterPicker = function() {
  renderPickerGrid();
};

function renderPickerGrid() {
  const q    = (document.getElementById('picker-search')?.value || '').toLowerCase();
  const sort = document.getElementById('picker-sort')?.value || 'line';
  const grid = document.getElementById('picker-grid');

  let list = fishData.filter(f => {
    if (pickerActiveStatus && f.status !== pickerActiveStatus) return false;
    if (pickerActivePosMarkers.size > 0) {
      const s = new Set(f.markers || []);
      for (const m of pickerActivePosMarkers) { if (!s.has(m)) return false; }
    }
    if (pickerActiveNegMarkers.size > 0) {
      const s = new Set(f.negMarkers || []);
      for (const m of pickerActiveNegMarkers) { if (!s.has(m)) return false; }
    }
    if (!q) return true;
    return (
      f.line.toLowerCase().includes(q) ||
      (f.unsorted || []).join(' ').toLowerCase().includes(q) ||
      (f.location || '').toLowerCase().includes(q) ||
      (f.tankId   || '').toLowerCase().includes(q) ||
      (f.markers  || []).some(m => m.toLowerCase().includes(q))
    );
  });

  list = [...list].sort((a, b) => {
    let cmp = 0;
    if (sort === 'age')     cmp = (a.age     || '').localeCompare(b.age     || '');
    else if (sort === 'count')   cmp = (a.count   || 0) - (b.count   || 0);
    else if (sort === 'updated') cmp = (a.updated || '').localeCompare(b.updated || '');
    else                         cmp = a.line.localeCompare(b.line);
    return pickerSortDir * cmp;
  });
  if (!list.length) { grid.innerHTML = '<p class="picker-empty">No tanks found.</p>'; return; }
  grid.innerHTML = list.map(f => {
    const checked = pickerSelected.has(f.tankId);
    const posHtml = (f.markers || []).map(m => `<span class="m-tag">${esc(m)}</span>`).join('');
    return `<label class="picker-card${checked ? ' picker-card-checked' : ''}">
      <input type="checkbox" class="picker-cb" value="${esc(f.tankId)}"
        ${checked ? 'checked' : ''} onchange="togglePickerTank('${esc(f.tankId)}', this.checked)" />
      <div class="picker-card-body">
        <div class="picker-card-line">${esc(f.line)}</div>
        <div class="picker-card-meta">
          <span class="status-badge badge-${f.status}">${esc(f.status)}</span>
          ${f.tankId   ? `<span class="picker-card-id">${esc(f.tankId)}</span>` : ''}
          ${f.location ? `<span class="picker-card-loc">📍 ${esc(f.location)}</span>` : ''}
          ${posHtml}
        </div>
      </div>
    </label>`;
  }).join('');
  updatePickerBtn();
}

window.togglePickerTank = function(tankId, checked) {
  if (checked) pickerSelected.add(tankId);
  else pickerSelected.delete(tankId);
  document.querySelector(`.picker-cb[value="${tankId}"]`)?.closest('.picker-card')?.classList.toggle('picker-card-checked', checked);
  updatePickerBtn();
};

function updatePickerBtn() {
  const btn = document.getElementById('picker-confirm-btn');
  if (btn) btn.textContent = `Done (${pickerSelected.size} selected)`;
}

window.confirmTankPicker = async function() {
  if (!currentExperiment) return;
  const btn = document.getElementById('picker-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  currentExperiment.tankIds = [...pickerSelected];
  const idx = experiments.findIndex(e => e.gid === currentExperiment.gid);
  if (idx !== -1) experiments[idx].tankIds = currentExperiment.tankIds;
  if (!demoMode) {
    try { await saveExpTankIds(currentExperiment.name, currentExperiment.tankIds, currentExperiment.tankGroups || {}); }
    catch(e) { showToast('❌ ' + e.message); if (btn) { btn.disabled = false; updatePickerBtn(); } return; }
  }
  closeTankPicker();
  renderAll();
  renderExperimentsDropdown();
  showToast(`✅ ${currentExperiment.tankIds.length} tanks saved`);
};

// ── Changelog ────────────────────────────────────────────────────────────────
function diffRecord(oldRec, newRec) {
  const fields = [
    { key: 'line',     label: 'Line'       },
    { key: 'age',      label: 'Fert. Date' },
    { key: 'count',    label: 'Count'      },
    { key: 'location', label: 'Location'   },
    { key: 'status',   label: 'Status'     },
    { key: 'notes',    label: 'Notes'      },
  ];
  const changes = [];
  fields.forEach(({ key, label }) => {
    const o = String(oldRec[key] ?? '');
    const n = String(newRec[key] ?? '');
    if (o !== n) changes.push(`${label}: "${o}" → "${n}"`);
  });
  // Markers
  const oldPos = (oldRec.markers    || []).join(', ') || '—';
  const newPos = (newRec.markers    || []).join(', ') || '—';
  if (oldPos !== newPos) changes.push(`+Markers: [${oldPos}] → [${newPos}]`);
  const oldNeg = (oldRec.negMarkers || []).join(', ') || '—';
  const newNeg = (newRec.negMarkers || []).join(', ') || '—';
  if (oldNeg !== newNeg) changes.push(`−Markers: [${oldNeg}] → [${newNeg}]`);
  const oldUnsorted = (oldRec.unsorted || []).join(', ') || '—';
  const newUnsorted = (newRec.unsorted || []).join(', ') || '—';
  if (oldUnsorted !== newUnsorted) changes.push(`?Markers: [${oldUnsorted}] → [${newUnsorted}]`);
  // Photo
  const hadPhoto = !!oldRec.photoUrl;
  const hasPhoto = !!newRec.photoUrl;
  if (!hadPhoto && hasPhoto)                                changes.push('Photo: added');
  else if (hadPhoto && !hasPhoto)                           changes.push('Photo: removed');
  else if (hadPhoto && hasPhoto && oldRec.photoUrl !== newRec.photoUrl) changes.push('Photo: replaced');
  return changes.length ? changes.join(' | ') : 'No changes';
}

function logChange(action, record, details = '') {
  if (demoMode) return;
  const row = [new Date().toISOString(), action, record.tankId || '', record.line || '', currentUser || '', details];
  authFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/changelog:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [row] }) }
  ).catch(e => console.warn('Changelog:', e));
}

// ── Google Drive ──────────────────────────────────────────────────────────────
function compressPhoto(file) {
  return new Promise((resolve) => {
    const MAX_PX = 1800;
    const QUALITY = 0.75;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_PX || height > MAX_PX) {
        if (width >= height) { height = Math.round(height * MAX_PX / width); width = MAX_PX; }
        else                 { width  = Math.round(width  * MAX_PX / height); height = MAX_PX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

async function uploadPhoto(file) {
  const compressed = await compressPhoto(file);
  const metadata = { name: `fzfish_${Date.now()}_${file.name.replace(/\.[^.]+$/, '.jpg')}`, mimeType: 'image/jpeg', parents: [DRIVE_FOLDER] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', compressed);
  const { id: fileId } = await (await authFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', body: form })).json();
  await authFetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
  return `https://lh3.googleusercontent.com/d/${fileId}=w800`;
}

function extractDriveFileId(url) {
  if (!url) return null;
  // lh3 CDN format: lh3.googleusercontent.com/d/FILEID=w800
  const lh3 = url.match(/lh3\.googleusercontent\.com\/d\/([^?=\s]+)/);
  if (lh3) return lh3[1];
  // Old thumbnail format: ?id=FILEID or &id=FILEID
  const thumb = url.match(/[?&]id=([^&]+)/);
  if (thumb) return thumb[1];
  return null;
}

// Convert any stored Drive URL to the cookie-free lh3 CDN format
function normalizePhotoUrl(url) {
  if (!url) return '';
  if (url.includes('lh3.googleusercontent.com')) return url; // already correct
  const id = extractDriveFileId(url);
  return id ? `https://lh3.googleusercontent.com/d/${id}=w800` : url;
}

async function deleteDrivePhoto(photoUrl) {
  const id = extractDriveFileId(photoUrl);
  if (!id || demoMode) return;
  try { await authFetch(`https://www.googleapis.com/drive/v3/files/${id}`, { method: 'DELETE' }); } catch(e) {}
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderAll() {
  updateStats();
  updateMarkerDatalists();
  updateFilterSummary(); // also calls updateMiniStats()
  filterFish();
}

function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return isNaN(dt) ? d : dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '—';
  const dt = new Date(d.includes('T') || d.includes(' ') ? d.replace(' ', 'T') : d + 'T00:00:00');
  if (isNaN(dt)) return d;
  const date = dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const time = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return d.length > 10 ? `${date} · ${time}` : date;
}

function calcDpf(d) {
  if (!d) return '?';
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt)) return '?';
  return Math.floor((Date.now() - dt.getTime()) / 86400000);
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function updateStats() {
  const count = s => fishData.filter(f => f.status === s).length;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('stat-total',     fishData.length);
  set('stat-active',    count('Active'));
  set('stat-nursery',   count('Nursery'));
  set('stat-incubator', count('Incubator'));
  set('stat-low',       count('Low Stock'));
  set('stat-archived',  count('Archived'));
}

// ── Search parsing ────────────────────────────────────────────────────────────
// Supports multi-term AND logic and optional field:value prefixes.
// e.g. "fli1 cd4"  →  both terms must match (across selected fields)
//      "line:fli1 notes:spine"  →  field-specific per term
const SEARCH_FIELD_ALIASES = {
  line: 'line', l: 'line',
  id: 'tankId', tankid: 'tankId',
  notes: 'notes', note: 'notes',
  location: 'location', loc: 'location',
  marker: 'markers', markers: 'markers',
  status: 'status',
};
function parseSearchTerms(raw) {
  const terms = [];
  // Match field:value (no spaces in value) or plain token
  const re = /([a-z]+):(\S+)|(\S+)/gi;
  let m;
  while ((m = re.exec(raw)) !== null) {
    if (m[1]) {
      const field = SEARCH_FIELD_ALIASES[m[1].toLowerCase()] || null;
      terms.push({ field, value: m[2].toLowerCase() });
    } else {
      terms.push({ field: null, value: m[3].toLowerCase() });
    }
  }
  return terms;
}
function matchSearchTerm(f, { field, value }) {
  // field-prefixed term → search only that field
  // plain term → search across all selected fields
  const fields = field ? [field] : [...searchFields];
  for (const key of fields) {
    if (key === 'line'     && (f.line     || '').toLowerCase().includes(value)) return true;
    if (key === 'tankId'   && (f.tankId   || '').toLowerCase().includes(value)) return true;
    if (key === 'notes'    && (f.notes    || '').toLowerCase().includes(value)) return true;
    if (key === 'location' && (f.location || '').toLowerCase().includes(value)) return true;
    if (key === 'status'   && (f.status   || '').toLowerCase().includes(value)) return true;
    if (key === 'markers'  && [...(f.markers||[]), ...(f.negMarkers||[]), ...(f.unsorted||[])]
      .some(m => m.toLowerCase().includes(value))) return true;
  }
  return false;
}

window.filterFish = function() {
  const q = (document.getElementById('search-input').value || '').toLowerCase();
  const base = currentExperiment
    ? fishData.filter(f => currentExperiment.tankIds.includes(f.tankId))
    : fishData;

  // Purge stale marker filters (marker deleted from all tanks)
  const allPos      = new Set(base.flatMap(f => f.markers    || []));
  const allNeg      = new Set(base.flatMap(f => f.negMarkers || []));
  const allUnsorted = new Set(base.flatMap(f => f.unsorted   || []));
  for (const m of [...activePosMarkers])      { if (!allPos.has(m))      activePosMarkers.delete(m); }
  for (const m of [...activeNegMarkers])      { if (!allNeg.has(m))      activeNegMarkers.delete(m); }
  for (const m of [...activeUnsortedMarkers]) { if (!allUnsorted.has(m)) activeUnsortedMarkers.delete(m); }

  filtered = base.filter(f => {
    if (activeStatuses.size > 0 && !activeStatuses.has(f.status)) return false;
    if (activePosMarkers.size > 0) {
      const s = new Set(f.markers || []);
      for (const m of activePosMarkers) { if (!s.has(m)) return false; }
    }
    if (activeNegMarkers.size > 0) {
      const s = new Set(f.negMarkers || []);
      for (const m of activeNegMarkers) { if (!s.has(m)) return false; }
    }
    if (activeUnsortedMarkers.size > 0) {
      const s = new Set(f.unsorted || []);
      for (const m of activeUnsortedMarkers) { if (!s.has(m)) return false; }
    }
    if (activeDpfMin !== null || activeDpfMax !== null) {
      const dpf = f.age ? Math.floor((Date.now() - new Date(f.age + 'T00:00:00')) / 86400000) : null;
      if (dpf === null) return false;
      if (activeDpfMin !== null && dpf < activeDpfMin) return false;
      if (activeDpfMax !== null && dpf > activeDpfMax) return false;
    }
    if (!q) return true;
    return parseSearchTerms(q).every(term => matchSearchTerm(f, term));
  });
  sortFish();
};

window.sortFish = function() {
  const s = document.getElementById('sort-select').value;
  filtered.sort((a, b) => {
    let cmp = 0;
    if (s === 'line')    cmp = a.line.localeCompare(b.line);
    if (s === 'age')     cmp = (a.age || '').localeCompare(b.age || '');
    if (s === 'count')   cmp = (a.count || 0) - (b.count || 0);
    if (s === 'updated') cmp = (a.updated || '').localeCompare(b.updated || '');
    return sortDir * cmp;
  });
  renderGrid();
};

window.toggleSortDir = function() {
  sortDir *= -1;
  const btn = document.getElementById('sort-dir-btn');
  if (btn) btn.textContent = sortDir === 1 ? '↑' : '↓';
  sortFish();
};

const GROUP_COLOR_ORDER = { green: 0, red: 1, blue: 2, yellow: 3 };
const GROUP_COLOR_LABELS = { green: '🟢 Green', red: '🔴 Red', blue: '🔵 Blue', yellow: '🟡 Yellow' };

function renderGrid() {
  const grid  = document.getElementById('fish-grid');
  const empty = document.getElementById('empty-state');
  // Remove cards AND group headers from previous render
  Array.from(grid.children).forEach(c => { if (c !== empty) c.remove(); });
  if (filtered.length === 0) { empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  // When groupByColor is active inside an experiment, stable-sort filtered
  // by color (preserves the existing within-group sort order).
  if (groupByColor && currentExperiment) {
    filtered.sort((a, b) => {
      const ac = GROUP_COLOR_ORDER[currentExperiment.tankGroups?.[a.tankId]] ?? 99;
      const bc = GROUP_COLOR_ORDER[currentExperiment.tankGroups?.[b.tankId]] ?? 99;
      return ac - bc;
    });
  }

  let lastColor = undefined; // sentinel — tracks when the group changes

  filtered.forEach((f, idx) => {
    // Insert a section header whenever the color group changes (only in group mode)
    if (groupByColor && currentExperiment) {
      const color = currentExperiment.tankGroups?.[f.tankId] || null;
      if (color !== lastColor) {
        lastColor = color;
        const hdr = document.createElement('div');
        hdr.className = `exp-group-header${color ? ` exp-group-header-${color}` : ' exp-group-header-none'}`;
        hdr.innerHTML = color
          ? `<span class="exp-group-hdr-dot"></span>${GROUP_COLOR_LABELS[color]}`
          : `<span class="exp-group-hdr-dot"></span>Ungrouped`;
        grid.appendChild(hdr);
      }
    }

    const card    = document.createElement('div');
    const isSel   = selectionMode && selectedTankIds.has(f.id);
    const groupColor = currentExperiment?.tankGroups?.[f.tankId] || null;
    card.className = `fish-card status-${f.status}${isSel ? ' card-selected' : ''}${groupColor ? ` card-group-${groupColor}` : ''}`;
    card.dataset.id = f.id;
    // Only stagger-animate the first 15 cards — animating 100+ simultaneously
    // creates that many GPU composite layers and causes scroll jank on mobile.
    card.style.animationDelay = idx < 15 ? `${idx * 0.04}s` : '0s';

    const posHtml      = (f.markers    || []).map(m => `<span class="m-tag">${esc(m)}</span>`).join('');
    const negHtml      = (f.negMarkers || []).map(m => `<span class="m-tag m-tag-neg">−${esc(m)}</span>`).join('');
    const unsortedHtml = (f.unsorted  || []).map(m => `<span class="m-tag m-tag-unsorted">${esc(m)}</span>`).join('');
    const thumbHtml = f.photoUrl ? `<img class="card-thumb" src="${esc(f.photoUrl)}" loading="lazy" style="object-position:${esc(f.thumbPos || '50% 15%')}" />` : '';
    const groupDot  = groupColor ? `<div class="card-group-dot card-group-dot-${groupColor}" title="Group: ${groupColor}"></div>` : '';

    const selDot = selectionMode
      ? `<div class="card-sel-dot${isSel ? ' card-sel-dot-on' : ''}"></div>` : '';

    card.innerHTML = `
      ${selDot}${groupDot}${thumbHtml}
      <div class="card-header">
        <span class="fert-date">${f.age ? formatDate(f.age) + ' · ' + calcDpf(f.age) + ' dpf' : ''}</span>
        <span class="status-badge badge-${f.status}">${esc(f.status)}</span>
      </div>
      <div class="line-name">${esc(f.line)}</div>
      <div class="card-meta">
        ${f.count    ? `<span class="meta-item"><span class="meta-icon">🐟</span>${f.count}</span>` : ''}
        ${f.location ? `<span class="meta-item"><span class="meta-icon">📍</span>${esc(f.location)}</span>` : ''}
      </div>
      ${(posHtml || negHtml || unsortedHtml) ? `<div class="card-markers">${posHtml}${negHtml}${unsortedHtml}</div>` : ''}
      <div class="card-footer">
        <span class="tank-id">${esc(f.tankId || '')}</span>
        <div class="card-actions">
          ${selectionMode ? '' : currentExperiment
            ? `<button class="card-btn danger" onclick="removeFromExperiment('${esc(f.tankId)}', event)">✕ Remove</button>`
            : `<button class="card-btn" onclick="event.stopPropagation();openEditModal('${esc(f.id)}')">Edit</button>
          <button class="card-btn danger" onclick="event.stopPropagation();deleteFish('${esc(f.id)}')">Delete</button>`
          }
        </div>
      </div>
    `;
    card.addEventListener('click', (e) => selectionMode ? toggleCardSelection(f.id, idx, e.shiftKey) : openDrawer(f.id));
    grid.appendChild(card);
  });
}

// ── Marker frequency cache ────────────────────────────────────────────────────
// Computed once from fishData, invalidated whenever fishData is mutated.
// Markers are sorted most-used first so the picker shows frequent ones at top.
let _markerFreq = null;

function invalidateMarkerFreq() { _markerFreq = null; }

function getMarkerFreq() {
  if (_markerFreq) return _markerFreq;
  const pos = new Map(), neg = new Map(), uns = new Map();
  fishData.forEach(f => {
    (f.markers    || []).forEach(m => pos.set(m, (pos.get(m) || 0) + 1));
    (f.negMarkers || []).forEach(m => neg.set(m, (neg.get(m) || 0) + 1));
    (f.unsorted   || []).forEach(m => uns.set(m, (uns.get(m) || 0) + 1));
  });
  _markerFreq = { pos, neg, uns };
  return _markerFreq;
}

function byFreqDesc(map) {
  return (a, b) => (map.get(b) || 0) - (map.get(a) || 0) || a.localeCompare(b);
}

// ── Marker datalists & dropdowns ──────────────────────────────────────────────
function uniquePosMarkers() {
  const { pos } = getMarkerFreq();
  return [...new Set(fishData.flatMap(f => f.markers    || []))].sort(byFreqDesc(pos));
}
function uniqueNegMarkers() {
  const { neg } = getMarkerFreq();
  return [...new Set(fishData.flatMap(f => f.negMarkers || []))].sort(byFreqDesc(neg));
}
function uniqueUnsortedMarkers() {
  const { uns } = getMarkerFreq();
  return [...new Set(fishData.flatMap(f => f.unsorted   || []))].sort(byFreqDesc(uns));
}

function updateMarkerDatalists() {
  const fill = (id, items) => { const el = document.getElementById(id); if (el) el.innerHTML = items.map(m => `<option value="${esc(m)}">`).join(''); };
  fill('markers-datalist',         uniquePosMarkers());
  fill('neg-markers-datalist',     uniqueNegMarkers());
  fill('unsorted-markers-datalist', uniqueUnsortedMarkers());
}

function buildDropdownHtml(markers, activeSet, toggleFn) {
  if (!markers.length) return '<p class="marker-dropdown-empty">No markers in inventory</p>';
  return markers.map(m => `
    <label class="marker-check">
      <input type="checkbox" value="${esc(m)}" ${activeSet.has(m) ? 'checked' : ''}
        onchange="${toggleFn}('${esc(m)}', this.checked)" />
      ${esc(m)}
    </label>`).join('');
}

function positionDropdown(dropdown, btnId) {
  const rect = document.getElementById(btnId).getBoundingClientRect();
  dropdown.style.top   = (rect.bottom + 4) + 'px';
  dropdown.style.right = (window.innerWidth - rect.right) + 'px';
}

window.togglePosDropdown = function() {
  const dd = document.getElementById('pos-dropdown');
  if (!dd.classList.contains('hidden')) { dd.classList.add('hidden'); return; }
  document.getElementById('neg-dropdown')?.classList.add('hidden');
  document.getElementById('unsorted-dropdown')?.classList.add('hidden');
  positionDropdown(dd, 'pos-filter-btn');
  dd.innerHTML = buildDropdownHtml(uniquePosMarkers(), activePosMarkers, 'togglePosFilter');
  dd.classList.remove('hidden');
};

window.toggleNegDropdown = function() {
  const dd = document.getElementById('neg-dropdown');
  if (!dd.classList.contains('hidden')) { dd.classList.add('hidden'); return; }
  document.getElementById('pos-dropdown')?.classList.add('hidden');
  document.getElementById('unsorted-dropdown')?.classList.add('hidden');
  positionDropdown(dd, 'neg-filter-btn');
  dd.innerHTML = buildDropdownHtml(uniqueNegMarkers(), activeNegMarkers, 'toggleNegFilter');
  dd.classList.remove('hidden');
};

window.toggleUnsortedDropdown = function() {
  const dd = document.getElementById('unsorted-dropdown');
  if (!dd) return;
  const isHidden = dd.classList.contains('hidden');
  document.getElementById('pos-dropdown')?.classList.add('hidden');
  document.getElementById('neg-dropdown')?.classList.add('hidden');
  document.getElementById('unsorted-dropdown')?.classList.add('hidden');
  if (isHidden) {
    positionDropdown(dd, 'unsorted-filter-btn');
    dd.innerHTML = buildDropdownHtml(uniqueUnsortedMarkers(), activeUnsortedMarkers, 'toggleUnsortedFilter');
    dd.classList.remove('hidden');
  }
};

window.togglePosFilter = function(m, checked) {
  if (checked) activePosMarkers.add(m); else activePosMarkers.delete(m);
  const c = activePosMarkers.size;
  document.getElementById('pos-filter-count').textContent = c > 0 ? ` (${c})` : '';
  document.getElementById('pos-filter-btn').classList.toggle('active', c > 0);
  updateFilterSummary(); filterFish();
};

window.toggleNegFilter = function(m, checked) {
  if (checked) activeNegMarkers.add(m); else activeNegMarkers.delete(m);
  const c = activeNegMarkers.size;
  document.getElementById('neg-filter-count').textContent = c > 0 ? ` (${c})` : '';
  document.getElementById('neg-filter-btn').classList.toggle('active', c > 0);
  updateFilterSummary(); filterFish();
};

window.toggleUnsortedFilter = function(m, checked) {
  if (checked) activeUnsortedMarkers.add(m); else activeUnsortedMarkers.delete(m);
  const c = activeUnsortedMarkers.size;
  document.getElementById('unsorted-filter-count').textContent = c > 0 ? ` (${c})` : '';
  document.getElementById('unsorted-filter-btn').classList.toggle('active', c > 0);
  updateFilterSummary(); filterFish();
};

// Close dropdowns on outside click
document.addEventListener('click', e => {
  ['pos-filter-wrap','neg-filter-wrap','unsorted-filter-wrap'].forEach(id => {
    const wrap = document.getElementById(id);
    const ddId = id === 'pos-filter-wrap' ? 'pos-dropdown' : id === 'neg-filter-wrap' ? 'neg-dropdown' : 'unsorted-dropdown';
    if (wrap && !wrap.contains(e.target)) document.getElementById(ddId)?.classList.add('hidden');
  });
  const expWrap = document.getElementById('exp-btn-wrap') || document.querySelector('.exp-btn-wrap');
  if (expWrap && !expWrap.contains(e.target)) closeExperimentsDropdown();
  if (!e.target.closest('#picker-pos-btn')) document.getElementById('picker-pos-dd')?.classList.add('hidden');
  if (!e.target.closest('#picker-neg-btn')) document.getElementById('picker-neg-dd')?.classList.add('hidden');
});

// ── Filter chips (multi-select status) ───────────────────────────────────────
window.setFilter = function(status) {
  if (activeStatuses.has(status)) activeStatuses.delete(status);
  else activeStatuses.add(status);
  refreshChips();
  updateFilterSummary();
  filterFish();
};

window.clearFilters = function() {
  activeStatuses.clear();
  activePosMarkers.clear();
  activeNegMarkers.clear();
  activeUnsortedMarkers.clear();
  activeDpfMin = null; activeDpfMax = null;
  const dMin = document.getElementById('dpf-min');
  const dMax = document.getElementById('dpf-max');
  if (dMin) dMin.value = '';
  if (dMax) dMax.value = '';
  document.getElementById('pos-filter-count').textContent = '';
  document.getElementById('neg-filter-count').textContent = '';
  document.getElementById('unsorted-filter-count').textContent = '';
  document.getElementById('pos-filter-btn')?.classList.remove('active');
  document.getElementById('neg-filter-btn')?.classList.remove('active');
  document.getElementById('unsorted-filter-btn')?.classList.remove('active');
  refreshChips();
  updateFilterSummary();
  filterFish();
};

window.applyDpfFilter = function() {
  const minVal = document.getElementById('dpf-min')?.value;
  const maxVal = document.getElementById('dpf-max')?.value;
  activeDpfMin = minVal !== '' && minVal != null ? parseInt(minVal) : null;
  activeDpfMax = maxVal !== '' && maxVal != null ? parseInt(maxVal) : null;
  updateFilterSummary();
  filterFish();
};

window.toggleImgMode = function() {
  imgOff = !imgOff;
  localStorage.setItem('fzfish-img-off', imgOff);
  document.getElementById('app')?.classList.toggle('img-off', imgOff);
  ['img-toggle-btn', 'mob-img-btn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.style.opacity = imgOff ? '0.4' : '1';
  });
};

function refreshChips() {
  document.querySelectorAll('.chip').forEach(c => {
    if (c.dataset.filter === 'all') c.classList.toggle('active', activeStatuses.size === 0);
    else c.classList.toggle('active', activeStatuses.has(c.dataset.filter));
  });
}

function updateFilterSummary() {
  const dpfActive = (activeDpfMin !== null || activeDpfMax !== null) ? 1 : 0;
  const total = activeStatuses.size + activePosMarkers.size + activeNegMarkers.size + activeUnsortedMarkers.size + dpfActive;
  const countEl = document.getElementById('filter-active-count');
  if (countEl) countEl.textContent = total > 0 ? ` (${total})` : '';
  document.getElementById('reset-filters-btn')?.classList.toggle('hidden', total === 0);
  updateMiniStats();
}

// ── Mobile filter sheet ───────────────────────────────────────────────────────
window.openMobileFilters = function() {
  // Reset accordion state each time the sheet opens — collapsed by default
  mfExpanded = { pos: false, neg: false, uns: false };
  buildMobileFilterSheet();
  document.getElementById('mobile-filter-sheet').classList.add('open');
  document.body.classList.add('modal-open');
};

window.mfToggleSection = function(key) {
  mfExpanded[key] = !mfExpanded[key];
  buildMobileFilterSheet();
};

window.closeMobileFilters = function() {
  document.getElementById('mobile-filter-sheet').classList.remove('open');
  checkScrollLock();
};

window.clearAllMobileFilters = function() {
  activeStatuses.clear();
  activePosMarkers.clear();
  activeNegMarkers.clear();
  activeUnsortedMarkers.clear();
  activeDpfMin = null; activeDpfMax = null;
  const dMin = document.getElementById('dpf-min');
  const dMax = document.getElementById('dpf-max');
  if (dMin) dMin.value = '';
  if (dMax) dMax.value = '';
  refreshChips();
  document.getElementById('pos-filter-count').textContent = '';
  document.getElementById('neg-filter-count').textContent = '';
  document.getElementById('unsorted-filter-count').textContent = '';
  document.getElementById('pos-filter-btn').classList.remove('active');
  document.getElementById('neg-filter-btn').classList.remove('active');
  document.getElementById('unsorted-filter-btn')?.classList.remove('active');
  updateFilterSummary();
  filterFish();
  buildMobileFilterSheet();
};

window.buildMobileFilterSheet = function() {
  const body = document.getElementById('mobile-filter-body');
  if (!body) return;

  const statusList = [
    { key: 'Active',    cls: 'sc-active'    },
    { key: 'Nursery',   cls: 'sc-nursery'   },
    { key: 'Incubator', cls: 'sc-incubator' },
    { key: 'Low Stock', cls: 'sc-low-stock' },
    { key: 'Archived',  cls: 'sc-archived'  },
  ];
  const baseData = currentExperiment
    ? fishData.filter(f => currentExperiment.tankIds.includes(f.tankId))
    : fishData;
  const cnt = s => baseData.filter(f => f.status === s).length;
  let html = '';

  // ── Status ──
  html += '<div class="mf-section"><div class="mf-section-title">Status</div>';
  const allActive = activeStatuses.size === 0;
  html += `<button class="mf-row${allActive ? ' mf-row-active' : ''}"
      onclick="clearFilters();buildMobileFilterSheet()">
    <span class="mf-check">${allActive ? '✓' : ''}</span>
    <span class="mf-row-label">All tanks</span>
    <span class="mf-row-count">${baseData.length}</span>
  </button>`;
  statusList.forEach(({ key, cls }) => {
    const on = activeStatuses.has(key);
    html += `<button class="mf-row${on ? ' mf-row-active' : ''}"
        onclick="setFilter('${key}');buildMobileFilterSheet()">
      <span class="mf-check">${on ? '✓' : ''}</span>
      <span class="mf-status-dot ${cls}">●</span>
      <span class="mf-row-label">${key}</span>
      <span class="mf-row-count">${cnt(key)}</span>
    </button>`;
  });
  html += '</div>';

  // ── Sort ──
  const sv  = document.getElementById('sort-select')?.value || 'line';
  const dir = sortDir === 1 ? '↑' : '↓';
  html += `<div class="mf-section"><div class="mf-section-title">Sort</div>
    <div class="mf-sort-row">
      <select class="mf-sort-select"
          onchange="document.getElementById('sort-select').value=this.value;sortFish()">
        <option value="line"    ${sv==='line'    ? 'selected' : ''}>Line</option>
        <option value="age"     ${sv==='age'     ? 'selected' : ''}>Fert. Date</option>
        <option value="count"   ${sv==='count'   ? 'selected' : ''}>Count</option>
        <option value="updated" ${sv==='updated' ? 'selected' : ''}>Last Updated</option>
      </select>
      <button class="mf-dir-btn" onclick="toggleSortDir();buildMobileFilterSheet()">${dir}</button>
    </div>
  </div>`;

  // ── DPF range ──
  const dpfMinVal = activeDpfMin !== null ? activeDpfMin : '';
  const dpfMaxVal = activeDpfMax !== null ? activeDpfMax : '';
  html += `<div class="mf-section"><div class="mf-section-title">Age (dpf)</div>
    <div class="mf-dpf-row">
      <input class="mf-dpf-input" type="number" min="0" placeholder="min"
        value="${dpfMinVal}"
        oninput="document.getElementById('dpf-min').value=this.value;applyDpfFilter()" />
      <span class="mf-dpf-sep">–</span>
      <input class="mf-dpf-input" type="number" min="0" placeholder="max"
        value="${dpfMaxVal}"
        oninput="document.getElementById('dpf-max').value=this.value;applyDpfFilter()" />
      <span class="mf-dpf-label">dpf</span>
    </div>
  </div>`;

  // Helper: render a collapsible marker accordion section
  function mfMarkerSection(key, label, markers, activeSet, toggleFn, rowCls) {
    if (!markers.length) return '';
    const activeCount = markers.filter(m => activeSet.has(m)).length;
    // Auto-expand if any markers in this section are active
    const open = mfExpanded[key] || activeCount > 0;
    const badge = activeCount ? `<span class="mf-active-badge">${activeCount}</span>` : '';
    let s = `<div class="mf-section mf-accordion${open ? ' mf-accordion-open' : ''}">
      <button class="mf-accordion-hdr" onclick="mfToggleSection('${key}')">
        <span class="mf-section-title">${label}${badge}</span>
        <span class="mf-accordion-arrow">${open ? '▲' : '▼'}</span>
      </button>`;
    if (open) {
      markers.forEach(m => {
        const on = activeSet.has(m);
        s += `<button class="mf-row${on ? ' mf-row-active' : ''}"
            onclick="${toggleFn}('${esc(m)}',${!on});buildMobileFilterSheet()">
          <span class="mf-check">${on ? '✓' : ''}</span>
          <span class="mf-row-label ${rowCls}">${esc(m)}</span>
        </button>`;
      });
    }
    s += '</div>';
    return s;
  }

  const { pos: pf, neg: nf, uns: uf } = getMarkerFreq();
  const pm = [...new Set(baseData.flatMap(f => f.markers    || []))].sort(byFreqDesc(pf));
  const nm = [...new Set(baseData.flatMap(f => f.negMarkers || []))].sort(byFreqDesc(nf));
  const um = [...new Set(baseData.flatMap(f => f.unsorted   || []))].sort(byFreqDesc(uf));

  html += mfMarkerSection('pos', '+ Markers (present)',  pm, activePosMarkers,      'togglePosFilter',      'mf-marker-pos');
  html += mfMarkerSection('neg', '− Markers (absent)',   nm, activeNegMarkers,      'toggleNegFilter',      'mf-marker-neg');
  html += mfMarkerSection('uns', '? Markers (unsorted)', um, activeUnsortedMarkers, 'toggleUnsortedFilter', 'mf-marker-unsorted');

  body.innerHTML = html;
};

function updateMiniStats() {
  const bar = document.getElementById('mini-stats-bar');
  if (!bar) return;
  const statusList = [
    { key: 'Active',    cls: 'sc-active'    },
    { key: 'Nursery',   cls: 'sc-nursery'   },
    { key: 'Incubator', cls: 'sc-incubator' },
    { key: 'Low Stock', cls: 'sc-low-stock' },
    { key: 'Archived',  cls: 'sc-archived'  },
  ];
  let html = `<span class="mini-stat" onclick="clearFilters()">
    <span class="mini-stat-count">${fishData.length}</span>
    <span class="mini-stat-label">Total</span>
  </span>`;
  statusList.forEach(({ key, cls }) => {
    const n = fishData.filter(f => f.status === key).length;
    if (!n) return;
    const sel = activeStatuses.has(key);
    html += `<span class="mini-stat${sel ? ' mini-stat-sel' : ''}" onclick="setFilter('${key}')">
      <span class="mini-stat-dot ${cls}">●</span>
      <span class="mini-stat-count">${n}</span>
      <span class="mini-stat-label">${key}</span>
    </span>`;
  });
  bar.innerHTML = html;
}

// ── Scroll lock ───────────────────────────────────────────────────────────────
function checkScrollLock() {
  const anyOverlay = document.querySelector('.overlay.active') !== null;
  const drawerOpen = document.getElementById('detail-drawer')?.classList.contains('open');
  document.body.classList.toggle('modal-open', anyOverlay || !!drawerOpen);
}

// ── Location picker (form) ───────────────────────────────────────────────────
function updateLocPicker() {
  const type = document.querySelector('input[name="loc-type"]:checked')?.value || 'R';
  const row  = document.getElementById('loc-selects-row');
  if (!row) return;
  if (type === 'I') { row.classList.add('hidden'); updateLocPreview(); return; }
  row.classList.remove('hidden');

  // Rebuild number select based on type (5 racks, 3 nursery)
  const numSel = document.getElementById('loc-num');
  if (numSel) {
    const maxNum = type === 'R' ? 5 : 3;
    const curNum = numSel.value || '1';
    numSel.innerHTML = '';
    for (let i = 1; i <= maxNum; i++) {
      const opt = document.createElement('option');
      opt.value = i; opt.textContent = i;
      if (String(i) === String(curNum)) opt.selected = true;
      numSel.appendChild(opt);
    }
  }

  // Show A/B side only for rack
  const sideGroup = document.getElementById('loc-side-group');
  if (sideGroup) sideGroup.classList.toggle('hidden', type !== 'R');

  updateLocPreview();
}

function updateLocPreview() {
  const type  = document.querySelector('input[name="loc-type"]:checked')?.value || 'R';
  const num   = document.getElementById('loc-num')?.value || '1';
  const shelf = document.getElementById('loc-shelf')?.value || '1';
  const side  = type === 'R' ? (document.getElementById('loc-side')?.value || '') : '';
  const el    = document.getElementById('loc-preview');
  if (el) el.textContent = formatLocation(type, num, shelf, side);
}

function getLocFromForm() {
  const type  = document.querySelector('input[name="loc-type"]:checked')?.value || 'R';
  const num   = document.getElementById('loc-num')?.value || '1';
  const shelf = document.getElementById('loc-shelf')?.value || '1';
  const side  = type === 'R' ? (document.getElementById('loc-side')?.value || '') : '';
  return formatLocation(type, num, shelf, side);
}

function setLocInForm(str) {
  const parsed = parseLocation(str);
  const type   = parsed?.type  || 'R';
  const num    = parsed?.num   || 1;
  const shelf  = parsed?.shelf || 1;
  const side   = parsed?.side  || '';
  const radio  = document.querySelector(`input[name="loc-type"][value="${type}"]`);
  if (radio) radio.checked = true;
  updateLocPicker();
  const numEl   = document.getElementById('loc-num');
  const shelfEl = document.getElementById('loc-shelf');
  const sideEl  = document.getElementById('loc-side');
  if (numEl)   numEl.value   = num;
  if (shelfEl) shelfEl.value = shelf;
  if (sideEl)  sideEl.value  = side;
  updateLocPreview();
}

// ── Status ↔ Location sync ───────────────────────────────────────────────────
// Status → Location: Active→Rack, Nursery→Nursery, Incubator→Incubator
window.syncStatusToLoc = function() {
  const status = document.querySelector('input[name="status"]:checked')?.value;
  const map = { Active: 'R', Nursery: 'N', Incubator: 'I' };
  const locType = map[status];
  if (!locType) return; // Low Stock / Breeding / Archived — don't force location
  const radio = document.querySelector(`input[name="loc-type"][value="${locType}"]`);
  if (radio && !radio.checked) { radio.checked = true; updateLocPicker(); }
};

// Location → Status: Rack→Active, Nursery→Nursery, Incubator→Incubator
window.syncLocToStatus = function() {
  const locType = document.querySelector('input[name="loc-type"]:checked')?.value;
  const map = { R: 'Active', N: 'Nursery', I: 'Incubator' };
  const status = map[locType];
  if (!status) return;
  const radio = document.querySelector(`input[name="status"][value="${status}"]`);
  if (radio && !radio.checked) radio.checked = true;
};

// ── Migration wizards (dev access only — not auto-triggered) ──────────────────
// To run from browser console: checkLocationMigration() or checkUnsortedMigration()
window.checkLocationMigration = checkLocationMigration;
window.checkUnsortedMigration = checkUnsortedMigration;

// ── Location migration wizard ─────────────────────────────────────────────────
function checkLocationMigration() {
  if (demoMode) return;
  if (localStorage.getItem('fzfish-loc-migrated') === 'true') return;
  const bad = fishData.filter(f => f.location && !parseLocation(f.location));
  if (!bad.length) { localStorage.setItem('fzfish-loc-migrated', 'true'); return; }
  openLocMigrate(bad);
}

function openLocMigrate(tanks) {
  const list = document.getElementById('loc-migrate-list');
  if (!list) return;
  list.innerHTML = tanks.map(f => {
    const id = f.tankId || f.id;
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `
    <div class="mig-row" id="mig-row-${safeId}" data-tank-id="${esc(id)}">
      <div class="mig-info">
        <span class="mig-line">${esc(f.line || f.tankId)}</span>
        <span class="mig-old">was: <em>${esc(f.location)}</em></span>
      </div>
      <div class="mig-picker">
        <label class="mig-type-opt"><input type="radio" name="mig-type-${safeId}" value="R" checked onchange="updateMigRow('${safeId}')"> Rack</label>
        <label class="mig-type-opt"><input type="radio" name="mig-type-${safeId}" value="N" onchange="updateMigRow('${safeId}')"> Nursery</label>
        <label class="mig-type-opt"><input type="radio" name="mig-type-${safeId}" value="I" onchange="updateMigRow('${safeId}')"> Incubator</label>
        <div class="mig-selects" id="mig-selects-${safeId}">
          <input id="mig-num-${safeId}" class="loc-select loc-num-input" type="text" maxlength="1" inputmode="numeric" placeholder="1" value="1" oninput="updateMigPreview('${safeId}')" />
          <span class="loc-select-label">S</span>
          <input id="mig-shelf-${safeId}" class="loc-select loc-num-input" type="text" maxlength="1" inputmode="numeric" placeholder="1" value="1" oninput="updateMigPreview('${safeId}')" />
        </div>
        <span class="loc-preview" id="mig-preview-${safeId}">R1 S1</span>
      </div>
    </div>`;
  }).join('');
  document.getElementById('loc-migrate-overlay').classList.add('active');
  checkScrollLock();
}

window.updateMigRow = function(safeId) {
  const type    = document.querySelector(`input[name="mig-type-${safeId}"]:checked`)?.value || 'R';
  const selects = document.getElementById(`mig-selects-${safeId}`);
  if (type === 'I') selects?.classList.add('hidden');
  else              selects?.classList.remove('hidden');
  updateMigPreview(safeId);
};

window.updateMigPreview = function(safeId) {
  const type  = document.querySelector(`input[name="mig-type-${safeId}"]:checked`)?.value || 'R';
  const num   = document.getElementById(`mig-num-${safeId}`)?.value || '1';
  const shelf = document.getElementById(`mig-shelf-${safeId}`)?.value || '1';
  const el    = document.getElementById(`mig-preview-${safeId}`);
  if (el) el.textContent = formatLocation(type, num, shelf);
};

window.saveMigratedLocations = async function() {
  const rows = document.querySelectorAll('.mig-row');
  const updates = [];
  rows.forEach(row => {
    const tankId  = row.dataset.tankId;
    const safeId  = row.id.replace('mig-row-', '');
    const type    = document.querySelector(`input[name="mig-type-${safeId}"]:checked`)?.value || 'R';
    const num     = document.getElementById(`mig-num-${safeId}`)?.value || '1';
    const shelf   = document.getElementById(`mig-shelf-${safeId}`)?.value || '1';
    const loc     = formatLocation(type, num, shelf);
    const fish    = fishData.find(f => (f.tankId || f.id) === tankId);
    if (fish) { fish.location = loc; updates.push({ fish, rowIndex: fish._rowIndex }); }
  });
  if (!demoMode) {
    showToast('💾 Saving locations…');
    await Promise.all(updates.map(({ fish, rowIndex }) => updateSheetRow(fish, rowIndex)));
  }
  localStorage.setItem('fzfish-loc-migrated', 'true');
  document.getElementById('loc-migrate-overlay').classList.remove('active');
  checkScrollLock();
  renderAll();
  showToast('✅ Locations updated');
};

window.skipMigration = function() {
  document.getElementById('loc-migrate-overlay').classList.remove('active');
  checkScrollLock();
};

// ── Unsorted markers migration wizard ─────────────────────────────────────────
let migUnsortedState = {}; // { safeId: string[] }

// A value "looks like genotype notation" if it contains ; or / (e.g. +;-, +/-)
// or is entirely made of +, -, ? symbols.  Real marker names look like EGFP, fli1, etc.
function looksLikeGenotype(markers) {
  return markers.some(m => /[;\/]/.test(m) || /[+\-?±]/.test(m) || /unsort/i.test(m));
}

function checkUnsortedMigration() {
  if (demoMode) return;
  // No localStorage flag — re-run every login until all values look like real marker names
  const needsMigration = fishData.filter(f => f.unsorted?.length && looksLikeGenotype(f.unsorted));
  if (!needsMigration.length) return;
  openUnsortedMigrate(needsMigration);
}

function openUnsortedMigrate(tanks) {
  migUnsortedState = {};
  const list = document.getElementById('unsorted-migrate-list');
  if (!list) return;
  list.innerHTML = tanks.map(f => {
    const id = f.tankId || f.id;
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const originalVal = (f.unsorted || []).join(', ');
    migUnsortedState[safeId] = [...(f.unsorted || [])];
    return `
    <div class="mig-u-row" id="mig-u-row-${safeId}" data-tank-id="${esc(id)}">
      <div class="mig-u-header">
        <span class="mig-u-tankid">${esc(id)}</span>
        <span class="mig-u-line">${esc(f.line || '')}</span>
      </div>
      <div class="mig-u-was">Previous genotype value: <em>${esc(originalVal)}</em></div>
      <div class="mig-u-tags" id="mig-u-tags-${safeId}"></div>
      <div class="mig-u-input-row">
        <input id="mig-u-input-${safeId}" class="mig-u-input" type="text"
          placeholder="Type marker name…" autocapitalize="none" autocorrect="off" spellcheck="false"
          onkeydown="if(event.key==='Enter'){event.preventDefault();addMigUnsortedMarker('${safeId}')}" />
        <button type="button" class="btn-tag-add" onclick="addMigUnsortedMarker('${safeId}')">＋</button>
      </div>
    </div>`;
  }).join('');
  tanks.forEach(f => {
    const id = f.tankId || f.id;
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    renderMigUnsortedTags(safeId);
  });
  document.getElementById('unsorted-migrate-overlay').classList.add('active');
  checkScrollLock();
}

function renderMigUnsortedTags(safeId) {
  const container = document.getElementById(`mig-u-tags-${safeId}`);
  if (!container) return;
  const markers = migUnsortedState[safeId] || [];
  container.innerHTML = markers.map((m, i) =>
    `<span class="marker-tag marker-tag-unsorted">${esc(m)}<button type="button" onclick="removeMigUnsortedMarker('${safeId}',${i})">×</button></span>`
  ).join('');
}

window.addMigUnsortedMarker = function(safeId) {
  const input = document.getElementById(`mig-u-input-${safeId}`);
  if (!input) return;
  const v = input.value.trim();
  if (!v) return;
  input.value = '';
  if (!migUnsortedState[safeId]) migUnsortedState[safeId] = [];
  if (!migUnsortedState[safeId].find(m => m.toLowerCase() === v.toLowerCase())) {
    migUnsortedState[safeId].push(v);
  }
  renderMigUnsortedTags(safeId);
};

window.removeMigUnsortedMarker = function(safeId, i) {
  if (migUnsortedState[safeId]) migUnsortedState[safeId].splice(i, 1);
  renderMigUnsortedTags(safeId);
};

window.saveUnsortedMigration = async function() {
  const rows = document.querySelectorAll('.mig-u-row');
  const updates = [];
  rows.forEach(row => {
    const tankId = row.dataset.tankId;
    const safeId = row.id.replace('mig-u-row-', '');
    const fish   = fishData.find(f => (f.tankId || f.id) === tankId);
    if (fish) {
      fish.unsorted = migUnsortedState[safeId] || [];
      updates.push({ fish, rowIndex: fish._rowIndex });
    }
  });
  if (!demoMode) {
    showToast('💾 Saving…');
    await Promise.all(updates.map(({ fish, rowIndex }) => updateSheetRow(fish, rowIndex)));
  }
  document.getElementById('unsorted-migrate-overlay').classList.remove('active');
  checkScrollLock();
  renderAll();
  showToast('✅ Unsorted markers updated');
};

window.skipUnsortedMigration = function() {
  document.getElementById('unsorted-migrate-overlay').classList.remove('active');
  checkScrollLock();
};

// ── Recent lines quick-fill ───────────────────────────────────────────────────
function getRecentLines() {
  try { return JSON.parse(localStorage.getItem('fzfish-recent-lines') || '[]'); } catch { return []; }
}
function addRecentLine(line) {
  if (!line) return;
  const lines = getRecentLines().filter(l => l !== line);
  lines.unshift(line);
  localStorage.setItem('fzfish-recent-lines', JSON.stringify(lines.slice(0, 3)));
}
function renderRecentLines() {
  const el = document.getElementById('recent-lines');
  if (!el) return;
  const lines = getRecentLines();
  if (!lines.length) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.innerHTML = lines.map(l =>
    `<button type="button" class="recent-line-pill" onclick="document.getElementById('f-line').value='${esc(l)}'">${esc(l)}</button>`
  ).join('');
}

// ── Last location quick-fill ──────────────────────────────────────────────────
function getLastLocation() {
  return localStorage.getItem('fzfish-last-location') || '';
}
function saveLastLocation(loc) {
  if (loc && loc !== 'Incubator') localStorage.setItem('fzfish-last-location', loc);
}
function renderLastLocation() {
  const el  = document.getElementById('last-location-wrap');
  if (!el) return;
  const loc = getLastLocation();
  if (!loc) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = `<button type="button" class="recent-line-pill" onclick="setLocInForm('${esc(loc)}');updateLocPreview();syncLocToStatus()">Last: ${esc(loc)}</button>`;
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────
window.openAddModal = function() {
  editingId = null; currentMarkers = []; currentNegMarkers = []; currentUnsortedMarkers = [];
  currentPhotoUrl = null; originalPhotoUrl = null; pendingPhotoFile = null;
  currentThumbPos = '50% 15%';
  document.getElementById('modal-title').textContent = 'Add Tank';
  document.getElementById('fish-form').reset();
  document.getElementById('f-tank-id').value             = '';
  document.getElementById('markers-container').innerHTML     = '';
  document.getElementById('neg-markers-container').innerHTML = '';
  document.getElementById('unsorted-markers-container').innerHTML = '';
  document.querySelector('input[name="status"][value="Active"]').checked = true;
  setLocInForm('');
  resetPhotoUI();
  renderRecentLines();
  renderLastLocation();
  document.getElementById('fish-modal').classList.add('active');
  checkScrollLock();
};

window.openEditModal = function(id) {
  const f = fishData.find(x => x.id === id);
  if (!f) return;
  editingId = id; currentMarkers = [...(f.markers || [])]; currentNegMarkers = [...(f.negMarkers || [])];
  currentUnsortedMarkers = [...(f.unsorted || [])];
  currentPhotoUrl = f.photoUrl || null; originalPhotoUrl = f.photoUrl || null; pendingPhotoFile = null;
  currentThumbPos = f.thumbPos || '50% 15%';
  document.getElementById('modal-title').textContent = 'Edit Tank';
  document.getElementById('f-tank-id').value  = f.tankId || f.id || '';
  document.getElementById('f-line').value     = f.line;
  document.getElementById('f-age').value      = f.age || '';
  document.getElementById('f-count').value    = f.count || '';
  setLocInForm(f.location || '');
  document.getElementById('f-notes').value    = f.notes || '';
  const si = document.querySelector(`input[name="status"][value="${f.status}"]`);
  if (si) si.checked = true;
  renderMarkerTags(); renderNegMarkerTags(); renderUnsortedMarkerTags();
  resetPhotoUI();
  if (currentPhotoUrl) showPhotoPreview(currentPhotoUrl);
  renderRecentLines();
  renderLastLocation();
  document.getElementById('fish-modal').classList.add('active');
  checkScrollLock();
};

window.duplicateFish = function(id) {
  const f = fishData.find(x => x.id === id);
  if (!f) return;
  // Open the add form pre-filled with this tank's data, minus photo, tankId, and notes
  editingId = null;
  currentMarkers        = [...(f.markers     || [])];
  currentNegMarkers     = [...(f.negMarkers  || [])];
  currentUnsortedMarkers = [...(f.unsorted   || [])];
  currentPhotoUrl       = null;
  originalPhotoUrl      = null;
  pendingPhotoFile      = null;
  currentThumbPos       = '50% 15%';
  document.getElementById('modal-title').textContent = 'Duplicate Tank';
  document.getElementById('f-tank-id').value = '';
  document.getElementById('f-line').value    = f.line || '';
  document.getElementById('f-age').value     = f.age  || '';
  document.getElementById('f-count').value   = f.count || '';
  setLocInForm(f.location || '');
  document.getElementById('f-notes').value   = '';
  const si = document.querySelector(`input[name="status"][value="${f.status}"]`);
  if (si) si.checked = true;
  renderMarkerTags(); renderNegMarkerTags(); renderUnsortedMarkerTags();
  resetPhotoUI();
  renderRecentLines();
  renderLastLocation();
  document.getElementById('fish-modal').classList.add('active');
  checkScrollLock();
};

window.closeModal = function() {
  document.getElementById('fish-modal').classList.remove('active');
  document.getElementById('pos-picker-dropdown')?.classList.add('hidden');
  document.getElementById('neg-picker-dropdown')?.classList.add('hidden');
  document.getElementById('unsorted-picker-dropdown')?.classList.add('hidden');
  checkScrollLock();
};

// Photo
function resetPhotoUI() {
  document.getElementById('f-photo').value = '';
  document.getElementById('photo-preview-wrap').classList.add('hidden');
  document.getElementById('photo-upload-label').classList.remove('hidden');
}
function showPhotoPreview(url) {
  const img = document.getElementById('f-photo-preview');
  img.src     = url;
  img.onclick = () => openLightbox(url);
  document.getElementById('photo-preview-wrap').classList.remove('hidden');
  document.getElementById('photo-upload-label').classList.add('hidden');
  const cropImg = document.getElementById('thumb-crop-img');
  if (cropImg) { cropImg.src = url; }
  applyThumbCropPos(currentThumbPos);
}

function applyThumbCropPos(pos) {
  currentThumbPos = pos;
  const parts = pos.split(' ');
  const xPct = parseFloat(parts[0]) || 50;
  const yPct = parseFloat(parts[1]) || 15;
  const dot = document.getElementById('thumb-crop-dot');
  const img = document.getElementById('thumb-crop-img');
  if (dot) { dot.style.left = xPct + '%'; dot.style.top = yPct + '%'; }
  if (img)  { img.style.objectPosition = pos; }
}

function getThumbCropPos(e, stage) {
  const rect = stage.getBoundingClientRect();
  const src  = e.touches ? e.touches[0] : e;
  const x = Math.max(0, Math.min(100, Math.round(((src.clientX - rect.left) / rect.width)  * 100)));
  const y = Math.max(0, Math.min(100, Math.round(((src.clientY - rect.top)  / rect.height) * 100)));
  return { x, y };
}

window.startThumbDrag = function(e) {
  e.preventDefault();
  const stage = document.getElementById('thumb-crop-stage');
  const { x, y } = getThumbCropPos(e, stage);
  applyThumbCropPos(x + '% ' + y + '%');
  const onMove = ev => {
    ev.preventDefault();
    const p = getThumbCropPos(ev, stage);
    applyThumbCropPos(p.x + '% ' + p.y + '%');
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('mouseup',   onUp);
    document.removeEventListener('touchend',  onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('mouseup',   onUp);
  document.addEventListener('touchend',  onUp);
};
window.handlePhotoSelect = function(input) {
  const file = input.files[0];
  if (!file) return;
  pendingPhotoFile = file;
  showPhotoPreview(URL.createObjectURL(file));
};
window.removePhoto = function() { currentPhotoUrl = null; pendingPhotoFile = null; resetPhotoUI(); };

window.saveFish = async function(e) {
  e.preventDefault();
  const saveBtn = document.getElementById('save-btn');

  // Active tanks must have a valid barcode-style ID
  const rawId  = document.getElementById('f-tank-id').value.trim().toUpperCase();
  const status = document.querySelector('input[name="status"]:checked')?.value;
  const hint   = document.getElementById('tank-id-hint');
  if (status === 'Active' && !/^C\d{8}$/.test(rawId)) {
    if (hint) hint.style.display = '';
    document.getElementById('f-tank-id').focus();
    return;
  }
  if (hint) hint.style.display = 'none';

  saveBtn.disabled = true; saveBtn.textContent = 'Saving…';

  let photoUrl = currentPhotoUrl || '';
  if (pendingPhotoFile && !demoMode) {
    try { showToast('📤 Uploading photo…'); photoUrl = await uploadPhoto(pendingPhotoFile); }
    catch(err) { showToast('❌ Photo upload failed: ' + err.message); saveBtn.disabled = false; saveBtn.textContent = 'Save Tank'; return; }
  }

  const record = {
    tankId:     document.getElementById('f-tank-id').value.trim() || (editingId ? (fishData.find(x => x.id === editingId)?.tankId || editingId) : `tank-${Date.now()}`),
    line:       document.getElementById('f-line').value.trim(),
    unsorted:   [...currentUnsortedMarkers],
    age:        document.getElementById('f-age').value.trim(),
    count:      parseInt(document.getElementById('f-count').value) || 0,
    location:   getLocFromForm(),
    markers:    [...currentMarkers],
    negMarkers: [...currentNegMarkers],
    status:     document.querySelector('input[name="status"]:checked').value,
    notes:      document.getElementById('f-notes').value.trim(),
    photoUrl, thumbPos: currentThumbPos,
    updated: new Date().toISOString().slice(0, 16).replace('T', ' '),
  };
  record.id = record.tankId;
  addRecentLine(record.line);
  saveLastLocation(record.location);

  if (editingId) {
    const idx = fishData.findIndex(x => x.id === editingId);
    if (idx !== -1) {
      const oldRec = { ...fishData[idx] };
      record._rowIndex = fishData[idx]._rowIndex;
      fishData[idx] = record;
      if (!demoMode) {
        await updateSheetRow(record, record._rowIndex);
        if (originalPhotoUrl && originalPhotoUrl !== photoUrl) deleteDrivePhoto(originalPhotoUrl);
        logChange('Edited', record, diffRecord(oldRec, record));
      }
    }
    showToast('✅ Tank updated');
  } else {
    if (!demoMode) {
      const rowIndex = await appendToSheets(record);
      record._rowIndex = rowIndex || fishData.length + 2;
      const addDetails = [
        `Line: ${record.line}`,
        `Status: ${record.status}`,
        record.count   ? `Count: ${record.count}`        : null,
        record.location? `Location: ${record.location}`  : null,
        (record.markers    ||[]).length ? `+Markers: [${record.markers.join(', ')}]`    : null,
        (record.negMarkers ||[]).length ? `−Markers: [${record.negMarkers.join(', ')}]` : null,
        record.photoUrl ? 'Photo: added' : null,
      ].filter(Boolean).join(' | ');
      logChange('Added', record, addDetails);
    } else {
      record._rowIndex = fishData.length + 2;
    }
    fishData.push(record);
    showToast('✅ Tank added');
  }

  saveBtn.disabled = false; saveBtn.textContent = 'Save Tank';
  invalidateMarkerFreq();
  closeModal(); renderAll();
};

// ── Marker tag rendering ──────────────────────────────────────────────────────
function renderMarkerTags() {
  document.getElementById('markers-container').innerHTML = currentMarkers.map((m, i) =>
    `<span class="marker-tag">${esc(m)}<button type="button" onclick="removeMarker(${i})">×</button></span>`).join('');
}
window.removeMarker = function(i) { currentMarkers.splice(i, 1); renderMarkerTags(); refreshPosPicker(); };

function renderNegMarkerTags() {
  document.getElementById('neg-markers-container').innerHTML = currentNegMarkers.map((m, i) =>
    `<span class="marker-tag marker-tag-neg">${esc(m)}<button type="button" onclick="removeNegMarker(${i})">×</button></span>`).join('');
}
window.removeNegMarker = function(i) { currentNegMarkers.splice(i, 1); renderNegMarkerTags(); refreshNegPicker(); };

function renderUnsortedMarkerTags() {
  document.getElementById('unsorted-markers-container').innerHTML = currentUnsortedMarkers.map((m, i) =>
    `<span class="marker-tag marker-tag-unsorted">${esc(m)}<button type="button" onclick="removeUnsortedMarker(${i})">×</button></span>`).join('');
}
window.removeUnsortedMarker = function(i) { currentUnsortedMarkers.splice(i, 1); renderUnsortedMarkerTags(); refreshUnsortedPicker(); };

// ── Marker picker dropdowns (in Add/Edit modal) ───────────────────────────────
function buildPickerHtml(allMarkers, currentList, toggleFn, newInputId) {
  let html = '';
  if (allMarkers.length) {
    html += allMarkers.map(m => {
      const on = currentList.some(x => x.toLowerCase() === m.toLowerCase());
      return `<label class="mpick-row${on ? ' mpick-checked' : ''}">
        <input type="checkbox" ${on ? 'checked' : ''}
          onchange="${toggleFn}('${esc(m)}', this.checked)" />
        ${esc(m)}
      </label>`;
    }).join('');
  }
  html += `<div class="mpick-add-trigger" id="${newInputId}-trigger" onclick="expandMarkerInput('${newInputId}')">＋ Add new marker</div>
  <div class="mpick-new-row hidden" id="${newInputId}-row">
    <input type="text" id="${newInputId}" class="mpick-new-input" placeholder="New marker…"
      autocapitalize="none" autocorrect="off" spellcheck="false"
      onkeydown="if(event.key==='Enter'){event.preventDefault();addNewMarker('${newInputId}')}" />
    <button type="button" class="btn-tag-add" onclick="addNewMarker('${newInputId}')">+</button>
  </div>`;
  return html;
}

window.expandMarkerInput = function(inputId) {
  document.getElementById(inputId + '-trigger')?.classList.add('hidden');
  const row = document.getElementById(inputId + '-row');
  if (row) {
    row.classList.remove('hidden');
    setTimeout(() => document.getElementById(inputId)?.focus(), 50);
  }
};

function refreshPosPicker() {
  const dd = document.getElementById('pos-picker-dropdown');
  if (!dd || dd.classList.contains('hidden')) return;
  const prev = document.getElementById('pos-new-input')?.value || '';
  dd.innerHTML = buildPickerHtml(uniquePosMarkers(), currentMarkers, 'toggleMarkerInPicker', 'pos-new-input');
  const ni = document.getElementById('pos-new-input');
  if (ni) ni.value = prev;
}
function refreshNegPicker() {
  const dd = document.getElementById('neg-picker-dropdown');
  if (!dd || dd.classList.contains('hidden')) return;
  const prev = document.getElementById('neg-new-input')?.value || '';
  dd.innerHTML = buildPickerHtml(uniqueNegMarkers(), currentNegMarkers, 'toggleNegMarkerInPicker', 'neg-new-input');
  const ni = document.getElementById('neg-new-input');
  if (ni) ni.value = prev;
}

function refreshUnsortedPicker() {
  const dd = document.getElementById('unsorted-picker-dropdown');
  if (!dd || dd.classList.contains('hidden')) return;
  const prev = document.getElementById('unsorted-new-input')?.value || '';
  dd.innerHTML = buildPickerHtml(uniqueUnsortedMarkers(), currentUnsortedMarkers, 'toggleUnsortedMarkerInPicker', 'unsorted-new-input');
  const ni = document.getElementById('unsorted-new-input');
  if (ni) ni.value = prev;
}

window.togglePosPicker = function() {
  const dd = document.getElementById('pos-picker-dropdown');
  const opening = dd.classList.contains('hidden');
  document.getElementById('pos-picker-dropdown').classList.add('hidden');
  document.getElementById('neg-picker-dropdown').classList.add('hidden');
  document.getElementById('unsorted-picker-dropdown')?.classList.add('hidden');
  if (opening) {
    dd.innerHTML = buildPickerHtml(uniquePosMarkers(), currentMarkers, 'toggleMarkerInPicker', 'pos-new-input');
    dd.classList.remove('hidden');
    dd.scrollTop = 0;
  }
};

window.toggleNegPicker = function() {
  const dd = document.getElementById('neg-picker-dropdown');
  const opening = dd.classList.contains('hidden');
  document.getElementById('pos-picker-dropdown').classList.add('hidden');
  document.getElementById('neg-picker-dropdown').classList.add('hidden');
  document.getElementById('unsorted-picker-dropdown')?.classList.add('hidden');
  if (opening) {
    dd.innerHTML = buildPickerHtml(uniqueNegMarkers(), currentNegMarkers, 'toggleNegMarkerInPicker', 'neg-new-input');
    dd.classList.remove('hidden');
    dd.scrollTop = 0;
  }
};

window.toggleUnsortedPicker = function() {
  const dd = document.getElementById('unsorted-picker-dropdown');
  if (!dd) return;
  const opening = dd.classList.contains('hidden');
  document.getElementById('pos-picker-dropdown')?.classList.add('hidden');
  document.getElementById('neg-picker-dropdown')?.classList.add('hidden');
  document.getElementById('unsorted-picker-dropdown').classList.add('hidden');
  if (opening) {
    dd.innerHTML = buildPickerHtml(uniqueUnsortedMarkers(), currentUnsortedMarkers, 'toggleUnsortedMarkerInPicker', 'unsorted-new-input');
    dd.classList.remove('hidden');
    dd.scrollTop = 0;
  }
};

window.toggleMarkerInPicker = function(m, checked) {
  if (checked && !currentMarkers.includes(m)) currentMarkers.push(m);
  else if (!checked) currentMarkers = currentMarkers.filter(x => x !== m);
  renderMarkerTags(); refreshPosPicker();
};

window.toggleNegMarkerInPicker = function(m, checked) {
  if (checked && !currentNegMarkers.includes(m)) currentNegMarkers.push(m);
  else if (!checked) currentNegMarkers = currentNegMarkers.filter(x => x !== m);
  renderNegMarkerTags(); refreshNegPicker();
};

window.toggleUnsortedMarkerInPicker = function(m, checked) {
  if (checked && !currentUnsortedMarkers.includes(m)) currentUnsortedMarkers.push(m);
  else if (!checked) currentUnsortedMarkers = currentUnsortedMarkers.filter(x => x !== m);
  renderUnsortedMarkerTags(); refreshUnsortedPicker();
};

window.addNewMarker = function(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const v = input.value.trim();
  if (!v) return;
  if (inputId === 'pos-new-input') {
    const existing = uniquePosMarkers().find(m => m.toLowerCase() === v.toLowerCase());
    const marker = existing || v;
    if (!currentMarkers.find(m => m.toLowerCase() === v.toLowerCase())) {
      currentMarkers.push(marker); renderMarkerTags();
    }
    refreshPosPicker();
  } else if (inputId === 'unsorted-new-input') {
    const existing = uniqueUnsortedMarkers().find(m => m.toLowerCase() === v.toLowerCase());
    const marker = existing || v;
    if (!currentUnsortedMarkers.find(m => m.toLowerCase() === v.toLowerCase())) {
      currentUnsortedMarkers.push(marker); renderUnsortedMarkerTags();
    }
    refreshUnsortedPicker();
  } else {
    const existing = uniqueNegMarkers().find(m => m.toLowerCase() === v.toLowerCase());
    const marker = existing || v;
    if (!currentNegMarkers.find(m => m.toLowerCase() === v.toLowerCase())) {
      currentNegMarkers.push(marker); renderNegMarkerTags();
    }
    refreshNegPicker();
  }
  input.value = '';
  input.blur();
};

// Escape key closes dropdowns and overlays
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closeExperimentsDropdown();
  if (!document.getElementById('tank-picker-overlay')?.classList.contains('hidden')) closeTankPicker();
});

// Close picker dropdowns on outside click
document.addEventListener('click', e => {
  ['pos-picker-wrap', 'neg-picker-wrap', 'unsorted-picker-wrap'].forEach(id => {
    const wrap = document.getElementById(id);
    if (wrap && !wrap.contains(e.target)) {
      wrap.querySelector('.marker-picker-dropdown')?.classList.add('hidden');
    }
  });
});

// ── Delete ────────────────────────────────────────────────────────────────────
window.deleteFish = async function(id) {
  if (!confirm('Delete this tank from inventory? This can\'t be undone.')) return;
  const fish = fishData.find(f => f.id === id);
  if (!fish) return;
  if (!demoMode && fish._rowIndex) {
    try {
      await deleteSheetRow(fish._rowIndex);
      if (fish.photoUrl) deleteDrivePhoto(fish.photoUrl);
      const delDetails = [
        `Line: ${fish.line}`,
        `Status: ${fish.status}`,
        fish.count    ? `Count: ${fish.count}`        : null,
        fish.location ? `Location: ${fish.location}`  : null,
        (fish.markers    ||[]).length ? `+Markers: [${fish.markers.join(', ')}]`    : null,
        (fish.negMarkers ||[]).length ? `−Markers: [${fish.negMarkers.join(', ')}]` : null,
        fish.photoUrl ? 'Had photo' : null,
      ].filter(Boolean).join(' | ');
      logChange('Deleted', fish, delDetails);
      await fetchFromSheets();
    } catch(e) { showToast('❌ Delete failed: ' + e.message); return; }
  } else {
    fishData = fishData.filter(f => f.id !== id);
  }
  // Remove deleted tank from any experiments
  const deletedId = fish.tankId;
  if (deletedId) {
    experiments.forEach(exp => {
      exp.tankIds = exp.tankIds.filter(id => id !== deletedId);
      if (exp.tankGroups) delete exp.tankGroups[deletedId];
    });
    if (currentExperiment) {
      currentExperiment.tankIds = currentExperiment.tankIds.filter(id => id !== deletedId);
      if (currentExperiment.tankGroups) delete currentExperiment.tankGroups[deletedId];
    }
  }
  showToast('🗑 Tank deleted');
  invalidateMarkerFreq();
  closeDrawer(); renderAll();
};

// ── Experiment membership from drawer ────────────────────────────────────────
window.toggleTankInExperiment = async function(tankId, expIdx) {
  const exp = experiments[expIdx];
  if (!exp) return;
  const inExp = exp.tankIds.includes(tankId);
  if (inExp) {
    if (!confirm(`Remove this tank from "${exp.name}"? This can't be undone.`)) return;
    exp.tankIds = exp.tankIds.filter(id => id !== tankId);
    if (exp.tankGroups) delete exp.tankGroups[tankId];
    if (currentExperiment?.gid === exp.gid) { currentExperiment.tankIds = exp.tankIds; currentExperiment.tankGroups = exp.tankGroups; }
  } else {
    exp.tankIds = [...exp.tankIds, tankId];
    if (currentExperiment?.gid === exp.gid) currentExperiment.tankIds = exp.tankIds;
  }
  if (!demoMode) saveExpTankIds(exp.name, exp.tankIds, exp.tankGroups || {});
  // Re-render just the exp section inside the drawer
  const el = document.getElementById(`exp-membership-${expIdx}`);
  if (el) el.classList.toggle('exp-member-active', exp.tankIds.includes(tankId));
  renderExperimentsDropdown();
  if (currentExperiment) renderAll();
};

// ── Detail Drawer ─────────────────────────────────────────────────────────────
window.openDrawer = function(id) {
  const f = fishData.find(x => x.id === id);
  if (!f) return;
  const posHtml      = (f.markers    || []).length ? (f.markers   || []).map(m => `<span class="m-tag">${esc(m)}</span>`).join(' ')                  : '<span style="color:var(--text-dim)">None</span>';
  const negHtml      = (f.negMarkers || []).length ? (f.negMarkers|| []).map(m => `<span class="m-tag m-tag-neg">−${esc(m)}</span>`).join(' ')        : '<span style="color:var(--text-dim)">None</span>';
  const unsortedHtml = (f.unsorted   || []).length ? (f.unsorted  || []).map(m => `<span class="m-tag m-tag-unsorted">${esc(m)}</span>`).join(' ')     : '<span style="color:var(--text-muted);font-size:.85rem">—</span>';
  const photoHtml = f.photoUrl ? `<img class="drawer-photo" src="${esc(f.photoUrl)}" onclick="openLightbox('${esc(f.photoUrl)}')" title="Click to enlarge" />` : '';

  document.getElementById('drawer-content').innerHTML = `
    ${photoHtml}
    <div class="drawer-line">${esc(f.line)}</div>
    <span class="status-badge badge-${f.status}" style="margin-top:.25rem;display:inline-block">${esc(f.status)}</span>
    <div class="drawer-section">
      <h4>Details</h4>
      <div class="drawer-row"><span class="drawer-row-label">Fert. Date</span><span class="drawer-row-val">${formatDate(f.age)}${f.age ? ' · ' + calcDpf(f.age) + ' dpf' : ''}</span></div>
      <div class="drawer-row"><span class="drawer-row-label">Count</span><span class="drawer-row-val">${f.count || '—'}</span></div>
      <div class="drawer-row"><span class="drawer-row-label">Location</span><span class="drawer-row-val">${esc(f.location || '—')}</span></div>
      <div class="drawer-row"><span class="drawer-row-label">Last Updated</span><span class="drawer-row-val">${formatDateTime(f.updated)}</span></div>
    </div>
    <div class="drawer-section">
      <h4>Positive Markers</h4>
      <div style="display:flex;flex-wrap:wrap;gap:.35rem;padding:.5rem 0">${posHtml}</div>
    </div>
    <div class="drawer-section">
      <h4>Negative Markers</h4>
      <div style="display:flex;flex-wrap:wrap;gap:.35rem;padding:.5rem 0">${negHtml}</div>
    </div>
    <div class="drawer-section">
      <h4>Unsorted Markers (?)</h4>
      <div style="display:flex;flex-wrap:wrap;gap:.35rem;padding:.5rem 0">${unsortedHtml}</div>
    </div>
    ${f.notes ? `<div class="drawer-section"><h4>Notes</h4><p style="font-size:.88rem;color:var(--text-muted);line-height:1.5">${esc(f.notes)}</p></div>` : ''}
    ${experiments.length ? `
    <div class="drawer-section">
      <h4>🧪 Experiments</h4>
      <div class="drawer-exp-list">
        ${experiments.map((exp, i) => {
          const inExp = exp.tankIds.includes(f.tankId);
          return `<button id="exp-membership-${i}"
            class="drawer-exp-btn${inExp ? ' exp-member-active' : ''}"
            onclick="toggleTankInExperiment('${esc(f.tankId)}', ${i})">
            ${inExp ? '✓' : '+'} ${esc(exp.name)}
          </button>`;
        }).join('')}
      </div>
    </div>` : ''}
    <div class="drawer-actions">
      <button class="btn-primary" onclick="closeDrawer();openEditModal('${esc(f.id)}')">Edit</button>
      <button class="btn-ghost" onclick="closeDrawer();duplicateFish('${esc(f.id)}')">Duplicate</button>
      ${currentExperiment
        ? `<button class="btn-ghost" onclick="closeDrawer();removeFromExperiment('${esc(f.tankId)}',event)">Remove from Experiment</button>`
        : `<button class="btn-ghost" onclick="closeDrawer();deleteFish('${esc(f.id)}')">Delete from Inventory</button>`}
    </div>
  `;
  document.getElementById('detail-drawer').classList.add('open');
  document.getElementById('drawer-backdrop').classList.add('active');
  checkScrollLock();
};

window.closeDrawer = function() {
  document.getElementById('detail-drawer').classList.remove('open');
  document.getElementById('drawer-backdrop').classList.remove('active');
  checkScrollLock();
};

// ── Lightbox ──────────────────────────────────────────────────────────────────
window.openLightbox = function(src) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('photo-lightbox').classList.add('active');
  checkScrollLock();
};
window.closeLightbox = function() {
  document.getElementById('photo-lightbox').classList.remove('active');
  checkScrollLock();
};

// ── Quick Start Guide ─────────────────────────────────────────────────────────
window.openGuide = function() {
  document.getElementById('guide-overlay').classList.add('active');
  document.body.classList.add('modal-open');
};
window.closeGuide = function() {
  document.getElementById('guide-overlay').classList.remove('active');
  checkScrollLock();
};

// ── Barcode Scanner ───────────────────────────────────────────────────────────
window.openScanner = function() {
  scanForForm = false;
  document.getElementById('scan-overlay').classList.add('active');
  document.getElementById('scan-status').textContent = 'Initializing camera…';
  document.getElementById('manual-barcode').value    = '';
  checkScrollLock(); startQuagga();
};
window.openScannerForForm = function() {
  scanForForm = true;
  document.getElementById('scan-overlay').classList.add('active');
  document.getElementById('scan-status').textContent = 'Initializing camera…';
  document.getElementById('manual-barcode').value    = '';
  checkScrollLock(); startQuagga();
};
window.closeScanner = function() {
  document.getElementById('scan-overlay').classList.remove('active');
  scanForForm = false;
  stopQuagga(); checkScrollLock();
};
// Named handler so Quagga.offDetected can remove the exact same reference —
// prevents duplicate listeners stacking up across multiple scan sessions.
function handleBarcodeDetected(result) {
  const code = result.codeResult.code?.trim() || '';
  if (!/^C\d{8}$/i.test(code)) {
    document.getElementById('scan-status').textContent = `⚠️ Bad scan (${code}) — expected C + 8 digits. Try again…`;
    return;
  }
  // Valid — stop scanner and close overlay
  stopQuagga();
  document.getElementById('scan-overlay').classList.remove('active');
  checkScrollLock();
  showToast(`📷 Scanned: ${code.toUpperCase()}`);
  if (scanForForm) {
    scanForForm = false;
    document.getElementById('f-tank-id').value = code.toUpperCase();
    return;
  }
  const found = fishData.find(f => (f.tankId || '').trim().toLowerCase() === code.toLowerCase());
  if (found) openDrawer(found.id);
  else { openAddModal(); document.getElementById('f-tank-id').value = code.toUpperCase(); }
}

function startQuagga() {
  if (typeof Quagga === 'undefined') { document.getElementById('scan-status').textContent = 'Scanner not available. Use manual entry.'; return; }
  Quagga.init({
    inputStream: { name:'Live', type:'LiveStream', target: document.querySelector('#interactive'), constraints: { facingMode:'environment', width:{ideal:1280}, height:{ideal:720} } },
    decoder:     { readers: ['code_128_reader','ean_reader','ean_8_reader','code_39_reader','upc_reader'] },
    locate: true,
  }, err => {
    if (err) { document.getElementById('scan-status').textContent = 'Camera error — use manual entry.'; return; }
    Quagga.start(); scannerRunning = true;
    document.getElementById('scan-status').textContent = 'Point camera at barcode…';
    // Remove any existing listener before adding — prevents stacking across sessions
    Quagga.offDetected(handleBarcodeDetected);
    Quagga.onDetected(handleBarcodeDetected);
  });
}
function stopQuagga() {
  if (scannerRunning && typeof Quagga !== 'undefined') {
    try { Quagga.offDetected(handleBarcodeDetected); Quagga.stop(); } catch(_){}
    scannerRunning = false;
  }
  // Force-stop camera tracks — Quagga.stop() doesn't always release the
  // MediaStream on all browsers, leaving the camera active in the background.
  try {
    document.querySelectorAll('#interactive video').forEach(v => {
      if (v.srcObject) { v.srcObject.getTracks().forEach(t => t.stop()); v.srcObject = null; }
    });
  } catch(_) {}
}
window.manualBarcode = function() {
  const v = document.getElementById('manual-barcode').value.trim().toUpperCase();
  if (!v) return;
  if (!/^C\d{8}$/.test(v)) {
    document.getElementById('manual-barcode').focus();
    showToast(`⚠️ Must be C + 8 digits (e.g. C12345678)`);
    return;
  }
  closeScanner();
  showToast(`📷 Entered: ${v}`);
  if (scanForForm) {
    scanForForm = false;
    document.getElementById('f-tank-id').value = v;
    return;
  }
  const found = fishData.find(f => (f.tankId || '').trim().toUpperCase() === v);
  if (found) openDrawer(found.id);
  else { openAddModal(); document.getElementById('f-tank-id').value = v; }
};
document.addEventListener('keydown', e => { if (e.target.id === 'manual-barcode' && e.key === 'Enter') manualBarcode(); });

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if ((e.metaKey||e.ctrlKey) && e.key==='k') { e.preventDefault(); document.getElementById('search-input')?.focus(); }
  if (e.key==='Escape') { closeModal(); closeDrawer(); closeScanner(); closeLightbox(); closeMobileFilters(); closeGuide(); }
  if ((e.metaKey||e.ctrlKey) && e.key==='n') { e.preventDefault(); openAddModal(); }
});
