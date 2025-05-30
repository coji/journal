import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import * as schema from '../db/schema';

type Variables = {
  user: {
    id: string;
    email: string;
    name: string;
  };
};

const attachments = new Hono<{ Bindings: Env; Variables: Variables }>();

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// POST /journal/:id/attachments - Upload file to journal entry
attachments.post('/:journalId/attachments', async (c) => {
  const journalId = c.req.param('journalId');
  const user = c.get('user');
  const db = drizzle(c.env.DB, { schema });

  // Verify journal entry exists and belongs to user
  const journalEntry = await db
    .select()
    .from(schema.journalEntries)
    .where(
      and(
        eq(schema.journalEntries.id, journalId),
        eq(schema.journalEntries.userId, user.id)
      )
    )
    .limit(1);

  if (!journalEntry[0]) {
    return c.json({ error: 'Journal entry not found' }, 404);
  }

  const formData = await c.req.formData();
  const file = formData.get('file');

  if (!file || typeof file === 'string') {
    return c.json({ error: 'No file provided' }, 400);
  }

  const fileObj = file as File;

  // Validate file type
  if (!ALLOWED_MIME_TYPES.includes(fileObj.type)) {
    return c.json(
      {
        error: 'File type not allowed',
        allowedTypes: ALLOWED_MIME_TYPES,
      },
      400
    );
  }

  // Validate file size
  if (fileObj.size > MAX_FILE_SIZE) {
    return c.json(
      {
        error: 'File size too large',
        maxSize: MAX_FILE_SIZE,
      },
      400
    );
  }

  try {
    const fileId = createId();
    const fileExtension = fileObj.name.split('.').pop() || 'bin';
    const filename = `${fileId}.${fileExtension}`;
    const r2Key = `attachments/${user.id}/${journalId}/${filename}`;

    // Upload to R2
    await c.env.ATTACHMENTS_BUCKET.put(r2Key, fileObj.stream(), {
      httpMetadata: {
        contentType: fileObj.type,
      },
    });

    // Save metadata to database
    const attachment = await db
      .insert(schema.attachments)
      .values({
        id: fileId,
        journalEntryId: journalId,
        filename,
        originalFilename: fileObj.name,
        mimeType: fileObj.type,
        size: fileObj.size,
        r2Key,
      })
      .returning();

    return c.json(attachment[0], 201);
  } catch (error) {
    console.error('File upload error:', error);
    return c.json({ error: 'Failed to upload file' }, 500);
  }
});

// GET /attachments/:id - Get file (authenticated proxy)
attachments.get('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const db = drizzle(c.env.DB, { schema });

  // Get attachment metadata and verify ownership
  const attachment = await db
    .select({
      attachment: schema.attachments,
      journalEntry: schema.journalEntries,
    })
    .from(schema.attachments)
    .innerJoin(
      schema.journalEntries,
      eq(schema.attachments.journalEntryId, schema.journalEntries.id)
    )
    .where(
      and(
        eq(schema.attachments.id, id),
        eq(schema.journalEntries.userId, user.id)
      )
    )
    .limit(1);

  if (!attachment[0]) {
    return c.json({ error: 'Attachment not found' }, 404);
  }

  try {
    // Get file from R2
    const object = await c.env.ATTACHMENTS_BUCKET.get(
      attachment[0].attachment.r2Key
    );

    if (!object) {
      return c.json({ error: 'File not found in storage' }, 404);
    }

    // Return file with proper headers
    return new Response(object.body, {
      headers: {
        'Content-Type': attachment[0].attachment.mimeType,
        'Content-Length': attachment[0].attachment.size.toString(),
        'Content-Disposition': `attachment; filename="${attachment[0].attachment.originalFilename}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('File retrieval error:', error);
    return c.json({ error: 'Failed to retrieve file' }, 500);
  }
});

// DELETE /attachments/:id - Delete attachment
attachments.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const db = drizzle(c.env.DB, { schema });

  // Get attachment metadata and verify ownership
  const attachment = await db
    .select({
      attachment: schema.attachments,
      journalEntry: schema.journalEntries,
    })
    .from(schema.attachments)
    .innerJoin(
      schema.journalEntries,
      eq(schema.attachments.journalEntryId, schema.journalEntries.id)
    )
    .where(
      and(
        eq(schema.attachments.id, id),
        eq(schema.journalEntries.userId, user.id)
      )
    )
    .limit(1);

  if (!attachment[0]) {
    return c.json({ error: 'Attachment not found' }, 404);
  }

  try {
    // Delete from R2
    await c.env.ATTACHMENTS_BUCKET.delete(attachment[0].attachment.r2Key);

    // Delete from database
    await db.delete(schema.attachments).where(eq(schema.attachments.id, id));

    return c.json({ message: 'Attachment deleted successfully' });
  } catch (error) {
    console.error('File deletion error:', error);
    return c.json({ error: 'Failed to delete file' }, 500);
  }
});

export default attachments;
