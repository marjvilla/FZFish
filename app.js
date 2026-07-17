/* ── FZFish app.js ── */

// ── Constants ────────────────────────────────────────────────────────────────
const CLIENT_ID     = '239772949162-ctqj91o3e56lep520shlo1trhq0rv42r.apps.googleusercontent.com';
const SHEET_ID      = '1AviXu1_KPFRx158Af05qBmA-LCw2GhxJxvfZEFUCuqY';
const TAB_NAME      = 'Fish';
const DRIVE_FOLDER  = '1VTpNTlB-JMLPZNKzgm0IIXCRkk9Agzf7';
const SCOPES        = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events openid email';
// Shared, subscribable Google Calendar that alert events get written to — NOT a personal calendar.
// Set this to the Calendar ID of a shared calendar (Calendar settings → Integrate calendar → Calendar ID)
// after following the "Setting up Google Calendar Sync" steps in the README. Looks like
// "abc123...@group.calendar.google.com". Leave blank to disable the feature entirely.
const GCAL_ID       = 'c_de94b9269ee872ee8ef5f198da77b020ce2e9a723ecb10a3fe700120a8292d09@group.calendar.google.com';

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
let drawerTankId      = null;  // internal id of the tank whose detail drawer is currently open, if any
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
let groupFilterColor  = null;       // 'green'|'red'|'blue'|'yellow'|'none'|null — highlights one group
let pickerSelected    = new Set();
let sortDir           = -1;  // -1 = desc (newest first for dates), 1 = asc
let imgOff            = localStorage.getItem('fzfish-img-off') === 'true';
let deferredInstallPrompt = null;
let alertCache            = null;   // null = not loaded; [] or array = loaded from sheet

// ── Breeding / lineage state ──
let crosses           = [];         // loaded from the Lineage tab
let lineageTabReady   = false;      // true once we know the Lineage tab exists
let newCrossParents   = [null, null]; // tankIds being assembled in the New Cross modal
let newCrossIncross   = false;
let newCrossPhotos    = [];         // photo URLs uploaded for the setup being created
let scanForCross      = 0;          // 0 = off, 1 = filling parent 1, 2 = filling parent 2

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

window.triggerInstall = function() {
  const isStandalone = window.navigator.standalone ||
                       window.matchMedia('(display-mode: standalone)').matches;
  if (isStandalone) { showToast('Already installed!'); return; }

  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(() => { deferredInstallPrompt = null; });
    return;
  }

  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const tip = document.getElementById('install-tooltip');
  if (isIOS && tip) {
    const visible = !tip.classList.contains('hidden');
    tip.classList.toggle('hidden', visible);
    if (!visible) setTimeout(() => tip.classList.add('hidden'), 5000);
    return;
  }

  // Fallback: open help guide install section
  openGuide();
  setTimeout(() => {
    const s = document.getElementById('guide-webapp-section');
    if (s) { s.open = true; s.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }, 150);
};

// A  B     C          D    E      F         G            H       I      J        K      L
// ID Line  Unsorted   Date Count  Location  PosMarkers   Status  Notes  Updated  Photo  NegMarkers
const COL = {
  tankId:     0, line:     1, unsorted:   2,
  age:        3, count:    4, location:   5,
  markers:    6, status:   7, notes:      8,
  updated:    9, photo:   10, negMarkers: 11,
  thumbPos:  12, crossOrigin: 13,
};

const LINEAGE_TAB = 'Lineage';

// ── Demo data ────────────────────────────────────────────────────────────────
const DEMO = [
  { tankId:'demo-1', line:'fli1:EGFP',     unsorted:[], age:'2025-01-10', count:12, location:'R1 S2', markers:['EGFP','fli1'],    negMarkers:[],        status:'Active',    notes:'Healthy, spawning well', photoUrl:'', updated:'2025-04-20' },
  { tankId:'demo-2', line:'gata1:DsRed x AB',   unsorted:[], age:'2025-02-01', count:8,  location:'R1A S3', markers:['DsRed','gata1'],  negMarkers:['fli1'],  status:'Breeding',  notes:'Set up breeding pair',   photoUrl:'', updated:'2025-04-22' },
  { tankId:'demo-3', line:'casper',            unsorted:[], age:'2024-12-05', count:3,  location:'R2B S3', markers:[],                 negMarkers:[],        status:'Breeding',  notes:'Need to expand',          photoUrl:'', updated:'2025-04-15' },
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
function updateHeaderHeight() {
  const h = document.querySelector('.app-header');
  if (h) document.documentElement.style.setProperty('--header-h', h.offsetHeight + 'px');
}
window.addEventListener('resize', updateHeaderHeight);

window.addEventListener('DOMContentLoaded', () => {
  // Measure header height after first paint for sticky filter bar offset
  requestAnimationFrame(updateHeaderHeight);
  if (imgOff) {
    document.getElementById('app')?.classList.add('img-off');
    ['img-toggle-btn', 'mob-img-btn'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.style.opacity = '0.4';
    });
  }
  if (localStorage.getItem('fzfish-demo') === 'true') { useDemoMode(); return; }

  // If we've seen this user before, try a silent token refresh — no sign-in screen needed.
  // localStorage persists across browser restarts; the token itself may be expired but
  // requestAccessToken({ prompt: '' }) will silently renew it while Google session is active.
  const storedUser = localStorage.getItem('zb-user');
  if (storedUser) {
    accessToken = localStorage.getItem('zb-token') || null;
    tokenExpiry  = parseInt(localStorage.getItem('zb-expiry') || '0');
    currentUser  = storedUser;
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
          // Silent refresh failed (Google session expired); clear and show sign-in
          accessToken = null;
          localStorage.removeItem('zb-token');
          localStorage.removeItem('zb-expiry');
          localStorage.removeItem('zb-user');
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
      localStorage.setItem('zb-token',  accessToken);
      localStorage.setItem('zb-expiry', String(tokenExpiry));
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
  localStorage.removeItem('zb-token');
  localStorage.removeItem('zb-expiry');
  localStorage.removeItem('zb-user');
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
  // Test Mode is billed as "Not Saved" — start every session clean rather than
  // carrying over crosses/experiments left behind by a previous demo session
  crosses = [];
  experiments = [];
  localStorage.removeItem(CROSS_KEY);
  showApp();
  showToast('🐠 Demo mode active — data not saved');
};

function showApp() {
  document.getElementById('setup-overlay').classList.remove('active');
  document.getElementById('app').classList.remove('hidden');
  const signoutBtn = document.getElementById('signout-btn');
  if (signoutBtn) signoutBtn.textContent = demoMode ? 'Exit Demo' : 'Sign Out';
  renderAll();
  checkAlerts();   // async — fire-and-forget, badge/toast updates when ready
  syncAllAlertsToCalendar();  // async — pushes any alerts missing a calendar event, whoever's signed in
  fetchCrosses().then(renderCrossBadge);  // load breeding crosses in the background
  showNavHintOnce();
  // Migration wizards are intentionally not auto-triggered.
  // Run manually via console if needed: checkLocationMigration() or checkUnsortedMigration()
}

// One-time hint pointing first-time users at the 🐟 nav menu
function showNavHintOnce() {
  if (localStorage.getItem('fzfish-nav-hint-shown')) return;
  const nav = document.getElementById('nav-wrap');
  if (!nav) return;
  nav.classList.add('nav-hint-pulse');
  let dismissed = false;
  const dismiss = () => { dismissed = true; nav.classList.remove('nav-hint-pulse'); localStorage.setItem('fzfish-nav-hint-shown', 'true'); };
  // Delay the toast so it isn't overwritten by the sign-in/demo toast that fires on load
  setTimeout(() => { if (!dismissed) showToast('👋 Click the 🐟 logo to switch between Inventory, Breeding & Lineage, and Experiments'); }, 3600);
  nav.addEventListener('click', dismiss, { once: true });
  setTimeout(dismiss, 20000);   // stop pulsing on its own if never clicked
}

async function fetchUserInfo() {
  try {
    const res  = await authFetch('https://www.googleapis.com/oauth2/v3/userinfo');
    const json = await res.json();
    currentUser = json.email || json.name || '';
    localStorage.setItem('zb-user', currentUser);
  } catch(e) { currentUser = ''; }
}

// ── Authenticated fetch ───────────────────────────────────────────────────────
async function authFetch(url, options = {}) {
  // Always try a silent refresh first — avoids "expired token" mid-save errors
  try { await ensureToken(); } catch(e) {
    showToast('⚠️ Session expired — please sign in again.');
    signOut(); throw new Error('No valid token');
  }
  return fetch(url, { ...options, headers: { ...options.headers, 'Authorization': `Bearer ${accessToken}` } });
}

// Proactively refresh the token 3 minutes before expiry so saves never hit an expired token
setInterval(() => {
  if (!demoMode && accessToken && tokenExpiry && Date.now() > tokenExpiry - 3 * 60 * 1000) {
    tokenClient?.requestAccessToken({ prompt: '' });
  }
}, 60 * 1000);

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
    // Alerts piggyback on this fetch — stored as JSON in Fish!Z1 (col 25 of row 0)
    try { alertCache = JSON.parse(rows[0]?.[25] || '[]'); } catch(e) { alertCache = []; }
    // One-time migration: if Fish!Z1 is empty, check changelog!Z1 for alerts written there previously
    if (!alertCache.length) {
      try {
        const mr = await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/changelog!Z1`);
        const mj = await mr.json();
        const raw = mj.values?.[0]?.[0];
        if (raw) {
          alertCache = JSON.parse(raw);
          await saveAlerts(alertCache);   // write to Fish!Z1
          // Clear the old cell
          await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/changelog!Z1:clear`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        }
      } catch(e) { /* changelog may not exist — fine */ }
    }
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
      crossOrigin: r[COL.crossOrigin] || '',
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
  const res = await authFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(TAB_NAME)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [recordToRow(record)] }) }
  );
  if (!res.ok) throw new Error(`Sheets append failed: ${res.status}`);
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
    r.crossOrigin || '',
  ];
}

window.syncSheets = async function() {
  const btn = document.getElementById('sync-btn');
  btn.classList.add('spinning');
  if (demoMode) { await new Promise(r => setTimeout(r, 600)); btn.classList.remove('spinning'); showToast('🐠 Demo mode — nothing to sync'); return; }
  try {
    alertCache = null;   // invalidate so next openAlertPanel re-fetches from sheet
    await fetchFromSheets(); await fetchExperiments(); await fetchCrosses(); renderAll();
    checkAlerts();
    renderCrossBadge();
  } catch(e) {
    showToast('⚠️ Sync failed — check your connection');
    console.warn('syncSheets error:', e);
  } finally {
    btn.classList.remove('spinning');
  }
};

// ── Experiments ──────────────────────────────────────────────────────────────
async function fetchExperiments() {
  if (demoMode) return;
  try {
    const res  = await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`);
    const json = await res.json();
    const reserved = new Set([TAB_NAME.toLowerCase(), 'changelog', LINEAGE_TAB.toLowerCase()]);
    const expSheets = (json.sheets || []).map(s => s.properties).filter(p => !reserved.has(p.title.toLowerCase()));
    // Only store names/gids — tank IDs are loaded lazily when an experiment is opened
    experiments = expSheets.map(p => ({ name: p.title, gid: p.sheetId, tankIds: null, tankGroups: null, notes: null, date: null }));
    renderExperimentsListView();
  } catch(e) { console.warn('fetchExperiments:', e.message); }
}

// Always re-fetches the experiment list from the sheet so it can't go stale/"shaky"
async function openExperimentsTab() {
  if (!demoMode) {
    document.getElementById('experiments-view-body').innerHTML = '<p class="alert-empty">Loading experiments…</p>';
    await fetchExperiments();
  } else {
    renderExperimentsListView();
  }
}

async function loadExpNotes(tabName) {
  try {
    const r = await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(tabName)}!D1`);
    const d = await r.json();
    return d.values?.[0]?.[0] || '';
  } catch(e) { return ''; }
}

async function saveExpNotes(tabName, notes) {
  await authFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(tabName)}!D1?valueInputOption=RAW`,
    { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ values: [[notes]] }) }
  );
}

// Experiment date piggybacks one cell over from notes (D1) — E1, same pattern
async function loadExpDate(tabName) {
  try {
    const r = await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(tabName)}!E1`);
    const d = await r.json();
    return d.values?.[0]?.[0] || '';
  } catch(e) { return ''; }
}

