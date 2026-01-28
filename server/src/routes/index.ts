import { Router, Request, Response } from 'express';
import { createX10, getX10sForAnonymous, getX10sForUser, getX10ById, deleteX10 } from '../services/x10.js';
import { getUserSettings } from '../services/settings.js';

export const indexRouter = Router();

// Landing page
indexRouter.get('/', (req: Request, res: Response) => {
  res.render('landing', {
    title: 'toyour.ai - A page, a video, a document... to your AI'
  });
});

// Create x10 from landing page
indexRouter.post('/create', async (req: Request, res: Response) => {
  try {
    const { urls } = req.body;

    if (!urls || typeof urls !== 'string') {
      return res.status(400).render('landing', {
        title: 'toyour.ai',
        error: 'Please paste at least one YouTube URL'
      });
    }

    // Parse URLs (one per line)
    const urlList = urls
      .split('\n')
      .map((u: string) => u.trim())
      .filter((u: string) => u.length > 0)
      .slice(0, 10); // Max 10 videos

    if (urlList.length === 0) {
      return res.status(400).render('landing', {
        title: 'toyour.ai',
        error: 'Please paste at least one YouTube URL'
      });
    }

    // Create x10 with anonymous ID from cookie
    const anonymousId = req.anonymousId;
    const { x10, failed } = await createX10(urlList, null, null, anonymousId);

    const wantsJson = req.headers.accept?.includes('application/json');

    if (x10.videos.length === 0) {
      if (wantsJson) {
        return res.status(400).json({
          error: 'Could not extract content from any of the provided URLs',
          failed
        });
      }
      return res.status(400).render('landing', {
        title: 'toyour.ai',
        error: 'Could not extract transcripts from any of the provided URLs',
        failedUrls: failed
      });
    }

    if (wantsJson) {
      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
      return res.json({
        id: x10.id,
        title: x10.title || 'Untitled',
        itemCount: x10.videos.length,
        tokenCount: x10.tokenCount,
        mdUrl: `${baseUrl}/s/${x10.id}.md`,
        pageUrl: `/s/${x10.id}`,
        failed
      });
    }

    // Redirect to the new x10 page
    res.redirect(`/s/${x10.id}`);

  } catch (error) {
    console.error('Error creating x10:', error);
    const wantsJson = req.headers.accept?.includes('application/json');
    if (wantsJson) {
      return res.status(500).json({ error: 'An error occurred while creating your collection' });
    }
    res.status(500).render('landing', {
      title: 'toyour.ai',
      error: 'An error occurred while creating your collection'
    });
  }
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
    title: 'Sync - toyour.ai',
    userCode: req.anonymousId
  });
});

// Handle sync - set the cookie to the provided code
indexRouter.post('/sync', (req: Request, res: Response) => {
  const { code } = req.body;

  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    return res.status(400).render('sync', {
      title: 'Sync - toyour.ai',
      userCode: req.anonymousId,
      error: 'Please enter a valid user code'
    });
  }

  const trimmedCode = code.trim();

  // Validate code format (should be 16 chars alphanumeric from nanoid)
  if (!/^[A-Za-z0-9_-]{10,32}$/.test(trimmedCode)) {
    return res.status(400).render('sync', {
      title: 'Sync - toyour.ai',
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

// My X10s page - shows x10s for logged-in user OR anonymous user
indexRouter.get('/collections', (req: Request, res: Response) => {
  // TODO: Check if user is logged in and get their x10s
  // For now, get x10s by anonymous ID
  const anonymousId = req.anonymousId;
  const x10s = getX10sForAnonymous(anonymousId);
  const settings = getUserSettings(anonymousId);

  res.render('myx10s', {
    title: 'My collections - toyour.ai',
    x10s,
    userCode: anonymousId,
    settings
  });
});

// Delete x10 (POST because HTML forms don't support DELETE)
indexRouter.post('/x10/:id/delete', (req: Request, res: Response) => {
  const { id } = req.params;
  const anonymousId = req.anonymousId;

  const x10 = getX10ById(id);
  if (!x10) {
    return res.status(404).render('error', {
      title: 'Not found',
      message: 'This x10 does not exist'
    });
  }

  // Check ownership by anonymous_id (or user_id when auth is implemented)
  const isOwner = x10.anonymous_id === anonymousId;
  // TODO: Also check x10.user_id === currentUser.id when auth is implemented

  if (!isOwner) {
    return res.status(403).render('error', {
      title: 'Not authorized',
      message: 'You are not allowed to delete this x10'
    });
  }

  const success = deleteX10(id);
  if (success) {
    res.redirect('/collections');
  } else {
    res.status(500).render('error', {
      title: 'Error',
      message: 'Could not delete the x10'
    });
  }
});
