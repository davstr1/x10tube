// StraightToYourAI Extension Popup

// Import API (will be injected via manifest)
let api;

// DOM Elements
const elements = {
  loading: null,
  videoInfo: null,
  videoThumbnail: null,
  videoTitle: null,
  videoMeta: null,
  pageInfo: null,
  pageIcon: null,
  pageTitle: null,
  pageMeta: null,
  notSupported: null,
  quickActions: null,
  openDirectBtn: null,
  openDirectLabel: null,
  openInBtn: null,
  llmSubmenu: null,
  copyLinkBtn: null,
  copyContentBtn: null,
  x10sSection: null,
  x10sList: null,
  emptyState: null,
  createBtn: null,
  dashboardLink: null,
  syncLink: null,
  logoLink: null,
  toast: null,
  toastMessage: null
};

// LLM display names
const LLM_NAMES = {
  claude: 'Claude',
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  grok: 'Grok',
  copilot: 'Copilot'
};

// LLM URLs
const LLM_URLS = {
  claude: (prompt) => `https://claude.ai/new?q=${encodeURIComponent(prompt)}`,
  chatgpt: (prompt) => `https://chat.openai.com/?q=${encodeURIComponent(prompt)}`,
  gemini: (prompt) => `https://www.google.com/search?udm=50&aep=11&q=${encodeURIComponent(prompt)}`,
  perplexity: (prompt) => `https://www.perplexity.ai/search/?q=${encodeURIComponent(prompt)}`,
  grok: (prompt) => `https://x.com/i/grok?text=${encodeURIComponent(prompt)}`,
  copilot: (prompt) => `https://copilot.microsoft.com/?q=${encodeURIComponent(prompt)}`
};

// Current page/video info
let currentItem = null;  // { type: 'youtube' | 'webpage', url, title, ... }
let itemInX10s = [];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Get DOM elements
  elements.loading = document.getElementById('loading');
  elements.videoInfo = document.getElementById('video-info');
  elements.videoThumbnail = document.getElementById('video-thumbnail');
  elements.videoTitle = document.getElementById('video-title');
  elements.videoMeta = document.getElementById('video-meta');
  elements.pageInfo = document.getElementById('page-info');
  elements.pageIcon = document.getElementById('page-icon');
  elements.pageTitle = document.getElementById('page-title');
  elements.pageMeta = document.getElementById('page-meta');
  elements.notSupported = document.getElementById('not-supported');
  elements.quickActions = document.getElementById('quick-actions');
  elements.openDirectBtn = document.getElementById('open-direct-btn');
  elements.openDirectLabel = document.getElementById('open-direct-label');
  elements.openInBtn = document.getElementById('open-in-btn');
  elements.llmSubmenu = document.getElementById('llm-submenu');
  elements.copyLinkBtn = document.getElementById('copy-link-btn');
  elements.copyContentBtn = document.getElementById('copy-content-btn');
  elements.x10sSection = document.getElementById('x10s-section');
  elements.x10sList = document.getElementById('x10s-list');
  elements.emptyState = document.getElementById('empty-state');
  elements.createBtn = document.getElementById('create-btn');
  elements.dashboardLink = document.getElementById('dashboard-link');
  elements.syncLink = document.getElementById('sync-link');
  elements.logoLink = document.getElementById('logo-link');
  elements.toast = document.getElementById('toast');
  elements.toastMessage = document.getElementById('toast-message');

  // Initialize API
  api = new StyaAPI();
  await api.init();

  // Set up links
  elements.dashboardLink.href = api.getDashboardUrl();
  elements.dashboardLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: api.getDashboardUrl() });
  });

  elements.syncLink.href = api.getSyncUrl();
  elements.syncLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: api.getSyncUrl() });
  });

  elements.logoLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: api.baseUrl });
  });

  // Set up create button
  elements.createBtn.addEventListener('click', handleCreateX10);

  // Set up quick actions
  elements.openInBtn.addEventListener('click', () => {
    elements.llmSubmenu.classList.toggle('hidden');
    const arrow = elements.openInBtn.querySelector('.quick-icon');
    arrow.textContent = elements.llmSubmenu.classList.contains('hidden') ? '▸' : '▾';
  });

  document.querySelectorAll('.submenu-item').forEach(item => {
    item.addEventListener('click', () => {
      if (currentItem) {
        const llm = item.dataset.llm;
        // Save preference
        chrome.storage.local.set({ styaLastLLM: llm });
        updateDirectButton(llm);
        handleOpenInLLM(currentItem.url, llm);
      }
    });
  });

  // Direct open button
  elements.openDirectBtn.addEventListener('click', async () => {
    if (!currentItem) return;
    const data = await chrome.storage.local.get(['styaLastLLM']);
    if (!data.styaLastLLM) return;
    handleOpenInLLM(currentItem.url, data.styaLastLLM);
  });

  // Load last LLM preference
  try {
    const data = await chrome.storage.local.get(['styaLastLLM']);
    if (data.styaLastLLM) {
      updateDirectButton(data.styaLastLLM);
    }
  } catch (e) {
    console.log('[STYA] Could not load last LLM preference:', e);
  }

  elements.copyLinkBtn.addEventListener('click', () => {
    if (currentItem) {
      handleCopyMDLink(currentItem.url);
    }
  });

  elements.copyContentBtn.addEventListener('click', () => {
    if (currentItem) {
      handleCopyMDContent(currentItem.url);
    }
  });

  // Check current tab
  await checkCurrentTab();
});