async function saveExpDate(tabName, date) {
  await authFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(tabName)}!E1?valueInputOption=RAW`,
    { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ values: [[date]] }) }
  );
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

function renderExperimentsListView() {
  const body = document.getElementById('experiments-view-body');
  if (!body) return;
  let html = `<button class="btn-primary btn-sm exp-new-btn" onclick="createExperiment()">＋ New Experiment</button>`;
  html += experiments.length
    ? experiments.map((exp, i) => `
        <button class="exp-list-row${currentExperiment?.gid === exp.gid ? ' exp-list-active' : ''}"
            onclick="enterExperiment(${i})">
          <span class="exp-list-name">${esc(exp.name)}</span>
          <span class="exp-list-meta">
            ${exp.date ? `<span class="exp-list-date">📅 ${esc(formatDate(exp.date))}</span>` : ''}
            <span class="exp-list-count">${exp.tankIds === null ? '…' : exp.tankIds.length + ' tanks'}</span>
          </span>
        </button>`).join('')
    : '<p class="alert-empty">No experiments yet. Create one to start grouping tanks.</p>';
  body.innerHTML = html;
}

window.enterExperiment = async function(idx) {
  const exp = experiments[idx];
  if (!exp) return;

  // Always reload fresh from the sheet (rather than relying on a cached load from
  // earlier in the session) so the experiment's tank list and notes can't go stale
  showToast('Loading experiment…');
  if (demoMode) {
    exp.tankIds    = exp.tankIds || [];
    exp.tankGroups = exp.tankGroups || {};
    exp.notes      = exp.notes || '';
    exp.date       = exp.date || '';
  } else {
    const [loaded, notes, date] = await Promise.all([loadExpTankIds(exp.name), loadExpNotes(exp.name), loadExpDate(exp.name)]);
    exp.tankIds    = loaded.ids;
    exp.tankGroups = loaded.groups;
    exp.notes      = notes;
    exp.date       = date;
  }

  const validIds = new Set(fishData.map(f => f.tankId));
  const cleaned  = exp.tankIds.filter(id => validIds.has(id));
  if (cleaned.length !== exp.tankIds.length) {
    exp.tankIds = cleaned;
    if (!demoMode) saveExpTankIds(exp.name, cleaned, exp.tankGroups || {});
  }
  currentExperiment = exp;
  activeMainTab      = 'experiments';
  document.getElementById('exp-name-display').textContent = exp.name;
  document.getElementById('exp-name-input').classList.add('hidden');
  document.getElementById('exp-name-display').classList.remove('hidden');
  document.getElementById('filter-panel')?.classList.add('exp-mode');
  document.getElementById('filter-toggle-bar')?.classList.add('exp-mode');
  document.getElementById('app')?.classList.add('in-experiment');
  document.getElementById('exp-notes-panel')?.classList.add('hidden');
  document.getElementById('exp-notes-toggle-btn')?.classList.remove('active');
  document.getElementById('exp-notes-toggle-btn')?.classList.toggle('has-notes', !!(exp.notes || '').trim());
  renderExpDatePill();
  resetGroupFilter();
  updateMainView();
  renderAll();
};

window.exitExperiment = function() {
  currentExperiment = null;
  resetGroupFilter();
  document.getElementById('filter-panel')?.classList.remove('exp-mode');
  document.getElementById('filter-toggle-bar')?.classList.remove('exp-mode');
  document.getElementById('app')?.classList.remove('in-experiment');
  document.getElementById('exp-notes-panel')?.classList.add('hidden');
  document.getElementById('exp-notes-toggle-btn')?.classList.remove('active');
  // Back to the experiments list (still on the Experiments tab)
  if (activeMainTab === 'experiments') renderExperimentsListView();
  updateMainView();
  renderAll();
};

window.toggleExpNotes = function() {
  if (!currentExperiment) return;
  const panel = document.getElementById('exp-notes-panel');
  const nowHidden = panel.classList.toggle('hidden');
  const open = !nowHidden;
  document.getElementById('exp-notes-toggle-btn')?.classList.toggle('active', open);
  if (open) {
    document.getElementById('exp-notes-input').value = currentExperiment.notes || '';
    document.getElementById('exp-notes-status').textContent = '';
    setTimeout(() => document.getElementById('exp-notes-input')?.focus(), 30);
  }
};

window.saveExpNotesFromInput = async function() {
  if (!currentExperiment) return;
  const input  = document.getElementById('exp-notes-input');
  const status = document.getElementById('exp-notes-status');
  const notes  = input.value;
  if (notes === (currentExperiment.notes || '')) return;
  currentExperiment.notes = notes;
  const idx = experiments.findIndex(e => e.gid === currentExperiment.gid);
  if (idx !== -1) experiments[idx].notes = notes;
  document.getElementById('exp-notes-toggle-btn')?.classList.toggle('has-notes', !!notes.trim());
  if (demoMode) { if (status) status.textContent = 'Saved'; return; }
  if (status) status.textContent = 'Saving…';
  try {
    await saveExpNotes(currentExperiment.name, notes);
    if (status) status.textContent = 'Saved';
    logChange('Experiment Notes Edited', { line: currentExperiment.name },
      notes.trim() ? `Notes: ${notes.length > 200 ? notes.slice(0, 200) + '…' : notes}` : 'Notes cleared');
  } catch(e) {
    if (status) status.textContent = '';
    showToast('❌ Failed to save notes');
  }
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

// "⬤ Group" button — opens a menu of colors to add the currently-selected tanks to
window.toggleGroupAssignMenu = function() {
  document.getElementById('group-assign-menu')?.classList.toggle('hidden');
};
window.startGroupAssign = function(color) {
  document.getElementById('group-assign-menu')?.classList.add('hidden');
  enterSelectionModeForGroup(color);
};

// Color swatches on the bar — click one to highlight (filter to) just that group
window.toggleGroupFilter = function(color) {
  groupFilterColor = groupFilterColor === color ? null : color;
  document.querySelectorAll('.exp-group-btns .exp-group-swatch').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === groupFilterColor);
  });
  filterFish();
};
function resetGroupFilter() {
  groupFilterColor = null;
  document.querySelectorAll('.exp-group-btns .exp-group-swatch').forEach(btn => btn.classList.remove('active'));
  document.getElementById('group-assign-menu')?.classList.add('hidden');
}

const GROUP_COLORS = ['green', 'red', 'blue', 'yellow'];
const GROUP_LABELS = { green: '🟢', red: '🔴', blue: '🔵', yellow: '🟡' };

window.enterSelectionModeForGroup = function(color) {
  const exp = currentExperiment;
  if (!exp) return;
  // Toggle off if already in group mode for the same color
  if (selectionMode && selectionContext?.type === 'experiment-group' && selectionContext?.color === color) {
    exitSelectionMode();
    return;
  }
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
  const assignedIds = [...selectedTankIds].map(id => fishData.find(f => f.id === id)?.tankId).filter(Boolean);
  logChange('Experiment Groups Updated', { line: exp.name },
    color === 'none' ? `Cleared group: ${assignedIds.join(', ')}` : `${color} group: ${assignedIds.join(', ')}`);
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
    logChange('Experiment Tanks Added', { line: exp.name }, `Added: ${newIds.join(', ')}`);
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
    const addedIds   = newList.filter(tid => !exp.tankIds.includes(tid));
    const removedIds = exp.tankIds.filter(tid => !newList.includes(tid));
    // Clean up group assignments for removed tanks
    removedIds.forEach(tid => { if (exp.tankGroups) delete exp.tankGroups[tid]; });
    exp.tankIds = newList;
    if (!demoMode) await saveExpTankIds(exp.name, exp.tankIds, exp.tankGroups || {});
    if (addedIds.length || removedIds.length) {
      logChange('Experiment Tanks Updated', { line: exp.name }, [
        addedIds.length   ? `Added: ${addedIds.join(', ')}`     : null,
        removedIds.length ? `Removed: ${removedIds.join(', ')}` : null,
      ].filter(Boolean).join(' | '));
    }
    const parts = [];
    if (addedIds.length)   parts.push(`+${addedIds.length} added`);
    if (removedIds.length) parts.push(`−${removedIds.length} removed`);
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
    logChange('Experiment Tanks Removed', { line: exp.name }, `Removed: ${tankIds.join(', ')}`);
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
    await dismissAlertsForTank(id);
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
  renderExperimentsListView();
  if (demoMode) return;
  try {
    await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ requests: [{ updateSheetProperties: { properties: { sheetId: currentExperiment.gid, title: newName }, fields: 'title' } }] }),
    });
    logChange('Experiment Renamed', { line: newName }, `"${oldName}" → "${newName}"`);
  } catch(e) {
    showToast('❌ Rename failed');
    currentExperiment.name = oldName;
    if (idx !== -1) experiments[idx].name = oldName;
    display.textContent = oldName;
  }
};

// ── Experiment date pill ──────────────────────────────────────────────────────
function renderExpDatePill() {
  const pill = document.getElementById('exp-date-pill');
  if (!pill || !currentExperiment) return;
  pill.textContent = currentExperiment.date ? `📅 ${formatDate(currentExperiment.date)}` : '📅 Set date';
  pill.classList.toggle('has-date', !!currentExperiment.date);
}

window.startEditExpDate = function() {
  const pill  = document.getElementById('exp-date-pill');
  const input = document.getElementById('exp-date-input');
  if (!pill || !input) return;
  input.value = currentExperiment.date ? toDateInput(currentExperiment.date) : '';
  pill.classList.add('hidden');
  input.classList.remove('hidden');
  input.focus();
};

window.saveExpDateFromInput = async function() {
  const pill  = document.getElementById('exp-date-pill');
  const input = document.getElementById('exp-date-input');
  const raw   = input.value.trim();
  input.classList.add('hidden');
  pill.classList.remove('hidden');
  if (raw && !isValidDateInput(raw)) { showToast('⚠️ Enter a valid date (MM/DD/YYYY)'); return; }
  const newDate = raw ? parseDateInput(raw) : '';
  if (newDate === (currentExperiment.date || '')) return;
  const oldDate = currentExperiment.date || '';
  currentExperiment.date = newDate;
  const idx = experiments.findIndex(e => e.gid === currentExperiment.gid);
  if (idx !== -1) experiments[idx].date = newDate;
  renderExpDatePill();
  if (!demoMode) {
    try {
      await saveExpDate(currentExperiment.name, newDate);
      logChange('Experiment Date Edited', { line: currentExperiment.name },
        newDate ? `${oldDate ? `"${formatDate(oldDate)}" → ` : ''}"${formatDate(newDate)}"` : 'Date cleared');
    } catch(e) { showToast('❌ Failed to save date'); }
  }
};

window.createExperiment = async function() {
  const name = prompt('Experiment name:');
  if (!name?.trim()) return;
  const trimmed = name.trim();
  if (demoMode) {
    const exp = { name: trimmed, gid: Date.now(), tankIds: [], tankGroups: {}, notes: '', date: '' };
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
    const exp = { name: props.title, gid: props.sheetId, tankIds: [], tankGroups: {}, notes: '', date: '' };
    experiments.push(exp);
    logChange('Experiment Created', { line: exp.name });
    enterExperiment(experiments.length - 1);
  } catch(e) { showToast('❌ ' + e.message); }
};

window.deleteExperiment = async function() {
  if (!currentExperiment) return;
  if (!confirm(`Delete experiment "${currentExperiment.name}"? This can't be undone.`)) return;
  const exp = currentExperiment;
  exitExperiment();
  experiments = experiments.filter(e => e.gid !== exp.gid);
  renderExperimentsListView();
  if (demoMode) return;
  try {
    await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ requests: [{ deleteSheet: { sheetId: exp.gid } }] }),
    });
    logChange('Experiment Deleted', { line: exp.name },
      `Had ${(exp.tankIds || []).length} tank${(exp.tankIds || []).length !== 1 ? 's' : ''}`);
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
  logChange('Experiment Tanks Removed', { line: currentExperiment.name }, `Removed: ${tankId}`);
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
  const statuses = ['Active','Nursery','Incubator','Breeding','Archived'];
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
  const statuses = ['Active','Nursery','Incubator','Breeding','Archived'];
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
  const prevIds = currentExperiment.tankIds || [];
  currentExperiment.tankIds = [...pickerSelected];
  const idx = experiments.findIndex(e => e.gid === currentExperiment.gid);
  if (idx !== -1) experiments[idx].tankIds = currentExperiment.tankIds;
  if (!demoMode) {
    try { await saveExpTankIds(currentExperiment.name, currentExperiment.tankIds, currentExperiment.tankGroups || {}); }
    catch(e) { showToast('❌ ' + e.message); if (btn) { btn.disabled = false; updatePickerBtn(); } return; }
  }
  const addedIds   = currentExperiment.tankIds.filter(tid => !prevIds.includes(tid));
  const removedIds = prevIds.filter(tid => !currentExperiment.tankIds.includes(tid));
  if (addedIds.length || removedIds.length) {
    logChange('Experiment Tanks Updated', { line: currentExperiment.name }, [
      addedIds.length   ? `Added: ${addedIds.join(', ')}`     : null,
      removedIds.length ? `Removed: ${removedIds.join(', ')}` : null,
    ].filter(Boolean).join(' | '));
  }
  closeTankPicker();
  renderAll();
  renderExperimentsListView();
  showToast(`✅ ${currentExperiment.tankIds.length} tanks saved`);
};

