import { Router, Request, Response } from 'express';
import {
  getCollectionById,
  getCollectionsForUser,
  getCollectionsForAnonymous,
  addPreExtractedItemToCollection,
  createCollectionWithPreExtractedItem,
  removeItemFromCollection,
  checkItemInUserCollections,
  checkItemInAnonymousCollections,
  forkCollection,
  deleteCollection,
  updateCollectionPrePrompt,
  PreExtractedItem
} from '../services/collection.js';
import { extractVideoId } from '../services/transcript.js';
import { getUserSettings, updateDefaultPrePrompt } from '../services/settings.js';

export const apiRouter = Router();

// CORS is handled globally in index.ts

// Get current user's identity (for extension sync)
apiRouter.get('/whoami', (req: Request, res: Response) => {
  res.json({ userCode: req.anonymousId });
});

// Get user's collections
apiRouter.get('/x10s', async (req: Request, res: Response) => {
  // TODO: Get user from auth token
  const userId = req.headers['x-user-id'] as string;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const collections = await getCollectionsForUser(userId);

  res.json({
    x10s: collections.map(c => ({
      id: c.id,
      title: c.title,
      videoCount: c.items.length,
      tokens: c.tokenCount,
      updatedAt: c.updated_at
    }))
  });
});

// Get collections by user code (for extension)
apiRouter.get('/x10s/by-code/:userCode', async (req: Request, res: Response) => {
  const { userCode } = req.params;

  if (!userCode) {
    return res.json({ x10s: [] });
  }

  const collections = await getCollectionsForAnonymous(userCode);

  res.json({
    x10s: collections.map(c => ({
      id: c.id,
      title: c.title,
      videoCount: c.items.length,
      tokens: c.tokenCount,
      updatedAt: c.updated_at
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

// Remove item from collection
apiRouter.delete('/x10/:id/video/:videoId', async (req: Request, res: Response) => {
  const { id, videoId } = req.params;
  const userId = req.headers['x-user-id'] as string | undefined;

  const collection = await getCollectionById(id);
  if (!collection) {
    return res.status(404).json({ error: 'Collection not found' });
  }

  // Check ownership
  if (collection.user_id !== null && collection.user_id !== userId) {
    return res.status(403).json({ error: 'Not authorized to edit this collection' });
  }

  const success = await removeItemFromCollection(id, videoId);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Item not found' });
  }
});

// Check if a video is in user's collections
apiRouter.get('/check-video', async (req: Request, res: Response) => {
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
    const inX10s = await checkItemInAnonymousCollections(userCode, videoId);
    return res.json({ inX10s });
  }

  if (!userId) {
    return res.json({ inX10s: [] });
  }

  const inX10s = await checkItemInUserCollections(userId, videoId);
  res.json({ inX10s });
});

// Fork collection
apiRouter.post('/x10/:id/fork', async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.headers['x-user-id'] as string | undefined;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const forked = await forkCollection(id, userId);
  if (forked) {
    res.json({
      id: forked.id,
      url: `/s/${forked.id}`
    });
  } else {
    res.status(404).json({ error: 'Collection not found' });
  }
});

// Delete collection
apiRouter.delete('/x10/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.headers['x-user-id'] as string | undefined;

  const collection = await getCollectionById(id);
  if (!collection) {
    return res.status(404).json({ error: 'Collection not found' });
  }

  // Check ownership
  if (collection.user_id !== userId) {
    return res.status(403).json({ error: 'Not authorized to delete this collection' });
  }

  const success = await deleteCollection(id);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'Failed to delete collection' });
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
    const extractedContent: PreExtractedItem = {
      url,
      title,
      type,
      content,
      youtube_id: youtube_id || undefined,
      channel: channel || undefined,
      duration: typeof duration === 'number' ? duration : undefined
    };

    let collectionResultId: string;
    let itemId: string;

    // If collectionId is provided, add to that collection
    if (collectionId) {
      const collection = await getCollectionById(collectionId);
      if (!collection) {
        return res.status(404).json({ success: false, error: 'Collection not found' });
      }

      // Check ownership
      const isOwner = collection.anonymous_id === anonymousId || collection.user_id === req.headers['x-user-id'];
      if (!isOwner) {
        return res.status(403).json({ success: false, error: 'Not authorized to edit this collection' });
      }

      if (collection.items.length >= 10) {
        return res.status(400).json({ success: false, error: 'Collection is full (max 10 items)' });
      }

      // Check for duplicates
      const alreadyExists = type === 'youtube'
        ? collection.items.some(v => v.youtube_id === youtube_id)
        : collection.items.some(v => v.url === url);

      if (alreadyExists) {
        return res.json({
          success: true,
          itemId: collection.items.find(v => type === 'youtube' ? v.youtube_id === youtube_id : v.url === url)?.id,
          collectionId: collection.id,
          userCode: anonymousId,
          message: 'Item already exists in this collection'
        });
      }

      const item = await addPreExtractedItemToCollection(collectionId, extractedContent);
      collectionResultId = collectionId;
      itemId = item.id;
    } else if (forceNew) {
      // Create a new collection
      const collection = await createCollectionWithPreExtractedItem(extractedContent, anonymousId);
      collectionResultId = collection.id;
      itemId = collection.items[0].id;
    } else {
      // Add to most recent collection or create new
      const existingCollections = await getCollectionsForAnonymous(anonymousId);

      if (existingCollections.length > 0 && existingCollections[0].items.length < 10) {
        const recentCollection = existingCollections[0];

        // Check for duplicates
        const alreadyExists = type === 'youtube'
          ? recentCollection.items.some(v => v.youtube_id === youtube_id)
          : recentCollection.items.some(v => v.url === url);

        if (alreadyExists) {
          return res.json({
            success: true,
            itemId: recentCollection.items.find(v => type === 'youtube' ? v.youtube_id === youtube_id : v.url === url)?.id,
            collectionId: recentCollection.id,
            userCode: anonymousId,
            message: 'Item already exists in your most recent collection'
          });
        }

        const item = await addPreExtractedItemToCollection(recentCollection.id, extractedContent);
        collectionResultId = recentCollection.id;
        itemId = item.id;
      } else {
        // Create new collection
        const collection = await createCollectionWithPreExtractedItem(extractedContent, anonymousId);
        collectionResultId = collection.id;
        itemId = collection.items[0].id;
      }
    }

    res.json({
      success: true,
      itemId,
      collectionId: collectionResultId,
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
apiRouter.get('/settings', async (req: Request, res: Response) => {
  const userCode = req.anonymousId;
  const settings = await getUserSettings(userCode);
  res.json(settings);
});

// Update user's default pre-prompt
apiRouter.patch('/settings/pre-prompt', async (req: Request, res: Response) => {
  const userCode = req.anonymousId;
  const { prePrompt } = req.body;

  if (typeof prePrompt !== 'string') {
    return res.status(400).json({ error: 'prePrompt must be a string' });
  }

  const settings = await updateDefaultPrePrompt(userCode, prePrompt);
  res.json(settings);
});

// Update collection pre-prompt
apiRouter.patch('/x10/:id/pre-prompt', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { prePrompt } = req.body;
  const userCode = req.anonymousId;

  const collection = await getCollectionById(id);
  if (!collection) {
    return res.status(404).json({ error: 'Collection not found' });
  }

  // Check ownership
  const isOwner = collection.anonymous_id === userCode || collection.user_id === req.headers['x-user-id'];
  if (!isOwner) {
    return res.status(403).json({ error: 'Not authorized to edit this collection' });
  }

  const success = await updateCollectionPrePrompt(id, prePrompt || null);
  if (success) {
    res.json({ success: true, prePrompt });
  } else {
    res.status(500).json({ error: 'Failed to update pre-prompt' });
  }
});
