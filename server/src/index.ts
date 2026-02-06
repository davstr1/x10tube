import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';

import { config } from './config.js';
import { anonymousMiddleware } from './middleware/anonymous.js';
import { indexRouter } from './routes/index.js';
import { x10Router } from './routes/x10.js';
import { apiRouter } from './routes/api.js';
import { checkSupabaseConnection } from './supabase.js';

// Handle uncaught errors gracefully
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection]', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Uncaught Exception]', error);
  process.exit(1);
});

const app = express();
const PORT = config.port;

// Make config available in Pug templates
app.locals.baseUrl = config.baseUrl;
app.locals.brandName = config.brandName;
app.locals.chromeExtensionUrl = config.chromeExtensionUrl;
app.locals.posthogApiKey = config.posthogApiKey;

// Global CORS middleware (must be before body parsers for preflight requests)
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Allow all origins with credentials (extension needs to work on any website)
  // The userCode cookie is not sensitive - it's a random ID for anonymous users
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests immediately
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
});

// Middleware
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(anonymousMiddleware);

// Static files
app.use(express.static(path.join(process.cwd(), 'public')));

// View engine
app.set('view engine', 'pug');
app.set('views', path.join(process.cwd(), 'src', 'views'));

// Routes
app.use('/', indexRouter);
app.use('/s', x10Router);
app.use('/api', apiRouter);

// Global error handler (must be after routes)
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error]', err.message);
  console.error(err.stack);

  // Don't leak error details in production
  const isDev = process.env.NODE_ENV !== 'production';

  if (req.path.startsWith('/api/')) {
    res.status(500).json({
      error: isDev ? err.message : 'Internal server error'
    });
  } else {
    res.status(500).render('error', {
      title: 'Erreur',
      message: isDev ? err.message : 'Une erreur est survenue'
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Not found',
    message: 'Page not found'
  });
});

// Start server
async function startServer() {
  try {
    // Verify database connection before starting
    await checkSupabaseConnection();
    console.log('[Startup] Supabase connection OK');

    app.listen(PORT, () => {
      console.log(`X10Tube server running at ${config.baseUrl}`);
    });
  } catch (error) {
    console.error('[Startup] Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