// ── Changelog ────────────────────────────────────────────────────────────────
function diffRecord(oldRec, newRec) {
  const fields = [
    { key: 'tankId',   label: 'Tank ID'    },
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
  // Lineage link (offspring-of-cross)
  const oldCross = oldRec.crossOrigin || '';
  const newCross = newRec.crossOrigin || '';
  if (oldCross !== newCross) {
    const label = id => { const c = crosses.find(x => x.id === id); return c ? crossLabel(c) : id; };
    if (!oldCross)      changes.push(`Lineage: linked to cross "${label(newCross)}"`);
    else if (!newCross) changes.push(`Lineage: unlinked from cross "${label(oldCross)}"`);
    else                changes.push(`Lineage: "${label(oldCross)}" → "${label(newCross)}"`);
  }
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
const PHOTO_MAX_PX  = 1800;
const PHOTO_QUALITY = 0.75;

function fitPhotoDims(width, height) {
  if (width > PHOTO_MAX_PX || height > PHOTO_MAX_PX) {
    if (width >= height) { height = Math.round(height * PHOTO_MAX_PX / width); width = PHOTO_MAX_PX; }
    else                 { width  = Math.round(width  * PHOTO_MAX_PX / height); height = PHOTO_MAX_PX; }
  }
  return { width, height };
}

// Plain <img>+<canvas> path — canvas.drawImage() draws raw pixel data and ignores
// EXIF orientation, so this is only used as a fallback where createImageBitmap
// with imageOrientation isn't supported.
function compressPhotoFallback(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = fitPhotoDims(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', PHOTO_QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// Photos straight off an Android camera commonly carry an EXIF rotation tag (portrait
// shots stored as landscape pixels + "rotate 90°"). canvas.drawImage() on a plain <img>
// ignores that tag, so a resized/compressed photo could come out sideways even though
// the original preview looked fine. createImageBitmap's imageOrientation:'from-image'
// bakes the correct rotation into the pixels before we ever touch a canvas.
async function compressPhoto(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    return compressPhotoFallback(file);
  }
  const { width, height } = fitPhotoDims(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', PHOTO_QUALITY));
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

// Returns true only if the file is actually gone from Drive (or never existed) —
// callers use this to avoid dropping a photo reference when the delete silently failed.
async function deleteDrivePhoto(photoUrl) {
  const id = extractDriveFileId(photoUrl);
  if (!id) return true;
  if (demoMode) return true;
  try {
    const res = await authFetch(`https://www.googleapis.com/drive/v3/files/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) {
      console.warn('deleteDrivePhoto failed:', id, res.status);
      return false;
    }
    return true;
  } catch(e) {
    console.warn('deleteDrivePhoto error:', e.message);
    return false;
  }
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

// Convert stored YYYY-MM-DD → MM/DD/YYYY for the age text input
function toDateInput(d) {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return d || '';
  const [y, m, day] = d.split('-');
  return m + '/' + day + '/' + y;
}
// A typed 2-digit year always means 20YY here — the app has no dates outside that range
function expandYear(y) { return y.length === 2 ? String(2000 + (+y)) : y; }

// Convert typed MM/DD/YYYY or MM/DD/YY → YYYY-MM-DD for storage
function parseDateInput(v) {
  if (!v) return '';
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return v;
  return expandYear(m[3]) + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
}
// True only for a fully-formed, real MM/DD/YYYY (or MM/DD/YY) calendar date (rejects 02/30/2024, 13/01/2024, etc.)
function isValidDateInput(v) {
  const m = (v || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return false;
  const month = +m[1], day = +m[2], year = +expandYear(m[3]);
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}
// Auto-format date input as user types (inserts slashes)
window.autoFormatDate = function(inp) {
  const prev = inp.value;
  let digits = prev.replace(/\D/g, '').slice(0, 8);
  let out = digits;
  if (digits.length > 4) out = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
  else if (digits.length > 2) out = digits.slice(0, 2) + '/' + digits.slice(2);
  if (out !== prev) inp.value = out;
};

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
  const fert = new Date(d + 'T00:00:00');
  if (isNaN(fert)) return '?';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((today - fert) / 86400000);
  // day 0 = date of fertilization; day 1 = the next calendar day; etc.
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
  set('stat-breeding',  count('Breeding'));
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
      const _today = new Date(); _today.setHours(0, 0, 0, 0);
      const dpf = f.age ? Math.round((_today - new Date(f.age + 'T00:00:00')) / 86400000) : null;
      if (dpf === null) return false;
      if (activeDpfMin !== null && dpf < activeDpfMin) return false;
      if (activeDpfMax !== null && dpf > activeDpfMax) return false;
    }
    if (groupFilterColor && currentExperiment) {
      const g = currentExperiment.tankGroups?.[f.tankId] || null;
      const want = groupFilterColor === 'none' ? null : groupFilterColor;
      if (g !== want) return false;
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

function renderGrid() {
  const grid  = document.getElementById('fish-grid');
  const empty = document.getElementById('empty-state');
  // Remove cards from previous render
  Array.from(grid.children).forEach(c => { if (c !== empty) c.remove(); });
  if (filtered.length === 0) { empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  filtered.forEach((f, idx) => {
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
    // Photo thumbnail: open lightbox (not drawer), unless in selection mode
    const thumb = card.querySelector('.card-thumb');
    if (thumb) {
      thumb.style.cursor = 'zoom-in';
      thumb.addEventListener('click', e => {
        e.stopPropagation();
        if (selectionMode) toggleCardSelection(f.id, idx, e.shiftKey);
        else openLightbox(f.photoUrl);
      });
    }
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
  const navWrap = document.getElementById('nav-wrap');
  if (navWrap && !navWrap.contains(e.target)) closeNavMenu();
  const groupWrap = document.getElementById('group-color-btn')?.closest('.exp-group-wrap');
  if (groupWrap && !groupWrap.contains(e.target)) document.getElementById('group-assign-menu')?.classList.add('hidden');
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
  if (!locType) return; // Breeding / Archived — don't force location
  const radio = document.querySelector(`input[name="loc-type"][value="${locType}"]`);
  if (radio && !radio.checked) { radio.checked = true; updateLocPicker(); }
};

// ── Split mode toggle (near Tank ID) ─────────────────────────────────────────
let splitMode = false;

window.toggleSplitMode = function() {
  splitMode = !splitMode;
  const btn  = document.getElementById('split-tag-btn');
  const hint = document.getElementById('split-tag-hint');
  const idEl = document.getElementById('f-tank-id');
  if (splitMode) {
    btn?.classList.add('active');
    if (hint) hint.classList.remove('hidden');
    // Auto-fill temp SPL-ID if field is empty or was a previous SPL-ID
    if (!idEl.value || /^SPL-/i.test(idEl.value)) {
      idEl.value = 'SPL-' + Math.random().toString(16).slice(2, 10).toUpperCase();
    }
  } else {
    btn?.classList.remove('active');
    if (hint) hint.classList.add('hidden');
    // Clear the temp ID when un-toggling
    if (/^SPL-/i.test(idEl.value)) idEl.value = '';
  }
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

// Find tank IDs currently shared by more than one tank — run manually via console
window.checkDuplicateTankIds = function() {
  const groups = {};
  fishData.forEach(f => {
    if (!f.tankId) return;
    const key = f.tankId.toUpperCase();
    (groups[key] ||= []).push(f);
  });
  const dupes = Object.entries(groups).filter(([, list]) => list.length > 1);
  if (!dupes.length) { console.log('✅ No duplicate tank IDs found.'); showToast('✅ No duplicate tank IDs found'); return; }
  console.log(`⚠️ Found ${dupes.length} duplicated tank ID(s):`);
  dupes.forEach(([id, list]) => {
    console.log(`  ${id} — used by ${list.length} tanks:`, list.map(f => ({ id: f.id, line: f.line, location: f.location, status: f.status })));
  });
  showToast(`⚠️ ${dupes.length} duplicate tank ID(s) — see console`);
};

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
  localStorage.setItem('fzfish-recent-lines', JSON.stringify(lines.slice(0, 2)));
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

// ── Lineage field (Add/Edit Tank form) ────────────────────────────────────────
function renderCrossOriginOptions(selectedId) {
  const sel = document.getElementById('f-cross-origin');
  if (!sel) return;
  const sorted = [...crosses].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  sel.innerHTML = '<option value="">— Not linked to a cross —</option>' + sorted.map(c =>
    `<option value="${esc(c.id)}">${esc(crossLabel(c))} — ${esc(formatDate(c.date))}${c.status !== 'active' ? ` (${esc(c.status)})` : ''}</option>`
  ).join('');
  sel.value = selectedId || '';
}

window.onCrossOriginChange = function() {
  const crossId = document.getElementById('f-cross-origin')?.value || '';
  const cross   = crossId ? crosses.find(c => c.id === crossId) : null;
  const note    = document.getElementById('offspring-cross-note');
  if (cross) {
    if (note) { note.textContent = `🧬 Linking to cross: ${crossLabel(cross)}`; note.classList.remove('hidden'); }
    document.getElementById('save-add-another-btn')?.classList.toggle('hidden', !!editingId);
  } else {
    note?.classList.add('hidden');
    document.getElementById('save-add-another-btn')?.classList.add('hidden');
  }
};

// ── Add / Edit Modal ──────────────────────────────────────────────────────────
window.openAddModal = function() {
  editingId = null; currentMarkers = []; currentNegMarkers = []; currentUnsortedMarkers = [];
  currentPhotoUrl = null; originalPhotoUrl = null; pendingPhotoFile = null;
  currentThumbPos = '50% 15%';
  document.getElementById('save-add-another-btn')?.classList.add('hidden');
  document.getElementById('offspring-cross-note')?.classList.add('hidden');
  document.getElementById('modal-title').textContent = 'Add Tank';
  document.getElementById('fish-form').reset();
  document.getElementById('f-tank-id').value             = '';
  document.getElementById('tank-id-hint').style.display  = 'none';
  document.getElementById('f-age-hint').style.display    = 'none';
  document.getElementById('markers-container').innerHTML     = '';
  document.getElementById('neg-markers-container').innerHTML = '';
  document.getElementById('unsorted-markers-container').innerHTML = '';
  document.querySelector('input[name="status"][value="Active"]').checked = true;
  setLocInForm('');
  resetPhotoUI();
  renderRecentLines();
  renderLastLocation();
  renderCrossOriginOptions('');
  // Reset split mode
  splitMode = false;
  document.getElementById('split-tag-btn')?.classList.remove('active');
  document.getElementById('split-tag-hint')?.classList.add('hidden');
  const baffleEl = document.getElementById('f-baffle-remind');
  if (baffleEl) baffleEl.checked = false;
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
  document.getElementById('tank-id-hint').style.display = 'none';
  document.getElementById('f-age-hint').style.display   = 'none';
  document.getElementById('f-tank-id').value  = f.tankId || f.id || '';
  document.getElementById('f-line').value     = f.line;
  document.getElementById('f-age').value      = toDateInput(f.age);
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
  renderCrossOriginOptions(f.crossOrigin || '');
  window.onCrossOriginChange();
  // Restore split mode if tank has a temp SPL-ID
  splitMode = /^SPL-/i.test(f.tankId || '');
  const splitBtn  = document.getElementById('split-tag-btn');
  const splitHint = document.getElementById('split-tag-hint');
  if (splitMode) { splitBtn?.classList.add('active'); splitHint?.classList.remove('hidden'); }
  else           { splitBtn?.classList.remove('active'); splitHint?.classList.add('hidden'); }
  const baffleEl = document.getElementById('f-baffle-remind');
  if (baffleEl) baffleEl.checked = false;
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
  document.getElementById('tank-id-hint').style.display = 'none';
  document.getElementById('f-age-hint').style.display   = 'none';
  document.getElementById('f-tank-id').value = '';
  document.getElementById('f-line').value    = f.line || '';
  document.getElementById('f-age').value     = toDateInput(f.age);
  document.getElementById('f-count').value   = f.count || '';
  setLocInForm(f.location || '');
  document.getElementById('f-notes').value   = '';
  const si = document.querySelector(`input[name="status"][value="${f.status}"]`);
  if (si) si.checked = true;
  renderMarkerTags(); renderNegMarkerTags(); renderUnsortedMarkerTags();
  resetPhotoUI();
  renderRecentLines();
  renderLastLocation();
  // Reset split mode (tank ID was just cleared above, so it can't be a temp SPL-ID)
  splitMode = false;
  document.getElementById('split-tag-btn')?.classList.remove('active');
  document.getElementById('split-tag-hint')?.classList.add('hidden');

  // If this tank was itself recorded offspring, carry the cross link forward so the
  // duplicate is still tied to the same cross (and "Save & Add Another" stays available)
  const cross = f.crossOrigin ? crosses.find(x => x.id === f.crossOrigin) : null;
  renderCrossOriginOptions(cross ? cross.id : '');
  window.onCrossOriginChange();
  if (cross) {
    const parentTxt = cross.incross ? `${cross.parent1} (incross)` : `${cross.parent1} × ${cross.parent2}`;
    document.getElementById('f-notes').value = `Offspring of ${parentTxt}`;
  }

  document.getElementById('fish-modal').classList.add('active');
  checkScrollLock();
};

window.closeModal = function() {
  document.getElementById('fish-modal').classList.remove('active');
  document.getElementById('save-add-another-btn')?.classList.add('hidden');
  document.getElementById('offspring-cross-note')?.classList.add('hidden');
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
  // Revoke previous blob URL to avoid memory leak
  const prev = document.getElementById('f-photo-preview')?.src;
  if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
  pendingPhotoFile = file;
  showPhotoPreview(URL.createObjectURL(file));
};
window.removePhoto = function() {
  const prev = document.getElementById('f-photo-preview')?.src;
  if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
  currentPhotoUrl = null; pendingPhotoFile = null; resetPhotoUI();
};

window.saveFishAddAnother = function() { return saveFish({ preventDefault(){} }, true); };

// ── Duplicate Tank ID dialog ──────────────────────────────────────────────────
let dupIdResolver = null;
function showDupIdDialog(rawId, duplicate) {
  return new Promise(resolve => {
    dupIdResolver = resolve;
    const msg = document.getElementById('dup-id-message');
    if (msg) msg.textContent = `Tank ID ${rawId} is already used by "${duplicate.line || duplicate.id}".`;
    document.getElementById('dup-id-overlay')?.classList.add('active');
    checkScrollLock();
  });
}
window.resolveDupId = function(action) {
  document.getElementById('dup-id-overlay')?.classList.remove('active');
  checkScrollLock();
  if (dupIdResolver) { dupIdResolver(action); dupIdResolver = null; }
};

// ── Live fertilization-date validation (Add/Edit Tank form) ──────────────────
window.validateAgeInput = function() {
  const val  = document.getElementById('f-age')?.value.trim() || '';
  const hint = document.getElementById('f-age-hint');
  if (!hint) return;
  hint.style.display = (val && !isValidDateInput(val)) ? '' : 'none';
};

window.saveFish = async function(e, addAnother) {
  e.preventDefault();
  const saveBtn = document.getElementById('save-btn');

  // Active tanks must have a valid barcode-style ID; Split tanks don't yet
  const rawId  = document.getElementById('f-tank-id').value.trim().toUpperCase();
  const status = document.querySelector('input[name="status"]:checked')?.value;
  const hint   = document.getElementById('tank-id-hint');
  if (status === 'Active' && !/^C\d{8}$/.test(rawId)) {
    if (hint) hint.style.display = '';
    document.getElementById('f-tank-id').focus();
    return;
  }
  if (hint) hint.style.display = 'none';

  // Fertilization date, if entered, must be a fully-formed, real MM/DD/YYYY date
  const rawAge = document.getElementById('f-age').value.trim();
  if (rawAge && !isValidDateInput(rawAge)) {
    showToast('⚠️ Fertilization date must be a valid MM/DD/YYYY date');
    document.getElementById('f-age').focus();
    return;
  }

  // Tank ID already used by a different tank — offer to save with a suffix + reminder, or cancel
  let dupSuffixApplied = false;
  if (rawId) {
    const duplicate = fishData.find(f => f.tankId && f.tankId.toUpperCase() === rawId && f.id !== (editingId || ''));
    if (duplicate) {
      const action = await showDupIdDialog(rawId, duplicate);
      if (action !== 'suffix') {
        document.getElementById('f-tank-id').focus();
        return;
      }
      const enteredRaw = document.getElementById('f-tank-id').value.trim();
      let n = 1, suffixed;
      do { suffixed = `${enteredRaw}-${n}`; n++; }
      while (fishData.some(f => f.tankId && f.tankId.toUpperCase() === suffixed.toUpperCase() && f.id !== (editingId || '')));
      document.getElementById('f-tank-id').value = suffixed;
      dupSuffixApplied = true;
    }
  }

  const oldStatus = editingId ? fishData.find(x => x.id === editingId)?.status : null;

  saveBtn.disabled = true; saveBtn.textContent = 'Saving…';

  let photoUrl = currentPhotoUrl || '';
  if (pendingPhotoFile && !demoMode) {
    try { showToast('📤 Uploading photo…'); photoUrl = await uploadPhoto(pendingPhotoFile); }
    catch(err) { showToast('❌ Photo upload failed: ' + err.message); saveBtn.disabled = false; saveBtn.textContent = 'Save Tank'; return; }
  }

  const enteredId = document.getElementById('f-tank-id').value.trim();
  const fallbackId = editingId
    ? (fishData.find(x => x.id === editingId)?.tankId || editingId)
    : `tank-${Date.now()}`;
  const oldCrossOrigin = editingId ? (fishData.find(x => x.id === editingId)?.crossOrigin || '') : '';
  const newCrossOrigin = document.getElementById('f-cross-origin')?.value || '';
  const record = {
    tankId:     enteredId || fallbackId,
    line:       document.getElementById('f-line').value.trim(),
    unsorted:   [...currentUnsortedMarkers],
    age:        parseDateInput(document.getElementById('f-age').value.trim()),
    count:      parseInt(document.getElementById('f-count').value) || 0,
    location:   getLocFromForm(),
    markers:    [...currentMarkers],
    negMarkers: [...currentNegMarkers],
    status:     document.querySelector('input[name="status"]:checked')?.value || 'Active',
    notes:      document.getElementById('f-notes').value.trim(),
    photoUrl, thumbPos: currentThumbPos,
    crossOrigin: newCrossOrigin,
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
      const originCross = record.crossOrigin ? crosses.find(x => x.id === record.crossOrigin) : null;
      const addDetails = [
        `Line: ${record.line}`,
        `Status: ${record.status}`,
        record.count   ? `Count: ${record.count}`        : null,
        record.location? `Location: ${record.location}`  : null,
        (record.markers    ||[]).length ? `+Markers: [${record.markers.join(', ')}]`    : null,
        (record.negMarkers ||[]).length ? `−Markers: [${record.negMarkers.join(', ')}]` : null,
        record.photoUrl ? 'Photo: added' : null,
        originCross ? `Offspring of cross: ${crossLabel(originCross)}` : null,
      ].filter(Boolean).join(' | ');
      logChange('Added', record, addDetails);
    } else {
      record._rowIndex = fishData.length + 2;
    }
    fishData.push(record);
    showToast('✅ Tank added');
  }

  saveBtn.disabled = false; saveBtn.textContent = 'Save Tank';

  // Alert: tank has a temp SPL-ID — remind to add real barcode in 3 days
  if (/^SPL-/i.test(record.tankId)) {
    await createAlert('split-id', record);
  }
  // Alert: nursery tank without a valid barcode — remind in 3 days
  if (record.status === 'Nursery' && !/^C\d{8}$/.test(record.tankId)) {
    await createAlert('nursery-id', record);
  }
  // Alert: baffle removal reminder checkbox
  if (document.getElementById('f-baffle-remind')?.checked) {
    await createAlert('baffle-remove', record);
  }
  // Alert: tank was saved with a suffixed duplicate ID — remind to fix it in 7 days
  if (dupSuffixApplied) {
    await createAlert('duplicate-id', record);
  }
  // Auto-dismiss ID alerts when tank gets a real C+8 barcode
  if (editingId && /^C\d{8}$/.test(record.tankId)) {
    if (/^SPL-/i.test(editingId)) await dismissAlertsForTank(editingId, 'split-id');
    await dismissAlertsForTank(editingId, 'nursery-id');
  }
  // Auto-dismiss duplicate-id alert once the tank's ID no longer collides with another tank
  if (editingId) {
    const stillDuplicate = fishData.some(f => f.tankId && f.tankId.toUpperCase() === record.tankId.toUpperCase() && f.id !== record.id);
    if (!stillDuplicate) await dismissAlertsForTank(editingId, 'duplicate-id');
  }

  // Lineage: sync cross offspring lists if the linked cross changed (set via the
  // Lineage field — new tanks recording offspring, edits changing/clearing the link,
  // or duplicates carrying a link forward all flow through here the same way)
  if (newCrossOrigin !== oldCrossOrigin) {
    if (oldCrossOrigin) await detachOffspringFromCross(oldCrossOrigin, editingId);
    if (newCrossOrigin) await attachOffspringToCross(newCrossOrigin, record.tankId);
  }
  if (newCrossOrigin && !editingId && addAnother) {
    invalidateMarkerFreq();
    renderAll();
    prepNextOffspring();   // keep modal open, ready for the next tank
    return;
  }

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
  await dismissAlertsForTank(id);
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
  renderExperimentsListView();
  if (currentExperiment) renderAll();
};

// ── Detail Drawer ─────────────────────────────────────────────────────────────
window.openDrawer = function(id) {
  const f = fishData.find(x => x.id === id);
  if (!f) return;
  drawerTankId = f.id;
  const posHtml      = (f.markers    || []).length ? (f.markers   || []).map(m => `<span class="m-tag">${esc(m)}</span>`).join(' ')                  : '<span style="color:var(--text-dim)">None</span>';
  const negHtml      = (f.negMarkers || []).length ? (f.negMarkers|| []).map(m => `<span class="m-tag m-tag-neg">−${esc(m)}</span>`).join(' ')        : '<span style="color:var(--text-dim)">None</span>';
  const unsortedHtml = (f.unsorted   || []).length ? (f.unsorted  || []).map(m => `<span class="m-tag m-tag-unsorted">${esc(m)}</span>`).join(' ')     : '<span style="color:var(--text-muted);font-size:.85rem">—</span>';
  const photoHtml = f.photoUrl ? `<img class="drawer-photo" src="${esc(f.photoUrl)}" onclick="openLightbox('${esc(f.photoUrl)}')" title="Click to enlarge" />` : '';

  document.getElementById('drawer-content').innerHTML = `
    ${photoHtml}
    <div class="drawer-line copy-field" onclick="copyToClip('${esc(f.line)}','Line name')" title="Click to copy">${esc(f.line)}<span class="copy-icon">⎘</span></div>
    <button class="btn-primary btn-sm drawer-edit-btn" onclick="closeDrawer();openEditModal('${esc(f.id)}')">Edit</button>
    <span class="status-badge badge-${f.status}" style="margin-top:.25rem;display:inline-block">${esc(f.status)}</span>
    <div class="drawer-section">
      <h4>Details</h4>
      <div class="drawer-row"><span class="drawer-row-label">Tank ID</span><span class="drawer-row-val copy-field" onclick="copyToClip('${esc(f.tankId || '')}','Tank ID')" title="Click to copy">${esc(f.tankId || '—')}<span class="copy-icon">⎘</span></span></div>
      <div class="drawer-row"><span class="drawer-row-label">Fert. Date</span><span class="drawer-row-val">${formatDate(f.age)}${f.age ? ' · ' + calcDpf(f.age) + ' dpf' : ''}</span></div>
      <div class="drawer-row"><span class="drawer-row-label">Count</span><span class="drawer-row-val">${f.count || '—'}</span></div>
      <div class="drawer-row"><span class="drawer-row-label">Location</span><span class="drawer-row-val copy-field" onclick="copyToClip('${esc(f.location || '')}','Location')" title="Click to copy">${esc(f.location || '—')}<span class="copy-icon">⎘</span></span></div>
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
    ${buildLineageHtml(f)}
    ${experiments.length ? `
    <div class="drawer-section">
      <h4>🧪 Experiments</h4>
      <div class="drawer-exp-list">
        ${experiments.map((exp, i) => {
          const inExp = (exp.tankIds || []).includes(f.tankId);
          return `<button id="exp-membership-${i}"
            class="drawer-exp-btn${inExp ? ' exp-member-active' : ''}"
            onclick="toggleTankInExperiment('${esc(f.tankId)}', ${i})">
            ${inExp ? '✓' : '+'} ${esc(exp.name)}
          </button>`;
        }).join('')}
      </div>
    </div>` : ''}
    <div class="drawer-section" id="drawer-alerts-section"></div>
    <div class="drawer-actions">
      <button class="btn-ghost" onclick="closeDrawer();duplicateFish('${esc(f.id)}')">Duplicate</button>
      ${currentExperiment
        ? `<button class="btn-ghost" onclick="closeDrawer();removeFromExperiment('${esc(f.tankId)}',event)">Remove from Experiment</button>`
        : `<button class="btn-ghost danger-ghost" onclick="closeDrawer();deleteFish('${esc(f.id)}')">Delete from Inventory</button>`}
    </div>
  `;
  document.getElementById('detail-drawer').classList.add('open');
  document.getElementById('drawer-backdrop').classList.add('active');
  checkScrollLock();
  renderDrawerAlerts(f.id);
};

window.closeDrawer = function() {
  document.getElementById('detail-drawer').classList.remove('open');
  document.getElementById('drawer-backdrop').classList.remove('active');
  checkScrollLock();
  drawerTankId = null;
};

// Shows this tank's own active/upcoming alerts at the bottom of its detail drawer,
// reusing the same alert-item markup/actions as the Alerts panel
async function renderDrawerAlerts(tankInternalId) {
  const wrap = document.getElementById('drawer-alerts-section');
  if (!wrap) return;
  const [active, upcoming] = await Promise.all([getActiveAlerts(), getUpcomingAlerts()]);
  const mine = [...active, ...upcoming].filter(a => a.tankInternalId === tankInternalId);
  if (!mine.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = `<h4>🔔 Alerts</h4>` + mine.map(a => `
    <div class="alert-item ${a.fireAt <= Date.now() ? 'alert-item-due' : 'alert-item-upcoming'}">
      <div class="alert-item-msg">${alertMessage(a)}</div>
      ${a.fireAt > Date.now() ? `<div class="alert-item-meta">Due ${formatAlertDate(a.fireAt)}</div>` : ''}
      <div class="alert-item-actions">
        ${a.fireAt <= Date.now() ? `<button class="btn-ghost btn-xs" onclick="snoozeAlert('${esc(a.id)}')">Snooze 1d</button>` : ''}
        <button class="btn-ghost btn-xs" onclick="dismissAlert('${esc(a.id)}')">Dismiss</button>
      </div>
    </div>
  `).join('');
}

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
  // Focus search bar after transition so keyboard comes up naturally
  setTimeout(() => document.getElementById('guide-search')?.focus(), 120);
};
window.closeGuide = function() {
  document.getElementById('guide-overlay').classList.remove('active');
  checkScrollLock();
  clearGuideSearch();
};
window.clearGuideSearch = function() {
  const inp = document.getElementById('guide-search');
  if (inp) inp.value = '';
  filterGuide('');
};
window.filterGuide = function(q) {
  const term = (q || '').trim().toLowerCase();
  const sections = document.querySelectorAll('#guide-overlay .guide-section');
  const clearBtn = document.getElementById('guide-search-clear');
  let anyMatch = false;
  sections.forEach(sec => {
    if (!term) {
      sec.style.display = '';
      sec.open = false;
      anyMatch = true;
    } else {
      const text = sec.textContent.toLowerCase();
      const match = text.includes(term);
      sec.style.display = match ? '' : 'none';
      if (match) { sec.open = true; anyMatch = true; }
    }
  });
  if (clearBtn) clearBtn.classList.toggle('hidden', !term);
  const noRes = document.getElementById('guide-no-results');
  if (noRes) noRes.style.display = (!term || anyMatch) ? 'none' : '';
};

// ── DPF calculator (help guide) ────────────────────────────────────────────────
// Same day-0-is-fertilization-date rule as calcDpf(), generalized to two arbitrary dates.
window.runDpfCalculator = function() {
  const result = document.getElementById('dpf-calc-result');
  if (!result) return;
  const raw1 = document.getElementById('dpf-calc-date1')?.value.trim() || '';
  const raw2 = document.getElementById('dpf-calc-date2')?.value.trim() || '';
  result.classList.remove('dpf-calc-negative');
  if (!raw1) { result.textContent = 'Enter a fertilization date to calculate dpf.'; return; }

  if (!isValidDateInput(raw1)) { result.textContent = '⚠️ First date isn\'t valid — use MM/DD/YYYY.'; return; }
  const d1Str = parseDateInput(raw1);
  const d1 = new Date(d1Str + 'T00:00:00');

  let d2, d2Label;
  if (raw2) {
    if (!isValidDateInput(raw2)) { result.textContent = '⚠️ Second date isn\'t valid — use MM/DD/YYYY.'; return; }
    const d2Str = parseDateInput(raw2);
    d2 = new Date(d2Str + 'T00:00:00');
    d2Label = formatDate(d2Str);
  } else {
    d2 = new Date(); d2.setHours(0, 0, 0, 0);
    d2Label = 'today';
  }

  const dpf = Math.round((d2 - d1) / 86400000);
  result.classList.toggle('dpf-calc-negative', dpf < 0);
  result.innerHTML = dpf < 0
    ? `<strong>${dpf}</strong> dpf — ${esc(d2Label)} is <em>before</em> the fertilization date`
    : `<strong>${dpf}</strong> dpf as of ${esc(d2Label)}`;
};

// ── Barcode Scanner ───────────────────────────────────────────────────────────
window.openScanner = function() {
  scanForForm = false;
  scanForCross = 0;
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
  scanForCross = 0;
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
  if (scanForCross) {
    const slot = scanForCross; scanForCross = 0;
    setCrossParentByScan(slot, code.toUpperCase());
    return;
  }
  if (scanForForm) {
    scanForForm = false;
    const upper = code.toUpperCase();
    const existing = fishData.find(f => (f.tankId || '').toUpperCase() === upper);
    if (existing && !editingId) {
      showToast(`⚠️ ${upper} already exists — opening that tank`);
      closeModal();
      openDrawer(existing.id);
      return;
    }
    if (existing && editingId && existing.id !== editingId) {
      showToast(`⚠️ ${upper} is already in use by another tank`);
    }
    document.getElementById('f-tank-id').value = upper;
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
  // Picking a breeding parent — accept any existing tank ID (parents may be SPL-* tanks)
  if (scanForCross) {
    const slot = scanForCross;
    closeScanner();
    setCrossParentByScan(slot, v);
    return;
  }
  if (!/^C\d{8}$/.test(v)) {
    document.getElementById('manual-barcode').focus();
    showToast(`⚠️ Must be C + 8 digits (e.g. C12345678)`);
    return;
  }
  // Save before closeScanner() resets it to false
  const wasFormScan = scanForForm;
  closeScanner();
  showToast(`📷 Entered: ${v}`);
  if (wasFormScan) {
    const existing = fishData.find(f => (f.tankId || '').toUpperCase() === v);
    if (existing && !editingId) {
      showToast(`⚠️ ${v} already exists — opening that tank`);
      closeModal();
      openDrawer(existing.id);
      return;
    }
    if (existing && editingId && existing.id !== editingId) {
      showToast(`⚠️ ${v} is already in use by another tank`);
    }
    document.getElementById('f-tank-id').value = v;
    return;
  }
  const found = fishData.find(f => (f.tankId || '').trim().toUpperCase() === v);
  if (found) openDrawer(found.id);
  else { openAddModal(); document.getElementById('f-tank-id').value = v; }
};
// ── Copy to clipboard ─────────────────────────────────────────────────────────
window.copyToClip = function(text, label) {
  if (!text || text === '—') return;
  navigator.clipboard?.writeText(text).then(() => {
    showToast(`📋 Copied ${label || ''}: ${text}`);
  }).catch(() => {
    // Fallback for older browsers / non-https
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(`📋 Copied ${label || ''}: ${text}`);
  });
};

// ── CSV export ────────────────────────────────────────────────────────────────
function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function tanksToCSV(tanks) {
  const headers = ['Tank ID', 'Line', 'Fert. Date', 'DPF', 'Count', 'Location', 'Status', '+Markers', '-Markers', '?Markers', 'Notes'];
  const rows = tanks.map(f => [
    f.tankId || '', f.line || '',
    f.age ? formatDate(f.age) : '', f.age ? calcDpf(f.age) : '',
    f.count || 0, f.location || '', f.status || '',
    (f.markers || []).join('; '), (f.negMarkers || []).join('; '), (f.unsorted || []).join('; '),
    f.notes || '',
  ]);
  return [headers, ...rows].map(r => r.map(csvEscape).join(',')).join('\r\n');
}

// Exports whatever's currently visible — the full inventory, or just the current
// experiment's tanks when inside one — respecting any active search/filters
window.exportVisibleTanksCSV = function() {
  if (!filtered.length) { showToast('⚠️ No tanks to export'); return; }
  const csv  = tanksToCSV(filtered);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const name = currentExperiment ? currentExperiment.name.replace(/[^a-z0-9_-]+/gi, '_') : 'fzfish-inventory';
  const a = document.createElement('a');
  a.href = url; a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast(`📤 Exported ${filtered.length} tank${filtered.length > 1 ? 's' : ''} to CSV`);
};

// ── Alert system ─────────────────────────────────────────────────────────────
// Alerts are stored as a single JSON blob in changelog!Z1 — a far-off cell
// that changelog append rows (columns A–F) never reach.  No new tab needed.
const ALERT_KEY      = 'fzfish-alerts';
const ALERTS_CELL    = TAB_NAME + '!Z1'; // col Z, row 1 — free-rides on the fetchFromSheets response

// ── Load alerts (always from cache — populated by fetchFromSheets; localStorage in demo) ──
async function loadAlerts() {
  if (demoMode) {
    try { return JSON.parse(localStorage.getItem(ALERT_KEY) || '[]'); }
    catch(e) { return []; }
  }
  return alertCache ?? [];
}

// ── Save alerts (sheet when signed in; localStorage in demo) ─────────────────
async function saveAlerts(alerts) {
  if (demoMode) { localStorage.setItem(ALERT_KEY, JSON.stringify(alerts)); return; }
  alertCache = alerts;
  try {
    await authFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(ALERTS_CELL)}?valueInputOption=RAW`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [[JSON.stringify(alerts)]] }) }
    );
  } catch(e) { console.warn('saveAlerts:', e.message); }
}

// ── Google Calendar sync ──────────────────────────────────────────────────────
// Alerts sync to ONE shared Google Calendar (GCAL_ID above) — not a personal one.
// There's no per-person write toggle: as long as GCAL_ID is configured and you're
// signed in for real, whichever account happens to be logged in pushes/removes
// events automatically as alerts are created, dismissed, or snoozed (this works for
// anyone because the calendar is shared org-wide with edit access — see README).
// "Subscribing" is a separate, per-person opt-in: clicking the Subscribe button just
// adds the shared calendar to *that person's own* Google Calendar view (read-only,
// no permissions granted) — it has nothing to do with who can push events.
// Each event's title ends with the email of whoever's account created it, so the
// team can tell who pushed it. See README "Setting up Google Calendar Sync".

function calendarSyncEnabled() {
  return !demoMode && !!GCAL_ID;
}

// Opens Google Calendar's "add this calendar" flow for the signed-in viewer —
// a personal, read-only opt-in that never touches write permissions.
window.subscribeToAlertsCalendar = function() {
  if (!GCAL_ID) { showToast('⚠️ Calendar sync isn\'t set up yet — see README'); return; }
  window.open(`https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(GCAL_ID)}`, '_blank', 'noopener');
};

// Creates a calendar event for any active/upcoming alert that doesn't have one yet —
// runs automatically after sign-in/data load, and again as a safety net on panel open
async function syncAllAlertsToCalendar() {
  if (!calendarSyncEnabled()) return;
  const alerts = await loadAlerts();
  let changed = false;
  for (const a of alerts) {
    if (!a.dismissed && !a.calendarEventId) {
      a.calendarEventId = await createCalendarEvent(a);
      changed = true;
    }
  }
  if (changed) await saveAlerts(alerts);
}

async function createCalendarEvent(alert) {
  if (!calendarSyncEnabled()) return null;
  const start = new Date(alert.fireAt);
  // Alerts computed from a bare due-date land at local midnight — bump those to 9am
  // so they don't show as an overnight event on the calendar.
  if (start.getHours() === 0 && start.getMinutes() === 0) start.setHours(9, 0, 0, 0);
  const end     = new Date(start.getTime() + 30 * 60000);
  const creator = currentUser || 'unknown user';
  try {
    const res = await authFetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GCAL_ID)}/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: `🐟 FZFish: ${plainAlertMessage(alert)} — ${creator}`.slice(0, 200),
        description: `${plainAlertMessage(alert)}\n\nAdded by: ${creator}\nOpen FZFish: https://marjvilla.github.io/FZFish/`,
        start: { dateTime: start.toISOString() },
        end:   { dateTime: end.toISOString() },
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] },
      }),
    });
    const json = await res.json();
    return json.id || null;
  } catch(e) { console.warn('createCalendarEvent:', e.message); return null; }
}

