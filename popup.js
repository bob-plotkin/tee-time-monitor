// Popup Script
document.addEventListener('DOMContentLoaded', async () => {
  // Check monitoring status
  const state = await chrome.storage.local.get(['monitorActive', 'settings']);
  
  const statusEl = document.getElementById('monitorStatus');
  if (state.monitorActive) {
    statusEl.textContent = 'Active';
    statusEl.className = 'status-value active';
  } else {
    statusEl.textContent = 'Not Active';
    statusEl.className = 'status-value inactive';
  }
  
  // Show last check time if available
  if (state.settings && state.settings.lastCheck) {
    document.getElementById('lastCheck').textContent = new Date(state.settings.lastCheck).toLocaleString();
  }
  
  // Open site button
  document.getElementById('openSite').addEventListener('click', () => {
    chrome.tabs.create({
      url: 'https://westchestercountyph.ezlinksgolf.com/index.html#/search'
    });
    window.close();
  });
  
  // Clear settings button
  document.getElementById('clearSettings').addEventListener('click', async () => {
    if (confirm('This will clear all saved settings. Continue?')) {
      await chrome.storage.local.clear();
      alert('Settings cleared!');
      window.close();
    }
  });
});