async function checkCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Check for unsupported pages (chrome://, file://, about:, etc.)
    if (!tab.url || !tab.url.startsWith('http')) {
      showNotSupported();
      await loadX10sList();
      return;
    }

    const url = new URL(tab.url);
    const isYouTube = url.hostname.includes('youtube.com') && url.searchParams.get('v');

    if (isYouTube) {
      // YouTube video
      const videoId = url.searchParams.get('v');

      // Get video info from content script
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getVideoInfo' });

        if (response && response.success) {
          currentItem = {
            type: 'youtube',
            id: videoId,
            url: tab.url,
            title: response.title,
            channel: response.channel,
            duration: response.duration
          };
        } else {
          // Fallback: use tab title
          currentItem = {
            type: 'youtube',
            id: videoId,
            url: tab.url,
            title: tab.title.replace(' - YouTube', ''),
            channel: '',
            duration: ''
          };
        }
      } catch (e) {
        // Content script not loaded, use fallback
        currentItem = {
          type: 'youtube',
          id: videoId,
          url: tab.url,
          title: tab.title.replace(' - YouTube', ''),
          channel: '',
          duration: ''
        };
      }

      showVideoInfo();
    } else {
      // Any other web page
      currentItem = {
        type: 'webpage',
        url: tab.url,
        title: tab.title,
        domain: url.hostname.replace(/^www\./, '')
      };

      showPageInfo();
    }

    await loadX10sList();

  } catch (error) {
    console.error('[STYA] Error:', error);
    showNotSupported();
    await loadX10sList();
  }
}

function showNotSupported() {
  elements.loading.classList.add('hidden');
  elements.videoInfo.classList.add('hidden');
  elements.pageInfo.classList.add('hidden');
  elements.quickActions.classList.add('hidden');
  elements.notSupported.classList.remove('hidden');
  elements.createBtn.disabled = true;
  document.getElementById('create-btn-text').textContent = 'Open a web page first';
}

function showVideoInfo() {
  elements.loading.classList.add('hidden');
  elements.notSupported.classList.add('hidden');
  elements.pageInfo.classList.add('hidden');
  elements.videoInfo.classList.remove('hidden');
  elements.quickActions.classList.remove('hidden');

  // Set thumbnail
  const thumbnailUrl = `https://img.youtube.com/vi/${currentItem.id}/mqdefault.jpg`;
  elements.videoThumbnail.style.backgroundImage = `url(${thumbnailUrl})`;

  // Set title
  elements.videoTitle.textContent = currentItem.title;

  // Set meta (channel + duration)
  const metaParts = [];
  if (currentItem.channel) metaParts.push(currentItem.channel);
  if (currentItem.duration) metaParts.push(currentItem.duration);
  elements.videoMeta.textContent = metaParts.join(' · ') || 'YouTube video';

  elements.createBtn.disabled = false;
  document.getElementById('create-btn-text').textContent = 'A new collection';
}

function showPageInfo() {
  elements.loading.classList.add('hidden');
  elements.notSupported.classList.add('hidden');
  elements.videoInfo.classList.add('hidden');
  elements.pageInfo.classList.remove('hidden');
  elements.quickActions.classList.remove('hidden');

  // Set title and domain
  elements.pageTitle.textContent = currentItem.title || 'Untitled page';
  elements.pageMeta.textContent = currentItem.domain;

  elements.createBtn.disabled = false;
  document.getElementById('create-btn-text').textContent = 'A new collection';
}

async function loadX10sList() {
  const result = await api.getMyX10s();

  elements.loading.classList.add('hidden');

  if (result.x10s.length === 0) {
    elements.x10sSection.classList.add('hidden');
    elements.emptyState.classList.remove('hidden');
  } else {
    elements.emptyState.classList.add('hidden');
    elements.x10sSection.classList.remove('hidden');

    // Check which x10s contain this item (only for YouTube videos for now)
    if (currentItem && currentItem.type === 'youtube') {
      const checkResult = await api.checkVideoInX10s(currentItem.id);
      itemInX10s = checkResult.inX10s || [];
    } else {
      itemInX10s = [];
    }

    renderX10sList(result.x10s);
  }
}

function renderX10sList(x10s) {
  elements.x10sList.innerHTML = '';

  x10s.forEach(x10 => {
    const isInX10 = itemInX10s.includes(x10.id);

    const item = document.createElement('button');
    item.className = 'x10-item';
    item.dataset.x10Id = x10.id;

    item.innerHTML = `
      <span class="x10-check">${isInX10 ? '✓' : ''}</span>
      <span class="x10-name">${escapeHtml(x10.title || 'Untitled')}</span>
      <span class="x10-count">${x10.videoCount} item${x10.videoCount > 1 ? 's' : ''}</span>
    `;

    if (!isInX10 && currentItem) {
      item.addEventListener('click', () => handleAddToX10(x10.id, x10.title));
    } else if (isInX10) {
      item.style.cursor = 'default';
      item.title = 'Already in this collection';
    } else {
      item.disabled = true;
    }

    elements.x10sList.appendChild(item);
  });
}

