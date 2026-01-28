---
stepsCompleted: ['step-01-init', 'step-02-context', 'step-03-starter', 'step-04-decisions', 'step-05-patterns', 'step-06-structure', 'step-07-validation', 'step-08-complete']
status: 'complete'
completedAt: '2026-01-27'
inputDocuments: ['prd.md']
workflowType: 'architecture'
project_name: 'Jellyfin WhatsApp Notifier'
user_name: 'Mathieu'
date: '2026-01-27'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
Le système doit orchestrer un flux événementiel : Jellyfin → Webhook → Aggregation → WhatsApp. Les 30 FR couvrent la réception d'événements, le traitement avec agrégation intelligente, l'envoi vers WhatsApp avec images, et la résilience via queue persistante. L'UI admin est secondaire mais nécessaire pour la configuration.

**Non-Functional Requirements:**
Les NFR critiques sont la fiabilité (99.9% uptime, queue persistante) et l'empreinte légère (< 100MB RAM). La dégradation gracieuse (TMDB/IMDB indisponible) et l'abstraction WhatsApp (changement de lib possible) guident les choix d'architecture.

**Scale & Complexity:**
- Primary domain: API Backend + Lightweight Web App
- Complexity level: Low-Medium
- Estimated architectural components: 7

### Technical Constraints & Dependencies

- Dépendance forte : Librairie WhatsApp tierce (Baileys ou whatsapp-web.js)
- Dépendance optionnelle : APIs TMDB/IMDB pour covers
- Contrainte déploiement : Docker avec docker-compose
- Contrainte stockage : Pas de DB externe (JSON/SQLite)

### Cross-Cutting Concerns Identified

- **Configuration management** : Jellyfin URL, WhatsApp group, alert channels
- **Error handling & retry** : Exponential backoff, queue persistence
- **Logging** : Sans données sensibles (NFR9)
- **State management** : Session WhatsApp, aggregation windows, queue

## Starter Template Evaluation

### Primary Technology Domain

**Backend Service + Lightweight Admin UI** - Service Node.js continu avec petite interface d'administration Vue.js.

### Selected Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Runtime | Node.js 20+ LTS | Stability, TypeScript support |
| Language | TypeScript | Type safety, better DX |
| Backend Framework | Fastify | Lightweight, built-in validation, plugin architecture |
| Frontend | Vue 3 + Vite | User preference, fast, modern |
| WhatsApp Library | Baileys | Direct WebSocket, lightweight, native TypeScript |
| Storage | SQLite (better-sqlite3) | Simple, single file, no server needed |

### Project Structure

```
jellyfin-whatsapp-notifier/
├── package.json          # Workspace root
├── docker-compose.yml
├── Dockerfile
├── packages/
│   ├── server/           # Fastify backend
│   │   ├── src/
│   │   └── package.json
│   └── admin/            # Vue 3 frontend
│       ├── src/
│       └── package.json
```

### Initialization Commands

```bash
# Backend (Fastify + TypeScript)
npm install fastify @fastify/cors @fastify/static baileys typescript
npm install -D @types/node tsx

# Frontend (Vue 3 + Vite)
npm create vue@latest packages/admin -- --typescript --router --pinia
```

### Architectural Decisions from Stack

- **Language & Runtime:** TypeScript strict mode, ES modules, Node.js 20+
- **Backend Framework:** Fastify with plugins (@fastify/cors, @fastify/static)
- **WhatsApp Integration:** Baileys - direct WebSocket, no Puppeteer overhead
- **Storage:** SQLite via better-sqlite3 (synchronous, simple, performant)
- **Build & Dev:** tsx for backend (direct TS execution), Vite for frontend

## Core Architectural Decisions

### Data Architecture

- **Database:** SQLite via better-sqlite3 (synchronous, no ORM)
- **Tables:** config, message_queue, notification_history
- **WhatsApp Session:** Separate file (`data/whatsapp-session/`) for easy export/backup
- **Migrations:** Auto-create tables on startup if not exists

### Authentication & Security

- **Admin UI:** Single password via `ADMIN_PASSWORD` env var
- **Session:** HTTP-only cookie with expiration
- **Webhook:** Header validation `X-Webhook-Secret`
- **Network:** Admin accessible on localhost by default

