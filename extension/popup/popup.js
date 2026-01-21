// X10Tube Extension Popup

// Import API (will be injected via manifest)
let api;

// DOM Elements
const elements = {
  loading: null,
  videoInfo: null,
  videoThumbnail: null,
  videoTitle: null,
  videoMeta: null,
  notYoutube: null,
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

// Current video info
let currentVideo = null;
let videoInX10s = [];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Get DOM elements
  elements.loading = document.getElementById('loading');
  elements.videoInfo = document.getElementById('video-info');
  elements.videoThumbnail = document.getElementById('video-thumbnail');
  elements.videoTitle = document.getElementById('video-title');
  elements.videoMeta = document.getElementById('video-meta');
  elements.notYoutube = document.getElementById('not-youtube');
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
  api = new X10TubeAPI();
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

  // Check current tab
  await checkCurrentTab();
});

async function checkCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url || !tab.url.includes('youtube.com/watch')) {
      showNotYoutube();
      await loadX10sList();
      return;
    }

    // Extract video ID from URL
    const url = new URL(tab.url);
    const videoId = url.searchParams.get('v');

    if (!videoId) {
      showNotYoutube();
      await loadX10sList();
      return;
    }

    // Get video info from content script
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getVideoInfo' });

      if (response && response.success) {
        currentVideo = {
          id: videoId,
          url: tab.url,
          title: response.title,
          channel: response.channel,
          duration: response.duration
        };
      } else {
        // Fallback: use tab title
        currentVideo = {
          id: videoId,
          url: tab.url,
          title: tab.title.replace(' - YouTube', ''),
          channel: '',
          duration: ''
        };
      }
    } catch (e) {
      // Content script not loaded, use fallback
      currentVideo = {
        id: videoId,
        url: tab.url,
        title: tab.title.replace(' - YouTube', ''),
        channel: '',
        duration: ''
      };
    }

    showVideoInfo();
    await loadX10sList();

  } catch (error) {
    console.error('[X10Tube Popup] Error:', error);
    showNotYoutube();
    await loadX10sList();
  }
}

function showNotYoutube() {
  elements.loading.classList.add('hidden');
  elements.videoInfo.classList.add('hidden');
  elements.notYoutube.classList.remove('hidden');
  elements.createBtn.disabled = true;
  elements.createBtn.textContent = 'Open a YouTube video first';
}

function showVideoInfo() {
  elements.loading.classList.add('hidden');
  elements.notYoutube.classList.add('hidden');
  elements.videoInfo.classList.remove('hidden');

  // Set thumbnail
  const thumbnailUrl = `https://img.youtube.com/vi/${currentVideo.id}/mqdefault.jpg`;
  elements.videoThumbnail.style.backgroundImage = `url(${thumbnailUrl})`;

  // Set title
  elements.videoTitle.textContent = currentVideo.title;

  // Set meta (channel + duration)
  const metaParts = [];
  if (currentVideo.channel) metaParts.push(currentVideo.channel);
  if (currentVideo.duration) metaParts.push(currentVideo.duration);
  elements.videoMeta.textContent = metaParts.join(' · ') || 'YouTube video';

  elements.createBtn.disabled = false;
  elements.createBtn.textContent = '+ Create a new x10';
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

    // Check which x10s contain this video
    if (currentVideo) {
      const checkResult = await api.checkVideoInX10s(currentVideo.id);
      videoInX10s = checkResult.inX10s || [];
    }

    renderX10sList(result.x10s);
  }
}

function renderX10sList(x10s) {
  elements.x10sList.innerHTML = '';

  x10s.forEach(x10 => {
    const isInX10 = videoInX10s.includes(x10.id);

    const item = document.createElement('button');
    item.className = 'x10-item';
    item.dataset.x10Id = x10.id;

    item.innerHTML = `
      <span class="x10-check">${isInX10 ? '✓' : ''}</span>
      <span class="x10-name">${escapeHtml(x10.title || 'Untitled')}</span>
      <span class="x10-count">${x10.videoCount} video${x10.videoCount > 1 ? 's' : ''}</span>
    `;

    if (!isInX10 && currentVideo) {
      item.addEventListener('click', () => handleAddToX10(x10.id, x10.title));
    } else if (isInX10) {
      item.style.cursor = 'default';
      item.title = 'Video already in this x10';
    } else {
      item.disabled = true;
    }

    elements.x10sList.appendChild(item);
  });
}

async function handleCreateX10() {
  if (!currentVideo) return;

  elements.createBtn.disabled = true;
  elements.createBtn.textContent = 'Creating...';

  const result = await api.createX10(currentVideo.url);

  if (result.success) {
    showToast(`Created new x10!`, 'success');

    // Open the new x10 page
    setTimeout(() => {
      chrome.tabs.create({ url: api.getX10Url(result.x10.x10Id) });
    }, 500);
  } else {
    showToast(`Error: ${result.error}`, 'error');
    elements.createBtn.disabled = false;
    elements.createBtn.textContent = '+ Create a new x10';
  }
}

async function handleAddToX10(x10Id, x10Title) {
  if (!currentVideo) return;

  // Find and disable the item
  const item = elements.x10sList.querySelector(`[data-x10-id="${x10Id}"]`);
  if (item) {
    item.classList.add('adding');
  }

  const result = await api.addVideoToX10(x10Id, currentVideo.url);

  if (result.success) {
    showToast(`Added to ${x10Title || 'x10'}`, 'success');

    // Update the check mark
    if (item) {
      const checkSpan = item.querySelector('.x10-check');
      if (checkSpan) checkSpan.textContent = '✓';
      item.classList.remove('adding');
      item.style.cursor = 'default';
    }

    videoInX10s.push(x10Id);
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
