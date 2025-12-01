// Background service worker
// Handles extension lifecycle and coordination

chrome.runtime.onInstalled.addListener(() => {
  console.log('Chat Exporter extension installed');
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadPDF') {
    // Handle PDF download coordination if needed
    sendResponse({ success: true });
  }
  return true;
});
