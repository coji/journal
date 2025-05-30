import { createMiddleware } from 'hono/factory';
import { createAuth } from '../auth';

export const authMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: {
    user: {
      id: string;
      email: string;
      name: string;
    };
  };
}>(async (c, next) => {
  const auth = createAuth(c.env);

  const authorization = c.req.header('Authorization');
  const token = authorization?.replace('Bearer ', '');

  if (!token) {
    return c.json({ error: 'Authorization token required' }, 401);
  }

  try {
    // TODO: Implement proper token validation with better-auth
    // For now, this is a simplified implementation
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session?.user) {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }

    c.set('user', {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    });

    await next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return c.json({ error: 'Authentication failed' }, 401);
  }
});
