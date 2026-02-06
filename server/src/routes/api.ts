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
  getItemBySourceId,
  hashUrl,
  PreExtractedItem
} from '../services/collection.js';
import { extractVideoId } from '../services/transcript.js';
import { getUserSettings, updateDefaultPrePrompt, updateYoutubePowerMode } from '../services/settings.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const apiRouter = Router();

// CORS is handled globally in index.ts

// Get current user's identity (for extension sync)
apiRouter.get('/whoami', (req: Request, res: Response) => {
  res.json({ userCode: req.anonymousId });
});

// Get user's collections
apiRouter.get('/x10s', asyncHandler(async (req: Request, res: Response) => {
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
}));

// Get collections by user code (for extension)
apiRouter.get('/x10s/by-code/:userCode', asyncHandler(async (req: Request, res: Response) => {
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
      updatedAt: c.updated_at,
      thumbnail: c.thumbnail_url
    }))
  });
}));

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
apiRouter.delete('/x10/:id/video/:videoId', asyncHandler(async (req: Request, res: Response) => {
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
}));

// Check if a video is in user's collections
apiRouter.get('/check-video', asyncHandler(async (req: Request, res: Response) => {
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
  // Now uses source_id (which is youtube_id for videos)
  if (userCode && typeof userCode === 'string') {
    const inX10s = await checkItemInAnonymousCollections(userCode, videoId);
    return res.json({ inX10s });
  }

  if (!userId) {
    return res.json({ inX10s: [] });
  }

  const inX10s = await checkItemInUserCollections(userId, videoId);
  res.json({ inX10s });
}));

// Check if an item already exists (before extraction) - for skip-extraction optimization
apiRouter.get('/item/check', asyncHandler(async (req: Request, res: Response) => {
  const { youtubeId, url } = req.query;

  // Determine source_id
  let sourceId: string;
  if (youtubeId && typeof youtubeId === 'string') {
    sourceId = youtubeId;
  } else if (url && typeof url === 'string') {
    sourceId = hashUrl(url);
  } else {
    return res.status(400).json({ error: 'youtubeId or url required' });
  }

  const item = await getItemBySourceId(sourceId);

  if (item) {
    res.json({
      exists: true,
      item: {
        id: item.id,
        title: item.title,
        channel: item.channel,
        duration: item.duration
      }
    });
  } else {
    res.json({ exists: false });
  }
}));

// Fork collection
apiRouter.post('/x10/:id/fork', asyncHandler(async (req: Request, res: Response) => {
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
}));

