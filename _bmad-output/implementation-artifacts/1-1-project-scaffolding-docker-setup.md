# Story 1.1: Project Scaffolding & Docker Setup

Status: review

## Story

As a **developer**,
I want **a fully configured project structure with Docker and CI/CD**,
so that **I can start implementing features with a working development and deployment environment**.

## Acceptance Criteria

1. **Given** the project repository is initialized
   **When** I run `npm install` at the root
   **Then** both server and admin packages are installed via npm workspaces

2. **Given** the project is set up
   **When** I run `docker-compose up`
   **Then** the service starts and listens on the configured port

3. **Given** code is pushed to main branch
   **When** GitHub Actions workflow runs
   **Then** a Docker image is built and pushed to ghcr.io

4. **Given** the service is starting
   **When** the container launches
   **Then** it is ready to accept requests within 30 seconds (NFR18)

## Tasks / Subtasks

- [x] Task 1: Initialize monorepo structure (AC: #1)
  - [x] Create root `package.json` with npm workspaces config
  - [x] Create `packages/server/` directory structure
  - [x] Create `packages/admin/` directory structure
  - [x] Create `.gitignore` with standard exclusions
  - [x] Create `.env.example` with all required env vars
  - [x] Create `README.md` with project documentation

- [x] Task 2: Setup backend package (AC: #1, #4)
  - [x] Initialize `packages/server/package.json` with dependencies
  - [x] Create `tsconfig.json` with strict TypeScript config
  - [x] Create `src/index.ts` Fastify entry point
  - [x] Create `src/config.ts` for env vars loading
  - [x] Create placeholder directory structure (routes/, services/, db/, types/)
  - [x] Add npm scripts: dev, build, start

- [x] Task 3: Setup admin frontend package (AC: #1)
  - [x] Run `npm create vue@latest` with TypeScript, Router, Pinia
  - [x] Configure Vite for production build
  - [x] Setup Tailwind CSS
  - [x] Create placeholder views and components structure
  - [x] Configure API client placeholder

- [x] Task 4: Create Docker configuration (AC: #2, #4)
  - [x] Create multi-stage `Dockerfile` with node:20-alpine
  - [x] Create `docker-compose.yml` with volume mounts
  - [x] Ensure data/ directory is mounted for persistence
  - [x] Test container starts within 30 seconds

- [x] Task 5: Setup GitHub Actions CI/CD (AC: #3)
  - [x] Create `.github/workflows/docker-build.yml`
  - [x] Configure trigger on push to main
  - [x] Configure build and push to ghcr.io
  - [x] Add proper permissions for GitHub Container Registry

- [x] Task 6: Validation & Testing (AC: #1-4)
  - [x] Verify `npm install` works at root
  - [x] Verify `docker-compose up` starts service
  - [x] Verify basic health endpoint responds
  - [x] Document any manual testing steps

## Dev Notes

### Technology Stack (MUST USE)

| Component | Technology | Version |
|-----------|-----------|---------|
| Runtime | Node.js | 20+ LTS |
| Language | TypeScript | strict mode |
| Backend | Fastify | latest |
| Frontend | Vue 3 + Vite | latest |
| State | Pinia | latest |
| Styling | Tailwind CSS | latest |
| Build (backend) | tsx | latest |

### Required Dependencies

**Backend (packages/server):**
```bash
npm install fastify @fastify/cors @fastify/static better-sqlite3 baileys
npm install -D typescript @types/node @types/better-sqlite3 tsx
```

**Frontend (packages/admin):**
```bash
npm create vue@latest packages/admin -- --typescript --router --pinia
cd packages/admin && npm install -D tailwindcss postcss autoprefixer
```

### Project Structure Notes

**CRITICAL: Follow this exact structure:**

```
jellyfin-whatsapp-notifier/
├── .github/
│   └── workflows/
│       └── docker-build.yml      # CI/CD pipeline
├── packages/
│   ├── server/
│   │   ├── src/
│   │   │   ├── index.ts          # Fastify entry point
│   │   │   ├── config.ts         # Env vars loading
│   │   │   ├── routes/           # HTTP endpoints (placeholder)
│   │   │   ├── services/         # Business logic (placeholder)
│   │   │   ├── db/               # Data access (placeholder)
│   │   │   └── types/            # TypeScript types (placeholder)
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── admin/
│       ├── src/
│       │   ├── main.ts
│       │   ├── App.vue
│       │   ├── views/
│       │   ├── components/
│       │   ├── stores/
│       │   ├── api/
│       │   └── router/
│       ├── index.html
│       ├── package.json
│       ├── vite.config.ts
│       ├── tailwind.config.js
│       └── tsconfig.json
├── data/                         # Docker volume (gitignored)
│   ├── db.sqlite
│   └── whatsapp-session/
├── package.json                  # Workspace root
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── .gitignore
└── README.md
```

### Naming Conventions (MUST FOLLOW)

- **Files:** kebab-case (`whatsapp-service.ts`)
- **TypeScript variables/functions:** camelCase
- **TypeScript classes/types:** PascalCase
- **SQLite tables:** snake_case, plural (`message_queue`)
- **SQLite columns:** snake_case (`created_at`)
- **Vue components:** PascalCase (`StatusCard.vue`)

### API Response Format (MUST FOLLOW)

```typescript
// Success
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": "Message explicite" }
```

### Dockerfile Requirements

```dockerfile
# Multi-stage build
FROM node:20-alpine AS builder
# ... build steps

FROM node:20-alpine AS runner
# Final production image < 200MB (NFR5)
```

### Environment Variables (.env.example)

```bash
# Server
PORT=3000
NODE_ENV=production

# Admin Authentication
ADMIN_PASSWORD=changeme

# Jellyfin
JELLYFIN_URL=http://jellyfin:8096
WEBHOOK_SECRET=your-secret-here

# WhatsApp
WHATSAPP_GROUP_ID=

# Alerts (optional)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
ALERT_EMAIL=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
DISCORD_WEBHOOK_URL=

# TMDB (optional)
TMDB_API_KEY=
```

### GitHub Actions Workflow

```yaml
name: Build and Push Docker Image

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:latest
```

### Fastify Entry Point Pattern

```typescript
// packages/server/src/index.ts
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from './config'

const fastify = Fastify({ logger: true })

await fastify.register(cors)

// Health check endpoint
fastify.get('/health', async () => ({ status: 'ok' }))

fastify.listen({ port: config.port, host: '0.0.0.0' }, (err) => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
```

### References

- [Source: architecture.md#Selected Stack] - Technology choices
- [Source: architecture.md#Project Structure] - Directory layout
- [Source: architecture.md#Infrastructure & Deployment] - Docker & CI/CD
- [Source: architecture.md#Naming Patterns] - Conventions
- [Source: prd.md#NFR5] - Docker image < 200MB
- [Source: prd.md#NFR18] - Start within 30 seconds

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Created npm workspaces monorepo structure with packages/server and packages/admin
- Backend: Fastify 5.x with TypeScript strict mode, tsx for dev
- Frontend: Vue 3 + Vite + Pinia + Tailwind CSS
- Multi-stage Dockerfile with node:20-alpine base
- GitHub Actions workflow for building and pushing to ghcr.io
- Health check endpoint responds with `{ success: true, data: { status: 'ok' } }`
- Server starts in < 2 seconds and listens on port 3000
- All dependencies installed successfully (445 packages)

### File List

**Created:**
- package.json (root workspace)
- .gitignore
- .env.example
- README.md
- Dockerfile
- docker-compose.yml
- .github/workflows/docker-build.yml
- packages/server/package.json
- packages/server/tsconfig.json
- packages/server/src/index.ts
- packages/server/src/config.ts
- packages/server/src/types/index.ts
- packages/server/src/routes/.gitkeep
- packages/server/src/services/.gitkeep
- packages/server/src/db/.gitkeep
- packages/admin/package.json
- packages/admin/tsconfig.json
- packages/admin/tsconfig.node.json
- packages/admin/vite.config.ts
- packages/admin/tailwind.config.js
- packages/admin/postcss.config.js
- packages/admin/index.html
- packages/admin/src/main.ts
- packages/admin/src/style.css
- packages/admin/src/App.vue
- packages/admin/src/vite-env.d.ts
- packages/admin/src/router/index.ts
- packages/admin/src/views/DashboardView.vue
- packages/admin/src/views/ConfigView.vue
- packages/admin/src/views/QueueView.vue
- packages/admin/src/api/client.ts
- packages/admin/src/stores/config.ts
- packages/admin/src/stores/whatsapp.ts
- packages/admin/src/components/.gitkeep

### Change Log

- 2026-01-27: Initial project scaffolding complete. All 6 tasks implemented.
