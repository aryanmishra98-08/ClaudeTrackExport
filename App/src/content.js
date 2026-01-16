/**
 * Claude Track & Export - Content Script
 * Adaptive collapsible UI that syncs with sidebar state
 */

(function() {
  'use strict';

  const CONFIG = {
    REFRESH_INTERVAL: 30000,
    PANEL_ID: 'claude-track-export-panel',
    STORAGE_KEY: 'claude_track_export_data'
  };

  const state = {
    usageData: null,
    orgId: null,
    isSidebarCollapsed: false,
    refreshTimer: null,
    lastRefresh: null,
    settings: {
      autoRefresh: true,
      copyToClipboard: true,
      showNotifications: true
    },
    // Cleanup tracking to prevent memory leaks
    observers: {
      sidebar: null,
      urlChanges: null
    },
    listeners: {
      resize: null,
      message: null
    },
    listenersAttached: false
  };

  // ============================================
  // Utility Functions
  // ============================================
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get('claude_track_export_settings');
      const settings = result.claude_track_export_settings || {
        autoRefresh: true,
        copyToClipboard: true,
        showNotifications: true
      };
      state.settings = settings;
      console.log('[Claude Track] Settings loaded:', settings);
      return settings;
    } catch (error) {
      console.error('[Claude Track] Error loading settings:', error);
      return state.settings;
    }
  }

  function getProgressColor(percentage) {
    if (percentage >= 90) return '#ef4444';
    if (percentage >= 70) return '#f59e0b';
    if (percentage >= 50) return '#eab308';
    return '#22c55e';
  }

  function formatTimeRemaining(resetTimestamp) {
    if (!resetTimestamp) return '';
    const now = Date.now();
    const resetTime = new Date(resetTimestamp).getTime();
    const diffMs = resetTime - now;
    if (diffMs <= 0) return 'Resetting...';
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (diffHours >= 24) {
      return `${Math.floor(diffHours / 24)}d ${diffHours % 24}h`;
    } else if (diffHours > 0) {
      return `${diffHours}h ${diffMins}m`;
    } else if (diffMins > 0) {
      return `${diffMins}m`;
    }
    return 'soon';
  }

  // ============================================
  // API Functions
  // ============================================
  async function fetchWithAuth(url, maxRetries = 2) {
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          credentials: 'include', // Required to send cookies for authentication
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
          // Don't retry on 4xx errors (client errors like 401, 403, 404)
          if (response.status >= 400 && response.status < 500) {
            throw new Error(`HTTP ${response.status}`);
          }
          throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
      } catch (error) {
        lastError = error;
        console.error(`[Claude Track] Fetch error (attempt ${attempt + 1}/${maxRetries + 1}):`, error);

        // If this wasn't the last attempt and it's a network error, wait before retrying
        if (attempt < maxRetries && error.message.includes('Failed to fetch')) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s
          await new Promise(resolve => setTimeout(resolve, delay));
        } else if (attempt < maxRetries) {
          // For other errors, don't retry
          break;
        }
      }
    }

    return null;
  }

  async function getOrganizationId() {
    if (state.orgId) return state.orgId;
    const data = await fetchWithAuth('https://claude.ai/api/organizations');
    if (data && Array.isArray(data) && data.length > 0) {
      state.orgId = data[0].uuid;
      return state.orgId;
    }
    return null;
  }

  async function fetchUsageData() {
    const orgId = await getOrganizationId();
    if (!orgId) return null;

    const usageResponse = await fetchWithAuth(`https://claude.ai/api/organizations/${orgId}/usage`);
    if (!usageResponse) return null;

    const usageData = {
      sessionLimit: {
        label: '5-Hour Session',
        shortLabel: '5H',
        utilization: usageResponse.five_hour?.utilization ?? 0,
        resetTime: usageResponse.five_hour?.resets_at ?? null
      },
      weeklyLimit: {
        label: 'Weekly Limit',
        shortLabel: '7D',
        utilization: usageResponse.seven_day?.utilization ?? 0,
        resetTime: usageResponse.seven_day?.resets_at ?? null
      }
    };

    state.usageData = usageData;
    state.lastRefresh = new Date();

    try {
      chrome.storage.local.set({ [CONFIG.STORAGE_KEY]: usageData });
    } catch (e) {
      console.error('[Claude Track] Error saving usage data to storage:', e);
    }

    return usageData;
  }

  // ============================================
  // Export Functions
  // ============================================
  function getCurrentConversationId() {
    const match = window.location.pathname.match(/\/chat\/([a-fA-F0-9-]+)/);
    return match ? match[1] : null;
  }

  async function fetchConversation(conversationId) {
    const orgId = await getOrganizationId();
    if (!orgId || !conversationId) return null;
    return await fetchWithAuth(`https://claude.ai/api/organizations/${orgId}/chat_conversations/${conversationId}`);
  }

  function extractMessages(conversation) {
    // Validate conversation data structure
    if (!conversation || typeof conversation !== 'object') {
      console.error('[Claude Track] Invalid conversation object');
      return [];
    }

    if (!Array.isArray(conversation.chat_messages)) {
      console.error('[Claude Track] Missing or invalid chat_messages array');
      return [];
    }

    return conversation.chat_messages
      .filter(msg => msg && typeof msg === 'object')
      .map(msg => ({
        role: msg.sender === 'human' ? 'user' : 'assistant',
        content: msg.text || '',
        timestamp: msg.created_at || null
      }));
  }

  function convertToMarkdown(messages, conversationName) {
    const title = conversationName || document.title.replace(' - Claude', '').trim() || 'Claude Conversation';
    // Use local timezone for export timestamp
    const date = new Date().toISOString().split('T')[0];
    const time = new Date().toLocaleTimeString();

    let markdown = `# ${title}\n\n**Exported:** ${date} at ${time}\n**Messages:** ${messages.length}\n\n---\n\n`;

    messages.forEach((msg, index) => {
      const role = msg.role === 'user' ? '👤 **User**' : '🤖 **Claude**';
      markdown += `### ${role}\n\n${msg.content}\n\n`;
      if (index < messages.length - 1) markdown += `---\n\n`;
    });

    return markdown;
  }

  function sanitizeFilename(name) {
    if (!name || typeof name !== 'string') {
      return 'conversation';
    }

    // Remove or replace invalid filename characters
    let sanitized = name
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '') // Remove invalid chars
      .replace(/\s+/g, '_')  // Replace spaces with underscores
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^[._]+/, '')  // Remove leading dots/underscores
      .replace(/[._]+$/, '')  // Remove trailing dots/underscores
      .toLowerCase();

    // Limit length to avoid filesystem issues
    if (sanitized.length > 200) {
      sanitized = sanitized.substring(0, 200);
    }

    // Ensure we have a valid filename
    return sanitized || 'conversation';
  }

  function downloadMarkdown(content, filename) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      return false;
    }
  }

  async function exportConversation() {
    const conversationId = getCurrentConversationId();
    if (!conversationId) {
      showModal('Export Failed', 'Please open a conversation to export it.');
      return;
    }

    const btns = document.querySelectorAll('.cte-export-btn');
    btns.forEach(btn => {
      btn.disabled = true;
      btn.classList.add('cte-loading');
    });

    try {
      const conversation = await fetchConversation(conversationId);
      if (!conversation) {
        showModal('Export Failed', 'Unable to retrieve conversation data from the server.');
        return;
      }

      const messages = extractMessages(conversation);
      if (messages.length === 0) {
        showModal('Export Failed', 'This conversation has no messages to export.');
        return;
      }

      const markdown = convertToMarkdown(messages, conversation.name);
      const sanitizedTitle = sanitizeFilename(conversation.name || 'conversation');
      downloadMarkdown(markdown, `claude_${sanitizedTitle}_${Date.now()}.md`);

      // Only copy to clipboard if setting is enabled
      if (state.settings.copyToClipboard) {
        await copyToClipboard(markdown);
      }

      // Export succeeded - log metrics (but don't fail if extension context is invalid)
      try {
        if (chrome.runtime?.id) {
          chrome.runtime.sendMessage({
            type: 'LOG_EXPORT',
            data: {
              conversationId,
              conversationName: conversation.name,
              messageCount: messages.length,
              timestamp: Date.now()
            }
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.log('[Claude Track] Export metric logging error:', chrome.runtime.lastError);
            } else if (response && response.success) {
              console.log('[Claude Track] Export logged to metrics');
            }
          });
        }
      } catch (metricsError) {
        // Silently fail metrics logging - export already succeeded
        console.log('[Claude Track] Could not log export metrics:', metricsError);
      }

      // Success - no notification
    } catch (error) {
      console.error('[Claude Track] Export error:', error);
      showModal('Export Failed', `An error occurred while exporting: ${error.message}`);
      // Send browser notification for export error (only if context is valid)
      if (chrome.runtime?.id) {
        sendBrowserNotification('Export Failed', 'An error occurred while exporting the conversation', 1);
      }
    } finally {
      btns.forEach(btn => {
        btn.disabled = false;
        btn.classList.remove('cte-loading');
      });
    }
  }

  // ============================================
  // UI Components
  // ============================================
  function createUsageBar(data, id) {
    const percentage = data.utilization;
    const color = getProgressColor(percentage);
    const resetInfo = data.resetTime ? formatTimeRemaining(data.resetTime) : '';
    
    return `
      <div class="cte-usage-item" id="${id}">
        <div class="cte-usage-header">
          <span class="cte-usage-label">${data.label}</span>
          <span class="cte-usage-value">${percentage}%</span>
        </div>
        <div class="cte-progress-bar">
          <div class="cte-progress-fill" style="width: ${percentage}%; background-color: ${color};"></div>
        </div>
        <div class="cte-usage-detail">${percentage}% used ${resetInfo ? `• ${resetInfo}` : ''}</div>
      </div>
    `;
  }

  function getPanelHTML() {
    const data = state.usageData || {
      sessionLimit: { label: '5-Hour Session', shortLabel: '5H', utilization: 0, resetTime: null },
      weeklyLimit: { label: 'Weekly Limit', shortLabel: '7D', utilization: 0, resetTime: null }
    };

    const lastRefreshText = state.lastRefresh 
      ? `Updated ${state.lastRefresh.toLocaleTimeString()}`
      : 'Fetching...';

    const sessionColor = getProgressColor(data.sessionLimit.utilization);
    const weeklyColor = getProgressColor(data.weeklyLimit.utilization);

    return `
      <!-- Collapsed View: Icon Only -->
      <div class="cte-collapsed-view">
        <button class="cte-icon-btn" id="cte-expand-btn" title="Claude Track & Export">
          <svg class="cte-main-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20V10"/>
            <path d="M18 20V4"/>
            <path d="M6 20v-4"/>
          </svg>
          <div class="cte-mini-indicators">
            <span class="cte-mini-dot" style="background-color: ${sessionColor};" title="5H: ${data.sessionLimit.utilization}%"></span>
            <span class="cte-mini-dot" style="background-color: ${weeklyColor};" title="7D: ${data.weeklyLimit.utilization}%"></span>
          </div>
        </button>
      </div>

      <!-- Expanded View: Full Content -->
      <div class="cte-expanded-view">
        <div class="cte-panel-header">
          <div class="cte-title">
            <svg class="cte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20V10"/>
              <path d="M18 20V4"/>
              <path d="M6 20v-4"/>
            </svg>
            <span>Track & Export</span>
          </div>
        </div>
        
        <div class="cte-panel-content">
          <div class="cte-section">
            <div class="cte-section-title">Usage Limits</div>
            <div class="cte-usage-bars" id="cte-usage-bars">
              ${createUsageBar(data.sessionLimit, 'cte-session')}
              ${createUsageBar(data.weeklyLimit, 'cte-weekly')}
            </div>
            <div class="cte-refresh-row">
              <span class="cte-refresh-text" id="cte-refresh-text">${lastRefreshText}</span>
              <button class="cte-refresh-btn" id="cte-manual-refresh" title="Refresh">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M23 4v6h-6"/>
                  <path d="M1 20v-6h6"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
              </button>
            </div>
          </div>
          
          <div class="cte-section">
            <button class="cte-export-btn cte-export-btn-full" id="cte-export-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <span>Export Conversation</span>
            </button>
          </div>
        </div>
      </div>
      
      <div class="cte-notification" id="cte-notification"></div>
      <div class="cte-banner" id="cte-banner"></div>
    `;
  }

  function createPanel() {
    const panel = document.createElement('div');
    panel.id = CONFIG.PANEL_ID;
    panel.className = 'cte-panel';
    panel.innerHTML = getPanelHTML();
    return panel;
  }

  function createModal() {
    // Don't create duplicate modals
    if (document.getElementById('cte-modal-overlay')) {
      return;
    }

    const modal = document.createElement('div');
    modal.id = 'cte-modal-overlay';
    modal.className = 'cte-modal-overlay';
    modal.innerHTML = `
      <div class="cte-modal">
        <div class="cte-modal-header">
          <h2 id="cte-modal-title"></h2>
          <button class="cte-modal-close" id="cte-modal-close">&times;</button>
        </div>
        <div class="cte-modal-body" id="cte-modal-body"></div>
        <div class="cte-modal-footer">
          <button class="cte-modal-button cte-modal-button-primary" id="cte-modal-ok">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Close button handler
    document.getElementById('cte-modal-close').addEventListener('click', closeModal);
    document.getElementById('cte-modal-ok').addEventListener('click', closeModal);

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  function updatePanelUI() {
    const data = state.usageData;
    if (!data) return;

    // Efficiently update individual elements instead of replacing entire innerHTML
    updateUsageItem('cte-session', data.sessionLimit);
    updateUsageItem('cte-weekly', data.weeklyLimit);

    // Update mini indicators
    const miniDots = document.querySelectorAll('.cte-mini-dot');
    if (miniDots.length >= 2) {
      miniDots[0].style.backgroundColor = getProgressColor(data.sessionLimit.utilization);
      miniDots[0].title = `5H: ${data.sessionLimit.utilization}%`;
      miniDots[1].style.backgroundColor = getProgressColor(data.weeklyLimit.utilization);
      miniDots[1].title = `7D: ${data.weeklyLimit.utilization}%`;
    }

    const refreshText = document.getElementById('cte-refresh-text');
    if (refreshText && state.lastRefresh) {
      refreshText.textContent = `Updated ${state.lastRefresh.toLocaleTimeString()}`;
    }
  }

  function updateUsageItem(id, data) {
    const item = document.getElementById(id);
    if (!item) return;

    const percentage = data.utilization;
    const color = getProgressColor(percentage);
    const resetInfo = data.resetTime ? formatTimeRemaining(data.resetTime) : '';

    // Update only the specific elements that changed
    const valueSpan = item.querySelector('.cte-usage-value');
    const progressFill = item.querySelector('.cte-progress-fill');
    const detailDiv = item.querySelector('.cte-usage-detail');

    if (valueSpan) valueSpan.textContent = `${percentage}%`;
    if (progressFill) {
      progressFill.style.width = `${percentage}%`;
      progressFill.style.backgroundColor = color;
    }
    if (detailDiv) {
      detailDiv.textContent = `${percentage}% used ${resetInfo ? `• ${resetInfo}` : ''}`;
    }
  }

  function showNotification(message, type = 'info') {
    // Check if notifications are enabled before showing
    if (!state.settings.showNotifications) {
      console.log('[Claude Track] Notification blocked - setting disabled:', message);
      return;
    }
    
    const notification = document.getElementById('cte-notification');
    if (!notification) {
      console.log('[Claude Track] Notification element not found');
      return;
    }
    
    console.log('[Claude Track] Showing notification:', message, type);
    notification.className = `cte-notification cte-notification-${type} cte-notification-show`;
    notification.textContent = message;
    setTimeout(() => notification.classList.remove('cte-notification-show'), 3000);
  }

  function sendBrowserNotification(title, message, priority = 0) {
    // Send browser notification via background service worker
    try {
      if (!chrome.runtime?.id) {
        console.log('[Claude Track] Cannot send notification - extension context invalid');
        return;
      }

      chrome.runtime.sendMessage({
        type: 'SEND_NOTIFICATION',
        data: {
          title,
          message,
          priority
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('[Claude Track] Notification error:', chrome.runtime.lastError);
        } else if (response && response.success) {
          console.log('[Claude Track] Browser notification sent');
        }
      });
    } catch (error) {
      console.log('[Claude Track] Cannot send notification:', error);
    }
  }

  function showBanner(message, type = 'info', duration = 5000, title = null) {
    // Check if notifications are enabled
    if (!state.settings.showNotifications) {
      console.log('[Claude Track] Banner blocked - setting disabled:', message);
      return;
    }

    const banner = document.getElementById('cte-banner');
    if (!banner) {
      console.log('[Claude Track] Banner element not found');
      return;
    }

    const icon = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    }[type] || 'ℹ';

    banner.innerHTML = `
      <div class="cte-banner-icon">${icon}</div>
      <div class="cte-banner-content">
        ${title ? `<div class="cte-banner-title">${title}</div>` : ''}
        <div class="cte-banner-message">${message}</div>
      </div>
      <button class="cte-banner-close" id="cte-banner-close-btn">&times;</button>
    `;

    banner.className = `cte-banner cte-banner-${type} cte-banner-show`;
    console.log('[Claude Track] Showing banner:', title || message, type);

    // Add close button event listener (remove inline onclick for security)
    const closeBtn = document.getElementById('cte-banner-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        banner.classList.remove('cte-banner-show');
      }, { once: true });
    }

    if (duration > 0) {
      setTimeout(() => {
        banner.classList.remove('cte-banner-show');
      }, duration);
    }
  }

  function showModal(title, message, type = 'error') {
    // Check if notifications are enabled
    if (!state.settings.showNotifications) {
      console.log('[Claude Track] Modal blocked - setting disabled:', title);
      return;
    }

    const overlay = document.getElementById('cte-modal-overlay');
    if (!overlay) {
      console.log('[Claude Track] Modal overlay not found');
      return;
    }

    const titleEl = document.getElementById('cte-modal-title');
    const bodyEl = document.getElementById('cte-modal-body');
    
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.textContent = message;

    overlay.classList.add('cte-modal-show');
    overlay.classList.remove('cte-modal-hide');
    console.log('[Claude Track] Showing modal:', title);
  }

  function closeModal() {
    const overlay = document.getElementById('cte-modal-overlay');
    if (overlay) {
      overlay.classList.add('cte-modal-hide');
      setTimeout(() => {
        overlay.classList.remove('cte-modal-show', 'cte-modal-hide');
      }, 300);
    }
  }

  // ============================================
  // Sidebar State Detection & Sync
  // ============================================
  function findSidebarContainer() {
    const selectors = [
      '[data-testid="sidebar"]',
      'nav[class*="sidebar"]',
      'nav[class*="Sidebar"]',
      'aside[class*="sidebar"]',
      '[class*="NavigationSidebar"]',
      'nav'
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  function detectSidebarState() {
    const sidebar = findSidebarContainer();
    if (!sidebar) return false;

    const sidebarWidth = sidebar.offsetWidth;
    const classes = sidebar.className.toLowerCase();
    
    const hasCollapsedIndicator = 
      classes.includes('collapsed') || 
      classes.includes('closed') ||
      classes.includes('mini') ||
      classes.includes('narrow') ||
      classes.includes('hidden');
    
    return sidebarWidth < 120 || hasCollapsedIndicator;
  }

  function syncPanelWithSidebar() {
    const panel = document.getElementById(CONFIG.PANEL_ID);
    if (!panel) return;

    const isCollapsed = detectSidebarState();
    
    if (isCollapsed !== state.isSidebarCollapsed) {
      state.isSidebarCollapsed = isCollapsed;
      
      if (isCollapsed) {
        panel.classList.add('cte-sidebar-collapsed');
        panel.classList.remove('cte-sidebar-expanded');
      } else {
        panel.classList.remove('cte-sidebar-collapsed');
        panel.classList.add('cte-sidebar-expanded');
      }
      
      console.log('[Claude Track] Sidebar state:', isCollapsed ? 'collapsed' : 'expanded');
    }
  }

  function observeSidebarChanges() {
    const sidebar = findSidebarContainer();
    if (!sidebar) return;

    // Initial sync
    syncPanelWithSidebar();

    // Disconnect previous observer if it exists
    if (state.observers.sidebar) {
      state.observers.sidebar.disconnect();
    }

    // Create observer for sidebar changes
    const observer = new MutationObserver(() => {
      requestAnimationFrame(syncPanelWithSidebar);
    });

    // Observe sidebar and its parents
    observer.observe(sidebar, { attributes: true, attributeFilter: ['class', 'style'] });

    let parent = sidebar.parentElement;
    while (parent && parent !== document.body) {
      observer.observe(parent, { attributes: true, attributeFilter: ['class', 'style'] });
      parent = parent.parentElement;
    }

    // Store observer for cleanup
    state.observers.sidebar = observer;

    // Remove previous resize listener if it exists
    if (state.listeners.resize) {
      window.removeEventListener('resize', state.listeners.resize);
    }

    // Handle window resize
    let resizeTimeout;
    const resizeHandler = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(syncPanelWithSidebar, 100);
    };

    window.addEventListener('resize', resizeHandler);
    state.listeners.resize = resizeHandler;
  }

  // ============================================
  // Panel Injection & Events
  // ============================================
  function injectPanel() {
    if (document.getElementById(CONFIG.PANEL_ID)) return;

    const sidebar = findSidebarContainer();
    const panel = createPanel();
    
    if (sidebar) {
      sidebar.appendChild(panel);
    } else {
      panel.classList.add('cte-panel-floating');
      document.body.appendChild(panel);
    }

    attachEventListeners();
    observeSidebarChanges();
  }

  function attachEventListeners() {
    // Refresh button
    const refreshBtn = document.getElementById('cte-manual-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.classList.add('cte-spinning');
        await fetchUsageData();
        updatePanelUI();
        refreshBtn.classList.remove('cte-spinning');

        // Log manual refresh to background script for metrics tracking
        try {
          if (chrome.runtime?.id) {
            chrome.runtime.sendMessage({
              type: 'LOG_REFRESH'
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.log('[Claude Track] Refresh metric logging error:', chrome.runtime.lastError);
              } else if (response && response.success) {
                console.log('[Claude Track] Manual refresh logged to metrics');
              }
            });
          }
        } catch (metricsError) {
          console.log('[Claude Track] Could not log refresh metrics:', metricsError);
        }
      });
      updateRefreshButtonState(refreshBtn);
    }

    // Export button (full view)
    const exportBtn = document.getElementById('cte-export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportConversation);
      updateExportButtonState(exportBtn);
    }

    // Expand button (collapsed view) - clicking icon triggers export for quick action
    const expandBtn = document.getElementById('cte-expand-btn');
    if (expandBtn) {
      expandBtn.addEventListener('click', exportConversation);
      updateExportButtonState(expandBtn);
    }

    // Listen for settings changes from popup (only attach once)
    if (!state.listenersAttached) {
      const messageHandler = (message, sender, sendResponse) => {
        if (message.type === 'SETTINGS_CHANGED') {
          state.settings = message.settings;
          console.log('[Claude Track] Settings updated:', message.settings);

          // Update button states
          const exportBtn = document.getElementById('cte-export-btn');
          const expandBtn = document.getElementById('cte-expand-btn');
          const refreshBtn = document.getElementById('cte-manual-refresh');

          if (exportBtn) updateExportButtonState(exportBtn);
          if (expandBtn) updateExportButtonState(expandBtn);
          if (refreshBtn) updateRefreshButtonState(refreshBtn);

          // Restart/stop auto-refresh timer based on new settings
          if (state.settings.autoRefresh) {
            startRefreshTimer();
            console.log('[Claude Track] Auto-refresh timer restarted');
          } else {
            stopRefreshTimer();
            console.log('[Claude Track] Auto-refresh timer stopped');
          }
        }
      };

      chrome.runtime.onMessage.addListener(messageHandler);
      state.listeners.message = messageHandler;
      state.listenersAttached = true;
    }
  }

  function updateExportButtonState(btn) {
    // Export is always enabled (download works regardless of clipboard setting)
    btn.disabled = false;
    const clipboardEnabled = state.settings.copyToClipboard;
    btn.title = clipboardEnabled
      ? 'Export Conversation (download + copy to clipboard)'
      : 'Export Conversation (download only, clipboard disabled in settings)';
    btn.classList.remove('cte-disabled');
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
  }

  function updateRefreshButtonState(btn) {
    // Manual refresh is always enabled (autoRefresh setting only controls automatic timer)
    btn.disabled = false;
    const autoRefreshEnabled = state.settings.autoRefresh;
    btn.title = autoRefreshEnabled
      ? 'Refresh usage data'
      : 'Refresh usage data (auto-refresh disabled, only manual refresh available)';
    btn.classList.remove('cte-disabled');
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
  }

  function startRefreshTimer() {
    // ENFORCE: Only start timer if autoRefresh is enabled
    if (!state.settings.autoRefresh) {
      console.log('[Claude Track] Auto-refresh is disabled, timer not started');
      return;
    }

    if (state.refreshTimer) clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(async () => {
      // Skip refresh if tab is hidden to save resources
      if (document.hidden) {
        console.log('[Claude Track] Skipping auto-refresh (tab hidden)');
        return;
      }

      await fetchUsageData();
      updatePanelUI();

      // Log auto-refresh to background script for metrics tracking
      try {
        if (chrome.runtime?.id) {
          chrome.runtime.sendMessage({
            type: 'LOG_REFRESH'
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.log('[Claude Track] Auto-refresh metric logging error:', chrome.runtime.lastError);
            } else if (response && response.success) {
              console.log('[Claude Track] Auto-refresh logged to metrics');
            }
          });
        }
      } catch (metricsError) {
        console.log('[Claude Track] Could not log refresh metrics:', metricsError);
      }
    }, CONFIG.REFRESH_INTERVAL);
  }

  function stopRefreshTimer() {
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
      console.log('[Claude Track] Auto-refresh timer stopped');
    }
  }

  // Cleanup function to prevent memory leaks
  function cleanup() {
    // Stop refresh timer
    stopRefreshTimer();

    // Disconnect all observers
    if (state.observers.sidebar) {
      state.observers.sidebar.disconnect();
      state.observers.sidebar = null;
    }
    if (state.observers.urlChanges) {
      state.observers.urlChanges.disconnect();
      state.observers.urlChanges = null;
    }

    // Remove event listeners
    if (state.listeners.resize) {
      window.removeEventListener('resize', state.listeners.resize);
      state.listeners.resize = null;
    }
    if (state.listeners.message) {
      chrome.runtime.onMessage.removeListener(state.listeners.message);
      state.listeners.message = null;
      state.listenersAttached = false;
    }

    console.log('[Claude Track] Cleanup completed');
  }

  function observeUrlChanges() {
    // Disconnect previous observer if it exists
    if (state.observers.urlChanges) {
      state.observers.urlChanges.disconnect();
    }

    let lastUrl = window.location.href;
    const observer = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        setTimeout(() => {
          if (!document.getElementById(CONFIG.PANEL_ID)) {
            injectPanel();
          }
        }, 1000);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Store observer for cleanup
    state.observers.urlChanges = observer;
  }

  // ============================================
  // Initialization
  // ============================================
  async function initialize() {
    console.log('[Claude Track] Initializing...');

    // Wait for document to be fully loaded
    if (document.readyState !== 'complete') {
      await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
    }

    // Wait for Claude's interface to be ready by checking for key elements
    let attempts = 0;
    const maxAttempts = 20; // 10 seconds max wait
    while (attempts < maxAttempts && !document.querySelector('nav')) {
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }

    if (attempts >= maxAttempts) {
      console.warn('[Claude Track] Claude interface not detected, proceeding anyway');
    }

    // Load settings first to initialize state
    await loadSettings();

    // Create modal element
    createModal();

    await fetchUsageData();
    injectPanel();
    startRefreshTimer();
    observeUrlChanges();

    console.log('[Claude Track] Ready');
  }

  initialize();
})();
