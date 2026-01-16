/**
 * Claude Track & Export - Popup Script
 * Handles popup UI interactions and settings management
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize
  await checkExtensionStatus();
  await loadSettings();
  await loadStats();
  attachEventListeners();
});

// Check if extension is active on Claude.ai
async function checkExtensionStatus() {
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab && tab.url && tab.url.includes('claude.ai')) {
      statusDot.classList.remove('inactive');
      statusText.textContent = 'Active';
    } else {
      statusDot.classList.add('inactive');
      statusText.textContent = 'Inactive (not on Claude.ai)';
    }
  } catch (error) {
    console.error('Error checking status:', error);
    statusDot.classList.add('inactive');
    statusText.textContent = 'Unknown';
  }
}

// Load settings from storage
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get('claude_track_export_settings');
    const settings = result.claude_track_export_settings || {};
    
    // Apply settings to toggles
    const autoRefresh = document.getElementById('setting-autorefresh');
    const clipboard = document.getElementById('setting-clipboard');
    const newChat = document.getElementById('setting-newchat');
    const notifications = document.getElementById('setting-notifications');
    const sounds = document.getElementById('setting-sounds');

    if (autoRefresh) autoRefresh.checked = settings.autoRefresh !== false;
    if (clipboard) clipboard.checked = settings.copyToClipboard !== false;
    if (newChat) newChat.checked = settings.autoOpenNewChat !== false;
    if (notifications) notifications.checked = settings.showNotifications !== false;
    if (sounds) sounds.checked = settings.playSoundNotifications !== false;
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Load statistics
async function loadStats() {
  try {
    const result = await chrome.storage.local.get([
      'claude_track_export_history',
      'claude_track_export_data',
      'claude_track_export_session_metrics'
    ]);
    
    // Update total exports from export history
    const history = result.claude_track_export_history || [];
    const totalExports = document.getElementById('total-exports');
    if (totalExports) {
      totalExports.textContent = history.length.toString();
    }
    
    // Update session metrics
    const metrics = result.claude_track_export_session_metrics || {
      totalRefreshes: 0,
      totalExports: 0,
      lastRefreshTime: null
    };
    
    // Update total refreshes
    const totalRefreshes = document.getElementById('total-refreshes');
    if (totalRefreshes) {
      totalRefreshes.textContent = metrics.totalRefreshes.toString();
    }
    
    // Update last refresh time
    const lastRefresh = document.getElementById('last-refresh');
    if (lastRefresh) {
      if (metrics.lastRefreshTime) {
        const date = new Date(metrics.lastRefreshTime);
        lastRefresh.textContent = date.toLocaleTimeString();
      } else {
        lastRefresh.textContent = '--';
      }
    }
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

// Save settings to storage
async function saveSettings() {
  try {
    const settings = {
      autoRefresh: document.getElementById('setting-autorefresh')?.checked ?? true,
      copyToClipboard: document.getElementById('setting-clipboard')?.checked ?? true,
      autoOpenNewChat: document.getElementById('setting-newchat')?.checked ?? true,
      showNotifications: document.getElementById('setting-notifications')?.checked ?? true,
      playSoundNotifications: document.getElementById('setting-sounds')?.checked ?? true
    };
    
    await chrome.storage.local.set({ claude_track_export_settings: settings });
    
    // Notify content script of settings change
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('claude.ai')) {
      chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_CHANGED', settings }).catch(() => {});
    }
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// Attach event listeners
function attachEventListeners() {
  // Settings toggles
  const toggles = document.querySelectorAll('.toggle input');
  toggles.forEach(toggle => {
    toggle.addEventListener('change', saveSettings);
  });
  
  // Open Claude button
  const openClaudeBtn = document.getElementById('btn-open-claude');
  if (openClaudeBtn) {
    openClaudeBtn.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab && tab.url && tab.url.includes('claude.ai')) {
        // Already on Claude, just close popup
        window.close();
      } else {
        // Open Claude in new tab
        chrome.tabs.create({ url: 'https://claude.ai/new' });
      }
    });
  }
  
  // Clear data button
  const clearDataBtn = document.getElementById('btn-clear-data');
  if (clearDataBtn) {
    clearDataBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear all local data? This will reset your export history and settings.')) {
        const originalText = clearDataBtn.textContent;
        clearDataBtn.disabled = true;
        clearDataBtn.textContent = 'Clearing...';

        try {
          await chrome.storage.local.clear();

          // Reinitialize with defaults
          await chrome.storage.local.set({
            claude_track_export_settings: {
              autoRefresh: true,
              copyToClipboard: true,
              autoOpenNewChat: true,
              showNotifications: true,
              playSoundNotifications: true
            },
            claude_track_export_history: [],
            claude_track_export_session_metrics: {
              totalRefreshes: 0,
              totalExports: 0,
              lastRefreshTime: null
            }
          });

          // Reload UI
          await loadSettings();
          await loadStats();

          clearDataBtn.textContent = '✓ Cleared';
          setTimeout(() => {
            clearDataBtn.textContent = originalText;
            clearDataBtn.disabled = false;
          }, 2000);
        } catch (error) {
          console.error('Error clearing data:', error);
          clearDataBtn.textContent = '✗ Failed';
          setTimeout(() => {
            clearDataBtn.textContent = originalText;
            clearDataBtn.disabled = false;
          }, 2000);
        }
      }
    });
  }
}

// Auto-refresh stats every 5 seconds while popup is open
setInterval(loadStats, 5000);
