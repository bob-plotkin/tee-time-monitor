// background.js — Service Worker (MV3)
// Owns the alarm cycle, notifications, and tab management.

const ALARM_NAME  = 'ttm-cycle';
const TARGET_URL  = 'https://westchestercountyph.ezlinksgolf.com/index.html#/search';

console.log('[TTM BG] Service worker started');

// ─── Alarm ───────────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  const { monitorActive } = await chrome.storage.local.get('monitorActive');
  if (!monitorActive) {
    chrome.alarms.clear(ALARM_NAME);
    return;
  }

  console.log('[TTM BG] Alarm fired — triggering cycle');
  await triggerCycle();
});

async function triggerCycle() {
  const tabs = await chrome.tabs.query({
    url: 'https://westchestercountyph.ezlinksgolf.com/*'
  });

  if (tabs.length === 0) {
    // No tab open — open one and the content script will auto-resume
    chrome.tabs.create({ url: TARGET_URL, active: false });
    return;
  }

  try {
    await chrome.tabs.sendMessage(tabs[0].id, { action: 'runCycle' });
  } catch (e) {
    // Content script not responding — reload the tab; it will resume from storage
    console.log('[TTM BG] Content script unreachable, reloading tab:', e.message);
    chrome.tabs.reload(tabs[0].id);
  }
}

// ─── Messages ─────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, respond) => {

  if (msg.action === 'startMonitoring') {
    handleStart(msg.settings).then(() => respond({ ok: true }));
    return true;
  }

  if (msg.action === 'stopMonitoring') {
    handleStop().then(() => respond({ ok: true }));
    return true;
  }

  if (msg.action === 'bookingSuccess') {
    handleSuccess(msg.details, sender.tab);
    respond({ ok: true });
  }

  if (msg.action === 'statusUpdate') {
    chrome.storage.local.set({ lastStatus: msg.status, lastCheck: Date.now() });
    respond({ ok: true });
  }

  if (msg.action === 'getState') {
    chrome.storage.local
      .get(['monitorActive', 'ttmSettings', 'lastStatus', 'lastCheck'])
      .then(state => respond(state));
    return true;
  }

  // Set the ngrs-range-slider via MAIN world (content scripts can't access
  // page-level 'angular' global — only executeScript with world:MAIN can)
  if (msg.action === 'setTimeSlider') {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world:  'MAIN',
      func: (fromMins, toMins) => {
        try {
          const sliders = document.querySelectorAll('.ngrs-range-slider');
          if (!sliders.length) return { ok: false, reason: 'no slider found' };

          const isolate = angular.element(sliders[0]).isolateScope();
          if (!isolate) return { ok: false, reason: 'no isolate scope' };

          // Step 1: set modelMin/modelMax to move the visual handles
          isolate.$apply(() => {
            isolate.modelMin = fromMins;
            isolate.modelMax = toMins;
          });

          // Step 2: call onHandleUp — this is what fires when the user releases
          // a handle. It propagates the new values to the parent (search controller)
          // scope and triggers the search. Without this the slider moves visually
          // but the search doesn't re-run.
          if (typeof isolate.onHandleUp === 'function') {
            isolate.onHandleUp();
          }

          // Step 3: log parent scope time keys for diagnosis
          const parentScope = angular.element(sliders[0]).scope();
          const parentKeys = parentScope && parentScope !== isolate
            ? Object.keys(parentScope).filter(k =>
                !k.startsWith('$') && /time|from|to|start|end|min|max/i.test(k)
              ).slice(0, 10)
            : [];

          return { ok: true, parentKeys };
        } catch(e) {
          return { ok: false, reason: e.message };
        }
      },
      args: [msg.fromMins, msg.toMins]
    })
    .then(results => respond(results?.[0]?.result || { ok: false, reason: 'no result' }))
    .catch(e  => respond({ ok: false, reason: e.message }));
    return true; // async response
  }
});

async function handleStart(settings) {
  const periodMinutes = Math.max(0.25, (settings.refreshSeconds || 60) / 60);
  await chrome.storage.local.set({
    monitorActive: true,
    ttmSettings:   settings,
    lastStatus:    'Monitoring started'
  });
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes:  periodMinutes,
    periodInMinutes: periodMinutes
  });
  console.log(`[TTM BG] Started — interval ${settings.refreshSeconds}s`);
}

async function handleStop() {
  await chrome.storage.local.set({ monitorActive: false, lastStatus: 'Stopped' });
  await chrome.alarms.clear(ALARM_NAME);
  console.log('[TTM BG] Stopped');
}

async function handleSuccess(details, tab) {
  await handleStop();

  chrome.notifications.create('ttm-success', {
    type: 'basic',
    iconUrl: 'icon.png',
    title: '⛳ Tee Time Booked!',
    message: details || 'Your tee time has been reserved. Check your email.',
    priority: 2,
    requireInteraction: true
  });

  // Ask content script to play the audio chime (service workers can't play audio)
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { action: 'playSuccess' }).catch(() => {});
  }

  console.log('[TTM BG] Booking success:', details);
}

// ─── Notification click → focus tab ──────────────────────────────────────────

chrome.notifications.onClicked.addListener((id) => {
  chrome.tabs.query({ url: '*://westchestercountyph.ezlinksgolf.com/*' }, (tabs) => {
    if (tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    }
  });
  chrome.notifications.clear(id);
});