async function deleteCalendarEvent(eventId) {
  if (!eventId || !calendarSyncEnabled()) return;
  try { await authFetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GCAL_ID)}/events/${eventId}`, { method: 'DELETE' }); }
  catch(e) { console.warn('deleteCalendarEvent:', e.message); }
}

// ── Custom user-created reminders ─────────────────────────────────────────────
window.addCustomReminder = async function() {
  const titleEl = document.getElementById('custom-reminder-title');
  const dateEl  = document.getElementById('custom-reminder-date');
  const timeEl  = document.getElementById('custom-reminder-time');
  const title   = titleEl.value.trim();
  const dateStr = parseDateInput(dateEl.value.trim());
  const time    = timeEl.value || '09:00';
  if (!title) { showToast('⚠️ Give the reminder a title'); return; }
  if (!dateEl.value.trim() || !isValidDateInput(dateEl.value.trim())) { showToast('⚠️ Enter a valid date (MM/DD/YYYY)'); return; }
  const fireAt = new Date(`${dateStr}T${time}:00`).getTime();
  if (isNaN(fireAt)) { showToast('⚠️ Invalid date/time'); return; }

  const alert = {
    id: 'al-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    type: 'custom', title, tankInternalId: null, tankLine: '', tankLocation: '',
    createdAt: Date.now(), fireAt, snoozedUntil: null, dismissed: false,
    createdBy: currentUser || '',
  };
  if (calendarSyncEnabled()) alert.calendarEventId = await createCalendarEvent(alert);

  const alerts = await loadAlerts();
  alerts.push(alert);
  await saveAlerts(alerts);
  titleEl.value = ''; dateEl.value = ''; timeEl.value = '';
  renderAlertBadge();
  buildAlertPanel();
  showToast('✅ Reminder added');
};

// ── Alert CRUD ────────────────────────────────────────────────────────────────
async function createAlert(type, fish) {
  const days   = (type === 'baffle-remove' || type === 'duplicate-id') ? 7 : 3;
  const alerts = await loadAlerts();
  if (alerts.some(a => !a.dismissed && a.type === type && a.tankInternalId === fish.id)) return;
  const alert = {
    id:             'al-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    type,
    tankInternalId: fish.id,
    tankLine:       fish.line,
    tankLocation:   fish.location,
    createdAt:      Date.now(),
    fireAt:         Date.now() + days * 24 * 60 * 60 * 1000,
    snoozedUntil:   null,
    dismissed:      false,
    createdBy:      currentUser || '',
  };
  if (calendarSyncEnabled()) alert.calendarEventId = await createCalendarEvent(alert);
  alerts.push(alert);
  await saveAlerts(alerts);
  renderAlertBadge();
}

window.dismissAlert = async function(id) {
  const alerts = await loadAlerts();
  const target = alerts.find(a => a.id === id);
  if (target?.calendarEventId) await deleteCalendarEvent(target.calendarEventId);
  const updated = alerts.map(a => a.id === id ? { ...a, dismissed: true } : a);
  await saveAlerts(updated);
  renderAlertBadge();
  buildAlertPanel();
  if (drawerTankId) renderDrawerAlerts(drawerTankId);
};

async function dismissAlertsForTank(tankInternalId, type) {
  const alerts = await loadAlerts();
  for (const a of alerts) {
    if (a.tankInternalId === tankInternalId && (!type || a.type === type) && a.calendarEventId) {
      await deleteCalendarEvent(a.calendarEventId);
    }
  }
  const updated = alerts.map(a =>
    a.tankInternalId === tankInternalId && (!type || a.type === type)
      ? { ...a, dismissed: true } : a
  );
  await saveAlerts(updated);
  renderAlertBadge();
}

window.snoozeAlert = async function(id) {
  const alerts  = await loadAlerts();
  const target  = alerts.find(a => a.id === id);
  const snoozedUntil = Date.now() + 24 * 60 * 60 * 1000;
  let calendarEventId = target?.calendarEventId || null;
  if (calendarEventId) {
    // Re-create the event at the new time rather than leaving a stale one a day early
    await deleteCalendarEvent(calendarEventId);
    calendarEventId = calendarSyncEnabled() ? await createCalendarEvent({ ...target, fireAt: snoozedUntil }) : null;
  }
  const updated = alerts.map(a => a.id === id ? { ...a, snoozedUntil, calendarEventId } : a);
  await saveAlerts(updated);
  renderAlertBadge();
  buildAlertPanel();
  if (drawerTankId) renderDrawerAlerts(drawerTankId);
};

async function getActiveAlerts() {
  const now = Date.now();
  return (await loadAlerts()).filter(a =>
    !a.dismissed && a.fireAt <= now && (!a.snoozedUntil || a.snoozedUntil < now)
  );
}

async function getUpcomingAlerts() {
  const now = Date.now();
  return (await loadAlerts()).filter(a => !a.dismissed && a.fireAt > now);
}

async function renderAlertBadge() {
  const count = (await getActiveAlerts()).length;
  ['alert-btn', 'mob-alert-btn'].forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    let badge = btn.querySelector('.alert-badge');
    if (count > 0) {
      if (!badge) { badge = document.createElement('span'); badge.className = 'alert-badge'; btn.appendChild(badge); }
      badge.textContent = count;
      btn.classList.add('has-alerts');
    } else {
      badge?.remove();
      btn.classList.remove('has-alerts');
    }
  });
}

const ALERT_TYPE_LABELS = {
  'split-id':          'temp ID to fix',
  'nursery-id':        'nursery barcode needed',
  'baffle-remove':     'baffle removal',
  'breeding-followup': 'cross follow-up',
  'duplicate-id':      'duplicate Tank ID',
};

// One-time digest shown right after sign-in — breaks the count down by type so
// it's a useful summary at a glance, not just a bare number
async function checkAlerts() {
  await renderAlertBadge();
  const active = await getActiveAlerts();
  if (!active.length) return;
  const counts = {};
  active.forEach(a => { counts[a.type] = (counts[a.type] || 0) + 1; });
  const parts = Object.entries(counts).map(([type, n]) => `${n} ${ALERT_TYPE_LABELS[type] || type}`);
  showToast(`🔔 ${active.length} alert${active.length > 1 ? 's' : ''}: ${parts.join(', ')}`);
}

function alertMessage(a) {
  const fish  = fishData.find(f => f.id === a.tankInternalId);
  const line  = fish?.line     || a.tankLine     || '?';
  const loc   = fish?.location || a.tankLocation || '?';
  if (a.type === 'split-id')   return `Add Tank ID to split tank: <strong>${esc(line)}</strong> at ${esc(loc)}`;
  if (a.type === 'nursery-id') return `Add Tank ID to nursery tank: <strong>${esc(line)}</strong> at ${esc(loc)}`;
  if (a.type === 'baffle-remove') {
    const tankId = fish?.tankId || '';
    return `Remove mesh baffles: <strong>${esc(line)}</strong>${tankId ? ` (${esc(tankId)})` : ''} at ${esc(loc)}`;
  }
  if (a.type === 'breeding-followup') {
    return `Record offspring for cross: <strong>${esc(a.tankLine || '?')}</strong>`;
  }
  if (a.type === 'duplicate-id') {
    const tankId = fish?.tankId || '';
    return `Give this tank a unique Tank ID: <strong>${esc(line)}</strong>${tankId ? ` (${esc(tankId)})` : ''} at ${esc(loc)}`;
  }
  if (a.type === 'custom') return esc(a.title || 'Reminder');
  return esc(a.type);
}

// Plain-text version of alertMessage (no HTML) — used in Calendar event descriptions
function plainAlertMessage(a) {
  return alertMessage(a).replace(/<[^>]+>/g, '');
}

function formatAlertDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Local → global migration ──────────────────────────────────────────────────
window.migrateLocalAlerts = async function() {
  try {
    const local = JSON.parse(localStorage.getItem(ALERT_KEY) || '[]').filter(a => !a.dismissed);
    if (!local.length) { buildAlertPanel(); return; }
    const existing = await loadAlerts();
    const existIds = new Set(existing.map(a => a.id));
    const toAdd    = local.filter(a => !existIds.has(a.id))
                          .map(a => ({ ...a, createdBy: a.createdBy || currentUser || '' }));
    await saveAlerts([...existing, ...toAdd]);
    localStorage.removeItem(ALERT_KEY);
    await renderAlertBadge();
    buildAlertPanel();
    showToast(`✅ Moved ${toAdd.length} alert${toAdd.length !== 1 ? 's' : ''} to shared`);
  } catch(e) { showToast('❌ Migration failed'); console.error(e); }
};

window.clearLocalAlerts = function() {
  localStorage.removeItem(ALERT_KEY);
  buildAlertPanel();
  showToast('Local alerts cleared');
};

// ── Alert panel open / close / build ─────────────────────────────────────────
window.openAlertPanel = async function() {
  const body = document.getElementById('alert-panel-body');
  if (body) body.innerHTML = '<p class="alert-empty">Loading…</p>';
  document.getElementById('alert-overlay').classList.add('active');
  checkScrollLock();
  if (calendarSyncEnabled()) await syncAllAlertsToCalendar(); // safety net for alerts created since last sync
  await buildAlertPanel();
};

window.closeAlertPanel = function() {
  document.getElementById('alert-overlay')?.classList.remove('active');
  checkScrollLock();
};

// ── Recent Activity panel (read-only changelog viewer) ───────────────────────
window.openActivityPanel = async function() {
  const body = document.getElementById('activity-panel-body');
  if (body) body.innerHTML = '<p class="alert-empty">Loading…</p>';
  document.getElementById('activity-overlay').classList.add('active');
  checkScrollLock();
  if (demoMode) {
    body.innerHTML = '<p class="alert-empty">Activity history isn\'t tracked in demo mode.</p>';
    return;
  }
  try {
    const r = await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/changelog!A:F`);
    const d = await r.json();
    // Keep only rows whose first cell parses as a date (skips any header row)
    const rows = (d.values || []).filter(row => row[0] && !isNaN(new Date(row[0]))).slice(-100).reverse();
    if (!rows.length) { body.innerHTML = '<p class="alert-empty">No activity recorded yet.</p>'; return; }
    body.innerHTML = rows.map(([ts, action, tankId, line, user, details]) => {
      const who = (user || '').split('@')[0] || 'unknown';
      return `<div class="activity-item">
        <div class="activity-top">
          <span class="activity-action">${esc(action)}</span>
          <span class="activity-when">${esc(formatActivityTime(ts))}</span>
        </div>
        <div class="activity-target">${esc(line || tankId || '')}${line && tankId ? ` <span class="activity-id">(${esc(tankId)})</span>` : ''}</div>
        ${details ? `<div class="activity-details">${esc(details)}</div>` : ''}
        <div class="activity-user">by ${esc(who)}</div>
      </div>`;
    }).join('');
  } catch(e) {
    body.innerHTML = '<p class="alert-empty">Couldn\'t load activity — check your connection and try again.</p>';
  }
};
window.closeActivityPanel = function() {
  document.getElementById('activity-overlay')?.classList.remove('active');
  checkScrollLock();
};
function formatActivityTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

