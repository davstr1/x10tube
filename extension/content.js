// Content script for x10tube
// Extracts captions and sends to x10tube backend

const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const DEFAULT_BACKEND_URL = 'http://localhost:3000';
const INNERTUBE_CONTEXT = {
  client: {
    clientName: 'WEB',
    clientVersion: '2.20250120.01.00',
    hl: 'en',
    gl: 'US',
  }
};

// Get video ID from URL
function getVideoId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('v');
}

// Get video title
function getVideoTitle() {
  const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string, h1.ytd-watch-metadata yt-formatted-string');
  return titleElement?.textContent || document.title.replace(' - YouTube', '');
}

// Decode HTML entities
function decodeHtml(text) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

// Strip HTML tags
function stripTags(text) {
  return text.replace(/<[^>]*>/g, '');
}

// Format milliseconds to timecode [HH:MM:SS] or [MM:SS]
function formatTimecode(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `[${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
  }
  return `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
}

// Format seconds to timecode
function formatTimecodeFromSeconds(sec) {
  return formatTimecode(sec * 1000);
}

// Fetch with proper YouTube headers
async function ytFetch(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Youtube-Client-Name': '1',
      'X-Youtube-Client-Version': '2.20250120.01.00',
    },
    body: JSON.stringify(body)
  });
  return response;
}

// Method 1: Get transcript via engagement panels (/next endpoint)
async function getTranscriptViaNext(videoId) {
  const result = {
    success: false,
    captions: null,
    error: null,
    debug: { method: 'next_endpoint' }
  };

  try {
    // Step 1: Call /next to get engagement panels
    const nextUrl = `https://www.youtube.com/youtubei/v1/next?key=${INNERTUBE_API_KEY}`;
    const nextBody = {
      context: INNERTUBE_CONTEXT,
      videoId: videoId
    };

    console.log('[YT Captions] Calling /next endpoint...');
    const nextResponse = await ytFetch(nextUrl, nextBody);
    result.debug.nextStatus = nextResponse.status;

    if (!nextResponse.ok) {
      throw new Error(`/next returned ${nextResponse.status}`);
    }

    const nextData = await nextResponse.json();

    // Find transcript panel in engagement panels
    const panels = nextData?.engagementPanels || [];
    let transcriptParams = null;

    for (const panel of panels) {
      const renderer = panel?.engagementPanelSectionListRenderer;
      if (renderer?.panelIdentifier === 'engagement-panel-searchable-transcript') {
        const content = renderer?.content;
        // Try continuationItemRenderer path
        const continuation = content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint?.params;
        if (continuation) {
          transcriptParams = continuation;
          break;
        }
      }
    }

    if (!transcriptParams) {
      result.debug.reason = 'no_transcript_params';
      result.error = 'Transcript panel not found. Video may not have captions.';
      return result;
    }

    result.debug.foundParams = true;

    // Step 2: Call /get_transcript with the params
    const transcriptUrl = `https://www.youtube.com/youtubei/v1/get_transcript?key=${INNERTUBE_API_KEY}`;
    const transcriptBody = {
      context: INNERTUBE_CONTEXT,
      params: transcriptParams
    };

    console.log('[YT Captions] Calling /get_transcript endpoint...');
    const transcriptResponse = await ytFetch(transcriptUrl, transcriptBody);
    result.debug.transcriptStatus = transcriptResponse.status;

    if (!transcriptResponse.ok) {
      throw new Error(`/get_transcript returned ${transcriptResponse.status}`);
    }

    const transcriptData = await transcriptResponse.json();

    // Extract transcript segments
    const actions = transcriptData?.actions || [];
    let segments = [];

    for (const action of actions) {
      const transcriptRenderer = action?.updateEngagementPanelAction?.content?.transcriptRenderer;
      const body = transcriptRenderer?.content?.transcriptSearchPanelRenderer?.body?.transcriptSegmentListRenderer?.initialSegments
        || transcriptRenderer?.body?.transcriptSegmentListRenderer?.initialSegments;

      if (body) {
        segments = body;
        break;
      }
    }

    if (segments.length === 0) {
      result.debug.reason = 'no_segments';
      result.error = 'No transcript segments found.';
      console.log('[YT Captions] Transcript response:', JSON.stringify(transcriptData).substring(0, 2000));
      return result;
    }

    // Extract text and timecodes from segments
    const textParts = [];
    const timedParts = [];

    for (const segment of segments) {
      const renderer = segment?.transcriptSegmentRenderer;
      if (!renderer) continue;

      const snippetRuns = renderer?.snippet?.runs || [];
      const startMs = parseInt(renderer?.startMs || '0', 10);

      let segmentText = '';
      for (const run of snippetRuns) {
        if (run.text) {
          segmentText += decodeHtml(stripTags(run.text));
        }
      }

      if (segmentText) {
        textParts.push(segmentText);
        timedParts.push({
          time: startMs,
          timecode: formatTimecode(startMs),
          text: segmentText
        });
      }
    }

    if (textParts.length === 0) {
      result.error = 'Could not extract text from segments.';
      return result;
    }

    result.success = true;
    result.captions = textParts.join(' ').replace(/\s+/g, ' ').trim();
    result.captionsWithTimecodes = timedParts.map(p => `${p.timecode} ${p.text}`).join('\n');
    result.segments = timedParts;
    result.debug.segmentCount = segments.length;
    result.debug.charCount = result.captions.length;

    return result;

  } catch (e) {
    result.error = `Error: ${e.message}`;
    result.debug.exception = e.toString();
    console.error('[YT Captions] Next method error:', e);
    return result;
  }
}

