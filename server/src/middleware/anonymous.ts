// Middleware to handle anonymous user identification via cookie
// This is a functional cookie - no GDPR consent required

import { Request, Response, NextFunction } from 'express';
import { nanoid } from 'nanoid';

const COOKIE_NAME = 'x10_anon';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000; // 1 year

// Extend Express Request type to include anonymousId
declare global {
  namespace Express {
    interface Request {
      anonymousId: string;
    }
  }
}

export function anonymousMiddleware(req: Request, res: Response, next: NextFunction) {
  let anonymousId = req.cookies[COOKIE_NAME];

  if (!anonymousId) {
    // Generate new anonymous ID
    anonymousId = nanoid(16);

    // Set cookie - httpOnly, 1 year expiry
    // sameSite: 'none' required for cross-origin requests from extension
    res.cookie(COOKIE_NAME, anonymousId, {
      httpOnly: true,
      sameSite: 'none',
      maxAge: COOKIE_MAX_AGE,
      secure: true // Required for sameSite: 'none' (Chrome allows this for localhost)
    });
  }

  req.anonymousId = anonymousId;
  next();
}
