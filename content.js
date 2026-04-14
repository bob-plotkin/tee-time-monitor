// content.js — Tee Time Monitor v2.10
// Injected into westchestercountyph.ezlinksgolf.com
// Handles UI, Angular-aware DOM interaction, result scanning, and booking flow.
// Does NOT reload the page — re-triggers the Angular search each cycle.

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const PANEL_ID    = 'ttm-panel';
const STORE_KEY   = 'ttmSettings';
const TARGET_HASH = '#/search';
const VERSION     = '2.17';
const BUILT       = new Date().toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });

// Course definitions: id used in storage, label shown in UI, value to match in DOM text
const COURSES = [
  { id: 'maple',     label: 'Maple Moor',   cbId: 'courseName_Maple Moor Golf Course'   },
  { id: 'mohansic',  label: 'Mohansic',     cbId: 'courseName_Mohansic Golf Course'     },
  { id: 'saxon',     label: 'Saxon Woods',  cbId: 'courseName_Saxon Woods Golf Course'  },
  { id: 'sprain',    label: 'Sprain Lake',  cbId: 'courseName_Sprain Lake Golf Course'  },
  { id: 'dunwoodie', label: 'Dunwoodie',    cbId: 'courseName_Dunwoodie Golf Course'    },
  { id: 'hudson',    label: 'Hudson Hills', cbId: 'courseName_Hudson Hills Golf Course' },
];

// Pricing option checkbox IDs (from site diagnostic)
const PASS_OPTIONS = [
  { id: 'resident', label: 'Resident',       cbId: 'priceOption', value: '17693' },
  { id: 'sr_park',  label: 'Sr. Park Pass',  cbId: 'priceOption', value: '17711' },
  { id: 'jr_park',  label: 'Jr. Park Pass',  cbId: 'priceOption', value: '17712' },
];

const DEFAULTS = {
  date:           nextDate(),
  timeFrom:       '09:00',
  timeTo:         '11:00',
  players:        2,
  courses:        ['maple', 'mohansic', 'saxon', 'sprain'],
  passType:       'sr_park',   // default: Sr. Park Passholder
  refreshSeconds: 60,
  autoBook:       true,
  debugMode:      false,
};

// ─── State ────────────────────────────────────────────────────────────────────

let CFG          = { ...DEFAULTS };   // active settings
let active       = false;             // monitoring running?
let cycleRunning = false;             // guard against concurrent runCycle calls
let cycleId      = null;              // setTimeout handle
let tickId       = null;             // countdown setInterval handle
let keepaliveId  = null;             // setInterval for session keepalive
let nextTick     = 0;                // epoch ms of next scheduled cycle

// ─── Utilities ───────────────────────────────────────────────────────────────

