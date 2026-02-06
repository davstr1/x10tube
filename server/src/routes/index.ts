import { Router, Request, Response } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { marked } from 'marked';
import { getCollectionsForAnonymous, getCollectionsForAnonymousPaginated, getCollectionById, deleteCollection } from '../services/collection.js';
import { getUserSettings } from '../services/settings.js';
import { config } from '../config.js';
import { asyncHandler } from '../lib/asyncHandler.js';

// Parse NEWS.md into structured items
function parseNewsMarkdown(): Array<{ id: string; title: string; date: string; html: string }> {
  try {
    const newsPath = join(process.cwd(), '..', 'NEWS.md');
    const content = readFileSync(newsPath, 'utf-8');

    // Split by H1 headers (# Title)
    const sections = content.split(/^# /m).filter(s => s.trim());

    return sections.map(section => {
      const lines = section.split('\n');
      const title = lines[0].trim();
      const id = title.split('—')[0]?.trim().replace(/\s+/g, '-').toLowerCase() || 'news';

      // Second line should be the date
      const date = lines[1]?.trim() || '';

      // Rest is the content
      const body = lines.slice(2).join('\n').trim();
      const html = marked.parse(body) as string;

      return { id, title, date, html };
    });
  } catch (error) {
    console.error('[News] Failed to parse NEWS.md:', error);
    return [];
  }
}

export const indexRouter = Router();

// Landing page
indexRouter.get('/', (_req: Request, res: Response) => {
  res.render('landing', {
    title: config.brandName
  });
});

// Welcome page (extension onboarding)
indexRouter.get('/welcome', (_req: Request, res: Response) => {
  res.render('welcome', {
    title: `Welcome - ${config.brandName}`
  });
});

// News page
indexRouter.get('/news', (_req: Request, res: Response) => {
  const newsItems = parseNewsMarkdown();
  res.render('news', {
    title: `News - ${config.brandName}`,
    newsItems
  });
});

// Privacy policy page
indexRouter.get('/privacy', (_req: Request, res: Response) => {
  res.render('privacy', {
    title: `Privacy Policy - ${config.brandName}`
  });
});

// Settings page
indexRouter.get('/settings', asyncHandler(async (req: Request, res: Response) => {
  const settings = await getUserSettings(req.anonymousId);
  res.render('settings', {
    title: `Settings - ${config.brandName}`,
    userCode: req.anonymousId,
    settings,
    saved: req.query.saved === '1'
  });
}));


// DISABLED: Server-side extraction removed
// The landing page form is temporarily disabled - use the Chrome extension instead
indexRouter.post('/create', (_req: Request, res: Response) => {
  return res.status(410).render('landing', {
    title: config.brandName,
    error: 'The web form is temporarily disabled. Please use the Chrome extension to add content.'
  });
});

// Disconnect - clear the cookie and generate a new anonymous ID
indexRouter.get('/disconnect', (req: Request, res: Response) => {
  // Clear the cookie by setting it to expire immediately
  res.clearCookie('x10_anon');
  // Redirect to home - the middleware will create a new anonymous ID
  res.redirect('/');
});

// Sync page - paste user code from another device
indexRouter.get('/sync', (req: Request, res: Response) => {
  res.render('sync', {
    title: `Sync - ${config.brandName}`,
    userCode: req.anonymousId
  });
});

// Handle sync - set the cookie to the provided code
indexRouter.post('/sync', (req: Request, res: Response) => {
  const { code } = req.body;

  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    return res.status(400).render('sync', {
      title: `Sync - ${config.brandName}`,
      userCode: req.anonymousId,
      error: 'Please enter a valid user code'
    });
  }

  const trimmedCode = code.trim();

  // Validate code format (should be 16 chars alphanumeric from nanoid)
  if (!/^[A-Za-z0-9_-]{10,32}$/.test(trimmedCode)) {
    return res.status(400).render('sync', {
      title: `Sync - ${config.brandName}`,
      userCode: req.anonymousId,
      error: 'Invalid code format'
    });
  }

  // Set the new cookie
  res.cookie('x10_anon', trimmedCode, {
    httpOnly: true,
    sameSite: 'none',
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    secure: true
  });

  // Redirect to dashboard with the new code
  res.redirect('/collections');
});

// My collections page - shows collections for logged-in user OR anonymous user
indexRouter.get('/collections', asyncHandler(async (req: Request, res: Response) => {
  // TODO: Check if user is logged in and get their collections
  // For now, get collections by anonymous ID
  const anonymousId = req.anonymousId;
  const { collections, hasMore } = await getCollectionsForAnonymousPaginated(anonymousId, 1);
  const settings = await getUserSettings(anonymousId);

  res.render('myx10s', {
    title: `My collections - ${config.brandName}`,
    x10s: collections,
    userCode: anonymousId,
    settings,
    hasMore,
    currentPage: 1
  });
}));

// API endpoint for loading more collections (infinite scroll + search)
indexRouter.get('/api/collections', asyncHandler(async (req: Request, res: Response) => {
  const anonymousId = req.anonymousId;
  const page = parseInt(req.query.page as string) || 1;
  const search = (req.query.q as string || '').trim() || undefined;
  const { collections, hasMore } = await getCollectionsForAnonymousPaginated(anonymousId, page, search);

  res.json({
    collections: collections.map(x10 => ({
      id: x10.id,
      title: x10.title,
      itemCount: x10.items.length,
      tokenCount: x10.tokenCount,
      updatedAt: x10.updated_at,
      firstItem: x10.items[0] || null
    })),
    hasMore,
    page
  });
}));

// Delete collection (POST because HTML forms don't support DELETE)
indexRouter.post('/x10/:id/delete', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const anonymousId = req.anonymousId;

  const collection = await getCollectionById(id);
  if (!collection) {
    return res.status(404).render('error', {
      title: 'Not found',
      message: 'This collection does not exist'
    });
  }

  // Check ownership by anonymous_id (or user_id when auth is implemented)
  const isOwner = collection.anonymous_id === anonymousId;
  // TODO: Also check collection.user_id === currentUser.id when auth is implemented

  if (!isOwner) {
    return res.status(403).render('error', {
      title: 'Not authorized',
      message: 'You are not allowed to delete this collection'
    });
  }

  const success = await deleteCollection(id);
  if (success) {
    res.redirect('/collections');
  } else {
    res.status(500).render('error', {
      title: 'Error',
      message: 'Could not delete the collection'
    });
  }
}));