async function buildAlertPanel() {
  const body = document.getElementById('alert-panel-body');
  if (!body) return;

  const active   = await getActiveAlerts();
  const upcoming = await getUpcomingAlerts();

  // Migration banner — shown when signed-in user has leftover local alerts
  let migrateBanner = '';
  if (!demoMode) {
    try {
      const local = JSON.parse(localStorage.getItem(ALERT_KEY) || '[]').filter(a => !a.dismissed);
      if (local.length) {
        migrateBanner = `<div class="alert-migrate-banner">
          <span>📦 ${local.length} local alert${local.length > 1 ? 's' : ''} from before shared sync</span>
          <div class="alert-migrate-actions">
            <button class="btn-xs btn-primary" onclick="migrateLocalAlerts()">Move to shared</button>
            <button class="btn-xs btn-ghost"    onclick="clearLocalAlerts()">Clear local</button>
          </div>
        </div>`;
      }
    } catch(e) {}
  }

  if (!active.length && !upcoming.length && !migrateBanner) {
    body.innerHTML = '<p class="alert-empty">No alerts — all clear!</p>';
    return;
  }

  let html = migrateBanner;
  if (active.length) {
    html += '<div class="alert-section-title">Due now</div>';
    active.forEach(a => {
      const fish = fishData.find(f => f.id === a.tankInternalId);
      const action = a.type === 'breeding-followup'
        ? `<button class="btn-ghost btn-xs" onclick="recordOffspring('${esc(a.crossId)}')">Record offspring</button>`
        : (fish ? `<button class="btn-ghost btn-xs" onclick="closeAlertPanel();openDrawer('${esc(fish.id)}')">Go to tank</button>` : '');
      html += `<div class="alert-item alert-item-due">
        <div class="alert-item-msg">${alertMessage(a)}</div>
        <div class="alert-item-actions">
          ${action}
          <button class="btn-ghost btn-xs" onclick="snoozeAlert('${esc(a.id)}')">Snooze 1d</button>
          <button class="btn-ghost btn-xs" onclick="dismissAlert('${esc(a.id)}')">Dismiss</button>
        </div>
      </div>`;
    });
  }
  if (upcoming.length) {
    html += '<div class="alert-section-title">Upcoming</div>';
    upcoming.forEach(a => {
      const fish = fishData.find(f => f.id === a.tankInternalId);
      const action = a.type === 'breeding-followup'
        ? `<button class="btn-ghost btn-xs" onclick="recordOffspring('${esc(a.crossId)}')">Record offspring</button>`
        : (fish ? `<button class="btn-ghost btn-xs" onclick="closeAlertPanel();openDrawer('${esc(fish.id)}')">Go to tank</button>` : '');
      html += `<div class="alert-item alert-item-upcoming">
        <div class="alert-item-msg">${alertMessage(a)}</div>
        <div class="alert-item-meta">Due ${formatAlertDate(a.fireAt)}</div>
        <div class="alert-item-actions">
          ${action}
          <button class="btn-ghost btn-xs" onclick="dismissAlert('${esc(a.id)}')">Dismiss</button>
        </div>
      </div>`;
    });
  }
  body.innerHTML = html;
}

