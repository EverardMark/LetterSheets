'use strict';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let loginUser = null;      // { id, email } captured between login and select_company
let employees = [];        // [{ id, first_name, last_name, department, position, status }]
let attendanceByEmp = {};  // employee_id -> today's attendance record
let enrolledByEmp = {};    // employee_id -> count of enrolled fingers
let fpTemplates = [];      // [{ employee_id, finger_index, template }]

let bridge = null;         // FpBridge instance
let readerReady = false;   // reader present + initialized
let identifyActive = false; // 1:N loop running on the clock view
let enrollingEmp = null;   // employee currently in the enroll modal

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', async () => {
  startLiveClock();
  wireEvents();

  initBridge();

  const cfg = await window.api.getConfig();

  if (cfg.authed) {
    showClockView(cfg.companyName);
    await loadClockData();
  } else {
    showSignInView();
  }
});

function wireEvents() {
  $('signInBtn').addEventListener('click', onSignInClick);
  $('password').addEventListener('keydown', (e) => { if (e.key === 'Enter') onSignInClick(); });
  $('email').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('password').focus(); });
  $('signOutBtn').addEventListener('click', gateSignOut);
  $('refreshBtn').addEventListener('click', loadClockData);
  $('search').addEventListener('input', renderGrid);

  // Enrollment (gated behind admin sign-in)
  $('enrollNavBtn').addEventListener('click', gateEnrollment);
  $('enrollBackBtn').addEventListener('click', backToClock);
  $('enrollSearch').addEventListener('input', renderEnrollGrid);
  $('enrollStartBtn').addEventListener('click', startEnrollCapture);
  $('enrollCancelBtn').addEventListener('click', closeEnrollModal);

  // Admin gate
  $('adminCancelBtn').addEventListener('click', closeAdminModal);
  $('adminConfirmBtn').addEventListener('click', submitAdmin);
  $('adminPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAdmin(); });
  document.addEventListener('keydown', onGlobalKeydown);
}

// ESC: cancel an open modal, otherwise prompt for admin sign-in to exit.
function onGlobalKeydown(e) {
  if (e.key !== 'Escape') return;
  if (!$('adminModal').classList.contains('hidden')) { closeAdminModal(); return; }
  if (!$('enrollModal').classList.contains('hidden')) { closeEnrollModal(); return; }
  promptAdmin({
    title: 'Admin sign-in required',
    subtitle: 'Only an administrator can close the time clock.',
    confirmLabel: 'Unlock & exit',
    onVerified: () => window.api.quitApp(),
  });
}

function gateEnrollment() {
  promptAdmin({
    title: 'Admin sign-in required',
    subtitle: 'Sign in to manage fingerprint enrollment.',
    confirmLabel: 'Continue',
    onVerified: () => showEnrollView(),
  });
}

function gateSignOut() {
  promptAdmin({
    title: 'Admin sign-in required',
    subtitle: 'Only an administrator can sign this device out.',
    confirmLabel: 'Sign out',
    onVerified: () => onSignOut(),
  });
}

// ---- Reusable admin verification gate ----
let pendingAdmin = null; // { onVerified, confirmLabel }

function promptAdmin({ title, subtitle, confirmLabel, onVerified }) {
  pendingAdmin = { onVerified, confirmLabel: confirmLabel || 'Continue' };
  $('adminModalTitle').textContent = title || 'Admin sign-in required';
  $('adminModalSub').textContent = subtitle || 'Only an administrator can do this.';
  $('adminEmail').value = '';
  $('adminPassword').value = '';
  setAdminMsg('');
  const btn = $('adminConfirmBtn');
  btn.disabled = false;
  btn.textContent = pendingAdmin.confirmLabel;
  $('adminModal').classList.remove('hidden');
  setTimeout(() => $('adminEmail').focus(), 50);
}

function closeAdminModal() {
  pendingAdmin = null;
  $('adminModal').classList.add('hidden');
}

