import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { csrf } from 'hono/csrf';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';

// Import route handlers
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { oauthRoutes } from './routes/oauth';
import { wellKnownRoutes } from './routes/well-known';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: ['http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// CSRF protection for MPA routes
app.use('/admin/*', csrf());
app.use('/login', csrf());
app.use('/register', csrf());
app.use('/consent', csrf());

// Routes
app.route('/admin', adminRoutes);
app.route('/', authRoutes);
app.route('/', oauthRoutes);
app.route('/.well-known', wellKnownRoutes);

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.notFound((c) => {
  return c.text('Not Found', 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Application error:', err);
  return c.text('Internal Server Error', 500);
});

const port = parseInt(process.env.PORT || '3000');
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port
});