// ── Breeding / Lineage ───────────────────────────────────────────────────────
// Crosses live in their own "Lineage" tab. Each row is one breeding setup:
// A Cross ID | B Date | C Parent1 | D Parent2 | E Incross | F Follow-up days
// G Status | H Photos(JSON) | I Photo expires | J Notes | K Offspring IDs
const CROSS_KEY = 'fzfish-crosses';   // demo-mode localStorage key

function findTank(tankId) {
  if (!tankId) return null;
  return fishData.find(f => (f.tankId || '') === tankId) || null;
}

function addDays(dateStr, n) {
  const base = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  if (isNaN(base)) return '';
  base.setDate(base.getDate() + n);
  return base.toISOString().slice(0, 10);
}

function crossLabelFromIds(id1, id2, incross) {
  const l1 = findTank(id1)?.line || id1 || '?';
  if (incross) return `${l1} inx.`;
  const l2 = findTank(id2)?.line || id2 || '?';
  return `${l1} × ${l2}`;
}
function crossLabel(c) {
  return crossLabelFromIds(c.parent1, c.incross ? c.parent1 : c.parent2, c.incross);
}

function rowToCross(r, i) {
  let photos = [];
  try { photos = JSON.parse(r[7] || '[]'); } catch(e) { photos = []; }
  return {
    id:           r[0] || '',
    date:         r[1] || '',
    parent1:      r[2] || '',
    parent2:      r[3] || '',
    incross:      String(r[4] || '').toLowerCase() === 'yes',
    followupDays: parseInt(r[5]) || 7,
    status:       r[6] || 'active',
    photos,
    photoExpires: r[8] || '',
    notes:        r[9] || '',
    offspring:    parseList(r[10]),
    _rowIndex:    i + 2,
  };
}
function crossToRow(c) {
  return [
    c.id, c.date, c.parent1, c.parent2 || '',
    c.incross ? 'yes' : '',
    String(c.followupDays || 7),
    c.status || 'active',
    JSON.stringify(c.photos || []),
    c.photoExpires || '',
    c.notes || '',
    (c.offspring || []).join(', '),
  ];
}

async function ensureLineageTab() {
  if (lineageTabReady || demoMode) return;
  const res  = await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`);
  const json = await res.json();
  const exists = (json.sheets || []).some(s => s.properties.title.toLowerCase() === LINEAGE_TAB.toLowerCase());
  if (!exists) {
    await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: LINEAGE_TAB } } }] }),
    });
    await authFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(LINEAGE_TAB)}!A1?valueInputOption=RAW`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [['Cross ID','Date','Parent 1','Parent 2','Incross','Follow-up Days','Status','Photos','Photo Expires','Notes','Offspring']] }) }
    );
  }
  lineageTabReady = true;
}

async function fetchCrosses() {
  if (demoMode) {
    try { crosses = JSON.parse(localStorage.getItem(CROSS_KEY) || '[]'); }
    catch(e) { crosses = []; }
    return;
  }
  try {
    const r = await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(LINEAGE_TAB)}!A2:K`);
    const d = await r.json();
    if (d.error) { crosses = []; return; }   // tab likely doesn't exist yet
    lineageTabReady = true;
    crosses = (d.values || []).map((row, i) => rowToCross(row, i)).filter(c => c.id);
    await cleanupExpiredCrossPhotos();
  } catch(e) { crosses = []; }
}

async function saveCross(c) {
  const idx = crosses.findIndex(x => x.id === c.id);
  if (idx >= 0) crosses[idx] = c; else crosses.push(c);
  if (demoMode) {
    localStorage.setItem(CROSS_KEY, JSON.stringify(crosses.map(({ _rowIndex, ...rest }) => rest)));
    return;
  }
  await ensureLineageTab();
  if (c._rowIndex) {
    await authFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(LINEAGE_TAB + '!A' + c._rowIndex)}?valueInputOption=RAW`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [crossToRow(c)] }) }
    );
  } else {
    const res = await authFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(LINEAGE_TAB)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [crossToRow(c)] }) }
    );
    const json = await res.json();
    const m = json.updates?.updatedRange?.match(/(\d+)$/);
    c._rowIndex = m ? parseInt(m[1]) : null;
  }
}

async function cleanupExpiredCrossPhotos() {
  if (demoMode) return;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (const c of crosses) {
    if (c.photos?.length && c.photoExpires) {
      const exp = new Date(c.photoExpires + 'T00:00:00');
      if (!isNaN(exp) && exp < today) {
        // Only drop photos that were actually deleted from Drive — anything that
        // failed stays on the cross so cleanup retries it next time the app loads
        const remaining = [];
        for (const url of c.photos) { if (!(await deleteDrivePhoto(url))) remaining.push(url); }
        c.photos = remaining;
        if (!remaining.length) c.photoExpires = '';
        try { await saveCross(c); } catch(e) {}
      }
    }
  }
}

// ── Cross badge (count of crosses due for follow-up) ─────────────────────────
function activeCrosses()   { return crosses.filter(c => c.status === 'active'); }
function crossesDueCount() {
  const now = Date.now();
  return activeCrosses().filter(c => {
    const due = new Date(c.date + 'T00:00:00').getTime() + (c.followupDays || 7) * 86400000;
    return due <= now;
  }).length;
}
function renderCrossBadge() {
  const due = crossesDueCount();
  const btn = document.getElementById('nav-lineage');
  if (btn) {
    let badge = btn.querySelector('.nav-badge');
    if (due > 0) {
      if (!badge) { badge = document.createElement('span'); badge.className = 'nav-badge'; btn.appendChild(badge); }
      badge.textContent = due;
      btn.classList.add('has-alerts');
    } else { badge?.remove(); btn.classList.remove('has-alerts'); }
  }
}

// ── Breeding follow-up alert ──────────────────────────────────────────────────
async function createBreedingAlert(cross) {
  const alerts = await loadAlerts();
  if (alerts.some(a => !a.dismissed && a.type === 'breeding-followup' && a.crossId === cross.id)) return;
  alerts.push({
    id:           'al-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    type:         'breeding-followup',
    crossId:      cross.id,
    tankLine:     crossLabel(cross),
    createdAt:    Date.now(),
    fireAt:       new Date(cross.date + 'T00:00:00').getTime() + (cross.followupDays || 7) * 86400000,
    snoozedUntil: null,
    dismissed:    false,
    createdBy:    currentUser || '',
  });
  await saveAlerts(alerts);
  renderAlertBadge();
}
async function dismissBreedingAlert(crossId) {
  const alerts = (await loadAlerts()).map(a =>
    a.type === 'breeding-followup' && a.crossId === crossId ? { ...a, dismissed: true } : a
  );
  await saveAlerts(alerts);
  renderAlertBadge();
}

// ── Top-level nav menu (fish logo → Inventory / Lineage / Experiments / Guide) ──
window.toggleNavMenu = function(e) {
  e?.stopPropagation();
  document.getElementById('nav-dropdown')?.classList.toggle('hidden');
};
window.closeNavMenu = function() {
  document.getElementById('nav-dropdown')?.classList.add('hidden');
};

// ── Top-level tabs (Inventory / Breeding & Lineage / Experiments) ────────────
let activeMainTab = 'inventory';

function updateMainView() {
  const inExpTab   = activeMainTab === 'experiments';
  const showGrid   = activeMainTab === 'inventory' || (inExpTab && currentExperiment);
  const showExpBar = inExpTab && currentExperiment;

  document.getElementById('fish-grid')?.classList.toggle('hidden', !showGrid);
  document.querySelector('.filter-panel')?.classList.toggle('hidden', !showGrid);
  document.getElementById('filter-toggle-bar')?.classList.toggle('hidden', !showGrid);
  document.getElementById('lineage-view')?.classList.toggle('hidden', activeMainTab !== 'lineage');
  document.getElementById('experiments-view')?.classList.toggle('hidden', !(inExpTab && !currentExperiment));
  document.getElementById('experiment-bar')?.classList.toggle('hidden', !showExpBar);
  if (!showExpBar) {
    document.getElementById('exp-notes-panel')?.classList.add('hidden');
    document.getElementById('exp-notes-toggle-btn')?.classList.remove('active');
  }

  document.getElementById('nav-inventory')?.classList.toggle('active', activeMainTab === 'inventory');
  document.getElementById('nav-lineage')?.classList.toggle('active', activeMainTab === 'lineage');
  document.getElementById('nav-experiments')?.classList.toggle('active', activeMainTab === 'experiments');
}

window.switchMainTab = async function(tab) {
  activeMainTab = tab;
  if (tab === 'inventory' && currentExperiment) {
    currentExperiment = null;
    resetGroupFilter();
  }
  if (tab === 'lineage') buildCrossesPanel();
  if (tab === 'experiments' && !currentExperiment) await openExperimentsTab();
  updateMainView();
  renderAll();
};

window.filterLineageSearch = function() {
  const term    = (document.getElementById('lineage-search-input')?.value || '').trim().toLowerCase();
  const results = document.getElementById('lineage-search-results');
  if (!results) return;
  if (!term) { results.classList.add('hidden'); results.innerHTML = ''; return; }
  const matches = fishData.filter(f =>
    (f.line || '').toLowerCase().includes(term) || (f.tankId || '').toLowerCase().includes(term)
  ).slice(0, 20);
  results.innerHTML = matches.length
    ? matches.map(f => `<button type="button" class="lineage-search-item" onclick="openDrawer('${esc(f.tankId)}')">
        <span class="lineage-search-line">${esc(f.line)}</span>
        <span class="lineage-search-meta">${esc(f.tankId)}${f.location ? ' · ' + esc(f.location) : ''}</span>
      </button>`).join('')
    : '<p class="picker-empty">No tanks found.</p>';
  results.classList.remove('hidden');
};

