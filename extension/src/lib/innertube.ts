// YouTube transcript extraction via InnerTube API
// Runs in the extension (user's IP) to avoid rate limiting on server

const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

// WEB client context
const WEB_CONTEXT = {
  client: {
    clientName: 'WEB',
    clientVersion: '2.20250122.01.00',
    hl: 'en',
    gl: 'US',
    userAgent: navigator.userAgent,
    originalUrl: 'https://www.youtube.com',
    platform: 'DESKTOP',
  }
};

// ANDROID client context (fallback, often more reliable)
const ANDROID_CONTEXT = {
  client: {
    clientName: 'ANDROID',
    clientVersion: '19.09.37',
    androidSdkVersion: 30,
    hl: 'en',
    gl: 'US',
  }
};

// ============================================
// Types
// ============================================

export interface TranscriptResult {
  transcript: string;
  title: string;
  channel: string;
  duration: number;  // in seconds
  durationFormatted: string;
  language: string;
}

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  name: { simpleText: string };
  vssId: string;
  isTranslatable: boolean;
}

interface PlayerResponse {
  playabilityStatus?: {
    status: string;
    reason?: string;
  };
  videoDetails?: {
    videoId: string;
    title: string;
    author: string;
    lengthSeconds: string;
  };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks: CaptionTrack[];
    };
  };
}

// ============================================
// Helpers
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
}

function stripTags(text: string): string {
  return text.replace(/<[^>]*>/g, '');
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

// ============================================
// InnerTube API calls
// ============================================

async function tryFetchPlayerData(
  videoId: string,
  context: typeof WEB_CONTEXT | typeof ANDROID_CONTEXT,
  clientName: string
): Promise<PlayerResponse | null> {
  const url = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}`;

  // Add timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://www.youtube.com',
        'Referer': 'https://www.youtube.com/',
      },
      body: JSON.stringify({
        context: context,
        videoId: videoId
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log(`[InnerTube] ${clientName} client returned ${response.status}`);
      return null;
    }

    const data = await response.json() as PlayerResponse;
    const playability = data?.playabilityStatus?.status;

    if (playability === 'OK') {
      return data;
    }

    console.log(`[InnerTube] ${clientName} client: ${data?.playabilityStatus?.reason || 'Unknown error'}`);
    return null;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      console.log(`[InnerTube] ${clientName} client timed out`);
      return null;
    }
    console.log(`[InnerTube] ${clientName} client error:`, error instanceof Error ? error.message : error);
    return null;
  }
}

async function fetchPlayerData(videoId: string, retries = 3): Promise<PlayerResponse> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    // Try WEB client first
    const webResult = await tryFetchPlayerData(videoId, WEB_CONTEXT, 'WEB');
    if (webResult) {
      return webResult;
    }

    // Fallback to ANDROID client
    const androidResult = await tryFetchPlayerData(videoId, ANDROID_CONTEXT, 'ANDROID');
    if (androidResult) {
      return androidResult;
    }

    lastError = new Error('Video not available');

    if (attempt < retries) {
      console.log(`[InnerTube] Attempt ${attempt} failed for ${videoId}. Retrying in ${500 * attempt}ms...`);
      await sleep(500 * attempt);
    }
  }

  throw lastError || new Error('Failed to fetch video data');
}

// ============================================
// Caption fetching
// ============================================

async function fetchCaptions(captionUrl: string): Promise<string> {
  // Remove srv3 format if present, use default XML format
  const url = captionUrl.replace('&fmt=srv3', '');

  // Add timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Caption fetch returned ${response.status}`);
    }

    const xml = await response.text();

    // Parse XML and extract text
    const textMatches = xml.matchAll(/<text[^>]*>([^<]*)<\/text>/g);
    const parts: string[] = [];

    for (const match of textMatches) {
      const text = decodeHtmlEntities(stripTags(match[1]));
      if (text.trim()) {
        parts.push(text);
      }
    }

    return parts.join(' ').replace(/\s+/g, ' ').trim();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Caption fetch timed out (10s)');
    }
    throw error;
  }
}

// ============================================
// Main export
// ============================================

/**
 * Extract transcript from a YouTube video
 * @param videoId - The YouTube video ID (11 characters)
 * @returns TranscriptResult with transcript text and metadata
 * @throws Error if video not found, private, or has no captions
 */
export async function getTranscript(videoId: string): Promise<TranscriptResult> {
  console.log(`[InnerTube] Getting transcript for ${videoId}`);

  // Fetch video metadata and caption tracks
  const playerData = await fetchPlayerData(videoId);

  // Extract video details
  const videoDetails = playerData?.videoDetails;
  const title = videoDetails?.title || 'Untitled';
  const channel = videoDetails?.author || 'Unknown';
  const lengthSeconds = parseInt(videoDetails?.lengthSeconds || '0', 10);

  // Get caption tracks
  const captionTracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  if (!captionTracks || captionTracks.length === 0) {
    throw new Error('No captions available for this video');
  }

  // Get the first available caption track
  const track = captionTracks[0];
  console.log(`[InnerTube] Using caption track: ${track.languageCode} (${track.name?.simpleText || 'auto'})`);

  const transcript = await fetchCaptions(track.baseUrl);

  if (!transcript) {
    throw new Error('Could not extract transcript');
  }

  console.log(`[InnerTube] Extracted ${transcript.length} chars of transcript`);

  return {
    transcript,
    title,
    channel,
    duration: lengthSeconds,
    durationFormatted: formatDuration(lengthSeconds),
    language: track.languageCode
  };
}

/**
 * Estimate token count for text (rough approximation: ~4 chars per token)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
