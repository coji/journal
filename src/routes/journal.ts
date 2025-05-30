import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, and, like, sql } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import * as schema from '../db/schema';

type Variables = {
  user: {
    id: string;
    email: string;
    name: string;
  };
};

const journal = new Hono<{ Bindings: Env; Variables: Variables }>();

// Validation schemas
const createEntrySchema = z.object({
  content: z.string().min(1, 'Content is required'),
});

const updateEntrySchema = z.object({
  content: z.string().min(1, 'Content is required'),
});

const querySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20)),
});

const searchSchema = z.object({
  q: z.string().min(1, 'Search query is required'),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20)),
});

// GET /journal - Get journal entries
journal.get('/', zValidator('query', querySchema), async (c) => {
  const { page, limit } = c.req.valid('query');
  const user = c.get('user');
  const db = drizzle(c.env.DB, { schema });

  const offset = (page - 1) * limit;

  const entries = await db
    .select()
    .from(schema.journalEntries)
    .where(eq(schema.journalEntries.userId, user.id))
    .orderBy(desc(schema.journalEntries.createdAt))
    .limit(limit)
    .offset(offset);

  const total = await db
    .select({ count: sql`count(*)` })
    .from(schema.journalEntries)
    .where(eq(schema.journalEntries.userId, user.id));

  return c.json({
    entries,
    pagination: {
      page,
      limit,
      total: total[0].count as number,
      totalPages: Math.ceil((total[0].count as number) / limit),
    },
  });
});

// POST /journal - Create new journal entry
journal.post('/', zValidator('json', createEntrySchema), async (c) => {
  const { content } = c.req.valid('json');
  const user = c.get('user');
  const db = drizzle(c.env.DB, { schema });

  const newEntry = await db
    .insert(schema.journalEntries)
    .values({
      userId: user.id,
      content,
    })
    .returning();

  return c.json(newEntry[0], 201);
});

// GET /journal/:id - Get specific journal entry
journal.get('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const db = drizzle(c.env.DB, { schema });

  const entry = await db
    .select()
    .from(schema.journalEntries)
    .where(
      and(
        eq(schema.journalEntries.id, id),
        eq(schema.journalEntries.userId, user.id)
      )
    )
    .limit(1);

  if (!entry[0]) {
    return c.json({ error: 'Journal entry not found' }, 404);
  }

  return c.json(entry[0]);
});

// PUT /journal/:id - Update journal entry
journal.put('/:id', zValidator('json', updateEntrySchema), async (c) => {
  const id = c.req.param('id');
  const { content } = c.req.valid('json');
  const user = c.get('user');
  const db = drizzle(c.env.DB, { schema });

  const updated = await db
    .update(schema.journalEntries)
    .set({
      content,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.journalEntries.id, id),
        eq(schema.journalEntries.userId, user.id)
      )
    )
    .returning();

  if (!updated[0]) {
    return c.json({ error: 'Journal entry not found' }, 404);
  }

  return c.json(updated[0]);
});

// DELETE /journal/:id - Delete journal entry
journal.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const db = drizzle(c.env.DB, { schema });

  const deleted = await db
    .delete(schema.journalEntries)
    .where(
      and(
        eq(schema.journalEntries.id, id),
        eq(schema.journalEntries.userId, user.id)
      )
    )
    .returning();

  if (!deleted[0]) {
    return c.json({ error: 'Journal entry not found' }, 404);
  }

  return c.json({ message: 'Journal entry deleted successfully' });
});

// GET /journal/search - Search journal entries
journal.get('/search', zValidator('query', searchSchema), async (c) => {
  const { q, page, limit } = c.req.valid('query');
  const user = c.get('user');
  const db = drizzle(c.env.DB, { schema });

  const offset = (page - 1) * limit;

  const entries = await db
    .select()
    .from(schema.journalEntries)
    .where(
      and(
        eq(schema.journalEntries.userId, user.id),
        like(schema.journalEntries.content, `%${q}%`)
      )
    )
    .orderBy(desc(schema.journalEntries.createdAt))
    .limit(limit)
    .offset(offset);

  const total = await db
    .select({ count: sql`count(*)` })
    .from(schema.journalEntries)
    .where(
      and(
        eq(schema.journalEntries.userId, user.id),
        like(schema.journalEntries.content, `%${q}%`)
      )
    );

  return c.json({
    entries,
    query: q,
    pagination: {
      page,
      limit,
      total: total[0].count as number,
      totalPages: Math.ceil((total[0].count as number) / limit),
    },
  });
});

export default journal;