function nextDate() {
  // Always default to the next upcoming Saturday.
  // If today is Saturday, jump to the following Saturday.
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 6=Sat
  const daysUntilSat = (day === 6) ? 7 : (6 - day);
  d.setDate(d.getDate() + daysUntilSat);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(...a)   { console.log('[TTM]', ...a); }
function dbg(...a)   { if (CFG.debugMode) console.log('[TTM DBG]', ...a); }
function warn(...a)  { console.warn('[TTM]', ...a); }

function toMins(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function parseDisplayTime(str) {
  const m = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const mer = m[3].toUpperCase();
  if (mer === 'PM' && h !== 12) h += 12;
  if (mer === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

// Angular-safe value setter for <input> — bypasses change-detection guards
function ngSetInput(el, val) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, val);
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur',   { bubbles: true }));
}

// Angular-safe setter for <select>
function ngSetSelect(el, val) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
  setter.call(el, val);
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// ─── Storage ─────────────────────────────────────────────────────────────────

async function loadCFG() {
  return new Promise(resolve => {
    chrome.storage.local.get([STORE_KEY, 'monitorActive'], d => {
      if (d[STORE_KEY]) CFG = { ...DEFAULTS, ...d[STORE_KEY] };
      resolve(!!d.monitorActive);
    });
  });
}

function saveCFG() {
  chrome.storage.local.set({ [STORE_KEY]: CFG });
}

// ─── Panel HTML ───────────────────────────────────────────────────────────────

function buildPanel() {
  if (document.getElementById(PANEL_ID)) return;

  const courseRows = COURSES.map(c => `
    <label class="ttm-course-lbl">
      <input type="checkbox" class="ttm-cb" data-cid="${c.id}"
        ${CFG.courses.includes(c.id) ? 'checked' : ''}>
      ${c.label}
    </label>`).join('');

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.innerHTML = `
    <div class="ttm-header" id="ttm-header">
      <span>⛳ Tee Time Monitor</span>
      <button class="ttm-hdr-btn" id="ttm-min" title="Minimize">—</button>
    </div>
    <div class="ttm-body" id="ttm-body">

      <div class="ttm-row">
        <label class="ttm-lbl">Date</label>
        <input type="date" id="ttm-date" class="ttm-inp" value="${CFG.date}">
      </div>

      <div class="ttm-row">
        <label class="ttm-lbl">Time Range</label>
        <div class="ttm-flex">
          <input type="time" id="ttm-from" class="ttm-inp ttm-inp-sm" value="${CFG.timeFrom}">
          <span class="ttm-sep">–</span>
          <input type="time" id="ttm-to"   class="ttm-inp ttm-inp-sm" value="${CFG.timeTo}">
        </div>
      </div>

      <div class="ttm-row">
        <label class="ttm-lbl">Players</label>
        <select id="ttm-players" class="ttm-inp ttm-inp-sm">
          ${[1,2,3,4].map(n=>`<option value="${n}"${CFG.players==n?' selected':''}>${n}</option>`).join('')}
        </select>
      </div>

      <div class="ttm-row">
        <label class="ttm-lbl">Courses</label>
        <div class="ttm-courses">${courseRows}</div>
        <div class="ttm-course-btns">
          <button class="ttm-xs-btn" id="ttm-all">All</button>
          <button class="ttm-xs-btn" id="ttm-none">None</button>
        </div>
      </div>

      <div class="ttm-row ttm-row-inline">
        <label class="ttm-lbl">Refresh (s)</label>
        <input type="number" id="ttm-refresh" class="ttm-inp ttm-inp-xs"
          value="${CFG.refreshSeconds}" min="15" max="600">
      </div>

      <div class="ttm-row ttm-row-inline">
        <label class="ttm-lbl">Pass Type</label>
        <select id="ttm-passtype" class="ttm-inp ttm-inp-sm">
          ${PASS_OPTIONS.map(p=>`<option value="${p.id}"${CFG.passType===p.id?' selected':''}>${p.label}</option>`).join('')}
        </select>
      </div>

      <div class="ttm-row ttm-row-inline">
        <label class="ttm-lbl">Auto-Book</label>
        <label class="ttm-toggle">
          <input type="checkbox" id="ttm-autobook" ${CFG.autoBook?'checked':''}>
          <span class="ttm-slider"></span>
        </label>
      </div>

      <div class="ttm-row ttm-row-inline">
        <label class="ttm-lbl">Debug Mode</label>
        <label class="ttm-toggle">
          <input type="checkbox" id="ttm-debug" ${CFG.debugMode?'checked':''}>
          <span class="ttm-slider"></span>
        </label>
      </div>

      <div class="ttm-controls">
        <button class="ttm-btn-start" id="ttm-start">▶ Start</button>
        <button class="ttm-btn-stop  ttm-hidden" id="ttm-stop">■ Stop</button>
        <button class="ttm-btn-check" id="ttm-check">Check Now</button>
      </div>

      <div class="ttm-statusbox">
        <div id="ttm-status">Ready</div>
        <div id="ttm-countdown" class="ttm-small"></div>
        <div id="ttm-lastchk"   class="ttm-small"></div>
      </div>

      <div class="ttm-version">v${VERSION} &nbsp;·&nbsp; ${BUILT}</div>

    </div>`;

  document.body.appendChild(panel);
  wirePanel();

  // Restore minimized state
  chrome.storage.local.get('ttmMin', d => { if (d.ttmMin) setMin(true); });
}

// ─── Panel Wiring ─────────────────────────────────────────────────────────────

function wirePanel() {
  // Minimize toggle
  ge('ttm-min').onclick = () => {
    const nowMin = !ge('ttm-body').classList.contains('ttm-hidden');
    setMin(nowMin);
    chrome.storage.local.set({ ttmMin: nowMin });
  };

  // All / None
  ge('ttm-all').onclick  = () => { qsa('.ttm-cb').forEach(c=>c.checked=true);  readPanel(); };
  ge('ttm-none').onclick = () => { qsa('.ttm-cb').forEach(c=>c.checked=false); readPanel(); };

  // Monitor buttons
  ge('ttm-start').onclick = startMonitor;
  ge('ttm-stop').onclick  = stopMonitor;
  ge('ttm-check').onclick = () => runCycle(true);

  // Live-save settings
  ['ttm-date','ttm-from','ttm-to','ttm-players','ttm-refresh','ttm-passtype',
   'ttm-autobook','ttm-debug'].forEach(id => {
    ge(id)?.addEventListener('change', readPanel);
  });
  qsa('.ttm-cb').forEach(cb => cb.addEventListener('change', readPanel));
}

function ge(id)      { return document.getElementById(id); }
function qsa(sel, root) { return Array.from((root||document).querySelectorAll(sel)); }

function setMin(minimize) {
  ge('ttm-body').classList.toggle('ttm-hidden', minimize);
  ge('ttm-min').textContent = minimize ? '+' : '—';
}

function readPanel() {
  CFG.date           = ge('ttm-date').value;
  CFG.timeFrom       = ge('ttm-from').value;
  CFG.timeTo         = ge('ttm-to').value;
  CFG.players        = parseInt(ge('ttm-players').value);
  CFG.refreshSeconds = Math.max(15, parseInt(ge('ttm-refresh').value) || 60);
  CFG.passType       = ge('ttm-passtype').value;
  CFG.autoBook       = ge('ttm-autobook').checked;
  CFG.debugMode      = ge('ttm-debug').checked;
  CFG.courses        = qsa('.ttm-cb:checked').map(cb => cb.dataset.cid);
  saveCFG();
}

// ─── Status Helpers ───────────────────────────────────────────────────────────

function setStatus(msg, cls = '') {
  const el = ge('ttm-status');
  if (el) { el.textContent = msg; el.className = cls; }
  chrome.runtime.sendMessage({ action: 'statusUpdate', status: msg }).catch(()=>{});
  log(msg);
}

function syncBtns() {
  ge('ttm-start')?.classList.toggle('ttm-hidden',  active);
  ge('ttm-stop')?.classList.toggle('ttm-hidden',  !active);
}

function startCountdown() {
  clearInterval(tickId);
  nextTick = Date.now() + CFG.refreshSeconds * 1000;
  tickId = setInterval(() => {
    const rem = Math.max(0, Math.ceil((nextTick - Date.now()) / 1000));
    const el = ge('ttm-countdown');
    if (el) el.textContent = active ? `Next check: ${rem}s` : '';
    if (rem === 0) clearInterval(tickId);
  }, 500);
}

// ─── Monitor Control ──────────────────────────────────────────────────────────

async function startMonitor() {
  readPanel();
  if (CFG.courses.length === 0) { setStatus('⚠ Select at least one course', 'ttm-warn'); return; }

  active = true;
  syncBtns();
  chrome.storage.local.set({ monitorActive: true });
  chrome.runtime.sendMessage({ action: 'startMonitoring', settings: CFG });

  startKeepalive();   // keep session alive between cycles
  setStatus('▶ Monitoring started…');
  await runCycle();
  scheduleNext();
}

function stopMonitor() {
  log('stopMonitor called', active ? '(was active)' : '(already stopped)');
  active = false;
  clearTimeout(cycleId);
  clearInterval(tickId);
  stopKeepalive();
  syncBtns();

  const cd = ge('ttm-countdown');
  if (cd) cd.textContent = '';

  chrome.storage.local.set({ monitorActive: false });
  chrome.runtime.sendMessage({ action: 'stopMonitoring' });
  setStatus('■ Stopped');
}

function scheduleNext() {
  if (!active) return;
  clearTimeout(cycleId);
  startCountdown();
  cycleId = setTimeout(async () => {
    if (active) { await runCycle(); scheduleNext(); }
  }, CFG.refreshSeconds * 1000);
}

// ─── Session Keepalive ────────────────────────────────────────────────────────
// Pings /api/search/init every 30s to prevent the site session from expiring.
// Uses fetch with credentials:include so the session cookie is sent.
const KEEPALIVE_INTERVAL = 30 * 1000; // 30 seconds

function startKeepalive() {
  stopKeepalive();
  keepaliveId = setInterval(pingSession, KEEPALIVE_INTERVAL);
  log('Session keepalive started (every 30s)');
}

function stopKeepalive() {
  if (keepaliveId) { clearInterval(keepaliveId); keepaliveId = null; }
}

async function pingSession() {
  try {
    const res = await fetch('/api/search/init', {
      method: 'GET',
      credentials: 'include',   // send session cookie
      cache: 'no-store'
    });
    dbg('Keepalive ping:', res.status, res.ok ? 'OK' : 'failed');
  } catch (e) {
    dbg('Keepalive ping error:', e.message);
  }
}

// ─── Core Cycle ───────────────────────────────────────────────────────────────

async function runCycle(manual = false) {
  if (cycleRunning) {
    dbg('runCycle skipped — previous cycle still running');
    return;
  }
  cycleRunning = true;
  log(`Cycle start — date:${CFG.date} from:${CFG.timeFrom} to:${CFG.timeTo} players:${CFG.players} courses:[${CFG.courses}]`);
  setStatus('🔍 Searching…');

  try {
    // 1. Apply static filters (date, players, courses, pass type)
    await applyFilters();

    // 2. Force a fresh search and wait for results to settle (9s)
    //    forceSearchRefresh() includes its own full wait — scan only after it returns
    await forceSearchRefresh();

    // 3. Scan rendered results — guaranteed to run after full 9s refresh wait
    const matches = findMatches();
    const now = new Date().toLocaleTimeString();
    const el = ge('ttm-lastchk');
    if (el) el.textContent = `Last: ${now}`;
    chrome.storage.local.set({ lastCheck: Date.now() });

    if (matches.length === 0) {
      setStatus(`No matches found (${now})`);
      return;
    }

    const desc = matches.map(m => m.timeStr + (m.course ? ` @ ${m.course}` : '')).join(', ');
    setStatus(`✅ Found: ${desc}`, 'ttm-success');

    if (CFG.debugMode) {
      log(`DEBUG — found matches but NOT booking: ${desc}`);
      setStatus(`[DEBUG] ${desc}`, 'ttm-debug');
      return;
    }

    if (!CFG.autoBook) {
      // Alert only — don't auto-book
      chrome.runtime.sendMessage({ action: 'bookingSuccess', details: `Available: ${desc}` });
      playSuccess();
      stopMonitor();
      return;
    }

    // 4. Book first match
    setStatus(`Booking ${matches[0].timeStr}…`);
    const booked = await doBook(matches[0]);

    if (booked) {
      playSuccess();
      chrome.runtime.sendMessage({
        action: 'bookingSuccess',
        details: `${matches[0].timeStr}${matches[0].course ? ' at ' + matches[0].course : ''}`
      });
      stopMonitor();
    } else {
      // Booking failed (e.g. membership issue on this slot) — keep monitoring
      // and try again next cycle. The site will show different available times.
      const now = new Date().toLocaleTimeString();
      setStatus(`⚠ Booking failed (${now}) — retrying next cycle`, 'ttm-warn');
      log('Booking failed — continuing to monitor');
    }

  } catch (err) {
    warn('Cycle error:', err);
    setStatus(`Error: ${err.message}`, 'ttm-warn');
  } finally {
    cycleRunning = false;
  }
}

// ─── Filter Application ───────────────────────────────────────────────────────
//
// The ezlinksgolf site is an Angular SPA. We must trigger Angular's change
// detection by using the native property setter + dispatching synthetic events.
// All selector attempts are logged in debug mode so failures are diagnosable.

async function applyFilters() {
  log('Applying search filters…');

  // ── Date ─────────────────────────────────────────────────────────────────
  // Confirmed: input#pickerDate, jQuery datepicker, format MM/DD/YYYY
  const [yr, mo, dy] = CFG.date.split('-');
  const mmddyyyy = `${mo}/${dy}/${yr}`;

  const dateInput = document.getElementById('pickerDate')
    || document.getElementById('mobilePickerDate');

  if (dateInput) {
    dateInput.value = mmddyyyy;
    // jQuery datepicker is on the page — use its API to set the date properly
    // This fires the datepicker's onSelect callback which updates Angular scope
    try {
      window.jQuery(dateInput).datepicker('setDate', new Date(+yr, +mo - 1, +dy));
      dbg('Date set via jQuery datepicker:', mmddyyyy);
    } catch (e) {
      dbg('jQuery datepicker.setDate failed:', e.message);
      // Fallback: fire change events and force Angular digest
      dateInput.dispatchEvent(new Event('change', { bubbles: true }));
      dateInput.dispatchEvent(new Event('blur',   { bubbles: true }));
    }
    // Belt-and-suspenders: also trigger Angular digest
    try {
      const scope = angular.element(dateInput).scope()
        || angular.element(document.body).scope();
      if (scope) scope.$apply();
    } catch (_) {}
    log('Date set to:', mmddyyyy);
  } else {
    warn('Date input not found (looked for #pickerDate, #mobilePickerDate)');
    dbg('All inputs:', qsa('input').map(i => `${i.type}#${i.id}`));
  }

  await sleep(400);

  // ── Players ───────────────────────────────────────────────────────────────
  // The site uses a custom Bootstrap dropdown for player count (not a <select>).
  // Structure: .btn.btn-white.dropdown-toggle > SPAN.ng-binding (current value)
  //            .dropdown-menu > A.ng-binding (options: 1, 2, 3, 4)
  const target = CFG.players;

  // Read current value from the dropdown toggle span
  const toggleBtn = document.querySelector('.btn.btn-white.dropdown-toggle');
  const currentSpan = toggleBtn?.querySelector('span.ng-binding');
  const current = parseInt(currentSpan?.textContent?.trim()) || 0;
  dbg('Players dropdown: current=', current, 'target=', target);

  if (current !== target) {
    if (!toggleBtn) {
      warn('Players dropdown toggle not found');
    } else {
      // Open the dropdown
      toggleBtn.click();
      await sleep(300);

      // Find and click the option matching target count
      // Use MouseEvent dispatch to avoid CSP javascript: href violation
      const options = qsa('.dropdown-menu a.ng-binding');
      dbg('Dropdown options:', options.map(a => a.textContent.trim()));
      const opt = options.find(a => parseInt(a.textContent.trim()) === target);
      if (opt) {
        opt.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        log('Players set to:', target);
        await sleep(300);
      } else {
        warn('Player option not found for:', target);
        // Close dropdown without selecting
        toggleBtn.click();
        await sleep(150);
      }
    }
  } else {
    log('Players already at target:', target);
  }

  await sleep(300);

  // ── Course Checkboxes ─────────────────────────────────────────────────────
  // Confirmed exact IDs: courseName_<Full Course Name>
  for (const course of COURSES) {
    const cb = document.getElementById(course.cbId);
    if (!cb) { warn('Course checkbox not found:', course.cbId); continue; }
    const shouldCheck = CFG.courses.includes(course.id);
    dbg(`Course "${course.label}": now=${cb.checked} want=${shouldCheck}`);
    if (cb.checked !== shouldCheck) {
      cb.click();   // .click() fires all bound handlers including Angular's
      await sleep(80);
    }
  }
  log('Courses applied:', CFG.courses);

  await sleep(200);

  // ── Pricing / Pass Type ───────────────────────────────────────────────────
  // Confirmed IDs: all share id="priceOption", distinguished by value
  // 17693=Resident, 17711=Sr.Park, 17712=Jr.Park
  const wantedPass = PASS_OPTIONS.find(p => p.id === CFG.passType);
  if (wantedPass) {
    const allPriceCbs = qsa('input[id="priceOption"]');
    dbg('Price option checkboxes found:', allPriceCbs.length,
      allPriceCbs.map(cb => `val=${cb.value} checked=${cb.checked}`));
    for (const cb of allPriceCbs) {
      const shouldCheck = (cb.value === wantedPass.value);
      if (cb.checked !== shouldCheck) {
        cb.click();
        await sleep(80);
        dbg(`PriceOption ${cb.value} → ${shouldCheck}`);
      }
    }
    log('Pass type applied:', wantedPass.label);
  }

  await sleep(300);

  // ── Time Range Slider ─────────────────────────────────────────────────────
  // Site uses ngrs-range-slider (Angular Range Slider directive).
  // Values are in minutes since midnight: 300=5AM, 1140=7PM, 540=9AM, 660=11AM
  await setTimeSlider();

  // Give Angular time to finish any search triggered by the slider change
  // before the course checkbox toggle fires the final search
  await sleep(1500);

  // Filters applied — forceSearchRefresh() will trigger the actual search in runCycle
}

// ─── Time Slider ──────────────────────────────────────────────────────────────
// Content scripts cannot access the page's 'angular' global (isolated world).
// Delegates to background.js which uses executeScript(world:'MAIN') to reach it.
// Confirmed scope props: modelMin/modelMax, bounds: min=300 (5AM) max=1140 (7PM)

async function setTimeSlider() {
  const SLIDER_MIN = 300;
  const SLIDER_MAX = 1140;
  const fromMins = Math.max(SLIDER_MIN, toMins(CFG.timeFrom));
  const toMins_  = Math.min(SLIDER_MAX, toMins(CFG.timeTo));

  return new Promise(resolve => {
    chrome.runtime.sendMessage(
      { action: 'setTimeSlider', fromMins, toMins: toMins_ },
      response => {
        if (chrome.runtime.lastError) {
          dbg('Time slider msg error:', chrome.runtime.lastError.message);
        } else if (response?.ok) {
          log(`Time slider set: ${CFG.timeFrom}–${CFG.timeTo} (${fromMins}–${toMins_})`);
          if (response.parentKeys?.length) dbg('Parent scope time keys:', response.parentKeys);
        } else {
          dbg('Time slider not set:', response?.reason || 'no response');
        }
        resolve();
      }
    );
  });
}

// ─── Force Search Refresh ─────────────────────────────────────────────────────
// Bumps the end time by +1 hour then immediately restores it.
// Each change triggers Angular's search pipeline, guaranteeing fresh results.

async function forceSearchRefresh() {
  // Strategy: toggle the FIRST selected course checkbox off then back on.
  // We confirmed course checkboxes reliably trigger Angular's search pipeline.
  // Sequence: uncheck → wait 1s → recheck → wait 9s for results to render.

  const firstCourse = COURSES.find(c => CFG.courses.includes(c.id));
  if (!firstCourse) {
    dbg('No courses selected — cannot toggle for refresh');
    setStatus('⏳ Waiting for results…');
    await sleep(9000);
    return;
  }

  const cb = document.getElementById(firstCourse.cbId);
  if (!cb) {
    dbg('Course checkbox not found for refresh toggle:', firstCourse.cbId);
    setStatus('⏳ Waiting for results…');
    await sleep(9000);
    return;
  }

  setStatus('🔄 Refreshing search…');
  log(`Search refresh: toggling "${firstCourse.label}" checkbox`);

  // Uncheck → triggers Angular search (results temporarily change)
  cb.click();
  await sleep(1000);

  // Re-check → triggers Angular search with full correct filter set
  cb.click();
  log('Search refresh: checkbox restored — waiting 9s for results');

  // Wait for fresh results to fully render
  setStatus('⏳ Waiting for results…');
  await sleep(9000);
  log('Search refresh complete');
}

// ─── Wait for Results ─────────────────────────────────────────────────────────

async function waitForResults() {
  // Poll until the Angular search pipeline completes.
  // Watch for: (a) a loading spinner to appear then clear,
  //            (b) VIEW buttons to appear in results,
  //            (c) hard timeout of 10s.
  const SPINNER = '.loading, .spinner, [class*="loading"], [ng-show*="loading"]';

  // Brief initial wait for Angular to kick off the request
  await sleep(800);

  // Wait for spinner to appear (up to 2s) then disappear (up to 8s)
  let spinnerSeen = false;
  for (let i = 0; i < 20; i++) {
    const spinner = document.querySelector(SPINNER);
    const visible = spinner && getComputedStyle(spinner).display !== 'none';
    if (visible) { spinnerSeen = true; }
    if (spinnerSeen && !visible) break;  // spinner appeared and cleared
    // Also stop waiting if VIEW buttons are present and no spinner
    if (!spinnerSeen && qsa('button').some(b => /^view$/i.test(b.textContent.trim()))) break;
    await sleep(500);
  }

  // Final settle
  await sleep(500);
}

// ─── Result Scanning ──────────────────────────────────────────────────────────

function findMatches() {
  const fromMins     = toMins(CFG.timeFrom);
  const toMins_      = toMins(CFG.timeTo);
  const wantedCourses = COURSES
    .filter(c => CFG.courses.includes(c.id))
    .map(c => c.label.toLowerCase());

  // ── Strategy 1: ng-repeat cards (confirmed from screenshot) ───────────────
  // The site renders results as cards via ng-repeat. Each card has:
  //   - A header div with the course name
  //   - A large time element
  //   - A "VIEW" button
  // We anchor on VIEW buttons and walk up to the card container.

  // Prefer <button> elements; include <a> but will use MouseEvent to avoid
  // CSP violation from javascript: href navigation on anchor clicks
  const viewBtns = qsa('button, a').filter(b => /^view$/i.test(b.textContent.trim()));
  dbg('VIEW buttons found:', viewBtns.length);

  const matches = [];

  for (const btn of viewBtns) {
    // Walk up to the card container (stops at ng-repeat element)
    const card = btn.closest('[ng-repeat]') || btn.closest('.col-xs-3, .col-sm-3, .result-card, .tee-time-card')
      || btn.parentElement?.parentElement;
    if (!card) { dbg('No card container for VIEW btn'); continue; }

    const cardText = card.textContent;

    // Extract time from card
    const timeMatch = cardText.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/i);
    if (!timeMatch) { dbg('No time in card:', cardText.slice(0,60)); continue; }

    const timeMins = parseDisplayTime(timeMatch[0]);
    if (timeMins === null || timeMins < fromMins || timeMins > toMins_) {
      dbg(`Time ${timeMatch[0]} (${timeMins}m) outside range [${fromMins}-${toMins_}]`);
      continue;
    }

    // Extract course from card — course name is in card header text
    const cardLower = cardText.toLowerCase();
    const course = wantedCourses.find(c => cardLower.includes(c));
    if (wantedCourses.length > 0 && !course) {
      dbg(`Card course not in wanted list. Card text: ${cardText.slice(0,80)}`);
      continue;
    }

    dbg(`MATCH: ${timeMatch[0]} @ ${course || 'any'}`);
    matches.push({ timeStr: timeMatch[0], timeMins, course: course || null, btn, card });
  }

  // ── Strategy 2: ng-repeat rows (fallback if card structure differs) ────────
  if (matches.length === 0 && viewBtns.length === 0) {
    dbg('No VIEW buttons — falling back to ng-repeat scan');
    for (const row of qsa('[ng-repeat]')) {
      const m = extractMatch(row, fromMins, toMins_, wantedCourses);
      if (m) matches.push(m);
    }
  }

  log(`Found ${matches.length} matches`, matches.map(m => `${m.timeStr}@${m.course}`));
  return matches;
}

function extractMatch(container, fromMins, toMins_, wantedCourses) {
  const text = container.textContent;
  const tm = text.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/i);
  if (!tm) return null;

  const timeMins = parseDisplayTime(tm[0]);
  if (timeMins === null || timeMins < fromMins || timeMins > toMins_) return null;

  const ctxt = text.toLowerCase();
  const course = wantedCourses.find(c => ctxt.includes(c));
  if (wantedCourses.length > 0 && !course) return null;

  const btn = bookBtnIn(container);
  if (!btn) return null;

  return { timeStr: tm[0], timeMins, course: course || null, btn, container };
}