// ── Crosses panel ─────────────────────────────────────────────────────────────
function crossCardHtml(c) {
  const setup   = formatDate(c.date);
  const dueTs   = new Date(c.date + 'T00:00:00').getTime() + (c.followupDays || 7) * 86400000;
  const days    = Math.ceil((dueTs - Date.now()) / 86400000);
  const dueTxt  = c.status !== 'active' ? '' :
    days > 0 ? `Follow-up in ${days} day${days !== 1 ? 's' : ''}`
             : `<span class="cross-due">Follow-up due</span>`;
  const p1 = findTank(c.parent1), p2 = findTank(c.parent2);
  const parentChips = `
    <span class="cross-parent-chip" onclick="openDrawer('${esc(c.parent1)}')">${esc(p1?.line || c.parent1)}</span>
    ${c.incross ? '<span class="cross-x">incross</span>' :
      `<span class="cross-x">×</span><span class="cross-parent-chip" onclick="openDrawer('${esc(c.parent2)}')">${esc(p2?.line || c.parent2)}</span>`}`;
  const photos = (c.photos || []).map(u => `<img class="cross-photo-thumb-img" src="${esc(u)}" onclick="openLightbox('${esc(u)}')">`).join('');
  const offspring = (c.offspring || []).length
    ? `<div class="cross-offspring">Offspring: ${c.offspring.map(id => `<span class="cross-parent-chip" onclick="openDrawer('${esc(id)}')">${esc(findTank(id)?.line || id)}</span>`).join(' ')}</div>`
    : '';
  return `<div class="cross-card cross-card-${c.status}">
    <div class="cross-card-top">
      <div class="cross-card-label">${esc(crossLabel(c))}</div>
      ${c.status === 'active' ? `<span class="cross-badge-days">${dueTxt}</span>` : `<span class="cross-status-tag">${esc(c.status)}</span>`}
    </div>
    <div class="cross-card-parents">${parentChips}</div>
    <div class="cross-card-meta">Set up ${setup} · <span class="copy-field cross-id-copy" onclick="copyToClip('${esc(c.id)}','Cross ID')" title="Click to copy">${esc(c.id)}<span class="copy-icon">⎘</span></span></div>
    ${c.notes ? `<div class="cross-card-notes">${esc(c.notes)}</div>` : ''}
    ${photos ? `<div class="cross-photo-row">${photos}</div>` : ''}
    ${offspring}
    ${c.status === 'active' ? `<div class="cross-card-actions">
      <button class="btn-xs btn-primary" onclick="recordOffspring('${esc(c.id)}')">Record offspring</button>
      <button class="btn-xs btn-ghost" onclick="openEditCross('${esc(c.id)}')">Edit</button>
      <label class="btn-xs btn-ghost cross-addphoto-btn">📷 Photo<input type="file" accept="image/*" multiple hidden onchange="addCrossPhotos('${esc(c.id)}', this)"></label>
      <button class="btn-xs btn-ghost" onclick="completeCross('${esc(c.id)}')">Mark done</button>
      <button class="btn-xs btn-ghost danger-ghost" onclick="cancelCross('${esc(c.id)}')">Cancel</button>
    </div>` : `<div class="cross-card-actions">
      <button class="btn-xs btn-ghost" onclick="openEditCross('${esc(c.id)}')">Edit</button>
    </div>`}
  </div>`;
}

function buildCrossesPanel() {
  const body = document.getElementById('crosses-panel-body');
  if (!body) return;
  const active = crosses.filter(c => c.status === 'active')
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const past = crosses.filter(c => c.status !== 'active')
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  let html = `<button class="btn-primary btn-sm cross-new-btn" onclick="openNewCross()">＋ New Cross</button>`;
  if (!active.length && !past.length) {
    html += `<p class="alert-empty">No crosses yet. Set one up to start tracking breeding.</p>`;
  }
  if (active.length) {
    html += `<div class="alert-section-title">Active breeding</div>`;
    html += active.map(crossCardHtml).join('');
  }
  if (past.length) {
    html += `<details class="cross-past"><summary>Past crosses (${past.length})</summary>`;
    html += past.map(crossCardHtml).join('');
    html += `</details>`;
  }
  body.innerHTML = html;
}

// ── New Cross modal ───────────────────────────────────────────────────────────
let crossChoosingSlot  = 0;
let editingCrossId     = null;   // null = creating; id = editing an existing cross
let removedCrossPhotos = [];      // existing photo URLs to delete from Drive on save
let newCrossDate       = null;    // YYYY-MM-DD — the fertilization date for this cross
let crossDateMode      = 'tomorrow'; // 'tomorrow' | 'today' | 'custom'

function todayStr() { return new Date().toISOString().slice(0, 10); }

function setCrossModalMode(editing) {
  const title = document.querySelector('#new-cross-overlay h2');
  const btn   = document.getElementById('new-cross-save');
  if (title) title.textContent = editing ? 'Edit Cross' : 'New Cross';
  if (btn)   btn.textContent   = editing ? 'Save changes' : 'Set up cross';
}

window.openNewCross = function(prefillParent1) {
  editingCrossId     = null;
  newCrossParents    = [prefillParent1 || null, null];
  newCrossIncross    = false;
  newCrossPhotos     = [];
  removedCrossPhotos = [];
  crossChoosingSlot  = 0;
  // Stock default is tomorrow — that's the day the eggs are actually fertilized
  crossDateMode      = 'tomorrow';
  newCrossDate       = addDays(todayStr(), 1);
  setCrossModalMode(false);
  document.getElementById('new-cross-overlay').classList.add('active');
  checkScrollLock();
  renderNewCrossModal();
};

window.openEditCross = function(crossId) {
  const c = crosses.find(x => x.id === crossId);
  if (!c) return;
  editingCrossId     = crossId;
  newCrossParents    = [c.parent1 || null, c.incross ? null : (c.parent2 || null)];
  newCrossIncross    = c.incross;
  newCrossPhotos     = (c.photos || []).map(url => ({ url, existing: true }));
  removedCrossPhotos = [];
  crossChoosingSlot  = 0;
  newCrossDate  = c.date || todayStr();
  crossDateMode = newCrossDate === addDays(todayStr(), 1) ? 'tomorrow'
                : newCrossDate === todayStr() ? 'today' : 'custom';
  setCrossModalMode(true);
  document.getElementById('new-cross-overlay').classList.add('active');
  checkScrollLock();
  renderNewCrossModal();
  document.getElementById('new-cross-days').value  = c.followupDays || 7;
  document.getElementById('new-cross-notes').value = c.notes || '';
};
window.closeNewCross = function() {
  document.getElementById('new-cross-overlay')?.classList.remove('active');
  newCrossPhotos     = [];
  removedCrossPhotos = [];
  editingCrossId     = null;
  checkScrollLock();
};

function crossParentSlotHtml(slot) {
  if (slot === 2 && newCrossIncross) return '';
  const tankId = newCrossParents[slot - 1];
  const tank   = tankId ? findTank(tankId) : null;
  let inner;
  if (tankId) {
    inner = `<div class="cross-parent-card">
      <div class="cross-parent-info">
        <div class="cross-parent-line">${esc(tank?.line || tankId)}</div>
        <div class="cross-parent-id">${esc(tankId)}${tank?.location ? ' · 📍 ' + esc(tank.location) : ''}</div>
      </div>
      <button type="button" class="btn-xs btn-ghost" onclick="clearCrossParent(${slot})">✕</button>
    </div>`;
  } else {
    inner = `<div class="cross-parent-empty">
      <button type="button" class="btn-sm btn-ghost" onclick="openScannerForCross(${slot})">📷 Scan</button>
      <button type="button" class="btn-sm btn-ghost" onclick="chooseCrossParent(${slot})">📋 Choose</button>
    </div>`;
    if (crossChoosingSlot === slot) {
      inner += `<div class="cross-chooser">
        <input type="text" class="cross-chooser-search" id="cross-chooser-search" placeholder="Search tanks…" oninput="filterCrossChooser(${slot}, this.value)" autocomplete="off" />
        <div class="cross-chooser-list" id="cross-chooser-list"></div>
      </div>`;
    }
  }
  return `<div class="cross-parent-slot"><label>Parent ${slot}</label>${inner}</div>`;
}

function renderNewCrossModal() {
  const body = document.getElementById('new-cross-body');
  if (!body) return;
  const prevDays  = document.getElementById('new-cross-days')?.value;
  const prevNotes = document.getElementById('new-cross-notes')?.value;
  const photos = newCrossPhotos.map((p, i) =>
    `<div class="cross-photo-thumb"><img src="${p.url}"><button type="button" class="cross-photo-del" onclick="removeNewCrossPhoto(${i})">✕</button></div>`
  ).join('');
  const p1 = newCrossParents[0];
  const p2 = newCrossIncross ? newCrossParents[0] : newCrossParents[1];
  const ready = p1 && (newCrossIncross || p2);
  body.innerHTML = `
    ${crossParentSlotHtml(1)}
    <label class="cross-incross-toggle">
      <input type="checkbox" ${newCrossIncross ? 'checked' : ''} onchange="toggleNewCrossIncross(this.checked)">
      <span>Incross (same line / sibling cross — single parent)</span>
    </label>
    ${crossParentSlotHtml(2)}
    <div class="cross-field">
      <label>Fertilization date</label>
      <div class="cross-date-btns">
        <button type="button" class="btn-xs ${crossDateMode === 'tomorrow' ? 'btn-primary' : 'btn-ghost'}" onclick="setCrossDateMode('tomorrow')">Tomorrow</button>
        <button type="button" class="btn-xs ${crossDateMode === 'today' ? 'btn-primary' : 'btn-ghost'}" onclick="setCrossDateMode('today')">Today</button>
        <button type="button" class="btn-xs ${crossDateMode === 'custom' ? 'btn-primary' : 'btn-ghost'}" onclick="setCrossDateMode('custom')">Custom</button>
      </div>
      ${crossDateMode === 'custom'
        ? `<input type="text" id="new-cross-date-custom" inputmode="numeric" placeholder="MM/DD/YYYY" maxlength="10" value="${esc(toDateInput(newCrossDate))}" oninput="autoFormatDate(this)" />`
        : `<p class="field-note">${esc(formatDate(newCrossDate))}</p>`}
    </div>
    <div class="cross-field">
      <label>Follow-up reminder (days)</label>
      <input type="number" id="new-cross-days" min="1" value="7" class="cross-num-input">
    </div>
    <div class="cross-field">
      <label>Setup photos <span class="field-note">auto-removed 14 days after fertilization</span></label>
      <div class="cross-photo-grid">
        ${photos}
        <label class="cross-photo-add">＋<input type="file" accept="image/*" multiple hidden onchange="addNewCrossPhotos(this)"></label>
      </div>
    </div>
    <div class="cross-field">
      <label>Notes</label>
      <textarea id="new-cross-notes" rows="2" placeholder="Cross details for the day…"></textarea>
    </div>
    <div class="cross-preview-label">${ready ? 'Will create: <strong>' + esc(crossLabelFromIds(p1, p2, newCrossIncross)) + '</strong>' : 'Pick parents to begin'}</div>
  `;
  if (prevDays  != null) document.getElementById('new-cross-days').value  = prevDays;
  if (prevNotes != null) document.getElementById('new-cross-notes').value = prevNotes;
  const saveBtn = document.getElementById('new-cross-save');
  if (saveBtn) saveBtn.disabled = !ready;
  if (crossChoosingSlot) {
    filterCrossChooser(crossChoosingSlot, '');
    setTimeout(() => document.getElementById('cross-chooser-search')?.focus(), 30);
  }
}

window.chooseCrossParent = function(slot) {
  crossChoosingSlot = crossChoosingSlot === slot ? 0 : slot;
  renderNewCrossModal();
};
window.filterCrossChooser = function(slot, q) {
  const list = document.getElementById('cross-chooser-list');
  if (!list) return;
  const term  = (q || '').toLowerCase();
  const other = newCrossParents[slot === 1 ? 1 : 0];
  let tanks = fishData.filter(f => f.tankId && f.tankId !== other);
  if (term) tanks = tanks.filter(f =>
    f.line.toLowerCase().includes(term) ||
    (f.tankId || '').toLowerCase().includes(term) ||
    (f.location || '').toLowerCase().includes(term));
  tanks = tanks.slice(0, 40);
  list.innerHTML = tanks.length
    ? tanks.map(f => `<button type="button" class="cross-chooser-item" onclick="setCrossParent(${slot},'${esc(f.tankId)}')">
        <span class="cross-chooser-line">${esc(f.line)}</span>
        <span class="cross-chooser-meta">${esc(f.tankId)}${f.location ? ' · ' + esc(f.location) : ''} · ${esc(f.status)}</span>
      </button>`).join('')
    : '<p class="picker-empty">No tanks found.</p>';
};
window.setCrossParent = function(slot, tankId) {
  newCrossParents[slot - 1] = tankId;
  crossChoosingSlot = 0;
  renderNewCrossModal();
};
window.clearCrossParent = function(slot) {
  newCrossParents[slot - 1] = null;
  renderNewCrossModal();
};
window.toggleNewCrossIncross = function(on) {
  newCrossIncross = on;
  if (on) newCrossParents[1] = null;
  crossChoosingSlot = 0;
  renderNewCrossModal();
};

window.setCrossDateMode = function(mode) {
  crossDateMode = mode;
  if (mode === 'tomorrow') newCrossDate = addDays(todayStr(), 1);
  else if (mode === 'today') newCrossDate = todayStr();
  // 'custom' — leave newCrossDate as-is; the custom input reads/validates at save time
  renderNewCrossModal();
};

window.openScannerForCross = function(slot) {
  scanForCross = slot;
  document.getElementById('scan-overlay').classList.add('active');
  document.getElementById('scan-status').textContent = 'Initializing camera…';
  document.getElementById('manual-barcode').value    = '';
  checkScrollLock(); startQuagga();
};
function setCrossParentByScan(slot, code) {
  const tank = fishData.find(f => (f.tankId || '').toUpperCase() === code.toUpperCase());
  if (!tank) { showToast(`⚠️ ${code} not found in inventory`); return; }
  newCrossParents[slot - 1] = tank.tankId;
  showToast(`✓ Parent ${slot}: ${tank.line}`);
  renderNewCrossModal();
}

