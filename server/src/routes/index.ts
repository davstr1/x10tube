import { Router, Request, Response } from 'express';
import { createX10, getX10sForAnonymous, getX10sForUser, getX10ById, deleteX10 } from '../services/x10.js';

export const indexRouter = Router();

// Landing page
indexRouter.get('/', (req: Request, res: Response) => {
  res.render('landing', {
    title: 'x10tube - Summarize YouTube videos with AI'
  });
});

// Create x10 from landing page
indexRouter.post('/create', async (req: Request, res: Response) => {
  try {
    const { urls } = req.body;

    if (!urls || typeof urls !== 'string') {
      return res.status(400).render('landing', {
        title: 'x10tube',
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
        title: 'x10tube',
        error: 'Please paste at least one YouTube URL'
      });
    }

    // Create x10 with anonymous ID from cookie
    const anonymousId = req.anonymousId;
    const { x10, failed } = await createX10(urlList, null, null, anonymousId);

    if (x10.videos.length === 0) {
      return res.status(400).render('landing', {
        title: 'x10tube',
        error: 'Could not extract transcripts from any of the provided URLs',
        failedUrls: failed
      });
    }

    // Redirect to the new x10 page
    res.redirect(`/s/${x10.id}`);

  } catch (error) {
    console.error('Error creating x10:', error);
    res.status(500).render('landing', {
      title: 'x10tube',
      error: 'An error occurred while creating your x10'
    });
  }
});

// Login page (placeholder for now)
indexRouter.get('/login', (req: Request, res: Response) => {
  res.render('login', {
    title: 'Log in - x10tube'
  });
});

// Dashboard - shows x10s for logged-in user OR anonymous user
indexRouter.get('/dashboard', (req: Request, res: Response) => {
  // TODO: Check if user is logged in and get their x10s
  // For now, get x10s by anonymous ID
  const anonymousId = req.anonymousId;
  const x10s = getX10sForAnonymous(anonymousId);

  res.render('dashboard', {
    title: 'My x10s - x10tube',
    x10s
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
    res.redirect('/dashboard');
  } else {
    res.status(500).render('error', {
      title: 'Error',
      message: 'Could not delete the x10'
    });
  }
});
