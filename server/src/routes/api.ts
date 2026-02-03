import { Router, Request, Response } from 'express';
import { createX10, getX10sForUser, getX10sForAnonymous, getX10ById, addVideoToX10, removeVideoFromX10, checkVideoInUserX10s, checkVideoInAnonymousX10s, forkX10, deleteX10, updateX10PrePrompt, addPreExtractedContentToX10, createX10WithPreExtractedContent, PreExtractedContent } from '../services/x10.js';
import { extractVideoId } from '../services/transcript.js';
import { getUserSettings, updateDefaultPrePrompt } from '../services/settings.js';
import { config } from '../config.js';

export const apiRouter = Router();

// CORS middleware for API routes
apiRouter.use((req, res, next) => {
  // For credentials to work, we need specific origin (not *)
  const origin = req.headers.origin;

  // Allow these origins + any chrome-extension origin
  const isAllowed = origin && (
    origin.includes('youtube.com') ||
    origin.includes(new URL(config.baseUrl).host) ||
    origin.startsWith('chrome-extension://') ||
    origin.startsWith('moz-extension://') // Firefox
  );

  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (origin) {
    // For other origins, allow without credentials
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
});

// Get current user's identity (for extension sync)
apiRouter.get('/whoami', (req: Request, res: Response) => {
  res.json({ userCode: req.anonymousId });
});

// Get user's x10s
apiRouter.get('/x10s', (req: Request, res: Response) => {
  // TODO: Get user from auth token
  const userId = req.headers['x-user-id'] as string;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const x10s = getX10sForUser(userId);

  res.json({
    x10s: x10s.map(x => ({
      id: x.id,
      title: x.title,
      videoCount: x.videos.length,
      tokens: x.tokenCount,
      updatedAt: x.updated_at
    }))
  });
});

// Get x10s by user code (for extension)
apiRouter.get('/x10s/by-code/:userCode', (req: Request, res: Response) => {
  const { userCode } = req.params;

  if (!userCode) {
    return res.json({ x10s: [] });
  }

  const x10s = getX10sForAnonymous(userCode);

  res.json({
    x10s: x10s.map(x => ({
      id: x.id,
      title: x.title,
      videoCount: x.videos.length,
      tokens: x.tokenCount,
      updatedAt: x.updated_at
    }))
  });
});

// DISABLED: Server-side extraction removed - use /api/x10/add-content instead
// This endpoint used to extract content server-side, which caused rate limiting issues
apiRouter.post('/x10/create', (_req: Request, res: Response) => {
  return res.status(410).json({
    error: 'This endpoint is deprecated. Use /api/x10/add-content with pre-extracted content.',
    hint: 'Content extraction now happens client-side to avoid rate limiting.'
  });
});

// DISABLED: Server-side extraction removed - use /api/x10/add-content instead
apiRouter.post('/x10/:id/add', (_req: Request, res: Response) => {
  return res.status(410).json({
    error: 'This endpoint is deprecated. Use /api/x10/add-content with pre-extracted content.',
    hint: 'Content extraction now happens client-side to avoid rate limiting.'
  });
});

// Remove video from x10
apiRouter.delete('/x10/:id/video/:videoId', (req: Request, res: Response) => {
  const { id, videoId } = req.params;
  const userId = req.headers['x-user-id'] as string | undefined;

  const x10 = getX10ById(id);
  if (!x10) {
    return res.status(404).json({ error: 'X10 not found' });
  }

  // Check ownership
  if (x10.user_id !== null && x10.user_id !== userId) {
    return res.status(403).json({ error: 'Not authorized to edit this x10' });
  }

  const success = removeVideoFromX10(id, videoId);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Video not found' });
  }
});