function bookBtnIn(el) {
  if (!el) return null;
  return qsa('button, a, input[type="button"], input[type="submit"]', el)
    .find(b => /book|view|reserve|select|tee/i.test(b.textContent + b.value + (b.getAttribute('href')||'')));
}

// ─── Booking Flow ─────────────────────────────────────────────────────────────

async function doBook(match) {
  log('Booking:', match.timeStr, match.course || '');

  // Step 1: click VIEW button — use MouseEvent to avoid CSP javascript: href issue
  // VIEW elements may be <a href="javascript:..."> which .click() tries to navigate
  const safeClick = (el) => {
    if (el.tagName === 'A') {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    } else {
      el.click();
    }
  };
  safeClick(match.btn);
  dbg('Clicked VIEW for:', match.timeStr, match.course);
  await sleep(1800);

  // Step 2: Handle the "Choose Option(s)" player-type dialog.
  // This is a REQUIRED booking step — not an error.
  // The dialog asks which pass type each player holds.
  const chooseDialog = detectDialog('Choose Option');
  if (chooseDialog) {
    log('"Choose Option(s)" dialog — selecting pass type');
    const handled = await handleChooseOptionsDialog();
    if (!handled) {
      warn('Could not handle Choose Options dialog — aborting this slot');
      dismissAnyDialog();
      return false;
    }
    await sleep(1200);
  }

  // Step 3: Walk the confirmation wizard (up to 6 steps)
  for (let step = 0; step < 6; step++) {
    dbg(`Wizard step ${step} — URL: ${window.location.hash}`);

    // Detect "Membership Issue" error modal (different from Choose Options)
    const membershipErr = detectDialog('Membership Issue');
    if (membershipErr) {
      warn('Membership Issue modal — this slot needs a different membership');
      dismissAnyDialog();
      return false;
    }

    // Detect success — page heading changes on confirmation
    const hdrs = qsa('h1,h2,h3').map(h => h.textContent.trim());
    dbg('Page headings:', hdrs);
    if (hdrs.some(h => /confirm|success|booked|thank|receipt|complete/i.test(h))) {
      log('Booking confirmed! Headings:', hdrs);
      return true;
    }
    // Also detect by URL hash change
    if (/confirm|receipt|complete|success/i.test(window.location.hash)) {
      log('Booking confirmed via URL:', window.location.hash);
      return true;
    }

    // Find next action button — prefer most specific first
    const contBtn =
      findByText('button', /^finish reservation$/i) ||
      findByText('button', /^(continue|next|confirm|complete|finalize|book now|reserve|add to cart|finish)$/i) ||
      findFirst(['button[type="submit"]', 'input[type="submit"]']);

    if (!contBtn) {
      dbg(`Step ${step}: no action button found — checking if already done`);
      // If we are on the payment/finish page with no button visible, may be done
      if (/payment|finish|confirm/i.test(window.location.hash)) return true;
      break;
    }

    log(`Step ${step}: clicking "${contBtn.textContent.trim()}"`);
    contBtn.click();
    await sleep(2000);
  }

  // Fallback — reached end of wizard steps without confirmed success or error.
  // Return false to keep monitoring rather than stopping on an uncertain state.
  warn('Booking flow: no confirmation detected — keeping monitor running');
  return false;
}

