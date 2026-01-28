# Story 5.4: Service Status Dashboard

Status: review

## Story

As an **admin**,
I want **to view the overall service status and configuration**,
so that **I know everything is working** (FR21).

## Acceptance Criteria

1. **Given** I'm on the dashboard (FR21)
   **When** I view the status section
   **Then** I see: WhatsApp status, queue count, last notification sent, uptime

2. **Given** there are pending messages in the queue
   **When** viewing the dashboard
   **Then** I see the count and can navigate to queue details

3. **Given** the aggregation window is active
   **When** viewing status
   **Then** I see items waiting in current film/series windows

4. **Given** recent notifications were sent
   **When** viewing activity
   **Then** I see a summary of recent successful deliveries

## Tasks / Subtasks

- [x] Task 1: Create status service
  - [x] Track service start time for uptime
  - [x] Record notification events (type, count, success)
  - [x] Keep recent notification history (last 10)

- [x] Task 2: Create status API endpoint
  - [x] GET /api/status returns full service status
  - [x] Include uptime, WhatsApp, queue, aggregation summary
  - [x] Include last and recent notifications

- [x] Task 3: Wire notification service to status service
  - [x] Record notifications when sent or queued
  - [x] Track item counts and success state

- [x] Task 4: Update Dashboard with status display
  - [x] Show service status bar with uptime
  - [x] Show last notification time
  - [x] Show recent notifications list

## Dev Notes

### Status Tracking

- StatusService tracks uptime from service start
- Recent notifications kept in memory (last 10)
- NotificationService records to status on send/queue

### References

- [Source: epics.md] - Story 5.4 acceptance criteria
- [Source: architecture.md] - Admin dashboard requirements

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Created StatusService with uptime and notification tracking
- Created status API route with comprehensive data
- Wired notification service to record activity
- Updated DashboardView with status bar and recent activity

### File List

**Created:**
- packages/server/src/services/status/index.ts (status tracking service)
- packages/server/src/routes/status.ts (status API endpoint)

**Modified:**
- packages/server/src/index.ts (register status routes)
- packages/server/src/services/notification/index.ts (record notifications)
- packages/admin/src/api/client.ts (add ServiceStatus type, getStatus method)
- packages/admin/src/views/DashboardView.vue (status bar, recent activity)

### Change Log

- 2026-01-27: Story 5.4 implementation complete. All 4 tasks implemented.
