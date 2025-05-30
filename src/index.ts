import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import auth from './auth';
import { authMiddleware } from './middleware/auth';
import journalRoutes from './routes/journal';
import attachmentRoutes from './routes/attachments';
import userRoutes from './routes/user';
import adminRoutes from './routes/admin';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from './db/schema';

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', cors());
app.use('*', logger());

// Health check
app.get('/', (c) => {
  return c.json({ message: 'Journal API is running' });
});

// Bootstrap admin endpoint (only works if no admin users exist)
app.post('/bootstrap-admin', async (c) => {
  const db = drizzle(c.env.DB, { schema });

  // Check if any admin users already exist
  const existingAdmins = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.isAdmin, true))
    .limit(1);

  if (existingAdmins.length > 0) {
    return c.json({ error: 'Admin user already exists' }, 400);
  }

  const body = await c.req.json().catch(() => ({}));
  const { email, name } = body;

  if (!email || !name) {
    return c.json({ error: 'Email and name are required' }, 400);
  }

  try {
    const newAdmin = await db
      .insert(schema.users)
      .values({
        email,
        name,
        emailVerified: true,
        isAdmin: true,
      })
      .returning({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        isAdmin: schema.users.isAdmin,
      });

    return c.json(
      {
        message: 'Bootstrap admin created successfully',
        user: newAdmin[0],
      },
      201
    );
  } catch (error) {
    console.error('Bootstrap admin creation error:', error);
    return c.json({ error: 'Failed to create bootstrap admin' }, 500);
  }
});

// Auth routes - handled by better-auth
app.all('/auth/*', async (c) => {
  return auth.handler(c.req.raw);
});

// Apply auth middleware to protected routes
app.use('/journal/*', authMiddleware);
app.use('/attachments/*', authMiddleware);
app.use('/user/*', authMiddleware);

// Admin routes (some require auth, some don't)
app.route('/admin', adminRoutes);

// Apply admin middleware only to specific admin endpoints
// (login and auth endpoints are handled within the admin routes)

// Other protected routes
app.route('/journal', journalRoutes);
app.route('/user', userRoutes);
app.route('/', attachmentRoutes);

export default app;
