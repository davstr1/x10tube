import { Router, Request, Response } from 'express';
import { getCollectionsForAnonymous, getCollectionById, deleteCollection } from '../services/collection.js';
import { getUserSettings, updateYoutubePowerMode } from '../services/settings.js';
import { config } from '../config.js';
import { asyncHandler } from '../lib/asyncHandler.js';

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

// Update settings
indexRouter.post('/settings', asyncHandler(async (req: Request, res: Response) => {
  const { youtube_power_mode } = req.body;

  // Checkbox sends value only when checked, undefined when unchecked
  const enabled = youtube_power_mode === 'on' || youtube_power_mode === true;

  await updateYoutubePowerMode(req.anonymousId, enabled);

  res.redirect('/settings?saved=1');
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
  const collections = await getCollectionsForAnonymous(anonymousId);
  const settings = await getUserSettings(anonymousId);

  res.render('myx10s', {
    title: `My collections - ${config.brandName}`,
    x10s: collections,
    userCode: anonymousId,
    settings
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
