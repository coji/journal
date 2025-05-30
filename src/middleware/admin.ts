import { createMiddleware } from 'hono/factory';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';

type Variables = {
  user: {
    id: string;
    email: string;
    name: string;
  };
};

export const adminMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  // Check for admin session cookie first
  const cookies = c.req.header('Cookie') || '';
  const sessionMatch = cookies.match(/admin_session=([^;]+)/);
  
  if (sessionMatch) {
    try {
      const session = JSON.parse(atob(sessionMatch[1]));
      c.set('user', session);
      await next();
      return;
    } catch {
      // Invalid session, continue to regular auth check
    }
  }

  // Fallback to regular auth middleware check
  const user = c.get('user');
  
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const db = drizzle(c.env.DB, { schema });
  
  const adminUser = await db
    .select({ isAdmin: schema.users.isAdmin })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .limit(1);

  if (!adminUser[0] || !adminUser[0].isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  await next();
});