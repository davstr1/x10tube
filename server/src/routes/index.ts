import { Router, Request, Response } from 'express';
import { createX10 } from '../services/x10.js';

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

    // Create x10 (no user for anonymous creation)
    const { x10, failed } = await createX10(urlList, null, null);

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

// Dashboard (placeholder - will require auth)
indexRouter.get('/dashboard', (req: Request, res: Response) => {
  // TODO: Check auth and get user's x10s
  res.render('dashboard', {
    title: 'Dashboard - x10tube',
    x10s: []
  });
});
