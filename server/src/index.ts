import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';

import { config } from './config.js';
import './db.js'; // Initialize database
import { anonymousMiddleware } from './middleware/anonymous.js';
import { indexRouter } from './routes/index.js';
import { x10Router } from './routes/x10.js';
import { apiRouter } from './routes/api.js';

const app = express();
const PORT = config.port;

// Make config available in Pug templates
app.locals.baseUrl = config.baseUrl;
app.locals.brandName = config.brandName;

// Middleware
app.use(express.json());
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

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Not found',
    message: 'Page not found'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`X10Tube server running at ${config.baseUrl}`);
});