async function submitAdmin() {
  if (!pendingAdmin) return;
  const email = $('adminEmail').value.trim();
  const password = $('adminPassword').value;
  if (!email || !password) return setAdminMsg('Enter admin email and password.', 'error');

  const btn = $('adminConfirmBtn');
  btn.disabled = true;
  btn.textContent = 'Verifying…';
  setAdminMsg('');

  const r = await window.api.verifyAdmin(email, password);
  if (!r.ok) {
    btn.disabled = false;
    btn.textContent = pendingAdmin.confirmLabel;
    return setAdminMsg(r.error || 'Verification failed.', 'error');
  }

  const action = pendingAdmin.onVerified;
  closeAdminModal();
  if (action) await action();
}

function setAdminMsg(text, kind) {
  const el = $('adminMsg');
  el.textContent = text || '';
  el.className = 'msg' + (kind ? ' ' + kind : '');
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
function showSignInView() {
  stopIdentify();
  $('topbar').classList.add('hidden');
  $('clockView').classList.add('hidden');
  $('enrollView').classList.add('hidden');
  $('signinView').classList.remove('hidden');
}

function showClockView(companyName) {
  $('signinView').classList.add('hidden');
  $('enrollView').classList.add('hidden');
  $('topbar').classList.remove('hidden');
  $('clockView').classList.remove('hidden');
  if (companyName != null) $('companyChip').textContent = companyName || '';
  updateFpPrompt();
  armIdentify();
}

function backToClock() {
  showClockView();
}

// ---------------------------------------------------------------------------
// Sign-in flow
// ---------------------------------------------------------------------------
async function onSignInClick() {
  const btn = $('signInBtn');
  const pickWrap = $('companyPickWrap');

  // Phase 2: a company is being selected.
  if (!pickWrap.classList.contains('hidden')) {
    await doSelectCompany();
    return;
  }

  // Phase 1: verify credentials.
  const email = $('email').value.trim();
  const password = $('password').value;

  if (!email || !password) return setMsg('Enter your email and password.', 'error');

  setBusy(btn, true, 'Signing in…');
  setMsg('');

  const r = await window.api.login(email, password);
  setBusy(btn, false, 'Continue');

  if (!r.ok) return setMsg(r.error || 'Sign-in failed.', 'error');

  const companies = r.data.companies || [];
  loginUser = { id: r.data.user.id, email: r.data.user.email };

  if (companies.length === 0) {
    return setMsg('This account has no company access.', 'error');
  }

  // Populate the company picker and switch the button to "Continue".
  const sel = $('companySelect');
  sel.innerHTML = '';
  for (const c of companies) {
    const opt = document.createElement('option');
    opt.value = c.company_id;
    opt.textContent = c.company_name || c.company_id;
    opt.dataset.name = c.company_name || '';
    sel.appendChild(opt);
  }

  $('email').setAttribute('disabled', 'true');
  $('password').setAttribute('disabled', 'true');
  pickWrap.classList.remove('hidden');

  if (companies.length === 1) {
    await doSelectCompany();
  } else {
    setMsg('Choose a company to finish setup.', 'ok');
  }
}

async function doSelectCompany() {
  const btn = $('signInBtn');
  const sel = $('companySelect');
  const companyId = sel.value;
  const companyName = sel.options[sel.selectedIndex]?.dataset.name || '';

  setBusy(btn, true, 'Finishing…');
  const r = await window.api.selectCompany(loginUser.id, companyId, companyName, loginUser.email);
  setBusy(btn, false, 'Continue');

  if (!r.ok) return setMsg(r.error || 'Could not create session.', 'error');

  // Reset the form for next time.
  $('password').value = '';
  resetSignInForm();

  showClockView(r.data.companyName || companyName);
  await loadClockData();
}

function resetSignInForm() {
  $('email').removeAttribute('disabled');
  $('password').removeAttribute('disabled');
  $('companyPickWrap').classList.add('hidden');
  setMsg('');
}

async function onSignOut() {
  await window.api.logout();
  employees = [];
  attendanceByEmp = {};
  loginUser = null;
  resetSignInForm();
  showSignInView();
}

// ---------------------------------------------------------------------------
// Clock data
// ---------------------------------------------------------------------------
async function loadClockData() {
  setSummary('Loading…');
  const [empRes, attRes, fpRes] = await Promise.all([
    window.api.listEmployees(),
    window.api.todayAttendance(),
    window.api.fpList(),
  ]);

  if (!empRes.ok) {
    if (empRes.code === 401) return handleExpired();
    setSummary('');
    return toast(empRes.error || 'Failed to load employees.', 'err');
  }

  // Enrolled-finger counts + push templates to the reader for 1:N matching.
  enrolledByEmp = {};
  fpTemplates = fpRes.ok ? (fpRes.data || []) : [];
  for (const t of fpTemplates) {
    enrolledByEmp[t.employee_id] = (enrolledByEmp[t.employee_id] || 0) + 1;
  }
  loadTemplatesIntoReader();

  employees = (empRes.data || [])
    .filter((e) => (e.status || '').toLowerCase() !== 'inactive' && (e.status || '').toLowerCase() !== 'terminated')
    .sort((a, b) => (a.first_name + a.last_name).localeCompare(b.first_name + b.last_name));

  attendanceByEmp = {};
  if (attRes.ok) {
    for (const rec of attRes.data || []) {
      // Keep the most relevant record per employee: an open one wins.
      const existing = attendanceByEmp[rec.employee_id];
      if (!existing || (!rec.clock_out && existing.clock_out)) {
        attendanceByEmp[rec.employee_id] = rec;
      }
    }
  }

  renderGrid();
}

function handleExpired() {
  toast('Session expired — please sign in again.', 'err');
  onSignOut();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function empState(emp) {
  const rec = attendanceByEmp[emp.id];
  if (!rec || !rec.clock_in) return { key: 'out', label: 'Not clocked in' };
  if (rec.clock_in && !rec.clock_out) return { key: 'in', label: 'Clocked in', rec };
  return { key: 'done', label: 'Clocked out', rec };
}

function renderGrid() {
  const q = $('search').value.trim().toLowerCase();
  const grid = $('grid');
  grid.innerHTML = '';

  const filtered = employees.filter((e) => {
    if (!q) return true;
    const hay = `${e.first_name} ${e.last_name} ${e.department} ${e.position}`.toLowerCase();
    return hay.includes(q);
  });

  $('emptyState').classList.toggle('hidden', filtered.length > 0);

  let inCount = 0;
  for (const emp of employees) if (empState(emp).key === 'in') inCount++;
  setSummary(`${employees.length} employees · ${inCount} clocked in`);

  for (const emp of filtered) {
    grid.appendChild(renderCard(emp));
  }
}

function renderCard(emp) {
  const st = empState(emp);
  const card = document.createElement('div');
  card.className = 'emp-card' + (st.key === 'in' ? ' in' : '');

  const initials = ((emp.first_name || '?')[0] + (emp.last_name || '')[0]).toUpperCase();
  const sub = [emp.position, emp.department].filter(Boolean).join(' · ');

  const head = document.createElement('div');
  head.className = 'emp-head';
  head.innerHTML = `
    <div class="avatar">${escapeHtml(initials)}</div>
    <div>
      <div class="emp-name">${escapeHtml(emp.first_name)} ${escapeHtml(emp.last_name)}</div>
      <div class="emp-sub">${escapeHtml(sub || '—')}</div>
    </div>`;

  const statusRow = document.createElement('div');
  statusRow.innerHTML = `
    <span class="emp-status ${st.key}"><span class="dot"></span>${st.label}</span>`;

  const timeRow = document.createElement('div');
  timeRow.className = 'emp-time';
  if (st.rec) {
    const inT = fmtTime(st.rec.clock_in);
    const outT = st.rec.clock_out ? fmtTime(st.rec.clock_out) : null;
    timeRow.textContent = outT ? `In ${inT} · Out ${outT}` : `In ${inT}`;
  } else {
    timeRow.textContent = ' ';
  }

  const actions = document.createElement('div');
  actions.className = 'emp-actions';
  if (st.key === 'out') {
    const b = mkBtn('Clock In', 'btn btn-green', () => doClockIn(emp, b));
    actions.appendChild(b);
  } else if (st.key === 'in') {
    const b = mkBtn('Clock Out', 'btn btn-out', () => doClockOut(emp, st.rec, b));
    actions.appendChild(b);
  } else {
    const b = mkBtn('Done for today', 'btn', null);
    b.setAttribute('disabled', 'true');
    actions.appendChild(b);
  }

  card.append(head, statusRow, timeRow, actions);
  return card;
}

// ---------------------------------------------------------------------------
// Clock actions
// ---------------------------------------------------------------------------
async function doClockIn(emp, btn) {
  setBusy(btn, true, 'Clocking in…');
  const r = await window.api.clockIn(emp.id);
  if (!r.ok) {
    setBusy(btn, false, 'Clock In');
    if (r.code === 401) return handleExpired();
    return toast(r.error || 'Clock-in failed.', 'err');
  }
  toast(`${emp.first_name} clocked in`, 'ok');
  await loadClockData();
}

async function doClockOut(emp, rec, btn) {
  if (!rec || !rec.id) return toast('No open record to clock out.', 'err');
  setBusy(btn, true, 'Clocking out…');
  const r = await window.api.clockOut(rec.id);
  if (!r.ok) {
    setBusy(btn, false, 'Clock Out');
    if (r.code === 401) return handleExpired();
    return toast(r.error || 'Clock-out failed.', 'err');
  }
  toast(`${emp.first_name} clocked out`, 'ok');
  await loadClockData();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mkBtn(label, cls, onClick) {
  const b = document.createElement('button');
  b.className = cls;
  b.textContent = label;
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

function setBusy(btn, busy, label) {
  if (!btn) return;
  btn.disabled = busy;
  if (label) btn.textContent = label;
}

function setMsg(text, kind) {
  const el = $('signinMsg');
  el.textContent = text || '';
  el.className = 'msg' + (kind ? ' ' + kind : '');
}

function setSummary(text) { $('statusSummary').textContent = text || ''; }

let toastTimer = null;
function toast(text, kind) {
  const el = $('toast');
  el.textContent = text;
  el.className = 'toast show ' + (kind || '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast ' + (kind || ''); }, 2600);
}

function fmtTime(dt) {
  if (!dt) return '—';
  // Server sends "YYYY-MM-DD HH:MM:SS" (local server time). Show HH:MM.
  const m = String(dt).match(/(\d{2}):(\d{2})/);
  if (!m) return dt;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min} ${ap}`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function startLiveClock() {
  const tick = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    $('clock').textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  tick();
  setInterval(tick, 1000);
}

// ===========================================================================
// Fingerprint reader bridge
// ===========================================================================
function initBridge() {
  bridge = new FpBridge();

  bridge.on('connection', ({ connected }) => {
    if (!connected) { readerReady = false; setReaderChip('off', 'No reader'); updateFpPrompt(); stopIdentify(); }
  });

  bridge.on('status', (m) => {
    readerReady = !!m.ready;
    setReaderChip(readerReady ? 'ready' : 'off', readerReady ? (m.reader || 'Reader ready') : 'No reader');
    updateFpPrompt();
    if (readerReady && isClockViewVisible()) { loadTemplatesIntoReader(); armIdentify(); }
  });

  bridge.on('identify', onIdentifyResult);
  bridge.on('capture', () => flashScanner('scan'));
  bridge.on('error', (m) => {
    if (enrollingEmp) setEnrollMsg(m.message || 'Reader error.', 'error');
    else toast(m.message || 'Reader error.', 'err');
  });

  // Enroll events
  bridge.on('enrollProgress', (m) => updateEnrollPips(m.captured, m.needed));
  bridge.on('enrollComplete', onEnrollComplete);

  bridge.start();
}

function setReaderChip(state, label) {
  const chip = $('readerChip');
  if (!chip) return;
  chip.className = 'reader-chip ' + state;
  $('readerLabel').textContent = label;
}

function loadTemplatesIntoReader() {
  if (!bridge || !bridge.connected) return;
  bridge.loadTemplates(fpTemplates.map((t) => ({
    employeeId: t.employee_id,
    fingerIndex: t.finger_index,
    fmd: t.template,
  })));
}

function isClockViewVisible() {
  return !$('clockView').classList.contains('hidden');
}

// ---- Kiosk prompt + identify loop ----
function updateFpPrompt() {
  const prompt = $('fpPrompt');
  if (!prompt) return;
  const show = readerReady && isClockViewVisible();
  prompt.classList.toggle('hidden', !show);
}

function armIdentify() {
  if (!readerReady || !bridge || !bridge.connected || !isClockViewVisible()) return;
  identifyActive = true;
  flashScanner('');
  $('fpTitle').textContent = 'Place your finger on the reader';
  $('fpHint').textContent = 'The clock will identify you automatically.';
  bridge.identify();
}

function stopIdentify() {
  identifyActive = false;
  if (bridge && bridge.connected) bridge.cancel();
}

async function onIdentifyResult(m) {
  if (!identifyActive) return;
  if (!m.matched || !m.employeeId) {
    flashScanner('err');
    $('fpTitle').textContent = 'Not recognized';
    $('fpHint').textContent = 'Try again, or tap your name below.';
    setTimeout(() => { if (identifyActive) armIdentify(); }, 1400);
    return;
  }

  const emp = employees.find((e) => e.id === m.employeeId);
  if (!emp) { setTimeout(() => armIdentify(), 800); return; }

  identifyActive = false; // pause while we clock this person
  flashScanner('scan');
  const st = empState(emp);
  let result;
  if (st.key === 'out') result = await window.api.clockIn(emp.id);
  else if (st.key === 'in') result = await window.api.clockOut(st.rec.id);
  else { toast(`${emp.first_name} is already done for today`, 'ok'); return rearm(); }

  if (!result.ok) {
    if (result.code === 401) return handleExpired();
    toast(result.error || 'Clock action failed.', 'err');
    return rearm();
  }

  const action = st.key === 'out' ? 'clocked in' : 'clocked out';
  $('fpTitle').textContent = `${emp.first_name} ${emp.last_name} — ${action}`;
  $('fpHint').textContent = 'Thank you!';
  toast(`${emp.first_name} ${action}`, 'ok');
  await loadClockData();
  rearm();
}

function rearm() {
  setTimeout(() => { if (isClockViewVisible()) armIdentify(); }, 1600);
}

function flashScanner(cls) {
  const s = $('fpScanner');
  if (s) s.className = 'fp-scanner ' + cls;
}

// ===========================================================================
// Enrollment
// ===========================================================================
function showEnrollView() {
  stopIdentify();
  $('clockView').classList.add('hidden');
  $('signinView').classList.add('hidden');
  $('enrollView').classList.remove('hidden');
  $('enrollReaderNote').textContent = readerReady
    ? 'Reader ready — pick an employee to enroll.'
    : 'No reader connected — enrollment needs the fingerprint reader.';
  renderEnrollGrid();
}

function renderEnrollGrid() {
  const q = $('enrollSearch').value.trim().toLowerCase();
  const grid = $('enrollGrid');
  grid.innerHTML = '';
  const list = employees.filter((e) => {
    if (!q) return true;
    return `${e.first_name} ${e.last_name} ${e.department} ${e.position}`.toLowerCase().includes(q);
  });

  for (const emp of list) {
    const count = enrolledByEmp[emp.id] || 0;
    const card = document.createElement('div');
    card.className = 'emp-card';
    const initials = ((emp.first_name || '?')[0] + (emp.last_name || '')[0]).toUpperCase();
    const sub = [emp.position, emp.department].filter(Boolean).join(' · ');

    const head = document.createElement('div');
    head.className = 'emp-head';
    head.innerHTML = `
      <div class="avatar">${escapeHtml(initials)}</div>
      <div>
        <div class="emp-name">${escapeHtml(emp.first_name)} ${escapeHtml(emp.last_name)}</div>
        <div class="emp-sub">${escapeHtml(sub || '—')}</div>
      </div>`;

    const badge = document.createElement('div');
    badge.innerHTML = count > 0
      ? `<span class="enrolled-badge">✓ ${count} finger${count > 1 ? 's' : ''} enrolled</span>`
      : `<span class="enrolled-badge none">Not enrolled</span>`;

    const actions = document.createElement('div');
    actions.className = 'emp-actions';
    const enrollBtn = mkBtn(count > 0 ? 'Re-enroll' : 'Enroll', 'btn btn-primary', () => openEnrollModal(emp));
    if (!readerReady) enrollBtn.setAttribute('disabled', 'true');
    actions.appendChild(enrollBtn);
    if (count > 0) {
      const del = mkBtn('Remove', 'btn btn-ghost', () => removeEnrollment(emp));
      actions.appendChild(del);
    }

    card.append(head, badge, actions);
    grid.appendChild(card);
  }
}

function openEnrollModal(emp) {
  if (!readerReady) return toast('Reader not connected.', 'err');
  enrollingEmp = emp;
  $('enrollModalName').textContent = `Enroll — ${emp.first_name} ${emp.last_name}`;
  $('enrollModalSub').textContent = 'Place the same finger on the reader 4 times.';
  setEnrollMsg('');
  $('enrollStartBtn').disabled = false;
  $('enrollStartBtn').textContent = 'Start capture';
  updateEnrollPips(0, 4);
  $('enrollModal').classList.remove('hidden');
}

function closeEnrollModal() {
  if (bridge && bridge.connected) bridge.cancel();
  enrollingEmp = null;
  $('enrollModal').classList.add('hidden');
}

function startEnrollCapture() {
  if (!enrollingEmp || !bridge || !bridge.connected) return;
  $('enrollStartBtn').disabled = true;
  $('enrollStartBtn').textContent = 'Capturing…';
  setEnrollMsg('Place your finger…', 'ok');
  updateEnrollPips(0, 4);
  bridge.enroll(enrollingEmp.id, 0); // finger_index 0 = primary
}

function updateEnrollPips(captured, needed) {
  needed = needed || 4;
  const wrap = $('enrollScans');
  wrap.innerHTML = '';
  for (let i = 0; i < needed; i++) {
    const pip = document.createElement('div');
    pip.className = 'scan-pip' + (i < captured ? ' done' : (i === captured ? ' active' : ''));
    pip.textContent = i < captured ? '✓' : (i + 1);
    wrap.appendChild(pip);
  }
}

async function onEnrollComplete(m) {
  if (!enrollingEmp) return;
  updateEnrollPips(4, 4);
  setEnrollMsg('Saving…', 'ok');
  const r = await window.api.fpEnroll(enrollingEmp.id, m.fingerIndex ?? 0, m.fmd, m.quality || 0);
  if (!r.ok) {
    if (r.code === 401) { closeEnrollModal(); return handleExpired(); }
    return setEnrollMsg(r.error || 'Failed to save fingerprint.', 'error');
  }
  const name = enrollingEmp.first_name;
  setEnrollMsg('Enrolled ✓', 'ok');
  toast(`${name} enrolled`, 'ok');
  await loadClockData();      // refresh counts + reload reader templates
  renderEnrollGrid();
  setTimeout(closeEnrollModal, 900);
}

async function removeEnrollment(emp) {
  const r = await window.api.fpDelete(emp.id, null);
  if (!r.ok) {
    if (r.code === 401) return handleExpired();
    return toast(r.error || 'Failed to remove.', 'err');
  }
  toast(`${emp.first_name}'s fingerprints removed`, 'ok');
  await loadClockData();
  renderEnrollGrid();
}

function setEnrollMsg(text, kind) {
  const el = $('enrollModalMsg');
  el.textContent = text || '';
  el.className = 'msg' + (kind ? ' ' + kind : '');
}
