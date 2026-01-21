import { Router, Request, Response } from 'express';
import { createX10, getX10sForUser, getX10ById, addVideoToX10, removeVideoFromX10, checkVideoInUserX10s, forkX10, deleteX10 } from '../services/x10.js';
import { extractVideoId } from '../services/transcript.js';

export const apiRouter = Router();

// CORS middleware for API routes
apiRouter.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
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

// Create new x10
apiRouter.post('/x10/create', async (req: Request, res: Response) => {
  const { urls } = req.body;
  const userId = req.headers['x-user-id'] as string | undefined;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'URLs array required' });
  }

  if (urls.length > 10) {
    return res.status(400).json({ error: 'Maximum 10 videos per x10' });
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
  const { url } = req.body;
  const userId = req.headers['x-user-id'] as string | undefined;

  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }

  const x10 = getX10ById(id);
  if (!x10) {
    return res.status(404).json({ error: 'X10 not found' });
  }

  // Check ownership (or orphan status)
  if (x10.user_id !== null && x10.user_id !== userId) {
    return res.status(403).json({ error: 'Not authorized to edit this x10' });
  }

  if (x10.videos.length >= 10) {
    return res.status(400).json({ error: 'Maximum 10 videos per x10' });
  }

  try {
    const video = await addVideoToX10(id, url);
    res.json({ success: true, video });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to add video'
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
  const { url } = req.query;
  const userId = req.headers['x-user-id'] as string | undefined;

  if (!userId) {
    return res.json({ inX10s: [] });
  }

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL parameter required' });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return res.status(400).json({ error: 'Invalid YouTube URL' });
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

// Add video from Chrome extension (creates new x10 or adds to most recent)
apiRouter.post('/x10/add', async (req: Request, res: Response) => {
  const { url, userCode } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, error: 'URL required' });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return res.status(400).json({ success: false, error: 'Invalid YouTube URL' });
  }

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

    if (existingX10s.length > 0 && existingX10s[0].videos.length < 10) {
      // Add to the most recent x10
      const recentX10 = existingX10s[0];

      // Check if video is already in this x10
      const alreadyExists = recentX10.videos.some(v => v.youtube_id === videoId);
      if (alreadyExists) {
        return res.json({
          success: true,
          x10Id: recentX10.id,
          x10Url: `/s/${recentX10.id}`,
          userCode: anonymousId,
          message: 'Video already in your most recent x10'
        });
      }

      const video = await addVideoToX10(recentX10.id, url);
      x10Id = recentX10.id;
      x10Url = `/s/${recentX10.id}`;
    } else {
      // Create a new x10
      const { x10, failed } = await createX10([url], null, null, anonymousId);

      if (x10.videos.length === 0) {
        return res.status(400).json({
          success: false,
          error: failed[0]?.error || 'Could not extract transcript'
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
    console.error('Error adding video from extension:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add video'
    });
  }
});