window.addNewCrossPhotos = function(input) {
  [...(input.files || [])].forEach(file => {
    newCrossPhotos.push({ file, url: URL.createObjectURL(file) });
  });
  input.value = '';
  renderNewCrossModal();
};
window.removeNewCrossPhoto = function(i) {
  const p = newCrossPhotos[i];
  if (p?.existing) removedCrossPhotos.push(p.url);
  else if (p?.url) URL.revokeObjectURL(p.url);
  newCrossPhotos.splice(i, 1);
  renderNewCrossModal();
};

window.saveNewCross = async function() {
  const p1 = newCrossParents[0];
  const p2 = newCrossIncross ? p1 : newCrossParents[1];
  if (!p1 || (!newCrossIncross && !p2)) { showToast('⚠️ Pick both parents first'); return; }
  const btn      = document.getElementById('new-cross-save');
  const origText = btn?.textContent || (editingCrossId ? 'Save changes' : 'Set up cross');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  const days  = parseInt(document.getElementById('new-cross-days')?.value) || 7;
  const notes = document.getElementById('new-cross-notes')?.value.trim() || '';

  let crossDate = newCrossDate;
  if (crossDateMode === 'custom') {
    const raw = document.getElementById('new-cross-date-custom')?.value.trim() || '';
    if (!isValidDateInput(raw)) {
      showToast('⚠️ Enter a valid fertilization date (MM/DD/YYYY)');
      if (btn) { btn.disabled = false; btn.textContent = origText; }
      return;
    }
    crossDate = parseDateInput(raw);
  }

  // Delete any existing photos the user removed
  let failedRemovals = 0;
  for (const url of removedCrossPhotos) { if (!(await deleteDrivePhoto(url))) failedRemovals++; }
  removedCrossPhotos = [];
  if (failedRemovals) showToast(`⚠️ ${failedRemovals} removed photo${failedRemovals > 1 ? 's' : ''} couldn't be deleted from Drive`);

  // Keep already-uploaded photos; upload the newly-added pending ones
  const kept    = newCrossPhotos.filter(p => p.existing).map(p => p.url);
  const pending = newCrossPhotos.filter(p => p.file);
  let uploaded  = [];
  if (pending.length) {
    if (demoMode) {
      uploaded = pending.map(p => p.url);
    } else {
      try {
        showToast('📤 Uploading photos…');
        for (const p of pending) { uploaded.push(await uploadPhoto(p.file)); }
      } catch(e) { showToast('❌ Photo upload failed'); }
    }
  }
  const photos = [...kept, ...uploaded];

  // ── Edit path ──
  if (editingCrossId) {
    const c = crosses.find(x => x.id === editingCrossId);
    if (!c) { closeNewCross(); return; }
    c.parent1      = p1;
    c.parent2      = newCrossIncross ? '' : p2;
    c.incross      = newCrossIncross;
    c.date         = crossDate;
    c.followupDays = days;
    c.notes        = notes;
    c.photos       = photos;
    c.photoExpires = photos.length ? addDays(crossDate, 14) : '';
    try { await saveCross(c); }
    catch(e) { showToast('❌ ' + e.message); if (btn) { btn.disabled = false; btn.textContent = origText; } return; }
    // Refresh the follow-up alert since label/timing may have changed
    if (c.status === 'active') {
      await dismissBreedingAlert(c.id);
      await createBreedingAlert(c);
      await setParentsBreeding([p1, ...(newCrossIncross ? [] : [p2])]);
    }
    editingCrossId = null;
    newCrossPhotos = [];
    closeNewCross();
    renderCrossBadge();
    renderAll();
    buildCrossesPanel();
    logChange('Cross Edited', { tankId: c.id, line: crossLabel(c) },
      `Parents: ${c.parent1}${c.incross ? ' (incross)' : ' × ' + c.parent2} | Follow-up: ${days}d${notes ? ' | Notes: ' + notes : ''}`);
    showToast(`✅ Cross updated: ${crossLabel(c)}`);
    return;
  }

  // ── Create path ──
  const cross = {
    id: 'CROSS-' + Date.now(),
    date: crossDate,
    parent1: p1,
    parent2: newCrossIncross ? '' : p2,
    incross: newCrossIncross,
    followupDays: days,
    status: 'active',
    photos,
    photoExpires: photos.length ? addDays(crossDate, 14) : '',
    notes,
    offspring: [],
    _rowIndex: null,
  };
  try {
    await saveCross(cross);
    await createBreedingAlert(cross);
  } catch(e) { showToast('❌ ' + e.message); if (btn) { btn.disabled = false; btn.textContent = origText; } return; }

  // Mark both parents as Breeding so they show in the Breeding section
  await setParentsBreeding([p1, ...(newCrossIncross ? [] : [p2])]);

  newCrossPhotos = [];
  if (btn) btn.textContent = origText;
  closeNewCross();
  renderCrossBadge();
  renderAll();
  buildCrossesPanel();
  logChange('Cross Created', { tankId: cross.id, line: crossLabel(cross) },
    `Parents: ${cross.parent1}${cross.incross ? ' (incross)' : ' × ' + cross.parent2} | Follow-up: ${days}d${photos.length ? ` | Photos: ${photos.length}` : ''}${notes ? ' | Notes: ' + notes : ''}`);
  showToast(`✅ Cross set up: ${crossLabel(cross)}`);
};

async function setParentsBreeding(ids) {
  for (const id of ids) {
    const f = fishData.find(x => x.tankId === id);
    if (!f || f.status === 'Breeding') continue;
    f.status = 'Breeding';
    f.updated = new Date().toISOString().slice(0, 16).replace('T', ' ');
    if (!demoMode && f._rowIndex) {
      try { await updateSheetRow(f, f._rowIndex); logChange('Edited', f, 'Status: → Breeding (cross setup)'); } catch(e) {}
    }
  }
}

window.completeCross = async function(crossId) {
  const c = crosses.find(x => x.id === crossId);
  if (!c) return;
  c.status = 'completed';
  await saveCross(c);
  await dismissBreedingAlert(crossId);
  renderCrossBadge();
  buildCrossesPanel();
  logChange('Cross Completed', { tankId: c.id, line: crossLabel(c) },
    `Offspring recorded: ${(c.offspring || []).length ? c.offspring.join(', ') : 'none'}`);
};
window.cancelCross = async function(crossId) {
  if (!confirm('Cancel this cross? It will move to past crosses.')) return;
  const c = crosses.find(x => x.id === crossId);
  if (!c) return;
  c.status = 'cancelled';
  // Only drop photos that were actually deleted from Drive — keep anything that
  // failed so it isn't silently orphaned (retried next cleanup pass)
  const remaining = [];
  for (const url of (c.photos || [])) { if (!(await deleteDrivePhoto(url))) remaining.push(url); }
  c.photos = remaining;
  if (!remaining.length) c.photoExpires = '';
  await saveCross(c);
  await dismissBreedingAlert(crossId);
  renderCrossBadge();
  buildCrossesPanel();
  logChange('Cross Cancelled', { tankId: c.id, line: crossLabel(c) });
  if (remaining.length) showToast(`⚠️ Cross cancelled, but ${remaining.length} photo${remaining.length > 1 ? 's' : ''} couldn't be deleted — will retry later`);
};

window.addCrossPhotos = async function(crossId, input) {
  const c = crosses.find(x => x.id === crossId);
  if (!c) return;
  const files = [...(input.files || [])];
  input.value = '';
  if (!files.length) return;
  showToast('📤 Uploading…');
  try {
    for (const file of files) {
      const url = demoMode ? URL.createObjectURL(file) : await uploadPhoto(file);
      c.photos = [...(c.photos || []), url];
    }
    if (!c.photoExpires) c.photoExpires = addDays(c.date, 14);
    await saveCross(c);
    buildCrossesPanel();
    logChange('Cross Photo Added', { tankId: c.id, line: crossLabel(c) }, `${files.length} photo${files.length > 1 ? 's' : ''}`);
    showToast('✅ Photo added');
  } catch(e) { showToast('❌ Upload failed'); }
};

// ── Record offspring ──────────────────────────────────────────────────────────
window.recordOffspring = function(crossId) {
  const c = crosses.find(x => x.id === crossId);
  if (!c) return;
  switchMainTab('inventory');
  closeAlertPanel();
  openAddModal();
  document.getElementById('modal-title').textContent = 'Record Offspring';
  document.getElementById('f-line').value = crossLabel(c);
  const parentTxt = c.incross ? `${c.parent1} (incross)` : `${c.parent1} × ${c.parent2}`;
  document.getElementById('f-notes').value = `Offspring of ${parentTxt}`;
  if (c.date) {
    document.getElementById('f-age').value = toDateInput(c.date);
    validateAgeInput();
  }
  const inc = document.querySelector('input[name="status"][value="Incubator"]');
  if (inc) { inc.checked = true; syncStatusToLoc?.(); }
  renderCrossOriginOptions(crossId);
  window.onCrossOriginChange();
};

function prepNextOffspring() {
  // Keep line/notes/status/cross context; clear the per-tank fields
  document.getElementById('f-tank-id').value = '';
  document.getElementById('f-count').value   = '';
  currentMarkers = []; currentNegMarkers = []; currentUnsortedMarkers = [];
  renderMarkerTags(); renderNegMarkerTags(); renderUnsortedMarkerTags();
  currentPhotoUrl = null; pendingPhotoFile = null;
  resetPhotoUI();
  showToast('✅ Saved — add the next tank');
  document.getElementById('f-tank-id').focus();
}

async function attachOffspringToCross(crossId, tankId) {
  const c = crosses.find(x => x.id === crossId);
  if (!c) return;
  if (!(c.offspring || []).includes(tankId)) c.offspring = [...(c.offspring || []), tankId];
  await saveCross(c);
  await dismissBreedingAlert(crossId);
  renderCrossBadge();
  buildCrossesPanel();
}

async function detachOffspringFromCross(crossId, tankId) {
  const c = crosses.find(x => x.id === crossId);
  if (!c) return;
  c.offspring = (c.offspring || []).filter(id => id !== tankId);
  await saveCross(c);
  buildCrossesPanel();
}

// ── Lineage section in the detail drawer ─────────────────────────────────────
function renderAncestryTree(tankId, visited) {
  visited = visited || new Set();
  if (visited.has(tankId)) return '';
  visited.add(tankId);
  const tank  = findTank(tankId);
  const cross = tank?.crossOrigin ? crosses.find(c => c.id === tank.crossOrigin) : null;
  if (!cross) return '';
  const parents = cross.incross ? [cross.parent1] : [cross.parent1, cross.parent2];
  return `<ul class="lineage-tree">` + parents.map(pid => {
    const p = findTank(pid);
    return `<li>
      <span class="lineage-node" onclick="openDrawer('${esc(pid)}')">${esc(p?.line || pid)} <small>${esc(pid)}</small></span>
      ${renderAncestryTree(pid, visited)}
    </li>`;
  }).join('') + `</ul>`;
}

function buildLineageHtml(f) {
  const origin    = f.crossOrigin ? crosses.find(c => c.id === f.crossOrigin) : null;
  const asParent  = crosses.filter(c => c.parent1 === f.tankId || c.parent2 === f.tankId);

  let parentsHtml = '';
  if (origin) {
    const chips = (origin.incross ? [origin.parent1] : [origin.parent1, origin.parent2]).map(pid =>
      `<span class="cross-parent-chip" onclick="closeDrawer();openDrawer('${esc(pid)}')">${esc(findTank(pid)?.line || pid)}</span>`
    ).join(origin.incross ? '' : ' <span class="cross-x">×</span> ');
    parentsHtml = `<div class="drawer-row"><span class="drawer-row-label">Bred from</span><span class="drawer-row-val">${chips}</span></div>
      <div class="drawer-row"><span class="drawer-row-label">Cross date</span><span class="drawer-row-val">${formatDate(origin.date)}</span></div>`;
  }

  let offspringHtml = '';
  if (asParent.length) {
    const rows = asParent.map(c => {
      const kids = (c.offspring || []).length
        ? c.offspring.map(id => `<span class="cross-parent-chip" onclick="closeDrawer();openDrawer('${esc(id)}')">${esc(findTank(id)?.line || id)}</span>`).join(' ')
        : `<span style="color:var(--text-dim)">${c.status === 'active' ? 'pending' : 'none recorded'}</span>`;
      return `<div class="lineage-cross-row"><span class="lineage-cross-label">${esc(crossLabel(c))} <small>(${formatDate(c.date)})</small></span><div>${kids}</div></div>`;
    }).join('');
    offspringHtml = `<div class="drawer-row-block"><span class="drawer-row-label">Crosses / offspring</span>${rows}</div>`;
  }

  const tree = origin ? renderAncestryTree(f.tankId) : '';
  const treeHtml = tree ? `<details class="lineage-full"><summary>Full ancestry</summary>${tree}</details>` : '';

  return `<div class="drawer-section">
    <h4>🧬 Lineage</h4>
    ${parentsHtml || offspringHtml ? '' : '<p style="color:var(--text-dim);font-size:.85rem;margin:.25rem 0">No breeding records for this tank yet.</p>'}
    ${parentsHtml}
    ${offspringHtml}
    ${treeHtml}
    <button class="btn-ghost btn-sm" style="margin-top:.5rem" onclick="startCrossFromTank('${esc(f.tankId)}')">🔀 Start cross from this tank</button>
  </div>`;
}

window.startCrossFromTank = function(tankId) {
  closeDrawer();
  openNewCross(tankId);
};

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ── Keyboard shortcuts (single consolidated listener) ─────────────────────────
document.addEventListener('keydown', e => {
  if (e.target.id === 'manual-barcode' && e.key === 'Enter') { manualBarcode(); return; }
  if ((e.metaKey||e.ctrlKey) && e.key==='k') { e.preventDefault(); document.getElementById('search-input')?.focus(); return; }
  if ((e.metaKey||e.ctrlKey) && e.key==='n') { e.preventDefault(); openAddModal(); return; }
  if (e.key==='Escape') {
    closeNavMenu();
    document.getElementById('group-assign-menu')?.classList.add('hidden');
    if (!document.getElementById('tank-picker-overlay')?.classList.contains('hidden')) closeTankPicker();
    closeModal(); closeDrawer(); closeScanner(); closeLightbox(); closeMobileFilters(); closeGuide(); closeAlertPanel(); closeActivityPanel(); closeNewCross();
  }
});
