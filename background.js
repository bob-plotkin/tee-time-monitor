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