async function handleCreateX10() {
  if (!currentItem) return;

  elements.createBtn.disabled = true;
  document.getElementById('create-btn-text').textContent = 'Creating...';

  const result = await api.createX10(currentItem.url);

  if (result.success) {
    showToast(`Created new collection!`, 'success');

    // Open the new x10 page
    setTimeout(() => {
      chrome.tabs.create({ url: api.getX10Url(result.x10.x10Id) });
    }, 500);
  } else {
    showToast(`Error: ${result.error}`, 'error');
    elements.createBtn.disabled = false;
    document.getElementById('create-btn-text').textContent = 'A new collection';
  }
}

async function handleAddToX10(x10Id, x10Title) {
  if (!currentItem) return;

  // Find and disable the item
  const item = elements.x10sList.querySelector(`[data-x10-id="${x10Id}"]`);
  if (item) {
    item.classList.add('adding');
  }

  const result = await api.addVideoToX10(x10Id, currentItem.url);

  if (result.success) {
    showToast(`Added to ${x10Title || 'collection'}`, 'success');

    // Update the check mark
    if (item) {
      const checkSpan = item.querySelector('.x10-check');
      if (checkSpan) checkSpan.textContent = '✓';
      item.classList.remove('adding');
      item.style.cursor = 'default';
    }

    itemInX10s.push(x10Id);
  } else {
    showToast(`Error: ${result.error}`, 'error');
    if (item) {
      item.classList.remove('adding');
    }
  }
}

function showToast(message, type = '') {
  elements.toastMessage.textContent = message;
  elements.toast.className = 'toast' + (type ? ` ${type}` : '');
  elements.toast.classList.remove('hidden');

  setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// Quick Actions (One-Click LLM)
// ============================================

async function handleOpenInLLM(url, llmType) {
  showToast('Creating collection...', '');
  disableQuickActions();

  try {
    const result = await api.createX10(url, true); // forceNew = true

    if (!result.success) {
      showToast(`Error: ${result.error}`, 'error');
      enableQuickActions();
      return;
    }

    const mdUrl = `${api.baseUrl}/s/${result.x10.x10Id}.md`;
    const prompt = `Fetch ${mdUrl}`;
    const llmUrl = LLM_URLS[llmType](prompt);

    chrome.tabs.create({ url: llmUrl });
    showToast(`Opened in ${llmType}`, 'success');
  } catch (error) {
    console.error('[STYA] handleOpenInLLM error:', error);
    showToast(`Error: ${error.message}`, 'error');
    enableQuickActions();
  }
}

async function handleCopyMDLink(url) {
  showToast('Creating collection...', '');
  disableQuickActions();

  try {
    const result = await api.createX10(url, true); // forceNew = true

    if (!result.success) {
      showToast(`Error: ${result.error}`, 'error');
      enableQuickActions();
      return;
    }

    const mdUrl = `${api.baseUrl}/s/${result.x10.x10Id}.md`;
    await navigator.clipboard.writeText(mdUrl);
    showToast('MD link copied!', 'success');
    enableQuickActions();
  } catch (error) {
    console.error('[STYA] handleCopyMDLink error:', error);
    showToast(`Error: ${error.message}`, 'error');
    enableQuickActions();
  }
}

async function handleCopyMDContent(url) {
  showToast('Creating collection...', '');
  disableQuickActions();

  try {
    const result = await api.createX10(url, true); // forceNew = true

    if (!result.success) {
      showToast(`Error: ${result.error}`, 'error');
      enableQuickActions();
      return;
    }

    const mdUrl = `${api.baseUrl}/s/${result.x10.x10Id}.md`;
    showToast('Fetching content...', '');

    const response = await fetch(mdUrl);
    const mdContent = await response.text();

    await navigator.clipboard.writeText(mdContent);
    showToast('MD content copied!', 'success');
    enableQuickActions();
  } catch (error) {
    console.error('[STYA] handleCopyMDContent error:', error);
    showToast(`Error: ${error.message}`, 'error');
    enableQuickActions();
  }
}

function updateDirectButton(llmKey) {
  if (llmKey && LLM_NAMES[llmKey]) {
    elements.openDirectLabel.textContent = `Open in ${LLM_NAMES[llmKey]}`;
    elements.openDirectBtn.classList.remove('hidden');
  }
}

function disableQuickActions() {
  elements.openDirectBtn.disabled = true;
  elements.openInBtn.disabled = true;
  elements.copyLinkBtn.disabled = true;
  elements.copyContentBtn.disabled = true;
}

function enableQuickActions() {
  elements.openDirectBtn.disabled = false;
  elements.openInBtn.disabled = false;
  elements.copyLinkBtn.disabled = false;
  elements.copyContentBtn.disabled = false;
}
