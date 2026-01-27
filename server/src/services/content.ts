// Unified content extraction service
// Handles both YouTube videos and web pages

import { extractVideoInfo, VideoInfo } from './transcript.js';

export type ContentType = 'youtube' | 'webpage';

export interface ContentInfo {
  url: string;
  type: ContentType;
  sourceId: string | null;      // youtube_id for videos, null for pages
  title: string;
  sourceName: string;           // channel for YouTube, domain for pages
  metadata: {
    duration?: string;          // YouTube only
  };
  content: string;              // transcript or markdown
}

// Detect URL type
export function detectUrlType(url: string): ContentType {
  if (url.match(/(?:youtube\.com|youtu\.be)/i)) {
    return 'youtube';
  }
  return 'webpage';
}

// Main extraction function - auto-detects type
export async function extractContent(url: string): Promise<ContentInfo> {
  const type = detectUrlType(url);

  if (type === 'youtube') {
    return extractYouTubeContent(url);
  } else {
    return extractWebPageContent(url);
  }
}

// Extract YouTube content (wrapper around existing transcript service)
async function extractYouTubeContent(url: string): Promise<ContentInfo> {
  const videoInfo: VideoInfo = await extractVideoInfo(url);

  return {
    url: videoInfo.url,
    type: 'youtube',
    sourceId: videoInfo.youtubeId,
    title: videoInfo.title,
    sourceName: videoInfo.channel,
    metadata: {
      duration: videoInfo.duration
    },
    content: videoInfo.transcript
  };
}

// ============================================
// Jina Reader - JSON mode
// ============================================

interface JinaResponse {
  code: number;
  status: number;
  data: {
    title: string;
    url: string;
    content: string;
    warning?: string;
    usage?: { tokens: number };
  } | null;
  name?: string;
  message?: string;
  readableMessage?: string;
}

// Warnings that indicate unusable content
const BLOCKING_WARNING_PATTERNS = [
  /Target URL returned error [45]\d\d/i,
  /requiring CAPTCHA/i,
];

// Titles that indicate a block/error page, not real content
const SUSPECT_TITLES = [
  'just a moment',
  'access denied',
  'attention required',
  'please verify',
  'verify you are human',
  'page not found',
  '403 forbidden',
  '404 not found',
  'blocked',
];

// Extract web page content via Jina Reader (JSON mode)
async function extractWebPageContent(url: string): Promise<ContentInfo> {
  const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;

  let response: Response;
  try {
    response = await fetch(jinaUrl, {
      headers: {
        'Accept': 'application/json',
      }
    });
  } catch (error) {
    throw new Error(`Could not reach page: ${error instanceof Error ? error.message : 'Network error'}`);
  }

  // HTTP errors (400, 422, 451)
  if (!response.ok) {
    let message: string | undefined;
    try {
      const errorData = await response.json() as JinaResponse;
      message = errorData.readableMessage || errorData.message;
    } catch { /* ignore JSON parse errors */ }

    if (response.status === 400) {
      throw new Error(message || 'Invalid URL');
    } else if (response.status === 451) {
      throw new Error(message || 'This site is blocked');
    } else if (response.status === 422) {
      throw new Error(message || 'Could not load page');
    } else {
      throw new Error(message || `Could not access page (${response.status})`);
    }
  }

  // Parse JSON response
  let json: JinaResponse;
  try {
    json = await response.json() as JinaResponse;
  } catch {
    throw new Error('Invalid response from content extraction service');
  }

  if (!json.data || !json.data.content) {
    throw new Error('No content found on this page');
  }

  // Check for blocking warnings (403, 404, CAPTCHA, etc.)
  if (json.data.warning) {
    for (const pattern of BLOCKING_WARNING_PATTERNS) {
      if (pattern.test(json.data.warning)) {
        // Use the first warning line as error message
        const firstWarning = json.data.warning.split('\n')[0].trim();
        throw new Error(`Page inaccessible: ${firstWarning}`);
      }
    }
  }

  // Check for suspect titles (anti-bot pages, error pages)
  const titleLower = (json.data.title || '').toLowerCase();
  const isSuspectTitle = SUSPECT_TITLES.some(s => titleLower.includes(s));
  const tokenCount = json.data.usage?.tokens || 0;

  if (isSuspectTitle && tokenCount < 100) {
    throw new Error(`Page blocked or inaccessible: "${json.data.title}"`);
  }

  // Check for very short content
  if (json.data.content.trim().length < 100) {
    throw new Error('Page content too short — may be blocked or empty');
  }

  // Extract domain as source name
  const domain = new URL(url).hostname.replace(/^www\./, '');

  return {
    url,
    type: 'webpage',
    sourceId: null,
    title: json.data.title || new URL(url).pathname.split('/').pop() || 'Untitled',
    sourceName: domain,
    metadata: {},
    content: json.data.content
  };
}

// Estimate token count (same as transcript.ts)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
