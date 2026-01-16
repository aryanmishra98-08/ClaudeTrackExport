/**
 * Claude Track & Export - Background Service Worker
 * Handles background tasks, storage management, and message passing
 */

// Storage keys
const STORAGE_KEYS = {
  USAGE_DATA: 'claude_track_export_data',
  SETTINGS: 'claude_track_export_settings',
  EXPORT_HISTORY: 'claude_track_export_history',
  SESSION_METRICS: 'claude_track_export_session_metrics'
};

// Default settings
const DEFAULT_SETTINGS = {
  autoRefresh: true,
  autoOpenNewChat: true,
  copyToClipboard: true,
  showNotifications: true,
  playSoundNotifications: true
};

// Initialize extension on install
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Claude Track] Extension installed:', details.reason);
  
  if (details.reason === 'install') {
    // Set default settings
    await chrome.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS,
      [STORAGE_KEYS.EXPORT_HISTORY]: [],
      [STORAGE_KEYS.SESSION_METRICS]: {
        totalRefreshes: 0,
        totalExports: 0,
        lastRefreshTime: null
      }
    });
    
    console.log('[Claude Track] Default settings initialized');
  }
  
  if (details.reason === 'update') {
    console.log('[Claude Track] Extension updated to version:', chrome.runtime.getManifest().version);
  }
});

// Message handler for communication with content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Claude Track] Message received:', message.type);
  
  switch (message.type) {
    case 'GET_SETTINGS':
      handleGetSettings(sendResponse);
      return true; // Keep channel open for async response
      
    case 'SAVE_SETTINGS':
      handleSaveSettings(message.data, sendResponse);
      return true;
      
    case 'LOG_EXPORT':
      handleLogExport(message.data, sendResponse);
      return true;
      
    case 'LOG_REFRESH':
      handleLogRefresh(sendResponse);
      return true;
      
    case 'GET_EXPORT_HISTORY':
      handleGetExportHistory(sendResponse);
      return true;
      
    case 'GET_SESSION_METRICS':
      handleGetSessionMetrics(sendResponse);
      return true;
      
    case 'CLEAR_DATA':
      handleClearData(sendResponse);
      return true;
      
    case 'SEND_NOTIFICATION':
      handleSendNotification(message.data, sendResponse);
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
      return true; // Keep channel open for async response
  }
});

// Handler functions
async function handleGetSettings(sendResponse) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    const settings = result[STORAGE_KEYS.SETTINGS] || DEFAULT_SETTINGS;
    sendResponse({ success: true, data: settings });
  } catch (error) {
    console.error('[Claude Track] Error getting settings:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleSaveSettings(data, sendResponse) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: data });
    sendResponse({ success: true });
  } catch (error) {
    console.error('[Claude Track] Error saving settings:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleLogExport(data, sendResponse) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.EXPORT_HISTORY);
    const history = result[STORAGE_KEYS.EXPORT_HISTORY] || [];
    
    // Add new export log entry
    history.unshift({
      ...data,
      timestamp: Date.now()
    });
    
    // Keep only last 50 exports
    if (history.length > 50) {
      history.pop();
    }
    
    // Update session metrics
    const metricsResult = await chrome.storage.local.get(STORAGE_KEYS.SESSION_METRICS);
    const metrics = metricsResult[STORAGE_KEYS.SESSION_METRICS] || {
      totalRefreshes: 0,
      totalExports: 0,
      lastRefreshTime: null
    };
    
    metrics.totalExports += 1;
    
    await chrome.storage.local.set({ 
      [STORAGE_KEYS.EXPORT_HISTORY]: history,
      [STORAGE_KEYS.SESSION_METRICS]: metrics
    });
    sendResponse({ success: true });
  } catch (error) {
    console.error('[Claude Track] Error logging export:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleLogRefresh(sendResponse) {
  try {
    const metricsResult = await chrome.storage.local.get(STORAGE_KEYS.SESSION_METRICS);
    const metrics = metricsResult[STORAGE_KEYS.SESSION_METRICS] || {
      totalRefreshes: 0,
      totalExports: 0,
      lastRefreshTime: null
    };
    
    metrics.totalRefreshes += 1;
    metrics.lastRefreshTime = Date.now();
    
    await chrome.storage.local.set({ 
      [STORAGE_KEYS.SESSION_METRICS]: metrics
    });
    
    sendResponse({ success: true, metrics });
  } catch (error) {
    console.error('[Claude Track] Error logging refresh:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleGetExportHistory(sendResponse) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.EXPORT_HISTORY);
    const history = result[STORAGE_KEYS.EXPORT_HISTORY] || [];
    sendResponse({ success: true, data: history });
  } catch (error) {
    console.error('[Claude Track] Error getting export history:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleGetSessionMetrics(sendResponse) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SESSION_METRICS);
    const metrics = result[STORAGE_KEYS.SESSION_METRICS] || {
      totalRefreshes: 0,
      totalExports: 0,
      lastRefreshTime: null
    };
    sendResponse({ success: true, data: metrics });
  } catch (error) {
    console.error('[Claude Track] Error getting session metrics:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleClearData(sendResponse) {
  try {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS,
      [STORAGE_KEYS.EXPORT_HISTORY]: [],
      [STORAGE_KEYS.SESSION_METRICS]: {
        totalRefreshes: 0,
        totalExports: 0,
        lastRefreshTime: null
      }
    });
    sendResponse({ success: true });
  } catch (error) {
    console.error('[Claude Track] Error clearing data:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleSendNotification(data, sendResponse) {
  try {
    const settingsResult = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    const settings = settingsResult[STORAGE_KEYS.SETTINGS] || DEFAULT_SETTINGS;

    // Only send notification if setting is enabled
    if (settings.showNotifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: data.title || 'Claude Track & Export',
        message: data.message || '',
        priority: data.priority || 0
      }, (notificationId) => {
        if (chrome.runtime.lastError) {
          console.error('[Claude Track] Error creating notification:', chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          console.log('[Claude Track] Notification created:', notificationId);
          sendResponse({ success: true, notificationId });
        }
      });
    } else {
      sendResponse({ success: true, skipped: true });
    }
  } catch (error) {
    console.error('[Claude Track] Error sending notification:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Tab update listener for SPA navigation handling
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('claude.ai')) {
    // Notify content script of navigation
    chrome.tabs.sendMessage(tabId, { type: 'URL_CHANGED', url: tab.url }).catch(() => {
      // Content script might not be ready yet, ignore error
    });
  }
});

// Storage change listener for sync across tabs
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    // Broadcast changes to all Claude tabs (excluding /code where content script doesn't run)
    chrome.tabs.query({ url: 'https://claude.ai/*' }, (tabs) => {
      tabs.forEach(tab => {
        // Skip tabs that are on /code path where content script is excluded
        if (tab.url && (tab.url.includes('claude.ai/code/') || tab.url.endsWith('claude.ai/code'))) {
          return;
        }
        chrome.tabs.sendMessage(tab.id, {
          type: 'STORAGE_CHANGED',
          changes
        }).catch(() => {});
      });
    });
  }
});

console.log('[Claude Track] Background service worker initialized');
