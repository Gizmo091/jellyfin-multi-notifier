# Story 5.2: WhatsApp Configuration & Status View

Status: review

## Story

As an **admin**,
I want **to configure the target WhatsApp group and view connection status**,
so that **I can manage where notifications are sent** (FR18, FR8 UI).

## Acceptance Criteria

1. **Given** I'm on the dashboard
   **When** I view the WhatsApp section
   **Then** I see: connection status, phone number, last connected time

2. **Given** WhatsApp is not connected
   **When** I click "Connect"
   **Then** a pairing code is displayed for me to enter on my phone

3. **Given** I want to view configuration (FR18)
   **When** I access the Configuration page
   **Then** I see current WhatsApp group ID and other settings

4. **Given** configuration is via environment variables
   **When** viewing the config page
   **Then** I see a reference table of all environment variables

## Tasks / Subtasks

- [x] Task 1: Update DashboardView with real data
  - [x] Display WhatsApp connection status
  - [x] Display queue status summary
  - [x] Display aggregation windows
  - [x] Add WhatsApp connect form with pairing code
  - [x] Auto-refresh every 5 seconds

- [x] Task 2: Create config API endpoint
  - [x] GET /api/config returns current settings (no secrets)
  - [x] Include alert channel configuration status

- [x] Task 3: Update ConfigView with configuration display
  - [x] Show core settings (Jellyfin URL, WhatsApp group, etc.)
  - [x] Show alert channel status (configured/not configured)
  - [x] Add test alerts button
  - [x] Add environment variables reference table

- [x] Task 4: Update QueueView with real data
  - [x] Display queue statistics
  - [x] Display message list with status
  - [x] Auto-refresh every 5 seconds

## Dev Notes

### Configuration Source

- All configuration is via environment variables (Docker-friendly)
- Config API endpoint exposes values without secrets
- UI displays read-only values with env var reference table

### References

- [Source: epics.md] - Story 5.2 acceptance criteria
- [Source: architecture.md] - Environment variable configuration

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Updated DashboardView with real WhatsApp, queue, aggregation data
- Created config API route exposing non-sensitive settings
- Updated ConfigView with configuration display and alert testing
- Updated QueueView with full queue display
- Added typed interfaces to API client
- All pages auto-refresh every 5 seconds

### File List

**Created:**
- packages/server/src/routes/config.ts (config API endpoint)

**Modified:**
- packages/server/src/index.ts (register config routes)
- packages/admin/src/api/client.ts (add ConfigStatus, AlertTestResult types, getConfig method)
- packages/admin/src/views/DashboardView.vue (real data display)
- packages/admin/src/views/ConfigView.vue (configuration and alerts UI)
- packages/admin/src/views/QueueView.vue (queue display)

### Change Log

- 2026-01-27: Story 5.2 implementation complete. All 4 tasks implemented.
