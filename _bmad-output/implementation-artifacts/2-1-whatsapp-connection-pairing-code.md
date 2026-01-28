# Story 2.1: WhatsApp Connection with Pairing Code

Status: review

## Story

As an **admin**,
I want **to connect the service to my WhatsApp account using a pairing code**,
so that **the service can send messages on my behalf** (FR5, FR10).

## Acceptance Criteria

1. **Given** the service is running and WhatsApp is not connected
   **When** I request a connection
   **Then** a pairing code is generated and displayed/logged

2. **Given** I have a pairing code
   **When** I enter it in WhatsApp > Linked Devices on my phone
   **Then** the service connects successfully

3. **Given** a successful connection
   **When** the session is established
   **Then** credentials are stored in `data/whatsapp-session/` (NFR7)

4. **Given** a connection attempt fails
   **When** an error occurs
   **Then** a clear error message is logged and a new code can be requested

## Tasks / Subtasks

- [x] Task 1: Install and configure Baileys library (AC: #1, #2)
  - [x] Add `@whiskeysockets/baileys` dependency to packages/server
  - [x] Add `pino` for Baileys logging (required dependency)
  - [x] Add `@hapi/boom` for error handling
  - [x] Create `packages/server/src/services/whatsapp/` directory structure

- [x] Task 2: Create WhatsApp client service (AC: #1, #2, #3)
  - [x] Create `packages/server/src/services/whatsapp/client.ts`
  - [x] Implement `WhatsAppClient` class with singleton pattern
  - [x] Configure auth state storage in `data/whatsapp-session/`
  - [x] Implement `connect()` method with pairing code flow
  - [x] Handle connection events (open, close, error)

- [x] Task 3: Implement pairing code generation (AC: #1, #4)
  - [x] Configure Baileys for pairing code mode (not QR)
  - [x] Get phone number from API request body
  - [x] Request pairing code via `requestPairingCode()`
  - [x] Log pairing code clearly for admin to copy
  - [x] Handle pairing timeout and retry with exponential backoff

- [x] Task 4: Create WhatsApp status API endpoint (AC: #1, #4)
  - [x] Create `packages/server/src/routes/whatsapp.ts`
  - [x] Implement `GET /api/whatsapp/status` endpoint
  - [x] Implement `POST /api/whatsapp/connect` endpoint
  - [x] Implement `POST /api/whatsapp/disconnect` endpoint
  - [x] Implement `POST /api/whatsapp/reconnect` endpoint
  - [x] Return connection status, phone number, last connected time
  - [x] Register routes in main server

- [x] Task 5: Session persistence and reconnection (AC: #3, #4)
  - [x] Implement `useMultiFileAuthState` for session storage
  - [x] Ensure session directory is created if missing
  - [x] Auto-reconnect on connection loss with exponential backoff
  - [x] Handle session expiry gracefully (clear session, emit event)

- [x] Task 6: Validation & Testing (AC: #1-4)
  - [x] Test pairing code generation → code displayed in API response
  - [x] Test status endpoint → returns connected: false initially
  - [x] Test phone number validation → rejects invalid formats
  - [x] Test error handling → clear error messages

## Dev Notes

### Previous Stories Context

**Epic 1 Complete:**
- Story 1.1: Project scaffolding with Fastify server
- Story 1.2: Webhook endpoint `/webhook/jellyfin` with secret validation
- Story 1.3: Media metadata extraction and in-memory storage

The server is running on port 3000 with Fastify. We now need to add WhatsApp functionality.

### Baileys Library Overview

Baileys is a TypeScript/JavaScript library for interacting with WhatsApp Web API via WebSocket. It allows:
- Sending/receiving messages
- Pairing code authentication (no QR scan needed)
- Multi-device support
- Session persistence

**Installation:**
```bash
npm install @whiskeysockets/baileys pino
```

### Directory Structure

```
packages/server/
├── src/
│   ├── services/
│   │   ├── whatsapp/
│   │   │   ├── client.ts        # WhatsApp client singleton
│   │   │   ├── auth-state.ts    # Auth state management (optional)
│   │   │   └── index.ts         # Exports
│   │   ├── media-extractor.ts
│   │   └── media-store.ts
│   └── routes/
│       ├── webhook.ts
│       └── whatsapp.ts          # New: WhatsApp API routes
└── data/
    └── whatsapp-session/        # Session files (gitignored)
```

### Implementation Pattern: WhatsApp Client

```typescript
// packages/server/src/services/whatsapp/client.ts
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  ConnectionState,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import path from 'path'
import { config } from '../../config.js'

const SESSION_PATH = path.join(process.cwd(), 'data', 'whatsapp-session')

export interface WhatsAppStatus {
  connected: boolean
  phoneNumber?: string
  lastConnected?: Date
  pairingCode?: string
}

class WhatsAppClient {
  private socket: WASocket | null = null
  private status: WhatsAppStatus = { connected: false }
  private logger = pino({ level: 'silent' }) // Suppress Baileys verbose logs

  async connect(phoneNumber?: string): Promise<string | null> {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH)

    this.socket = makeWASocket({
      auth: state,
      printQRInTerminal: false, // We use pairing code, not QR
      logger: this.logger,
    })

    // Handle connection updates
    this.socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update

      if (connection === 'close') {
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode
        this.status.connected = false

        if (reason === DisconnectReason.loggedOut) {
          // Session invalidated, need new pairing
          console.log('WhatsApp logged out, need to re-pair')
        } else {
          // Try to reconnect
          console.log('WhatsApp disconnected, attempting reconnect...')
          await this.connect(phoneNumber)
        }
      }

      if (connection === 'open') {
        this.status.connected = true
        this.status.lastConnected = new Date()
        this.status.phoneNumber = this.socket?.user?.id?.split(':')[0]
        console.log('WhatsApp connected successfully')
      }
    })

    // Save credentials on update
    this.socket.ev.on('creds.update', saveCreds)

    // Request pairing code if not registered
    if (!state.creds.registered && phoneNumber) {
      const code = await this.socket.requestPairingCode(phoneNumber)
      this.status.pairingCode = code
      console.log(`WhatsApp pairing code: ${code}`)
      return code
    }

    return null
  }

  getStatus(): WhatsAppStatus {
    return { ...this.status }
  }

  getSocket(): WASocket | null {
    return this.socket
  }
}

// Singleton instance
export const whatsappClient = new WhatsAppClient()
```

### API Endpoints Pattern

```typescript
// packages/server/src/routes/whatsapp.ts
import { FastifyInstance } from 'fastify'
import { whatsappClient } from '../services/whatsapp/client.js'
import type { ApiResponse } from '../types/index.js'

export async function whatsappRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/whatsapp/status
  fastify.get('/api/whatsapp/status', async () => {
    return {
      success: true,
      data: whatsappClient.getStatus(),
    }
  })

  // POST /api/whatsapp/connect
  fastify.post<{ Body: { phoneNumber: string } }>(
    '/api/whatsapp/connect',
    async (request) => {
      const { phoneNumber } = request.body

      if (!phoneNumber) {
        return {
          success: false,
          error: 'Phone number is required',
        }
      }

      try {
        const pairingCode = await whatsappClient.connect(phoneNumber)
        return {
          success: true,
          data: {
            pairingCode,
            message: pairingCode
              ? 'Enter this code in WhatsApp > Linked Devices'
              : 'Already connected or reconnecting',
          },
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Connection failed',
        }
      }
    }
  )
}
```

### Configuration Updates

Add to `config.ts`:
```typescript
whatsappPhoneNumber: getEnv('WHATSAPP_PHONE_NUMBER', ''),
```

### Phone Number Format

Baileys requires phone numbers in international format WITHOUT the + sign:
- France: `33612345678` (not +33 6 12 34 56 78)
- US: `14155551234` (not +1 415 555 1234)

### Session Storage (NFR7)

Session files are stored locally only:
```
data/whatsapp-session/
├── creds.json           # Authentication credentials
├── app-state-sync-key-*.json
└── ... other state files
```

**Important:** Add to `.gitignore`:
```
data/whatsapp-session/
```

### Test Commands

```bash
# Check WhatsApp status
curl http://localhost:3000/api/whatsapp/status

# Request connection with phone number
curl -X POST http://localhost:3000/api/whatsapp/connect \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "33612345678"}'
```

### Error Handling

| Error | Cause | Action |
|-------|-------|--------|
| `DisconnectReason.loggedOut` | User logged out from phone | Need new pairing code |
| `DisconnectReason.connectionClosed` | Network issue | Auto-reconnect |
| `DisconnectReason.connectionLost` | WebSocket closed | Auto-reconnect |
| `DisconnectReason.badSession` | Session corrupted | Clear session, re-pair |

### References

- [Source: architecture.md#WhatsApp Integration] - Baileys library
- [Source: prd.md#FR5] - Connect with pairing code
- [Source: prd.md#FR10] - Generate new pairing code
- [Source: prd.md#NFR7] - Store credentials locally only
- [Baileys GitHub](https://github.com/WhiskeySockets/Baileys)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Installed @whiskeysockets/baileys, pino, @hapi/boom dependencies
- Created WhatsAppClient singleton with EventEmitter for connection events
- Implemented pairing code flow via `requestPairingCode()` method
- Session stored in `data/whatsapp-session/` using `useMultiFileAuthState`
- Auto-creates session directory if missing
- Auto-reconnect with exponential backoff (max 5 attempts)
- Handles DisconnectReason.loggedOut by clearing session
- Added 4 API endpoints: status, connect, disconnect, reconnect
- Phone number validation: 10-15 digits, international format without +
- All tests pass:
  - GET /api/whatsapp/status → `{"connected": false}`
  - POST /api/whatsapp/connect with invalid phone → 400 Bad Request
  - POST /api/whatsapp/connect with valid phone → pairing code generated

### File List

**Created:**
- packages/server/src/services/whatsapp/client.ts
- packages/server/src/services/whatsapp/index.ts
- packages/server/src/routes/whatsapp.ts

**Modified:**
- packages/server/src/index.ts (added whatsappRoutes registration)
- packages/server/src/types/index.ts (added pairingCode, error to WhatsAppStatus)
- packages/server/package.json (added baileys, pino, @hapi/boom deps)

### Change Log

- 2026-01-27: Story 2.1 implementation complete. All 6 tasks implemented and tested.