// Check if a video is in user's x10s
apiRouter.get('/check-video', (req: Request, res: Response) => {
  const { url, videoId: queryVideoId, userCode } = req.query;
  const userId = req.headers['x-user-id'] as string | undefined;

  // Get video ID from url param or videoId param
  let videoId: string | null = null;
  if (url && typeof url === 'string') {
    videoId = extractVideoId(url);
  } else if (queryVideoId && typeof queryVideoId === 'string') {
    videoId = queryVideoId;
  }

  if (!videoId) {
    return res.status(400).json({ error: 'URL or videoId parameter required' });
  }

  // Check by userCode (for extension) or userId (for authenticated users)
  if (userCode && typeof userCode === 'string') {
    const inX10s = checkVideoInAnonymousX10s(userCode, videoId);
    return res.json({ inX10s });
  }

  if (!userId) {
    return res.json({ inX10s: [] });
  }

  const inX10s = checkVideoInUserX10s(userId, videoId);
  res.json({ inX10s });
});

// Fork x10
apiRouter.post('/x10/:id/fork', (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.headers['x-user-id'] as string | undefined;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const forked = forkX10(id, userId);
  if (forked) {
    res.json({
      id: forked.id,
      url: `/s/${forked.id}`
    });
  } else {
    res.status(404).json({ error: 'X10 not found' });
  }
});

// Delete x10
apiRouter.delete('/x10/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.headers['x-user-id'] as string | undefined;

  const x10 = getX10ById(id);
  if (!x10) {
    return res.status(404).json({ error: 'X10 not found' });
  }

  // Check ownership
  if (x10.user_id !== userId) {
    return res.status(403).json({ error: 'Not authorized to delete this x10' });
  }

  const success = deleteX10(id);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'Failed to delete x10' });
  }
});

// DISABLED: Server-side extraction removed - use /api/x10/add-content instead
// This was the main endpoint for the old extension that sent URLs for server-side extraction
apiRouter.post('/x10/add', (_req: Request, res: Response) => {
  return res.status(410).json({
    success: false,
    error: 'This endpoint is deprecated. Use /api/x10/add-content with pre-extracted content.',
    hint: 'Content extraction now happens client-side to avoid rate limiting.'
  });
});

