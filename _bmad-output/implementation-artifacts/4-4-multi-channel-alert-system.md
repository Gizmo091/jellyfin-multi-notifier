# Story 4.4: Multi-Channel Alert System

Status: review

## Story

As an **admin**,
I want **to receive alerts via email, Telegram, or Discord when WhatsApp disconnects**,
so that **I can reconnect quickly** (FR22, FR23, FR24, FR25, FR26).

## Acceptance Criteria

1. **Given** WhatsApp disconnection is detected (FR22)
   **When** alert is triggered
   **Then** configured alert channels are notified

2. **Given** email alerts are configured (FR24)
   **When** an alert is sent
   **Then** email is delivered with disconnection info and reconnection code (FR23)

3. **Given** Telegram alerts are configured (FR25)
   **When** an alert is sent
   **Then** Telegram message is delivered with disconnection info and reconnection code

4. **Given** Discord alerts are configured (FR26)
   **When** an alert is sent
   **Then** Discord webhook is called with disconnection info and reconnection code

5. **Given** one alert channel fails
   **When** sending alerts
   **Then** other channels still receive alerts (NFR12)

6. **Given** no alert channels are configured
   **When** an alert is triggered
   **Then** the event is logged but no error occurs

## Tasks / Subtasks

- [x] Task 1: Create AlertService for multi-channel alerts
  - [x] Send email via SMTP (nodemailer)
  - [x] Send Telegram message via bot API
  - [x] Send Discord message via webhook

- [x] Task 2: Wire WhatsApp disconnect events to alerts
  - [x] Listen for 'disconnected' event
  - [x] Listen for 'logged-out' event
  - [x] Include pairing code in alert message

- [x] Task 3: Test alert channels
  - [x] Test email delivery
  - [x] Test Telegram delivery
  - [x] Test Discord delivery

## Dev Notes

### Previous Stories Context

**Story 2.4:** WhatsApp disconnection detection with events
**Config:** Already has SMTP, Telegram, Discord env vars

### Implementation Pattern

```typescript
class AlertService {
  async sendAlert(type: string, message: string, pairingCode?: string): Promise<void> {
    const results = await Promise.allSettled([
      this.sendEmail(type, message, pairingCode),
      this.sendTelegram(type, message, pairingCode),
      this.sendDiscord(type, message, pairingCode),
    ])
    // Log results, continue even if some fail
  }
}
```

### Alert Message Format

```
[Jellyfin Notifier] WhatsApp Disconnected

Reason: Connection lost
Time: 2026-01-27 15:30:00

To reconnect, use pairing code: ABC-DEF
Or visit the admin dashboard at: {PUBLIC_URL}
```

### References

- [Source: prd.md#FR22-26] - Alert system requirements
- [Source: prd.md#NFR12] - Independent channel operation
- [nodemailer](https://nodemailer.com/)
- [Telegram Bot API](https://core.telegram.org/bots/api#sendmessage)
- [Discord Webhooks](https://discord.com/developers/docs/resources/webhook)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Created AlertService singleton for multi-channel alerts
- Email via nodemailer with SMTP configuration
- Telegram via Bot API (sendMessage endpoint)
- Discord via webhook with embed formatting
- All channels operate independently (NFR12)
- Listens to WhatsApp 'disconnected' and 'logged-out' events
- Alert includes disconnection reason, timestamp, pairing code
- Added /api/alerts/status and /api/alerts/test endpoints
- Test endpoint sends test alert to all configured channels

### File List

**Created:**
- packages/server/src/services/alert/index.ts (AlertService)
- packages/server/src/routes/alert.ts (alert API endpoints)

**Modified:**
- packages/server/src/index.ts (initialize alert service, register routes)
- packages/server/package.json (add nodemailer)

### Change Log

- 2026-01-27: Story 4.4 implementation complete. All 3 tasks implemented.
