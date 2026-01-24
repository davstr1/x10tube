import { Router, Request, Response } from 'express';
import { createX10, getX10sForUser, getX10sForAnonymous, getX10ById, addVideoToX10, removeVideoFromX10, checkVideoInUserX10s, checkVideoInAnonymousX10s, forkX10, deleteX10, updateX10PrePrompt } from '../services/x10.js';
import { extractVideoId } from '../services/transcript.js';
import { getUserSettings, updateDefaultPrePrompt } from '../services/settings.js';

export const apiRouter = Router();

// CORS middleware for API routes
apiRouter.use((req, res, next) => {
  // For credentials to work, we need specific origin (not *)
  const origin = req.headers.origin;

  // Allow these origins + any chrome-extension origin
  const isAllowed = origin && (
    origin.includes('youtube.com') ||
    origin.includes('localhost:3000') ||
    origin.includes('x10tube.com') ||
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

// Create new x10
apiRouter.post('/x10/create', async (req: Request, res: Response) => {
  const { urls } = req.body;
  const userId = req.headers['x-user-id'] as string | undefined;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'URLs array required' });
  }

  if (urls.length > 10) {
    return res.status(400).json({ error: 'Maximum 10 items per x10' });
  }

  try {
    const { x10, failed } = await createX10(urls, userId || null, null);

    res.json({
      id: x10.id,
      url: `/s/${x10.id}`,
      videoCount: x10.videos.length,
      failed
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create x10'
    });
  }
});

// Add video to x10
apiRouter.post('/x10/:id/add', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { url, userCode } = req.body;
  const userId = req.headers['x-user-id'] as string | undefined;

  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }

  const x10 = getX10ById(id);
  if (!x10) {
    return res.status(404).json({ error: 'X10 not found' });
  }

  // Check ownership by user_id or anonymous_id
  const isOwnerByUserId = x10.user_id !== null && x10.user_id === userId;
  const isOwnerByAnonymousId = x10.anonymous_id !== null && x10.anonymous_id === userCode;
  const isOrphan = x10.user_id === null && x10.anonymous_id === null;

  if (!isOwnerByUserId && !isOwnerByAnonymousId && !isOrphan) {
    return res.status(403).json({ error: 'Not authorized to edit this x10' });
  }

  if (x10.videos.length >= 10) {
    return res.status(400).json({ error: 'Maximum 10 items per x10' });
  }

  try {
    const item = await addVideoToX10(id, url);
    res.json({ success: true, item });
  } catch (error) {
    console.error('[API] Error adding item to x10:', id, url, error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to add content'
    });
  }
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

// Add content from Chrome extension (creates new x10 or adds to most recent)
// Supports both YouTube videos and web pages
apiRouter.post('/x10/add', async (req: Request, res: Response) => {
  const { url, userCode, forceNew } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, error: 'URL required' });
  }

  // Check if it's a YouTube URL
  const videoId = extractVideoId(url);
  const isYouTube = !!videoId;

  try {
    // Use the provided user code or generate a new one
    const { nanoid } = await import('nanoid');
    const anonymousId = userCode && userCode.trim() ? userCode.trim() : nanoid(16);

    // Import the function to get x10s for anonymous user
    const { getX10sForAnonymous } = await import('../services/x10.js');

    // Get user's x10s to find the most recent one
    const existingX10s = getX10sForAnonymous(anonymousId);

    let x10Id: string;
    let x10Url: string;

    if (!forceNew && existingX10s.length > 0 && existingX10s[0].videos.length < 10) {
      // Add to the most recent x10
      const recentX10 = existingX10s[0];

      // Check if item is already in this x10
      const alreadyExists = isYouTube
        ? recentX10.videos.some(v => v.youtube_id === videoId)
        : recentX10.videos.some(v => v.url === url);

      if (alreadyExists) {
        return res.json({
          success: true,
          x10Id: recentX10.id,
          x10Url: `/s/${recentX10.id}`,
          userCode: anonymousId,
          message: isYouTube ? 'Video already in your most recent x10' : 'Page already in your most recent x10'
        });
      }

      const item = await addVideoToX10(recentX10.id, url);
      x10Id = recentX10.id;
      x10Url = `/s/${recentX10.id}`;
    } else {
      // Create a new x10
      const { x10, failed } = await createX10([url], null, null, anonymousId);

      if (x10.videos.length === 0) {
        return res.status(400).json({
          success: false,
          error: failed[0]?.error || 'Could not extract content'
        });
      }

      x10Id = x10.id;
      x10Url = `/s/${x10.id}`;
    }

    res.json({
      success: true,
      x10Id,
      x10Url,
      userCode: anonymousId
    });

  } catch (error) {
    console.error('Error adding content from extension:', error);
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
