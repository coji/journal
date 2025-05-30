import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import * as schema from '../db/schema';
import { createAuth } from '../auth';

type Variables = {
  user: {
    id: string;
    email: string;
    name: string;
  };
};

const user = new Hono<{ Bindings: Env; Variables: Variables }>();

// Validation schemas
const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  email: z.string().email().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

// GET /user/profile - Get user profile
user.get('/profile', async (c) => {
  const currentUser = c.get('user');
  const db = drizzle(c.env.DB, { schema });

  const userProfile = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      emailVerified: schema.users.emailVerified,
      image: schema.users.image,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, currentUser.id))
    .limit(1);

  if (!userProfile[0]) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json(userProfile[0]);
});

// PUT /user/profile - Update user profile
user.put('/profile', zValidator('json', updateProfileSchema), async (c) => {
  const { name, email } = c.req.valid('json');
  const currentUser = c.get('user');
  const db = drizzle(c.env.DB, { schema });

  const updateData: Partial<typeof schema.users.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (name) updateData.name = name;
  if (email) {
    updateData.email = email;
    updateData.emailVerified = false; // Reset email verification if email changes
  }

  const updated = await db
    .update(schema.users)
    .set(updateData)
    .where(eq(schema.users.id, currentUser.id))
    .returning({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      emailVerified: schema.users.emailVerified,
      image: schema.users.image,
    });

  if (!updated[0]) {
    return c.json({ error: 'Failed to update profile' }, 500);
  }

  return c.json(updated[0]);
});

// POST /user/change-password - Change password
user.post(
  '/change-password',
  zValidator('json', changePasswordSchema),
  async (c) => {
    const { newPassword } = c.req.valid('json');

    try {
      // better-auth handles password changes through its built-in endpoints
      // This endpoint would typically redirect to better-auth's change password flow
      // For now, returning a placeholder response
      return c.json({
        message: 'Use /auth/change-password endpoint with proper session',
        newPassword, // Remove in production
      });
    } catch (error) {
      console.error('Password change error:', error);
      return c.json({ error: 'Failed to change password' }, 500);
    }
  }
);

// POST /user/request-password-reset - Request password reset email
user.post(
  '/request-password-reset',
  zValidator(
    'json',
    z.object({
      email: z.string().email(),
    })
  ),
  async (c) => {
    const { email } = c.req.valid('json');

    try {
      // better-auth handles password reset through its built-in endpoints
      // This would typically use /auth/forget-password endpoint
      return c.json({
        message: 'Use /auth/forget-password endpoint for password reset',
        email,
      });
    } catch (error) {
      console.error('Password reset request error:', error);
      // Always return success to prevent email enumeration
      return c.json({ message: 'Password reset email sent if account exists' });
    }
  }
);

// DELETE /user/account - Delete user account
user.delete('/account', async (c) => {
  const currentUser = c.get('user');
  const db = drizzle(c.env.DB, { schema });

  try {
    // Start transaction to delete all user data
    await db.transaction(async (tx) => {
      // Delete attachments (files need to be deleted from R2 separately)
      // const userAttachments = await tx
      //   .select({ r2Key: schema.attachments.r2Key })
      //   .from(schema.attachments)
      //   .innerJoin(schema.journalEntries, eq(schema.attachments.journalEntryId, schema.journalEntries.id))
      //   .where(eq(schema.journalEntries.userId, currentUser.id))

      // Delete attachments metadata
      await tx
        .delete(schema.attachments)
        .where(
          eq(
            schema.attachments.journalEntryId,
            tx
              .select({ id: schema.journalEntries.id })
              .from(schema.journalEntries)
              .where(eq(schema.journalEntries.userId, currentUser.id))
          )
        );

      // Delete journal entries
      await tx
        .delete(schema.journalEntries)
        .where(eq(schema.journalEntries.userId, currentUser.id));

      // Delete OAuth tokens
      await tx
        .delete(schema.oauthTokens)
        .where(eq(schema.oauthTokens.userId, currentUser.id));

      // Delete sessions
      await tx
        .delete(schema.sessions)
        .where(eq(schema.sessions.userId, currentUser.id));

      // Delete user account
      await tx.delete(schema.users).where(eq(schema.users.id, currentUser.id));

      // TODO: Delete files from R2 bucket
      // for (const attachment of userAttachments) {
      //   await c.env.ATTACHMENTS_BUCKET.delete(attachment.r2Key)
      // }
    });

    return c.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Account deletion error:', error);
    return c.json({ error: 'Failed to delete account' }, 500);
  }
});

// POST /user/resend-verification - Resend email verification
user.post('/resend-verification', async (c) => {
  const currentUser = c.get('user');

  try {
    // better-auth handles email verification through its built-in endpoints
    // This would typically use /auth/send-verification-email endpoint
    return c.json({
      message:
        'Use /auth/send-verification-email endpoint for email verification',
      email: currentUser.email,
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    return c.json({ error: 'Failed to send verification email' }, 500);
  }
});

export default user;
