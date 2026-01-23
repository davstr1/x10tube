// YouTube transcript extraction service
// Uses the InnerTube API to fetch video metadata and captions

const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const INNERTUBE_CONTEXT = {
  client: {
    clientName: 'WEB',
    clientVersion: '2.20250122.01.00',
    hl: 'en',
    gl: 'US',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    originalUrl: 'https://www.youtube.com',
    platform: 'DESKTOP',
  }
};

export interface VideoInfo {
  youtubeId: string;
  url: string;
  title: string;
  channel: string;
  duration: string;
  transcript: string;
}

// Extract video ID from various YouTube URL formats
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

// Format seconds to duration string (e.g., "15:23" or "1:02:45")
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Decode HTML entities
function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
}

// Strip XML/HTML tags
function stripTags(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

// Sleep helper for retry delays
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Android client context (more reliable for some videos)
const ANDROID_CONTEXT = {
  client: {
    clientName: 'ANDROID',
    clientVersion: '19.09.37',
    androidSdkVersion: 30,
    hl: 'en',
    gl: 'US',
  }
};

// Try to fetch with a specific client context
async function tryFetchPlayerData(videoId: string, context: any, clientName: string): Promise<any | null> {
  const url = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://www.youtube.com',
        'Referer': 'https://www.youtube.com/',
      },
      body: JSON.stringify({
        context: context,
        videoId: videoId
      })
    });

    if (!response.ok) {
      console.log(`[Transcript] ${clientName} client returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    const playability = data?.playabilityStatus?.status;

    if (playability === 'OK') {
      return data;
    }

    console.log(`[Transcript] ${clientName} client: ${data?.playabilityStatus?.reason || 'Unknown error'}`);
    return null;
  } catch (error) {
    console.log(`[Transcript] ${clientName} client error:`, error instanceof Error ? error.message : error);
    return null;
  }
}

// Fetch video metadata and caption tracks via /player endpoint (with retry and fallback)
async function fetchPlayerData(videoId: string, retries = 3): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    // Try WEB client first
    const webResult = await tryFetchPlayerData(videoId, INNERTUBE_CONTEXT, 'WEB');
    if (webResult) {
      return webResult;
    }

    // Fallback to ANDROID client (often more reliable)
    const androidResult = await tryFetchPlayerData(videoId, ANDROID_CONTEXT, 'ANDROID');
    if (androidResult) {
      return androidResult;
    }

    lastError = new Error('Video not available');

    if (attempt < retries) {
      console.log(`[Transcript] Attempt ${attempt} failed for ${videoId}. Retrying in ${500 * attempt}ms...`);
      await sleep(500 * attempt);
    }
  }

  throw lastError || new Error('Failed to fetch video data');
}

// Fetch and parse caption XML
async function fetchCaptions(captionUrl: string): Promise<string> {
  // Remove srv3 format if present, use default XML
  const url = captionUrl.replace('&fmt=srv3', '');

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Caption fetch returned ${response.status}`);
  }

  const xml = await response.text();

  // Parse XML and extract text
  const textMatches = xml.matchAll(/<text[^>]*>([^<]*)<\/text>/g);
  const parts: string[] = [];

  for (const match of textMatches) {
    const text = decodeHtml(stripTags(match[1]));
    if (text.trim()) {
      parts.push(text);
    }
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

// Main extraction function
export async function extractVideoInfo(youtubeUrl: string): Promise<VideoInfo> {
  const videoId = extractVideoId(youtubeUrl);

  if (!videoId) {
    throw new Error('Invalid YouTube URL');
  }

  // fetchPlayerData now handles retries and playability check
  const playerData = await fetchPlayerData(videoId);

  // Extract video details
  const videoDetails = playerData?.videoDetails || {};
  const title = videoDetails.title || 'Untitled';
  const channel = videoDetails.author || 'Unknown';
  const lengthSeconds = parseInt(videoDetails.lengthSeconds || '0', 10);
  const duration = formatDuration(lengthSeconds);

  // Get caption tracks
  const captionTracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  if (!captionTracks || captionTracks.length === 0) {
    throw new Error('No captions available for this video');
  }

  // Get the first available caption track (usually primary language or auto-generated)
  const track = captionTracks[0];
  const transcript = await fetchCaptions(track.baseUrl);

  if (!transcript) {
    throw new Error('Could not extract transcript');
  }

  return {
    youtubeId: videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title,
    channel,
    duration,
    transcript
  };
}

// Extract multiple videos
export async function extractMultipleVideos(urls: string[]): Promise<{
  success: VideoInfo[];
  failed: { url: string; error: string }[];
}> {
  const success: VideoInfo[] = [];
  const failed: { url: string; error: string }[] = [];

  for (const url of urls) {
    try {
      const info = await extractVideoInfo(url);
      success.push(info);
    } catch (error) {
      failed.push({
        url,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return { success, failed };
}

// Estimate token count (rough approximation: ~4 chars per token)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
