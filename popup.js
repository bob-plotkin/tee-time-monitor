// popup.js

document.addEventListener('DOMContentLoaded', async () => {
  // Ask background for current state
  const state = await new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'getState' }, resolve);
  });

  const active = state?.monitorActive;
  const pStatus = document.getElementById('pStatus');
  pStatus.textContent = active ? 'Monitoring' : 'Stopped';
  pStatus.className   = 'val ' + (active ? 'on' : 'off');

  if (state?.lastCheck) {
    document.getElementById('pLastCheck').textContent =
      new Date(state.lastCheck).toLocaleTimeString();
  }

  if (state?.lastStatus) {
    document.getElementById('pLastStatus').textContent =
      state.lastStatus.slice(0, 60);
  }

  document.getElementById('btnOpen').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://westchestercountyph.ezlinksgolf.com/index.html#/search' });
    window.close();
  });

  document.getElementById('btnClear').addEventListener('click', async () => {
    if (confirm('Clear all saved settings?')) {
      await chrome.storage.local.clear();
      alert('Cleared.');
      window.close();
    }
  });
});
