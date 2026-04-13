// Background Service Worker
console.log('Tee Time Monitor background service started');

// Listen for notification requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'sendNotification') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: message.title || 'Tee Time Alert!',
      message: message.message || 'Notification from Tee Time Monitor',
      priority: 2,
      requireInteraction: true
    }, (notificationId) => {
      console.log('Notification sent:', notificationId);
    });
    
    sendResponse({ success: true });
  }
  
  return true;
});

// Handle notification clicks
chrome.notifications.onClicked.addListener((notificationId) => {
  // Focus on the tab that sent the notification
  chrome.tabs.query({ url: '*://westchestercountyph.ezlinksgolf.com/*' }, (tabs) => {
    if (tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    }
  });
  
  chrome.notifications.clear(notificationId);
});
