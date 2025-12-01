// Content script - runs on chat pages
// This file is mainly for future enhancements
// Current extraction happens via executeScript in popup.js

console.log('Chat Exporter: Content script loaded');

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractChat') {
    try {
      const chatData = extractConversation();
      sendResponse({ success: true, data: chatData });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }
  return true;
});
