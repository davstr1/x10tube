// Jina Reader - Extract web page content as Markdown
// Runs in the extension (user's IP) to avoid rate limiting on server

// ============================================
// Types
// ============================================

export interface JinaResult {
  content: string;   // Markdown content
  title: string;
  url: string;
  domain: string;
  tokenCount?: number;
}

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

// ============================================
// Detection patterns
// ============================================

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

// ============================================
// Main export
// ============================================

/**
 * Extract content from a web page via Jina Reader
 * @param url - The web page URL to extract
 * @returns JinaResult with Markdown content and metadata
 * @throws Error if page is inaccessible, blocked, or has no content
 */
export async function getMarkdown(url: string): Promise<JinaResult> {
  console.log(`[Jina] Extracting content from ${url}`);

  const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;

  // Add timeout to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  let response: Response;
  try {
    response = await fetch(jinaUrl, {
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Page extraction timed out (30s)');
    }
    throw new Error(`Could not reach page: ${error instanceof Error ? error.message : 'Network error'}`);
  }
  clearTimeout(timeoutId);

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

  console.log(`[Jina] Extracted ${json.data.content.length} chars from ${domain}`);

  return {
    content: json.data.content,
    title: json.data.title || new URL(url).pathname.split('/').pop() || 'Untitled',
    url: json.data.url || url,
    domain,
    tokenCount
  };
}

/**
 * Check if a URL is a YouTube URL
 */
export function isYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes('youtube.com') || parsed.hostname === 'youtu.be';
  } catch {
    return false;
  }
}
