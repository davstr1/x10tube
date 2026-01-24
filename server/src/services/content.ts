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

// Extract web page content via Jina Reader
async function extractWebPageContent(url: string): Promise<ContentInfo> {
  const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;

  let response: Response;
  try {
    response = await fetch(jinaUrl, {
      headers: {
        'Accept': 'text/plain',
        'User-Agent': 'X10Tube/1.0'
      }
    });
  } catch (error) {
    throw new Error(`Could not reach page: ${error instanceof Error ? error.message : 'Network error'}`);
  }

  // Handle HTTP errors
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Page not found');
    } else if (response.status === 400) {
      throw new Error('Invalid URL');
    } else if (response.status >= 500) {
      throw new Error('Page took too long to load');
    } else {
      throw new Error(`Could not access page (${response.status})`);
    }
  }

  const markdown = await response.text();

  // Check for empty or error content
  if (!markdown || markdown.trim().length === 0) {
    throw new Error('No content found on this page');
  }

  // Check for Jina error messages in content
  if (markdown.includes('Error:') && markdown.length < 500) {
    throw new Error('Could not access page content');
  }

  // Extract title from markdown (first # heading or "Title:" line)
  const title = extractTitleFromMarkdown(markdown) || new URL(url).pathname.split('/').pop() || 'Untitled';

  // Extract domain as source name
  const domain = new URL(url).hostname.replace(/^www\./, '');

  return {
    url,
    type: 'webpage',
    sourceId: null,
    title,
    sourceName: domain,
    metadata: {},
    content: markdown
  };
}

// Extract title from Jina markdown response
function extractTitleFromMarkdown(markdown: string): string | null {
  // Jina format: "Title: Page Title\n\nURL Source: ..."
  const titleMatch = markdown.match(/^Title:\s*(.+?)(?:\n|$)/m);
  if (titleMatch) {
    return titleMatch[1].trim();
  }

  // Fallback: first # heading
  const headingMatch = markdown.match(/^#\s+(.+?)(?:\n|$)/m);
  if (headingMatch) {
    return headingMatch[1].trim();
  }

  return null;
}

// Estimate token count (same as transcript.ts)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
