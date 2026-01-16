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
      autoOpenNewChat: true,
      showNotifications: true
    }
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
        autoOpenNewChat: true,
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
  async function fetchWithAuth(url) {
    try {
      const response = await fetch(url, {
        credentials: 'include',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('[Claude Track] Fetch error:', error);
      return null;
    }
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
    } catch (e) {}
    
    return usageData;
  }

  // ============================================
  // Export Functions
  // ============================================
  function getCurrentConversationId() {
    const match = window.location.pathname.match(/\/chat\/([a-f0-9-]+)/);
    return match ? match[1] : null;
  }

  async function fetchConversation(conversationId) {
    const orgId = await getOrganizationId();
    if (!orgId || !conversationId) return null;
    return await fetchWithAuth(`https://claude.ai/api/organizations/${orgId}/chat_conversations/${conversationId}`);
  }

  function extractMessages(conversation) {
    if (!conversation || !conversation.chat_messages) return [];
    return conversation.chat_messages.map(msg => ({
      role: msg.sender === 'human' ? 'user' : 'assistant',
      content: msg.text || '',
      timestamp: msg.created_at
    }));
  }

  function convertToMarkdown(messages, conversationName) {
    const title = conversationName || document.title.replace(' - Claude', '').trim() || 'Claude Conversation';
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
    // ENFORCE: Check if export is enabled
    const settings = await loadSettings();
    
    // If copyToClipboard is disabled AND we need to check export separately
    // For now, we'll treat it as: export includes clipboard copy
    if (!settings.copyToClipboard) {
      showNotification('Export is disabled in settings', 'error');
      return;
    }

    const conversationId = getCurrentConversationId();
    if (!conversationId) {
      showNotification('No conversation open', 'error');
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
        showNotification('Failed to fetch', 'error');
        return;
      }

      const messages = extractMessages(conversation);
      if (messages.length === 0) {
        showNotification('No messages', 'error');
        return;
      }

      const markdown = convertToMarkdown(messages, conversation.name);
      const title = (conversation.name || 'conversation').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      downloadMarkdown(markdown, `claude_${title}_${Date.now()}.md`);
      
      // ENFORCE: Only copy to clipboard if setting is enabled
      if (settings.copyToClipboard) {
        await copyToClipboard(markdown);
      }
      
      // Log export to background script for metrics tracking
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
      
      showNotification(`Exported ${messages.length} msgs`, 'success');
    } catch (error) {
      showNotification('Export failed', 'error');
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
    `;
  }

  function createPanel() {
    const panel = document.createElement('div');
    panel.id = CONFIG.PANEL_ID;
    panel.className = 'cte-panel';
    panel.innerHTML = getPanelHTML();
    return panel;
  }

  function updatePanelUI() {
    const data = state.usageData;
    if (!data) return;

    const usageBars = document.getElementById('cte-usage-bars');
    if (usageBars) {
      usageBars.innerHTML = `
        ${createUsageBar(data.sessionLimit, 'cte-session')}
        ${createUsageBar(data.weeklyLimit, 'cte-weekly')}
      `;
    }

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

  function showNotification(message, type = 'info') {
    const notification = document.getElementById('cte-notification');
    if (!notification) return;
    notification.className = `cte-notification cte-notification-${type} cte-notification-show`;
    notification.textContent = message;
    setTimeout(() => notification.classList.remove('cte-notification-show'), 3000);
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

    // Also handle window resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(syncPanelWithSidebar, 100);
    });
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
        // ENFORCE: Check if auto-refresh is enabled before allowing manual refresh
        const settings = await loadSettings();
        if (!settings.autoRefresh) {
          showNotification('Auto-refresh is disabled in settings', 'error');
          return;
        }

        refreshBtn.classList.add('cte-spinning');
        await fetchUsageData();
        updatePanelUI();
        refreshBtn.classList.remove('cte-spinning');
        showNotification('Refreshed', 'success');
        
        // Log manual refresh to background script for metrics tracking
        chrome.runtime.sendMessage({
          type: 'LOG_REFRESH'
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.log('[Claude Track] Refresh metric logging error:', chrome.runtime.lastError);
          } else if (response && response.success) {
            console.log('[Claude Track] Manual refresh logged to metrics');
          }
        });
      });
      // ENFORCE: Update refresh button state based on settings
      updateRefreshButtonState(refreshBtn);
    }

    // Export button (full view)
    const exportBtn = document.getElementById('cte-export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportConversation);
      // ENFORCE: Disable export button if setting is disabled
      updateExportButtonState(exportBtn);
    }

    // Expand button (collapsed view) - clicking icon also triggers export for quick action
    const expandBtn = document.getElementById('cte-expand-btn');
    if (expandBtn) {
      expandBtn.addEventListener('click', exportConversation);
      // ENFORCE: Disable expand button if setting is disabled
      updateExportButtonState(expandBtn);
    }

    // Listen for settings changes from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
        
        // ENFORCE: Restart/stop auto-refresh timer based on new settings
        if (state.settings.autoRefresh) {
          startRefreshTimer();
          console.log('[Claude Track] Auto-refresh timer restarted');
        } else {
          stopRefreshTimer();
          console.log('[Claude Track] Auto-refresh timer stopped');
        }
      }
    });
  }

  function updateExportButtonState(btn) {
    const isEnabled = state.settings.copyToClipboard;
    btn.disabled = !isEnabled;
    btn.title = isEnabled 
      ? 'Export Conversation' 
      : 'Export is disabled in settings';
    
    if (!isEnabled) {
      btn.classList.add('cte-disabled');
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
    } else {
      btn.classList.remove('cte-disabled');
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    }
  }

  function updateRefreshButtonState(btn) {
    const isEnabled = state.settings.autoRefresh;
    btn.disabled = !isEnabled;
    btn.title = isEnabled 
      ? 'Refresh' 
      : 'Auto-refresh is disabled in settings';
    
    if (!isEnabled) {
      btn.classList.add('cte-disabled');
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
    } else {
      btn.classList.remove('cte-disabled');
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    }
  }

  function startRefreshTimer() {
    // ENFORCE: Only start timer if autoRefresh is enabled
    if (!state.settings.autoRefresh) {
      console.log('[Claude Track] Auto-refresh is disabled, timer not started');
      return;
    }

    if (state.refreshTimer) clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(async () => {
      await fetchUsageData();
      updatePanelUI();
      
      // Log auto-refresh to background script for metrics tracking
      chrome.runtime.sendMessage({
        type: 'LOG_REFRESH'
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('[Claude Track] Auto-refresh metric logging error:', chrome.runtime.lastError);
        } else if (response && response.success) {
          console.log('[Claude Track] Auto-refresh logged to metrics');
        }
      });
    }, CONFIG.REFRESH_INTERVAL);
  }

  function stopRefreshTimer() {
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
      console.log('[Claude Track] Auto-refresh timer stopped');
    }
  }

  function observeUrlChanges() {
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
  }

  // ============================================
  // Initialization
  // ============================================
  async function initialize() {
    console.log('[Claude Track] Initializing...');

    if (document.readyState !== 'complete') {
      await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // ENFORCE: Load settings first to initialize state
    await loadSettings();
    
    await fetchUsageData();
    injectPanel();
    startRefreshTimer();
    observeUrlChanges();

    console.log('[Claude Track] Ready');
  }

  initialize();
})();