### API & Communication

- **Style:** REST with JSON
- **Response Format:** `{ "success": boolean, "data": {} }` or `{ "success": false, "error": "message" }`
- **Error Handling:** HTTP status codes (400, 401, 500) + explicit message
- **Validation:** JSON Schema via Fastify built-in

### Frontend Architecture

- **Framework:** Vue 3 + Vite + TypeScript
- **State:** Pinia stores (config, whatsapp, queue)
- **Styling:** Tailwind CSS
- **Structure:** views / components / stores / api

### Infrastructure & Deployment

- **Container:** Docker multi-stage build, node:20-alpine base
- **CI/CD:** GitHub Actions → build & push to ghcr.io on main
- **Registry:** ghcr.io (GitHub Container Registry)
- **Config:** Environment variables only
- **Volumes:** `data/` (SQLite DB + WhatsApp session)
- **Logging:** JSON to stdout

## Implementation Patterns & Consistency Rules

### Naming Patterns

**Database (SQLite):**
- Tables: snake_case, plural (`message_queue`, `notification_history`)
- Columns: snake_case (`media_id`, `created_at`, `retry_count`)

**API Endpoints:**
- RESTful paths: `/api/config`, `/api/whatsapp/status`, `/api/queue`
- Webhook: `/webhook/jellyfin`
- Redirect: `/redirect/:id`

**TypeScript Code:**
- Variables/functions: camelCase (`messageQueue`, `sendNotification`)
- Classes/Types: PascalCase (`WhatsAppService`, `MediaEvent`)
- Files: kebab-case (`whatsapp-service.ts`, `message-queue.ts`)

**Vue Components:**
- Components: PascalCase (`StatusCard.vue`, `QueueList.vue`)
- Composables: use prefix (`useWhatsApp.ts`, `useConfig.ts`)

### Structure Patterns

```
packages/server/src/
├── index.ts              # Entry point
├── config.ts             # Configuration loading
├── routes/
│   ├── webhook.ts        # POST /webhook/jellyfin
│   ├── api.ts            # /api/* routes
│   └── redirect.ts       # GET /redirect/:id
├── services/
│   ├── whatsapp.ts       # Baileys wrapper
│   ├── aggregator.ts     # Temporal aggregation
│   ├── queue.ts          # Message queue
│   ├── alerter.ts        # Alert channels
│   └── media.ts          # TMDB/IMDB covers
├── db/
│   ├── index.ts          # SQLite connection
│   └── migrations.ts     # Table creation
└── types/
    └── index.ts          # Shared types

packages/admin/src/
├── views/
│   ├── DashboardView.vue
│   ├── ConfigView.vue
│   └── QueueView.vue
├── components/
├── stores/
│   ├── config.ts
│   └── whatsapp.ts
└── api/
    └── client.ts
```

### Format Patterns

**API Responses:**
- Success: `{ "success": true, "data": { ... } }`
- Error: `{ "success": false, "error": "Message explicite" }`

**JSON Fields:** camelCase (`mediaId`, `createdAt`)

**Dates:** ISO 8601 strings (`2026-01-27T12:00:00Z`)

### Process Patterns

**Error Handling:** Fastify centralized error handler

**Logging:** Fastify built-in logger (JSON stdout), no console.log

**Tests:** Co-located (`whatsapp.ts` + `whatsapp.test.ts`)

### Enforcement Guidelines

**All AI Agents MUST:**
- Use snake_case for SQLite columns
- Use camelCase for TypeScript and JSON
- Use kebab-case for file names
- Place tests next to source files
- Use Fastify logger, not console.log
- Return `{ success, data/error }` format

## Project Structure & Boundaries

### Complete Project Directory Structure