// Handle the "Choose Option(s)" dialog that appears after clicking VIEW.
// The dialog asks: how many players? (native select: values "number:1".."number:4")
// It also has a Bootstrap dropdown showing the same value visually.
// Our panel selects (ttm-players, ttm-passtype) leak into the DOM query, so
// we identify the real dialog select by its option value format "number:N".
async function handleChooseOptionsDialog() {
  const target = CFG.players;

  // ── Find the player-count select (value format: "number:N") ──────────────
  // Exclude our own panel selects which have ids starting with "ttm-"
  const playerSelect = Array.from(document.querySelectorAll('select'))
    .find(s => !s.id.startsWith('ttm') && 
               Array.from(s.options).some(o => /^number:\d/.test(o.value)));

  if (playerSelect) {
    const targetValue = `number:${target}`;
    dbg('Dialog player select options:', Array.from(playerSelect.options).map(o => o.value + ':' + o.text.trim()));
    ngSetSelect(playerSelect, targetValue);
    log(`Dialog: player count set to ${target} (value="${targetValue}")`);
    await sleep(200);
  } else {
    // Fallback: use the Bootstrap dropdown inside the dialog
    dbg('No player select found — trying Bootstrap dropdown');
    const toggleBtn = document.querySelector('.modal .btn.btn-white.dropdown-toggle, [role="dialog"] .btn.btn-white.dropdown-toggle')
      || document.querySelector('.btn.btn-white.dropdown-toggle');
    if (toggleBtn) {
      const current = parseInt(toggleBtn.textContent.trim()) || 0;
      dbg('Dialog dropdown current:', current, 'target:', target);
      if (current !== target) {
        toggleBtn.click();
        await sleep(300);
        // A links with single digit text are the player count options
        const opts = qsa('a.ng-binding').filter(a => /^[1-4]$/.test(a.textContent.trim()));
        const opt  = opts.find(a => parseInt(a.textContent.trim()) === target);
        if (opt) { opt.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); await sleep(200); }
        else warn('Dialog dropdown option not found for:', target);
      }
    } else {
      warn('Could not find player count control in dialog');
    }
  }

  await sleep(300);

  // ── Click Continue ────────────────────────────────────────────────────────
  // The Continue button has class "primary-btn" in this dialog
  const contBtn = document.querySelector('button.primary-btn')
    || findByText('button', /^(continue|ok|next|confirm)$/i);
  if (contBtn) {
    log('Clicking dialog button:', contBtn.textContent.trim());
    contBtn.click();
    return true;
  }
  warn('No Continue button found in Choose Options dialog');
  return false;
}

