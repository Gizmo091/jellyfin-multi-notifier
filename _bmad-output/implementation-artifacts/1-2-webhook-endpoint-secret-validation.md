# Story 1.2: Webhook Endpoint with Secret Validation

Status: review

## Story

As a **system**,
I want **to receive and validate Jellyfin webhooks**,
so that **only authorized requests are processed** (FR3).

## Acceptance Criteria

1. **Given** the webhook endpoint `/webhook/jellyfin` exists
   **When** a POST request arrives with valid `X-Webhook-Secret` header
   **Then** the request is accepted for processing (200 OK)

2. **Given** a webhook request arrives
   **When** the `X-Webhook-Secret` header is missing or invalid
   **Then** the request is rejected with 401 Unauthorized

3. **Given** a valid webhook is received
   **When** processed
   **Then** processing completes within 500ms (NFR3)

## Tasks / Subtasks

- [x] Task 1: Create webhook route file (AC: #1)
  - [x] Create `packages/server/src/routes/webhook.ts`
  - [x] Define Fastify route schema with JSON Schema validation
  - [x] Export route registration function

- [x] Task 2: Implement secret validation (AC: #1, #2)
  - [x] Create preHandler hook for X-Webhook-Secret validation
  - [x] Use timing-safe comparison (crypto.timingSafeEqual)
  - [x] Return 401 with `{ success: false, error: "Invalid webhook secret" }` on failure
  - [x] Return 200 with `{ success: true, data: { received: true } }` on success

- [x] Task 3: Register route in main server (AC: #1)
  - [x] Import webhook routes in `src/index.ts`
  - [x] Register routes with Fastify

- [x] Task 4: Add webhook-specific types (AC: #1)
  - [x] Define `JellyfinWebhookPayload` interface in types
  - [x] Define webhook response types

- [x] Task 5: Validation & Testing (AC: #1-3)
  - [x] Test with valid X-Webhook-Secret header → 200 OK
  - [x] Test with invalid X-Webhook-Secret header → 401
  - [x] Test with missing X-Webhook-Secret header → 401
  - [x] Verify processing completes within 500ms

## Dev Notes

### Previous Story (1.1) Context

Story 1.1 implemented:
- Fastify server running on port 3000
- `config.webhookSecret` available from `src/config.ts`
- Response format: `{ success: true, data: {} }` or `{ success: false, error: "" }`
- Types defined in `src/types/index.ts`
- Placeholder `src/routes/` directory ready

### Technical Requirements

**Endpoint:** `POST /webhook/jellyfin`

**Headers:**
- `X-Webhook-Secret`: Required, must match `WEBHOOK_SECRET` env var

**Response Codes:**
| Code | Condition |
|------|-----------|
| 200 | Valid secret, request accepted |
| 401 | Missing or invalid secret |
| 400 | Invalid JSON body (Fastify handles) |

**Performance:** Must complete within 500ms (NFR3)

### Implementation Pattern

```typescript
// packages/server/src/routes/webhook.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { timingSafeEqual } from 'crypto'
import { config } from '../config.js'

export async function webhookRoutes(fastify: FastifyInstance) {
  // Validation hook
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const secret = request.headers['x-webhook-secret']

    if (!secret || typeof secret !== 'string') {
      return reply.code(401).send({ success: false, error: 'Missing webhook secret' })
    }

    const expected = Buffer.from(config.webhookSecret)
    const received = Buffer.from(secret)

    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      return reply.code(401).send({ success: false, error: 'Invalid webhook secret' })
    }
  })

  // Webhook endpoint
  fastify.post('/webhook/jellyfin', async (request, reply) => {
    // For now, just acknowledge receipt
    // Story 1.3 will handle payload extraction
    return { success: true, data: { received: true } }
  })
}
```

### Registration in index.ts

```typescript
import { webhookRoutes } from './routes/webhook.js'

// After other registrations
await fastify.register(webhookRoutes)
```

### Timing-Safe Comparison

**CRITICAL:** Use `crypto.timingSafeEqual()` to prevent timing attacks.

```typescript
import { timingSafeEqual } from 'crypto'

// Convert to buffers of same length before comparing
const expected = Buffer.from(config.webhookSecret)
const received = Buffer.from(headerValue)

// Length check first (timingSafeEqual requires same length)
if (expected.length !== received.length) {
  return false
}

return timingSafeEqual(expected, received)
```

### Test Commands

```bash
# Valid secret
curl -X POST http://localhost:3000/webhook/jellyfin \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: your-secret-here" \
  -d '{"test": true}'

# Invalid secret
curl -X POST http://localhost:3000/webhook/jellyfin \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: wrong-secret" \
  -d '{"test": true}'

# Missing secret
curl -X POST http://localhost:3000/webhook/jellyfin \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### Naming Conventions (from architecture)

- **Files:** kebab-case (`webhook.ts`)
- **Functions:** camelCase (`webhookRoutes`)
- **Types:** PascalCase (`JellyfinWebhookPayload`)

### References

- [Source: architecture.md#API Endpoints] - `/webhook/jellyfin` endpoint
- [Source: architecture.md#Authentication & Security] - Webhook header validation
- [Source: prd.md#FR3] - Validate webhooks using shared secret
- [Source: prd.md#NFR3] - Processing within 500ms
- [Source: prd.md#NFR6] - Validate before processing

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Created webhook route with Fastify plugin pattern
- Implemented timing-safe secret comparison using crypto.timingSafeEqual()
- Added preHandler hook for secret validation on all webhook routes
- Response format follows API standard: `{ success, data/error }`
- Added comprehensive types for Jellyfin webhook payload (JellyfinItem, JellyfinUser)
- All tests pass:
  - Valid secret → 200 OK with `{ success: true, data: { received: true, timestamp } }`
  - Invalid secret → 401 with `{ success: false, error: "Invalid webhook secret" }`
  - Missing secret → 401 with `{ success: false, error: "Missing webhook secret" }`
- Performance: 7.24ms response time (well under 500ms NFR3 requirement)

### File List

**Created:**
- packages/server/src/routes/webhook.ts

**Modified:**
- packages/server/src/index.ts (added webhook routes import and registration)
- packages/server/src/types/index.ts (added JellyfinWebhookPayload, JellyfinItem, JellyfinUser, WebhookReceivedResponse)

### Change Log

- 2026-01-27: Story 1.2 implementation complete. All 5 tasks implemented and tested.