// Method 2: Get captions via /player endpoint and XML
async function getCaptionsViaPlayer(videoId) {
  const result = {
    success: false,
    captions: null,
    language: null,
    error: null,
    debug: { method: 'player_endpoint' }
  };

  try {
    // Step 1: Call /player to get caption tracks
    const playerUrl = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}`;
    const playerBody = {
      context: INNERTUBE_CONTEXT,
      videoId: videoId
    };

    console.log('[YT Captions] Calling /player endpoint...');
    const playerResponse = await ytFetch(playerUrl, playerBody);
    result.debug.playerStatus = playerResponse.status;

    if (!playerResponse.ok) {
      throw new Error(`/player returned ${playerResponse.status}`);
    }

    const playerData = await playerResponse.json();

    // Check playability
    const playability = playerData?.playabilityStatus?.status;
    result.debug.playability = playability;

    if (playability !== 'OK') {
      result.error = `Video not playable: ${playability}`;
      return result;
    }

    // Get caption tracks
    const captionTracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!captionTracks || captionTracks.length === 0) {
      result.error = 'No caption tracks found.';
      result.debug.reason = 'no_tracks';
      return result;
    }

    result.debug.trackCount = captionTracks.length;

    // Get the first track (usually primary language)
    const track = captionTracks[0];
    let captionUrl = track.baseUrl;
    result.language = track.name?.simpleText || track.languageCode;
    result.debug.isAuto = track.kind === 'asr';

    // Remove srv3 format if present, use default XML
    captionUrl = captionUrl.replace('&fmt=srv3', '');

    console.log('[YT Captions] Fetching caption XML from:', captionUrl);
    result.debug.captionUrl = captionUrl.substring(0, 100) + '...';

    // Step 2: Fetch the caption XML
    const captionResponse = await fetch(captionUrl);
    result.debug.captionStatus = captionResponse.status;

    if (!captionResponse.ok) {
      throw new Error(`Caption XML returned ${captionResponse.status}`);
    }

    const captionXml = await captionResponse.text();
    result.debug.xmlLength = captionXml.length;

    if (!captionXml || captionXml.length === 0) {
      result.error = 'Empty caption response.';
      return result;
    }

    // Parse XML
    const parser = new DOMParser();
    const doc = parser.parseFromString(captionXml, 'text/xml');

    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      result.debug.xmlPreview = captionXml.substring(0, 300);
      throw new Error('Invalid XML');
    }

    const textElements = doc.querySelectorAll('text');
    result.debug.textElements = textElements.length;

    if (textElements.length === 0) {
      result.error = 'No text elements in caption XML.';
      return result;
    }

    // Extract text and timecodes
    const textParts = [];
    const timedParts = [];

    for (const el of textElements) {
      const text = el.textContent;
      if (text) {
        const decodedText = decodeHtml(stripTags(text));
        const startSec = parseFloat(el.getAttribute('start') || '0');
        const startMs = Math.floor(startSec * 1000);

        textParts.push(decodedText);
        timedParts.push({
          time: startMs,
          timecode: formatTimecode(startMs),
          text: decodedText
        });
      }
    }

    result.success = true;
    result.captions = textParts.join(' ').replace(/\s+/g, ' ').trim();
    result.captionsWithTimecodes = timedParts.map(p => `${p.timecode} ${p.text}`).join('\n');
    result.segments = timedParts;
    result.debug.charCount = result.captions.length;

    return result;

  } catch (e) {
    result.error = `Error: ${e.message}`;
    result.debug.exception = e.toString();
    console.error('[YT Captions] Player method error:', e);
    return result;
  }
}

// Main function: try both methods
async function getCaptions(videoId) {
  console.log('[YT Captions] Getting captions for:', videoId);

  // Try method 1: /next + /get_transcript
  const nextResult = await getTranscriptViaNext(videoId);
  if (nextResult.success) {
    return nextResult;
  }

  console.log('[YT Captions] Method 1 failed, trying method 2...');

  // Try method 2: /player + XML
  const playerResult = await getCaptionsViaPlayer(videoId);
  if (playerResult.success) {
    return playerResult;
  }

  // Both failed
  return {
    success: false,
    error: nextResult.error || playerResult.error || 'All methods failed.',
    debug: {
      method1: nextResult.debug,
      method2: playerResult.debug
    }
  };
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getCaptions') {
    (async () => {
      const videoId = getVideoId();

      if (!videoId) {
        sendResponse({
          success: false,
          error: 'Could not find video ID.',
          debug: { reason: 'no_video_id' }
        });
        return;
      }

      const result = await getCaptions(videoId);

      if (result.success) {
        sendResponse({
          success: true,
          captions: result.captions,
          captionsWithTimecodes: result.captionsWithTimecodes,
          title: getVideoTitle(),
          language: result.language || 'Auto-detected',
          isAutoGenerated: result.debug?.isAuto || false,
          debug: result.debug
        });
      } else {
        sendResponse({
          success: false,
          error: result.error,
          debug: result.debug
        });
      }
    })();

    return true;
  }
});

// =====================================================
// FLOATING UI - Button and Panel injected into YouTube
// =====================================================

let captionsLoaded = false;

function injectFloatingUI() {
  // Don't inject if already exists
  if (document.getElementById('ytc-floating-btn')) return;

  // Don't inject if not on a video page
  if (!getVideoId()) return;

  // Create styles
  const styles = document.createElement('style');
  styles.textContent = `
    #ytc-floating-btn {
      position: fixed;
      top: 80px;
      right: 20px;
      width: 48px;
      height: 48px;
      background: #ff4d4d;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transition: transform 0.2s, background 0.2s;
    }
    #ytc-floating-btn:hover {
      transform: scale(1.1);
      background: #ff3333;
    }
    #ytc-floating-btn svg {
      width: 24px;
      height: 24px;
      fill: white;
    }
    #ytc-panel {
      position: fixed;
      top: 80px;
      right: 80px;
      width: 380px;
      max-height: 500px;
      background: #1a1a2e;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      z-index: 9998;
      display: none;
      flex-direction: column;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    #ytc-panel.open {
      display: flex;
    }
    #ytc-panel-header {
      padding: 16px;
      background: #16213e;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    #ytc-panel-header h3 {
      margin: 0;
      font-size: 16px;
      color: #ff4d4d;
      font-weight: 600;
    }
    #ytc-panel-close {
      background: none;
      border: none;
      color: #888;
      font-size: 24px;
      cursor: pointer;
      line-height: 1;
    }
    #ytc-panel-close:hover {
      color: #fff;
    }
    #ytc-panel-content {
      padding: 16px;
      overflow-y: auto;
      flex: 1;
    }
    #ytc-panel .status {
      padding: 12px;
      background: #0f0f1a;
      border-radius: 8px;
      text-align: center;
      color: #4da6ff;
    }
    #ytc-panel .error {
      padding: 12px;
      background: #2d1f1f;
      border: 1px solid #ff4d4d;
      border-radius: 8px;
      color: #ff6b6b;
      font-size: 13px;
    }
    #ytc-panel .options-row {
      display: flex;
      align-items: center;
      margin-bottom: 12px;
    }
    #ytc-panel .toggle-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: #888;
      cursor: pointer;
    }
    #ytc-panel .toggle-label input {
      display: none;
    }
    #ytc-panel .toggle-switch {
      position: relative;
      width: 36px;
      height: 20px;
      background: #333;
      border-radius: 10px;
      transition: background 0.2s;
    }
    #ytc-panel .toggle-switch::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      background: #888;
      border-radius: 50%;
      transition: all 0.2s;
    }
    #ytc-panel .toggle-label input:checked + .toggle-switch {
      background: #ff4d4d;
    }
    #ytc-panel .toggle-label input:checked + .toggle-switch::after {
      left: 18px;
      background: #fff;
    }
    #ytc-panel textarea {
      width: 100%;
      height: 180px;
      padding: 12px;
      background: #0f0f1a;
      border: 1px solid #333;
      border-radius: 8px;
      color: #eaeaea;
      font-size: 13px;
      line-height: 1.5;
      resize: vertical;
      font-family: inherit;
      margin-bottom: 12px;
    }
    #ytc-panel textarea:focus {
      outline: none;
      border-color: #ff4d4d;
    }
    #ytc-panel .buttons-row {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }
    #ytc-panel .btn {
      flex: 1;
      padding: 10px 16px;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    #ytc-panel .copy-btn {
      background: #ff4d4d;
      color: #fff;
    }
    #ytc-panel .copy-btn:hover {
      background: #ff3333;
    }
    #ytc-panel .copy-btn.copied {
      background: #4caf50;
    }
    #ytc-panel .claude-btn {
      background: #d97706;
      color: #fff;
    }
    #ytc-panel .claude-btn:hover {
      background: #b45309;
    }
    #ytc-panel .claude-settings {
      padding-top: 12px;
      border-top: 1px solid #333;
    }
    #ytc-panel .claude-settings label {
      display: block;
      font-size: 12px;
      color: #888;
      margin-bottom: 6px;
    }
    #ytc-panel .claude-settings textarea {
      height: 50px;
      margin-bottom: 0;
    }
    #ytc-panel .x10-section {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #333;
    }
    #ytc-panel .x10-section h4 {
      font-size: 13px;
      color: #ff4d4d;
      margin: 0 0 12px 0;
      font-weight: 600;
    }
    #ytc-panel .x10-btn {
      width: 100%;
      padding: 12px 16px;
      background: #dc2626;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 12px;
    }
    #ytc-panel .x10-btn:hover {
      background: #b91c1c;
    }
    #ytc-panel .x10-btn:disabled {
      background: #666;
      cursor: not-allowed;
    }
    #ytc-panel .x10-btn.success {
      background: #16a34a;
    }
    #ytc-panel .x10-settings {
      margin-top: 12px;
    }
    #ytc-panel .x10-settings label {
      display: block;
      font-size: 12px;
      color: #888;
      margin-bottom: 4px;
    }
    #ytc-panel .x10-settings input {
      width: 100%;
      padding: 8px 12px;
      background: #0f0f1a;
      border: 1px solid #333;
      border-radius: 6px;
      color: #eaeaea;
      font-size: 12px;
      font-family: monospace;
      margin-bottom: 8px;
    }
    #ytc-panel .x10-settings input:focus {
      outline: none;
      border-color: #ff4d4d;
    }
    #ytc-panel .x10-link {
      display: block;
      text-align: center;
      font-size: 12px;
      color: #888;
      text-decoration: none;
      margin-top: 8px;
    }
    #ytc-panel .x10-link:hover {
      color: #ff4d4d;
    }
  `;
  document.head.appendChild(styles);

  // Create floating button
  const btn = document.createElement('button');
  btn.id = 'ytc-floating-btn';
  btn.title = 'YouTube Captions Grabber';
  btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6zm0 4h8v2H6zm10 0h2v2h-2zm-6-4h8v2h-8z"/></svg>`;
  document.body.appendChild(btn);

  // Create panel
  const panel = document.createElement('div');
  panel.id = 'ytc-panel';
  panel.innerHTML = `
    <div id="ytc-panel-header">
      <h3>YouTube Captions</h3>
      <button id="ytc-panel-close">&times;</button>
    </div>
    <div id="ytc-panel-content">
      <div id="ytc-status" class="status">Cliquez pour charger les sous-titres</div>
      <div id="ytc-error" class="error" style="display:none;"></div>
      <div id="ytc-result" style="display:none;">
        <div class="options-row">
          <label class="toggle-label">
            <input type="checkbox" id="ytc-timecodes">
            <span class="toggle-switch"></span>
            <span>Afficher les timecodes</span>
          </label>
        </div>
        <textarea id="ytc-captions" readonly></textarea>
        <div class="buttons-row">
          <button class="btn copy-btn" id="ytc-copy">Copier</button>
          <button class="btn claude-btn" id="ytc-claude">Envoyer à Claude</button>
        </div>
        <div class="claude-settings">
          <label>Prompt Claude :</label>
          <textarea id="ytc-prompt">Résume-moi ça. On apprend quelque chose?</textarea>
        </div>
        <div class="x10-section">
          <h4>x10tube</h4>
          <button class="x10-btn" id="ytc-add-x10">Add to x10tube</button>
          <div class="x10-settings">
            <label>User code (to sync across devices):</label>
            <input type="text" id="ytc-user-code" placeholder="Leave empty for a new code">
            <label>Backend URL:</label>
            <input type="text" id="ytc-backend-url" value="http://localhost:3000">
          </div>
          <a class="x10-link" id="ytc-open-dashboard" href="#" target="_blank">Open my x10s →</a>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  // State
  let currentCaptions = '';
  let currentCaptionsWithTimecodes = '';

  // Load saved prompt
  chrome.storage.local.get(['claudePrompt'], (data) => {
    if (data.claudePrompt) {
      document.getElementById('ytc-prompt').value = data.claudePrompt;
    }
  });

  // Toggle panel
  btn.addEventListener('click', async () => {
    panel.classList.toggle('open');

    if (panel.classList.contains('open') && !captionsLoaded) {
      await loadCaptions();
    }
  });

  // Close panel
  document.getElementById('ytc-panel-close').addEventListener('click', () => {
    panel.classList.remove('open');
  });

  // Load captions
  async function loadCaptions() {
    const statusEl = document.getElementById('ytc-status');
    const errorEl = document.getElementById('ytc-error');
    const resultEl = document.getElementById('ytc-result');

    statusEl.style.display = 'block';
    statusEl.textContent = 'Chargement des sous-titres...';
    errorEl.style.display = 'none';
    resultEl.style.display = 'none';

    const videoId = getVideoId();
    if (!videoId) {
      statusEl.style.display = 'none';
      errorEl.style.display = 'block';
      errorEl.textContent = 'Impossible de trouver l\'ID de la vidéo.';
      return;
    }

    const result = await getCaptions(videoId);

    statusEl.style.display = 'none';

    if (result.success) {
      currentCaptions = result.captions;
      currentCaptionsWithTimecodes = result.captionsWithTimecodes || result.captions;
      document.getElementById('ytc-captions').value = currentCaptions;
      resultEl.style.display = 'block';
      captionsLoaded = true;
    } else {
      errorEl.style.display = 'block';
      errorEl.textContent = result.error;
    }
  }

  // Timecode toggle
  document.getElementById('ytc-timecodes').addEventListener('change', (e) => {
    const captionsEl = document.getElementById('ytc-captions');
    captionsEl.value = e.target.checked ? currentCaptionsWithTimecodes : currentCaptions;
  });

  // Copy button
  document.getElementById('ytc-copy').addEventListener('click', async () => {
    const copyBtn = document.getElementById('ytc-copy');
    const text = document.getElementById('ytc-captions').value;

    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = 'Copié !';
      copyBtn.classList.add('copied');
      setTimeout(() => {
        copyBtn.textContent = 'Copier';
        copyBtn.classList.remove('copied');
      }, 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  });

  // Send to Claude
  document.getElementById('ytc-claude').addEventListener('click', async () => {
    const prompt = document.getElementById('ytc-prompt').value.trim();
    const captions = document.getElementById('ytc-captions').value;

    // Save prompt
    chrome.storage.local.set({ claudePrompt: prompt });

    // Build message
    const message = `${prompt}\n\n---\n\n${captions}`;

    // Store for Claude inject script
    await chrome.storage.local.set({ pendingClaudeMessage: message });

    // Open Claude
    window.open('https://claude.ai/new', '_blank');
  });

  // Save prompt on change
  document.getElementById('ytc-prompt').addEventListener('change', (e) => {
    chrome.storage.local.set({ claudePrompt: e.target.value });
  });

  // x10tube integration
  const userCodeInput = document.getElementById('ytc-user-code');
  const backendUrlInput = document.getElementById('ytc-backend-url');
  const addX10Btn = document.getElementById('ytc-add-x10');
  const openDashboardLink = document.getElementById('ytc-open-dashboard');

  // Load saved x10tube settings
  chrome.storage.local.get(['x10UserCode', 'x10BackendUrl'], (data) => {
    if (data.x10UserCode) {
      userCodeInput.value = data.x10UserCode;
    }
    if (data.x10BackendUrl) {
      backendUrlInput.value = data.x10BackendUrl;
    }
    updateDashboardLink();
  });

  // Save settings on change
  userCodeInput.addEventListener('change', () => {
    chrome.storage.local.set({ x10UserCode: userCodeInput.value });
    updateDashboardLink();
  });

  backendUrlInput.addEventListener('change', () => {
    chrome.storage.local.set({ x10BackendUrl: backendUrlInput.value });
    updateDashboardLink();
  });

  function updateDashboardLink() {
    const backendUrl = backendUrlInput.value || DEFAULT_BACKEND_URL;
    openDashboardLink.href = `${backendUrl}/dashboard`;
  }

  // Add to x10tube
  addX10Btn.addEventListener('click', async () => {
    const videoUrl = window.location.href;
    const backendUrl = backendUrlInput.value || DEFAULT_BACKEND_URL;
    const userCode = userCodeInput.value.trim();

    addX10Btn.disabled = true;
    addX10Btn.textContent = 'Adding...';

    try {
      const response = await fetch(`${backendUrl}/api/x10/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: videoUrl,
          userCode: userCode || undefined
        })
      });

      const data = await response.json();

      if (data.success) {
        // Save the user code if we got one back
        if (data.userCode && !userCode) {
          userCodeInput.value = data.userCode;
          chrome.storage.local.set({ x10UserCode: data.userCode });
        }

        addX10Btn.textContent = 'Added! ✓';
        addX10Btn.classList.add('success');

        setTimeout(() => {
          addX10Btn.textContent = 'Add to x10tube';
          addX10Btn.classList.remove('success');
          addX10Btn.disabled = false;
        }, 2000);
      } else {
        throw new Error(data.error || 'Failed to add video');
      }
    } catch (error) {
      console.error('[x10tube] Error:', error);
      addX10Btn.textContent = 'Error: ' + error.message;
      addX10Btn.disabled = false;

      setTimeout(() => {
        addX10Btn.textContent = 'Add to x10tube';
      }, 3000);
    }
  });
}

// Inject UI when on video page
function checkAndInjectUI() {
  if (getVideoId()) {
    injectFloatingUI();
  }
}

// Initial check
checkAndInjectUI();

// Re-check on URL changes (YouTube is SPA)
let lastUrl = location.href;

new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    captionsLoaded = false; // Reset for new video

    const panel = document.getElementById('ytc-panel');
    if (panel) {
      panel.classList.remove('open');
      // Reset UI state
      const statusEl = document.getElementById('ytc-status');
      const resultEl = document.getElementById('ytc-result');
      const errorEl = document.getElementById('ytc-error');
      if (statusEl) statusEl.style.display = 'block';
      if (statusEl) statusEl.textContent = 'Cliquez pour charger les sous-titres';
      if (resultEl) resultEl.style.display = 'none';
      if (errorEl) errorEl.style.display = 'none';
    }
    setTimeout(checkAndInjectUI, 1000);
  }
}).observe(document.body, { subtree: true, childList: true });