// Detect a visible dialog/modal whose title contains the given text
function detectDialog(titleText) {
  const candidates = qsa(
    '.modal, [class*="modal"], [role="dialog"], [role="alertdialog"], .dialog, [class*="dialog"]'
  );
  for (const el of candidates) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
    const text = el.textContent;
    if (new RegExp(titleText, 'i').test(text)) return { el, text: text.slice(0, 200) };
  }
  return null;
}

function dismissAnyDialog() {
  const okBtn = findByText('button', /^(ok|close|dismiss|cancel)$/i);
  if (okBtn) { okBtn.click(); dbg('Dismissed dialog'); }
}

// ─── Audio ────────────────────────────────────────────────────────────────────

function playSuccess() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Three ascending tones: C5 → E5 → G5 (pleasant chime)
    [[523.25, 0.0, 0.35],
     [659.25, 0.3, 0.35],
     [783.99, 0.6, 0.60]].forEach(([freq, start, dur]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + start;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.45, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    });
  } catch (e) {
    warn('Audio error:', e);
  }
}

// ─── DOM Helpers ──────────────────────────────────────────────────────────────

function findFirst(selectors) {
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) return el;
    } catch (_) {}
  }
  return null;
}

function findByText(tag, regex) {
  return qsa(tag).find(el => regex.test(el.textContent.trim()));
}