```
jellyfin-whatsapp-notifier/
├── .github/
│   └── workflows/
│       └── docker-build.yml      # Build & push to ghcr.io
├── packages/
│   ├── server/
│   │   ├── src/
│   │   │   ├── index.ts          # Fastify entry point
│   │   │   ├── config.ts         # Env vars loading
│   │   │   ├── routes/
│   │   │   │   ├── webhook.ts    # POST /webhook/jellyfin
│   │   │   │   ├── api.ts        # /api/* endpoints
│   │   │   │   └── redirect.ts   # GET /redirect/:id
│   │   │   ├── services/
│   │   │   │   ├── whatsapp.ts   # Baileys wrapper
│   │   │   │   ├── aggregator.ts # Temporal aggregation logic
│   │   │   │   ├── queue.ts      # Message queue & retry
│   │   │   │   ├── alerter.ts    # Email/Telegram/Discord alerts
│   │   │   │   └── media.ts      # TMDB/IMDB cover fetcher
│   │   │   ├── db/
│   │   │   │   ├── index.ts      # SQLite connection
│   │   │   │   └── migrations.ts # Table creation
│   │   │   └── types/
│   │   │       └── index.ts      # Shared TypeScript types
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── admin/
│       ├── src/
│       │   ├── main.ts
│       │   ├── App.vue
│       │   ├── views/
│       │   │   ├── DashboardView.vue
│       │   │   ├── ConfigView.vue
│       │   │   └── QueueView.vue
│       │   ├── components/
│       │   │   ├── WhatsAppStatus.vue
│       │   │   ├── QueueList.vue
│       │   │   └── LoginForm.vue
│       │   ├── stores/
│       │   │   ├── config.ts
│       │   │   └── whatsapp.ts
│       │   ├── api/
│       │   │   └── client.ts
│       │   └── router/
│       │       └── index.ts
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

### Architectural Boundaries

**API Boundaries:**
- External: `/webhook/jellyfin` (Jellyfin → Service)
- External: `/redirect/:id` (Users → Jellyfin)
- Internal: `/api/*` (Admin UI → Server)

**Service Boundaries:**
```
Webhook Route → Aggregator Service → Queue Service → WhatsApp Service
                                                   ↓
                                            Alerter Service (on error)
```

**Data Boundaries:**
- SQLite: config, queue, history (accessed via `db/index.ts` only)
- WhatsApp session: file-based, managed by `services/whatsapp.ts`
- In-memory: aggregation windows (lost on restart, acceptable)

### FR to Structure Mapping

| FR Category | Files |
|-------------|-------|
| Media Event Reception (FR1-4) | `routes/webhook.ts`, `services/media.ts` |
| WhatsApp Integration (FR5-10) | `services/whatsapp.ts` |
| Message Aggregation (FR11-14) | `services/aggregator.ts` |
| Content Links (FR15-17) | `routes/redirect.ts` |
| Admin Configuration (FR18-21) | `routes/api.ts`, `admin/src/views/` |
| System Alerts (FR22-26) | `services/alerter.ts` |
| Resilience & Queue (FR27-30) | `services/queue.ts`, `db/` |

### External Integrations

| Service | Integration | Fallback |
|---------|-------------|----------|
| Jellyfin | Webhook | None (required) |
| WhatsApp | Baileys | Reconnect with code |
| TMDB/IMDB | HTTP | Jellyfin cover |
| Email/Telegram/Discord | API | Skip if not configured |

## Architecture Validation Results

### Coherence Validation ✅

- **Decision Compatibility:** Node.js + Fastify + Baileys + SQLite form a coherent, lightweight stack
- **Pattern Consistency:** Naming conventions aligned between backend, frontend, and database
- **Structure Alignment:** Simple monorepo with clear boundaries between server and admin

### Requirements Coverage ✅

- **30/30 FR** mapped to specific components
- **18/18 NFR** addressed by architectural decisions
- **3/3 User Journeys** supported by architecture

### Implementation Readiness ✅

- Complete stack defined with versions
- Implementation patterns documented
- Project structure ready to scaffold
- CI/CD defined (GitHub Actions → ghcr.io)

### Architecture Completeness Checklist

- [x] Project context analyzed
- [x] Technology stack selected with versions
- [x] All FR/NFR mapped to components
- [x] Naming & structure patterns defined
- [x] Complete project structure documented
- [x] CI/CD pipeline defined
- [x] Docker deployment ready

### Architecture Readiness Assessment

**Overall Status:** ✅ READY FOR IMPLEMENTATION

**Confidence Level:** High

**Key Strengths:**
- Simple and coherent stack
- All requirements covered
- Clear patterns for AI agents

**First Implementation Step:**
```bash
mkdir -p packages/server/src/{routes,services,db,types}
mkdir -p packages/admin
npm init -y
```