// Delete collection
apiRouter.delete('/x10/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.headers['x-user-id'] as string | undefined;

  const collection = await getCollectionById(id);
  if (!collection) {
    return res.status(404).json({ error: 'Collection not found' });
  }

  // Check ownership (user_id for authenticated users, anonymous_id for anonymous)
  const isOwner = collection.user_id === userId || collection.anonymous_id === req.anonymousId;
  if (!isOwner) {
    return res.status(403).json({ error: 'Not authorized to delete this collection' });
  }

  const success = await deleteCollection(id);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'Failed to delete collection' });
  }
}));

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
// Supports useExisting flag to skip extraction when item already exists
apiRouter.post('/x10/add-content', asyncHandler(async (req: Request, res: Response) => {
  const { url, title, type, content, youtube_id, channel, duration, collectionId, forceNew, userCode, useExisting } = req.body;

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

  // If useExisting=true, content can be empty (reuse existing transcript)
  // Otherwise, content is required
  if (!useExisting) {
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ success: false, error: 'Content required' });
    }
    // Validate content size (max 500KB)
    if (content.length > 500 * 1024) {
      return res.status(400).json({ success: false, error: 'Content too large (max 500KB)' });
    }
  } else {
    // Verify item exists when useExisting=true
    const sourceId = type === 'youtube' && youtube_id ? youtube_id : hashUrl(url);
    const existingItem = await getItemBySourceId(sourceId);
    if (!existingItem) {
      return res.status(400).json({
        success: false,
        error: 'Item not found. Please retry without cache.',
        retryWithExtraction: true
      });
    }
  }

  // YouTube videos must have youtube_id
  if (type === 'youtube' && !youtube_id) {
    return res.status(400).json({ success: false, error: 'YouTube ID required for YouTube videos' });
  }

  // Validate field sizes
  if (title.length > 500) {
    return res.status(400).json({ success: false, error: 'Title too long (max 500 chars)' });
  }
  if (url.length > 2000) {
    return res.status(400).json({ success: false, error: 'URL too long (max 2000 chars)' });
  }
  if (channel && channel.length > 200) {
    return res.status(400).json({ success: false, error: 'Channel name too long (max 200 chars)' });
  }

  try {
    // Use the provided user code or the one from cookie, or generate new
    const { nanoid } = await import('nanoid');
    const anonymousId = userCode?.trim() || req.anonymousId || nanoid(16);

    // Build the content object
    // When useExisting=true, content may be empty - the service will reuse existing item
    const extractedContent: PreExtractedItem = {
      url,
      title,
      type,
      content: content || '',  // Empty string when useExisting=true
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

      // Check for duplicates using source_id
      const sourceId = type === 'youtube' && youtube_id ? youtube_id : hashUrl(url);
      const existingItemInCollection = collection.items.find(v => v.source_id === sourceId);

      if (existingItemInCollection) {
        return res.json({
          success: true,
          itemId: existingItemInCollection.id,
          collectionId: collection.id,
          userCode: anonymousId,
          message: 'Item already exists in this collection'
        });
      }

      const item = await addPreExtractedItemToCollection(collectionId, extractedContent);
      collectionResultId = collectionId;
      itemId = item.id;
    } else if (forceNew) {
      // Before creating a new collection, check if user already has a single-item collection with this item
      const sourceIdForCheck = type === 'youtube' && youtube_id ? youtube_id : hashUrl(url);
      const allCollections = await getCollectionsForAnonymous(anonymousId);
      const singleItemCollection = allCollections.find(c =>
        c.items.length === 1 && c.items[0].source_id === sourceIdForCheck
      );

      if (singleItemCollection) {
        // Already have a collection with just this item
        return res.json({
          success: true,
          itemId: singleItemCollection.items[0].id,
          collectionId: singleItemCollection.id,
          userCode: anonymousId,
          message: 'Item already exists in a collection'
        });
      }

      // Create a new collection
      const collection = await createCollectionWithPreExtractedItem(extractedContent, anonymousId);
      collectionResultId = collection.id;
      itemId = collection.items[0].id;
    } else {
      // Add to most recent collection or create new
      const existingCollections = await getCollectionsForAnonymous(anonymousId);

      if (existingCollections.length > 0 && existingCollections[0].items.length < 10) {
        const recentCollection = existingCollections[0];

        // Check for duplicates using source_id
        const sourceIdCheck = type === 'youtube' && youtube_id ? youtube_id : hashUrl(url);
        const existingInRecent = recentCollection.items.find(v => v.source_id === sourceIdCheck);

        if (existingInRecent) {
          return res.json({
            success: true,
            itemId: existingInRecent.id,
            collectionId: recentCollection.id,
            userCode: anonymousId,
            message: 'Item already exists in your most recent collection'
          });
        }

        const item = await addPreExtractedItemToCollection(recentCollection.id, extractedContent);
        collectionResultId = recentCollection.id;
        itemId = item.id;
      } else {
        // Before creating a new collection, check if user already has a single-item collection with this item
        const sourceIdForNewCheck = type === 'youtube' && youtube_id ? youtube_id : hashUrl(url);
        const singleItemCollection = existingCollections.find(c =>
          c.items.length === 1 && c.items[0].source_id === sourceIdForNewCheck
        );

        if (singleItemCollection) {
          // Already have a collection with just this item
          return res.json({
            success: true,
            itemId: singleItemCollection.items[0].id,
            collectionId: singleItemCollection.id,
            userCode: anonymousId,
            message: 'Item already exists in a collection'
          });
        }

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
}));

// Get user settings
apiRouter.get('/settings', asyncHandler(async (req: Request, res: Response) => {
  const userCode = req.anonymousId;
  const settings = await getUserSettings(userCode);
  res.json(settings);
}));

// Update user's default pre-prompt
apiRouter.patch('/settings/pre-prompt', asyncHandler(async (req: Request, res: Response) => {
  const userCode = req.anonymousId;
  const { prePrompt } = req.body;

  if (typeof prePrompt !== 'string') {
    return res.status(400).json({ error: 'prePrompt must be a string' });
  }

  if (prePrompt.length > 10000) {
    return res.status(400).json({ error: 'prePrompt too long (max 10000 chars)' });
  }

  const settings = await updateDefaultPrePrompt(userCode, prePrompt);
  res.json(settings);
}));

// Update YouTube Power Mode setting
apiRouter.patch('/settings/youtube-power-mode', asyncHandler(async (req: Request, res: Response) => {
  const userCode = req.anonymousId;
  const { enabled } = req.body;

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be a boolean' });
  }

  const settings = await updateYoutubePowerMode(userCode, enabled);
  res.json(settings);
}));

// Update collection pre-prompt
apiRouter.patch('/x10/:id/pre-prompt', asyncHandler(async (req: Request, res: Response) => {
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

  if (prePrompt && prePrompt.length > 10000) {
    return res.status(400).json({ error: 'prePrompt too long (max 10000 chars)' });
  }

  const success = await updateCollectionPrePrompt(id, prePrompt || null);
  if (success) {
    res.json({ success: true, prePrompt });
  } else {
    res.status(500).json({ error: 'Failed to update pre-prompt' });
  }
}));