function labelFor(input) {
  // Check wrapping <label>, then for= attribute, then aria-label, then value
  const wrap = input.closest('label');
  if (wrap) return wrap.textContent.trim();
  if (input.id) {
    const lbl = document.querySelector(`label[for="${input.id}"]`);
    if (lbl) return lbl.textContent.trim();
  }
  return input.getAttribute('aria-label') || input.value || input.name || '';
}

// ─── Message Handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg.action === 'runCycle') {
    runCycle().then(() => respond({ ok: true }));
    return true;
  }
  if (msg.action === 'playSuccess') {
    playSuccess();
    respond({ ok: true });
  }
  if (msg.action === 'stopMonitoring') {
    stopMonitor();
    respond({ ok: true });
  }
});

// ─── Initialisation ───────────────────────────────────────────────────────────

async function init() {
  log('Content script init');

  // Wait for the Angular app to bootstrap (SPA loads async)
  for (let i = 0; i < 20; i++) {
    if (document.querySelector('[ng-app],[ng-controller],.ng-scope,[data-ng-app],[ui-view],ion-app')) {
      await sleep(600);
      break;
    }
    await sleep(400);
  }

  const wasActive = await loadCFG();
  buildPanel();

  if (wasActive) {
    log('Resuming monitoring after page load');
    active = true;
    syncBtns();
    setStatus('Resuming…');
    await sleep(800);
    await runCycle();
    scheduleNext();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
