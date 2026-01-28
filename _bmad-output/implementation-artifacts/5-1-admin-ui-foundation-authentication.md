# Story 5.1: Admin UI Foundation with Authentication

Status: review

## Story

As an **admin**,
I want **a secure web interface to manage the service**,
so that **I can configure and monitor without command line access**.

## Acceptance Criteria

1. **Given** the admin UI is built with Vue 3 + Vite + Tailwind
   **When** I access the admin URL
   **Then** I see a login page

2. **Given** I enter the correct password (ADMIN_PASSWORD env var)
   **When** I submit
   **Then** I'm authenticated and redirected to the dashboard

3. **Given** I enter an incorrect password
   **When** I submit
   **Then** I see an error message and remain on login

4. **Given** I'm authenticated
   **When** a session cookie is set
   **Then** it's HTTP-only and expires after configured duration

## Tasks / Subtasks

- [x] Task 1: Create auth routes on server
  - [x] POST /api/auth/login (password auth)
  - [x] POST /api/auth/logout
  - [x] GET /api/auth/check (session validation)
  - [x] HTTP-only session cookie

- [x] Task 2: Create auth store and login view
  - [x] Pinia auth store
  - [x] Login view with form
  - [x] Error handling

- [x] Task 3: Add route guards
  - [x] Protected routes redirect to login
  - [x] Login redirects to dashboard if authenticated

- [x] Task 4: Update App.vue with navigation
  - [x] Header with nav links
  - [x] Logout button

## Dev Notes

### Session Management

- In-memory session store (single instance)
- 24-hour session duration
- HTTP-only cookie for security
- Session token generated with crypto.getRandomValues()

### References

- [Source: prd.md] - Admin authentication via single password
- [Source: architecture.md] - ADMIN_PASSWORD env var

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Created auth routes with session management
- In-memory session store with 24h expiration
- HTTP-only cookie with secure flag in production
- Auth hook for protected API routes
- Pinia auth store for frontend state
- Login view with password form
- Router guards for protected routes
- App.vue with navigation header and logout

### File List

**Created:**
- packages/server/src/routes/auth.ts (auth endpoints)
- packages/admin/src/stores/auth.ts (auth store)
- packages/admin/src/views/LoginView.vue (login page)

**Modified:**
- packages/server/src/index.ts (register cookie plugin, auth routes, auth hook)
- packages/server/package.json (add @fastify/cookie)
- packages/admin/src/router/index.ts (add login route, auth guards)
- packages/admin/src/App.vue (add navigation, logout)

### Change Log

- 2026-01-27: Story 5.1 implementation complete. All 4 tasks implemented.
