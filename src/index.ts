import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { createAuth } from './auth'
import { authMiddleware } from './middleware/auth'
import journalRoutes from './routes/journal'
import attachmentRoutes from './routes/attachments'

interface Env {
  DB: D1Database
  ATTACHMENTS_BUCKET: R2Bucket
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
}

const app = new Hono<{ Bindings: Env }>()

// Middleware
app.use('*', cors())
app.use('*', logger())

// Health check
app.get('/', (c) => {
  return c.json({ message: 'Journal API is running' })
})

// Auth routes - handled by better-auth
app.all('/auth/*', async (c) => {
  const auth = createAuth(c.env)
  return auth.handler(c.req.raw)
})

// Apply auth middleware to protected routes
app.use('/journal/*', authMiddleware)
app.use('/attachments/*', authMiddleware)

// Protected routes
app.route('/journal', journalRoutes)
app.route('/', attachmentRoutes)

export default app