// Add PRE-EXTRACTED content from Chrome extension (no server-side extraction)
// The extension extracts YouTube transcripts and web page content directly
apiRouter.post('/x10/add-content', async (req: Request, res: Response) => {
  const { url, title, type, content, youtube_id, channel, duration, collectionId, forceNew, userCode } = req.body;

  // Validate required fields
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, error: 'URL required' });
  }
  if (!title || typeof title !== 'string') {
    return res.status(400).json({ success: false, error: 'Title required' });
  }
  if (!type || (type !== 'youtube' && type !== 'webpage')) {
    return res.status(400).json({ success: false, error: 'Type must be "youtube" or "webpage"' });
  }
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ success: false, error: 'Content required' });
  }

  // Validate content size (max 500KB)
  if (content.length > 500 * 1024) {
    return res.status(400).json({ success: false, error: 'Content too large (max 500KB)' });
  }

  // YouTube videos must have youtube_id
  if (type === 'youtube' && !youtube_id) {
    return res.status(400).json({ success: false, error: 'YouTube ID required for YouTube videos' });
  }

  try {
    // Use the provided user code or the one from cookie, or generate new
    const { nanoid } = await import('nanoid');
    const anonymousId = userCode?.trim() || req.anonymousId || nanoid(16);

    // Build the content object
    const extractedContent: PreExtractedContent = {
      url,
      title,
      type,
      content,
      youtube_id: youtube_id || undefined,
      channel: channel || undefined,
      duration: typeof duration === 'number' ? duration : undefined
    };

    let x10Id: string;
    let itemId: string;

    // If collectionId is provided, add to that collection
    if (collectionId) {
      const x10 = getX10ById(collectionId);
      if (!x10) {
        return res.status(404).json({ success: false, error: 'Collection not found' });
      }

      // Check ownership
      const isOwner = x10.anonymous_id === anonymousId || x10.user_id === req.headers['x-user-id'];
      if (!isOwner) {
        return res.status(403).json({ success: false, error: 'Not authorized to edit this collection' });
      }

      if (x10.videos.length >= 10) {
        return res.status(400).json({ success: false, error: 'Collection is full (max 10 items)' });
      }

      // Check for duplicates
      const alreadyExists = type === 'youtube'
        ? x10.videos.some(v => v.youtube_id === youtube_id)
        : x10.videos.some(v => v.url === url);

      if (alreadyExists) {
        return res.json({
          success: true,
          itemId: x10.videos.find(v => type === 'youtube' ? v.youtube_id === youtube_id : v.url === url)?.id,
          collectionId: x10.id,
          userCode: anonymousId,
          message: 'Item already exists in this collection'
        });
      }

      const item = addPreExtractedContentToX10(collectionId, extractedContent);
      x10Id = collectionId;
      itemId = item.id;
    } else if (forceNew) {
      // Create a new collection
      const x10 = createX10WithPreExtractedContent(extractedContent, anonymousId);
      x10Id = x10.id;
      itemId = x10.videos[0].id;
    } else {
      // Add to most recent collection or create new
      const existingX10s = getX10sForAnonymous(anonymousId);

      if (existingX10s.length > 0 && existingX10s[0].videos.length < 10) {
        const recentX10 = existingX10s[0];

        // Check for duplicates
        const alreadyExists = type === 'youtube'
          ? recentX10.videos.some(v => v.youtube_id === youtube_id)
          : recentX10.videos.some(v => v.url === url);

        if (alreadyExists) {
          return res.json({
            success: true,
            itemId: recentX10.videos.find(v => type === 'youtube' ? v.youtube_id === youtube_id : v.url === url)?.id,
            collectionId: recentX10.id,
            userCode: anonymousId,
            message: 'Item already exists in your most recent collection'
          });
        }

        const item = addPreExtractedContentToX10(recentX10.id, extractedContent);
        x10Id = recentX10.id;
        itemId = item.id;
      } else {
        // Create new collection
        const x10 = createX10WithPreExtractedContent(extractedContent, anonymousId);
        x10Id = x10.id;
        itemId = x10.videos[0].id;
      }
    }

    res.json({
      success: true,
      itemId,
      collectionId: x10Id,
      userCode: anonymousId
    });

  } catch (error) {
    console.error('[API] Error adding pre-extracted content:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add content'
    });
  }
});

// Get user settings
apiRouter.get('/settings', (req: Request, res: Response) => {
  const userCode = req.anonymousId;
  const settings = getUserSettings(userCode);
  res.json(settings);
});

// Update user's default pre-prompt
apiRouter.patch('/settings/pre-prompt', (req: Request, res: Response) => {
  const userCode = req.anonymousId;
  const { prePrompt } = req.body;

  if (typeof prePrompt !== 'string') {
    return res.status(400).json({ error: 'prePrompt must be a string' });
  }

  const settings = updateDefaultPrePrompt(userCode, prePrompt);
  res.json(settings);
});

// Update x10 pre-prompt
apiRouter.patch('/x10/:id/pre-prompt', (req: Request, res: Response) => {
  const { id } = req.params;
  const { prePrompt } = req.body;
  const userCode = req.anonymousId;

  const x10 = getX10ById(id);
  if (!x10) {
    return res.status(404).json({ error: 'X10 not found' });
  }

  // Check ownership
  const isOwner = x10.anonymous_id === userCode || x10.user_id === req.headers['x-user-id'];
  if (!isOwner) {
    return res.status(403).json({ error: 'Not authorized to edit this x10' });
  }

  const success = updateX10PrePrompt(id, prePrompt || null);
  if (success) {
    res.json({ success: true, prePrompt });
  } else {
    res.status(500).json({ error: 'Failed to update pre-prompt' });
  }
});
