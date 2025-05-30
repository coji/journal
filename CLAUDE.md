# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `pnpm dev` - Start development server with Wrangler
- `pnpm deploy` - Deploy to Cloudflare Workers with minification
- `pnpm cf-typegen` - Generate TypeScript types for Cloudflare bindings
- `pnpm db:generate` - Generate database migration files with Drizzle Kit
- `pnpm db:migrate` - Apply migrations to local D1 database
- `pnpm db:migrate:prod` - Apply migrations to production D1 database

## Architecture Overview

This is a journal API built for Cloudflare Workers using:

- **Hono** framework for HTTP routing and middleware
- **Drizzle ORM** with SQLite (Cloudflare D1) for database operations  
- **better-auth** for authentication (email/password, OAuth providers)
- **Cloudflare R2** for file attachment storage
- **Zod** for request validation

### Core Structure

- `src/index.ts` - Main Hono app with middleware setup and route mounting
- `src/auth.ts` - better-auth configuration 
- `src/middleware/auth.ts` - Authentication middleware for protected routes
- `src/db/schema.ts` - Database schema definitions with type exports
- `src/routes/` - API route handlers (journal, attachments, user)

### Authentication Flow

All routes under `/journal/*`, `/attachments/*`, and `/user/*` require authentication. The auth middleware validates sessions created by better-auth. OAuth and email/password auth routes are handled at `/auth/*`.

### Database Design

Uses better-auth managed tables (users, sessions, oauth_*) plus application tables:
- `journal_entries` - User journal posts (markdown content)
- `attachments` - File metadata with R2 object references

### Environment Setup

Requires Cloudflare D1 database and R2 bucket configured in `wrangler.jsonc`. Environment variables for auth secrets and OAuth providers go in the `vars` section.