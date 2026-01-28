# Story 2.2: Send Text Messages to Group

Status: review

## Story

As a **system**,
I want **to send text messages to a configured WhatsApp group**,
so that **users receive notifications** (FR6).

## Acceptance Criteria

1. **Given** WhatsApp is connected
   **When** a text message is sent to the configured group ID
   **Then** the message appears in the WhatsApp group

2. **Given** WhatsApp is not connected
   **When** a message send is attempted
   **Then** the operation fails gracefully with an error (prepared for queue in Epic 4)

3. **Given** a message is sent
   **When** delivery is confirmed
   **Then** the success is logged

## Tasks / Subtasks

- [x] Task 1: Add sendTextMessage method to WhatsApp client (AC: #1, #2, #3)
  - [x] Implement `sendTextMessage(jid, text)` in client.ts
  - [x] Validate WhatsApp is connected before sending
  - [x] Use Baileys `sendMessage()` API
  - [x] Return success/failure boolean

- [x] Task 2: Create message sending API endpoint (AC: #1, #2)
  - [x] Add `POST /api/whatsapp/send` endpoint
  - [x] Accept groupId and message in request body
  - [x] Return delivery status with groupId

- [x] Task 3: Add group ID configuration (AC: #1)
  - [x] Use `WHATSAPP_GROUP_ID` from config as fallback
  - [x] Auto-append @g.us if not present
  - [x] Allow override via API request

- [x] Task 4: Logging and error handling (AC: #2, #3)
  - [x] Log successful message delivery with truncated preview
  - [x] Log failed attempts with error details
  - [x] Emit events: message-sent, message-failed

- [x] Task 5: Validation & Testing (AC: #1-3)
  - [x] Test send without connection → "WhatsApp is not connected"
  - [x] Test send without message → 400 validation error
  - [x] Test send with empty message → 400 validation error
  - [x] Test send without group ID → "No group ID provided"

## Dev Notes

### Previous Story Context

**Story 2.1:** WhatsApp connection with pairing code implemented
- `whatsappClient` singleton available
- `getSocket()` returns WASocket when connected
- `isConnected()` checks connection status

### WhatsApp Group ID Format

WhatsApp group IDs have the format: `{timestamp}{random}@g.us`
Example: `120363123456789012@g.us`

To find your group ID:
1. Add the bot to the group
2. Send a message in the group
3. Check server logs for incoming message with group JID

### Baileys sendMessage API

```typescript
// Send text message to group
await socket.sendMessage(groupId, {
  text: 'Hello, World!'
})

// The groupId must end with @g.us for groups
// Individual chats end with @s.whatsapp.net
```

### Implementation Pattern

```typescript
// In packages/server/src/services/whatsapp/client.ts

async sendTextMessage(groupId: string, text: string): Promise<boolean> {
  if (!this.isConnected() || !this.socket) {
    console.error('Cannot send message: WhatsApp not connected')
    return false
  }

  // Validate group ID format
  if (!groupId.endsWith('@g.us')) {
    groupId = `${groupId}@g.us`
  }

  try {
    await this.socket.sendMessage(groupId, { text })
    console.log(`Message sent to ${groupId}`)
    this.emit('message-sent', { groupId, text })
    return true
  } catch (error) {
    console.error('Failed to send message:', error)
    this.emit('message-failed', { groupId, text, error })
    return false
  }
}
```

### API Endpoint Pattern

```typescript
// POST /api/whatsapp/send
fastify.post<{ Body: { groupId?: string, message: string } }>(
  '/api/whatsapp/send',
  async (request) => {
    const { groupId, message } = request.body
    const targetGroup = groupId || config.whatsappGroupId

    if (!message) {
      return { success: false, error: 'Message is required' }
    }

    if (!targetGroup) {
      return { success: false, error: 'Group ID not configured' }
    }

    const sent = await whatsappClient.sendTextMessage(targetGroup, message)
    return sent
      ? { success: true, data: { sent: true, groupId: targetGroup } }
      : { success: false, error: 'Failed to send message' }
  }
)
```

### Test Commands

```bash
# Send test message (requires WhatsApp connected)
curl -X POST http://localhost:3000/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -d '{"message": "Test from Jellyfin Notifier!"}'

# Send to specific group
curl -X POST http://localhost:3000/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -d '{"groupId": "120363123456789012@g.us", "message": "Hello!"}'
```

### References

- [Source: prd.md#FR6] - Send text messages to group
- [Source: architecture.md#WhatsApp Integration] - Baileys library
- [Baileys sendMessage](https://github.com/WhiskeySockets/Baileys#sending-messages)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Added `sendTextMessage(jid, text)` method to WhatsApp client
- Method validates connection status before sending
- Auto-normalizes JID format (appends @g.us if needed)
- Emits events: message-sent (with messageId), message-failed (with error)
- Added POST /api/whatsapp/send endpoint with JSON schema validation
- Message validation: required, 1-4096 chars
- Falls back to config.whatsappGroupId if not provided in request
- All tests pass:
  - Send without connection → graceful "not connected" error
  - Send without message → 400 validation error
  - Send with empty message → 400 validation error
  - Send without group ID configured → "No group ID provided" error

### File List

**Modified:**
- packages/server/src/services/whatsapp/client.ts (added sendTextMessage method)
- packages/server/src/routes/whatsapp.ts (added /send endpoint)
- packages/admin/src/stores/config.ts (fixed unused variable warning)

### Change Log

- 2026-01-27: Story 2.2 implementation complete. All 5 tasks implemented and tested.
