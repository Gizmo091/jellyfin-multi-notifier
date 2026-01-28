# Story 2.4: Connection Status & Disconnection Detection

Status: review

## Story

As an **admin**,
I want **to know the current WhatsApp connection status and be notified of disconnections**,
so that **I can take action if needed** (FR8, FR9).

## Acceptance Criteria

1. **Given** the service is running
   **When** I query the WhatsApp status
   **Then** I receive: connected/disconnected, last connected time, phone number

2. **Given** WhatsApp is connected
   **When** the connection is lost (logout, network issue, etc.)
   **Then** the system detects this within 60 seconds (NFR16)

3. **Given** a disconnection is detected
   **When** the event occurs
   **Then** an internal event is emitted (prepared for alerts in Epic 4)

4. **Given** a disconnection occurred
   **When** I request a new pairing code (FR10)
   **Then** a fresh code is generated for reconnection

## Tasks / Subtasks

- [x] Task 1: Enhance status endpoint response (AC: #1)
  - [x] Ensure status includes: connected, lastConnected, phoneNumber
  - [x] Add disconnection reason to status if applicable
  - [x] Add isReconnecting flag to status

- [x] Task 2: Verify disconnection detection (AC: #2, #3)
  - [x] Test network disconnection triggers event
  - [x] Test logout triggers event with permanent flag
  - [x] Ensure detection happens within 60 seconds

- [x] Task 3: Reconnection code generation (AC: #4)
  - [x] POST /api/whatsapp/connect generates fresh code after disconnect
  - [x] Clear previous session if logged out
  - [x] Return new pairing code in response

- [x] Task 4: Validation & Testing (AC: #1-4)
  - [x] Test status endpoint returns all fields
  - [x] Test reconnect after disconnect
  - [x] Verify events are emitted correctly

## Dev Notes

### Previous Stories Context

**Story 2.1:** WhatsApp connection with pairing code
- `whatsappClient.connect(phoneNumber)` available
- `whatsappClient.getStatus()` returns WhatsAppStatus

**Story 2.2:** Send text messages to group
**Story 2.3:** Send images with captions

### Current WhatsAppStatus Interface

```typescript
interface WhatsAppStatus {
  connected: boolean
  phoneNumber?: string
  lastConnected?: Date
  pairingCode?: string
  error?: string
}
```

### Baileys Disconnection Reasons

```typescript
enum DisconnectReason {
  connectionClosed = 428,
  connectionLost = 408,
  connectionReplaced = 440,
  timedOut = 408,
  loggedOut = 401,
  badSession = 500,
  restartRequired = 515,
  multideviceMismatch = 411,
}
```

### Implementation Enhancements

```typescript
// Enhanced status
interface WhatsAppStatus {
  connected: boolean
  phoneNumber?: string
  lastConnected?: Date
  pairingCode?: string
  error?: string
  disconnectReason?: string  // Add reason if disconnected
  isReconnecting?: boolean   // True if reconnect attempt in progress
}
```

### Test Commands

```bash
# Check status
curl http://localhost:3000/api/whatsapp/status | jq .

# Request new pairing code after disconnect
curl -X POST http://localhost:3000/api/whatsapp/connect \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "33612345678"}'
```

### References

- [Source: prd.md#FR8] - View WhatsApp status
- [Source: prd.md#FR9] - Detect disconnection
- [Source: prd.md#NFR16] - Detection within 60 seconds
- [Baileys connection events](https://github.com/WhiskeySockets/Baileys#handling-events)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Enhanced WhatsAppStatus interface with `disconnectReason` and `isReconnecting` fields
- Status endpoint GET /api/whatsapp/status returns: connected, phoneNumber, lastConnected, pairingCode, error, disconnectReason, isReconnecting
- Disconnection reason is stored when connection closes (uses Baileys DisconnectReason enum)
- isReconnecting flag set to true during reconnection attempts
- Both flags cleared when connection is re-established
- Events already implemented in Story 2.1:
  - 'connected' event emitted on successful connection
  - 'disconnected' event emitted with reason and permanent flag
  - 'logged-out' event emitted when session is invalidated
- Auto-reconnect with exponential backoff (max 5 attempts, max 60s delay)
- Session cleared on logout for fresh pairing code

### File List

**Modified:**
- packages/server/src/services/whatsapp/client.ts (enhanced status tracking)
- packages/server/src/types/index.ts (updated WhatsAppStatus interface)

### Change Log

- 2026-01-27: Story 2.4 implementation complete. All 4 tasks implemented and tested.
