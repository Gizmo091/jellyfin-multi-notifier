---
title: 'WhatsApp Group Selection & Auto-Connect'
slug: 'whatsapp-group-selection-auto-connect'
created: '2026-01-28'
status: 'done'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['TypeScript', 'Baileys (@whiskeysockets/baileys)', 'better-sqlite3', 'Vue 3', 'Fastify']
files_to_modify:
  - 'packages/server/src/config.ts'
  - 'packages/server/src/index.ts'
  - 'packages/server/src/services/whatsapp/client.ts'
  - 'packages/server/src/services/alert/index.ts'
  - 'packages/server/src/services/settings/index.ts'
  - 'packages/server/src/routes/whatsapp.ts'
  - 'packages/server/src/routes/config.ts'
  - 'packages/admin/src/views/ConfigView.vue'
  - 'packages/admin/src/api/client.ts'
  - '.env'
  - '.env.example'
code_patterns:
  - 'Singleton services (QueueService, AlertService, WhatsAppClient)'
  - 'SQLite with better-sqlite3 - sync API'
  - 'EventEmitter for inter-service communication'
  - 'Fastify routes with typed schema'
  - 'Vue 3 Composition API with ref/onMounted'
test_patterns: []
---

# Tech-Spec: WhatsApp Group Selection & Auto-Connect

**Created:** 2026-01-28

## Overview

### Problem Statement

Currently, the WhatsApp group ID must be configured via environment variable (`WHATSAPP_GROUP_ID`), but the admin cannot know the group IDs before connecting to WhatsApp. Additionally, the phone number must be manually entered in the UI each time, and the pairing code is only shown in logs.

### Solution

- Add `WHATSAPP_PHONE_NUMBER` in `.env` for automatic connection at server startup
- Send pairing code via configured alert channels (email/Discord/Telegram) instead of just logs
- List available WhatsApp groups with proper hierarchy (Communities > Groups) and images in the admin UI
- Store selected target group in SQLite database
- Remove `WHATSAPP_GROUP_ID` from environment configuration entirely

### Scope

**In Scope:**
- `WHATSAPP_PHONE_NUMBER` environment variable for auto-connection at startup
- Pairing code delivery via alert channels (mail/Discord/Telegram if configured)
- API endpoint to list WhatsApp groups with community hierarchy and images
- Admin UI dropdown with visual representation (group images, community indentation)
- SQLite table for storing selected target group
- Remove `WHATSAPP_GROUP_ID` from config.ts and .env handling

**Out of Scope:**
- Multi-group selection per language (future feature)
- Community management/configuration
- Group creation from the admin UI

## Context for Development

### Codebase Patterns

1. **SQLite Service Pattern** (from `QueueService`):
   - Use `better-sqlite3` with sync API
   - Create table in `initialize()` method
   - Data stored in `data/` directory
   - Singleton export pattern

2. **Alert Service Pattern** (from `AlertService`):
   - `sendEmail()`, `sendTelegram()`, `sendDiscord()` private methods
   - `Promise.allSettled()` for independent channel delivery (NFR12)
   - `formatXxxMessage()` for message formatting

3. **Config Pattern**:
   - `getEnv()` / `getEnvNumber()` helpers
   - Interface + const export
   - All values from `process.env`

4. **Server Startup** (from `index.ts`):
   - Services initialized after route registration
   - `service.initialize()` pattern

5. **Baileys API**:
   - `socket.groupFetchAllParticipating()` - returns `Record<string, GroupMetadata>`
   - `GroupMetadata` includes: `id`, `subject`, `subjectOwner`, `subjectTime`, `creation`, `owner`, `desc`, `participants`, `isCommunity`, `isCommunityAnnounce`, `linkedParent`
   - `socket.profilePictureUrl(jid, 'image')` - returns group image URL

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `packages/server/src/services/queue/index.ts` | SQLite service pattern to follow |
| `packages/server/src/services/alert/index.ts` | Alert sending pattern - add `sendPairingCodeAlert()` |
| `packages/server/src/services/whatsapp/client.ts` | Add `getGroups()` method, modify `connect()` |
| `packages/server/src/config.ts` | Add `whatsappPhoneNumber`, remove `whatsappGroupId` |
| `packages/server/src/index.ts` | Add auto-connect at startup |
| `packages/server/src/routes/whatsapp.ts` | Add group listing endpoint |
| `packages/server/src/routes/config.ts` | Update to return group from SQLite |
| `packages/admin/src/views/ConfigView.vue` | Add group selector UI |

### Technical Decisions

- **Storage:** New `app_settings` table in `data/queue.db` (reuse existing DB file)
- **Baileys API:** `groupFetchAllParticipating()` + community detection via `linkedParent` field
- **Group Images:** Fetch via `socket.profilePictureUrl(groupId, 'image')` - may return undefined
- **Priority:** SQLite only, no env var fallback for group ID
- **Auto-connect timing:** After `alertService.initialize()` in `index.ts`

## Implementation Plan

### Tasks

- [x] **Task 1: Update config.ts**
  - File: `packages/server/src/config.ts`
  - Action: Add `whatsappPhoneNumber: getEnv('WHATSAPP_PHONE_NUMBER', '')` to Config interface and config object
  - Action: Remove `whatsappGroupId` from Config interface and config object
  - Notes: This will cause TypeScript errors in files using `config.whatsappGroupId` - to be fixed in subsequent tasks

- [x] **Task 2: Create SettingsService**
  - File: `packages/server/src/services/settings/index.ts` (new file)
  - Action: Create `SettingsService` class following `QueueService` pattern
  - Action: Add `app_settings` table with columns: `key TEXT PRIMARY KEY, value TEXT, updated_at TEXT`
  - Action: Implement methods: `get(key)`, `set(key, value)`, `getWhatsAppGroupId()`, `setWhatsAppGroupId(groupId)`
  - Notes: Use same `data/queue.db` database file for simplicity

- [x] **Task 3: Update WhatsAppClient with getGroups()**
  - File: `packages/server/src/services/whatsapp/client.ts`
  - Action: Add `getGroups()` method using `socket.groupFetchAllParticipating()`
  - Action: For each group, fetch image via `socket.profilePictureUrl(groupId, 'image')` with try/catch
  - Action: Return array of `{ id, name, image?, isCommunity, linkedParent?, participantCount }`
  - Action: Emit `'pairing-code'` event when pairing code is generated (in `connect()` method)
  - Notes: `profilePictureUrl` may throw if no image exists - handle gracefully

- [x] **Task 4: Add sendPairingCodeAlert() to AlertService**
  - File: `packages/server/src/services/alert/index.ts`
  - Action: Add `sendPairingCodeAlert(code: string)` public method
  - Action: Format message with pairing code prominently displayed
  - Action: Include instructions: "WhatsApp > Linked Devices > Link a Device"
  - Action: Wire to `whatsappClient.on('pairing-code')` in `initialize()` method
  - Notes: Follow existing `sendDisconnectionAlert()` pattern

- [x] **Task 5: Add auto-connect at startup**
  - File: `packages/server/src/index.ts`
  - Action: Import `whatsappClient` and `config`
  - Action: After `alertService.initialize()`, add auto-connect logic:
    ```typescript
    if (config.whatsappPhoneNumber) {
      console.log('Auto-connecting WhatsApp...')
      whatsappClient.connect(config.whatsappPhoneNumber).catch(err => {
        console.error('WhatsApp auto-connect failed:', err)
      })
    }
    ```
  - Notes: Don't await - let it connect in background

- [x] **Task 6: Update notification service to use SettingsService**
  - File: `packages/server/src/services/notification/index.ts`
  - Action: Replace `config.whatsappGroupId` with `settingsService.getWhatsAppGroupId()`
  - Action: Add check: if no group configured, log warning and skip send
  - Notes: Import `settingsService` from new service

- [x] **Task 7: Add WhatsApp groups API endpoint**
  - File: `packages/server/src/routes/whatsapp.ts`
  - Action: Add `GET /api/whatsapp/groups` endpoint
  - Action: Return groups from `whatsappClient.getGroups()` organized by community
  - Action: Structure response: `{ communities: [...], groups: [...] }` where communities contain their child groups
  - Notes: Return 503 if WhatsApp not connected

- [x] **Task 8: Add group selection API endpoint**
  - File: `packages/server/src/routes/config.ts`
  - Action: Add `POST /api/config/whatsapp-group` endpoint with body `{ groupId: string }`
  - Action: Validate groupId exists in available groups (optional but recommended)
  - Action: Save via `settingsService.setWhatsAppGroupId(groupId)`
  - Action: Update `GET /api/config` to return `whatsappGroupId` from `settingsService.getWhatsAppGroupId()`
  - Notes: Remove `whatsappGroupId` from env-based config response

- [x] **Task 9: Update API client types**
  - File: `packages/admin/src/api/client.ts`
  - Action: Add `WhatsAppGroup` interface: `{ id, name, image?, isCommunity, participantCount }`
  - Action: Add `WhatsAppGroupsResponse` interface with community hierarchy
  - Action: Add `getWhatsAppGroups()` method
  - Action: Add `setWhatsAppGroup(groupId)` method
  - Action: Update `ConfigStatus` to include `whatsappGroupId` and `whatsappGroupName`

- [x] **Task 10: Update ConfigView.vue with group selector**
  - File: `packages/admin/src/views/ConfigView.vue`
  - Action: Replace static "WhatsApp Group ID" display with dropdown selector
  - Action: Fetch groups via `apiClient.getWhatsAppGroups()` when WhatsApp is connected
  - Action: Display groups with images (40x40px rounded), community hierarchy (indented children)
  - Action: Show "Not connected" message if WhatsApp disconnected
  - Action: Add "Save" button to persist selection via `apiClient.setWhatsAppGroup()`
  - Action: Remove `WHATSAPP_GROUP_ID` from environment variables reference table
  - Notes: Use TailwindCSS for styling consistent with existing UI

- [x] **Task 11: Update .env files**
  - File: `.env` and `.env.example`
  - Action: Add `WHATSAPP_PHONE_NUMBER=` (empty default)
  - Action: Remove `WHATSAPP_GROUP_ID` line
  - Notes: Add comment explaining phone number format (international without +)

- [x] **Task 12: Update README.md**
  - File: `README.md`
  - Action: Update Environment Variables table: add `WHATSAPP_PHONE_NUMBER`, remove `WHATSAPP_GROUP_ID`
  - Action: Update First-time Setup section to mention auto-connect and alert channels for pairing code
  - Notes: Keep instructions simple and clear

### Acceptance Criteria

- [x] **AC1:** Given `WHATSAPP_PHONE_NUMBER` is set in `.env`, when server starts and no session exists, then pairing code is sent to all configured alert channels (email/Discord/Telegram)

- [x] **AC2:** Given `WHATSAPP_PHONE_NUMBER` is set and session exists, when server starts, then WhatsApp auto-connects silently without pairing code

- [x] **AC3:** Given WhatsApp is connected, when admin accesses Configuration page, then a dropdown shows all available groups with images and community hierarchy

- [x] **AC4:** Given groups belong to a Community, when displayed in dropdown, then they appear indented under their parent community with community name as header

- [x] **AC5:** Given admin selects a group and clicks Save, when the selection is submitted, then the group ID is persisted in SQLite and used for all future notifications

- [x] **AC6:** Given no group is configured, when a notification is triggered, then a warning is logged and the notification is skipped (not queued)

- [x] **AC7:** Given WhatsApp is disconnected, when admin views Configuration page, then the group selector shows "WhatsApp not connected" message instead of dropdown

- [x] **AC8:** Given `WHATSAPP_GROUP_ID` env var exists in old deployment, when server starts, then it is ignored (no fallback to env var)

## Additional Context

### Dependencies

- `@whiskeysockets/baileys` (already installed) - `groupFetchAllParticipating()`, `profilePictureUrl()`
- `better-sqlite3` (already installed) - reuse existing database

### Testing Strategy

**Manual Testing:**
1. Start server without `WHATSAPP_PHONE_NUMBER` - verify no auto-connect attempt
2. Set `WHATSAPP_PHONE_NUMBER`, delete session, restart - verify pairing code sent to alerts
3. Complete pairing, restart server - verify silent reconnect
4. Access Config page - verify groups listed with images
5. Select group, save - verify persisted across restart
6. Trigger notification - verify sent to selected group

**Edge Cases to Verify:**
- Group without image (should show placeholder)
- Community with no child groups (should still display)
- Very long group names (should truncate in UI)
- WhatsApp disconnect during group fetch (should handle gracefully)

### Notes

- **Risk:** Baileys `profilePictureUrl()` may be rate-limited - consider caching images
- **Risk:** Group list may be large - consider pagination for >50 groups
- **Future:** Multi-group per language could use same `app_settings` table with different keys
- **Migration:** Existing deployments with `WHATSAPP_GROUP_ID` will need manual reconfiguration via UI
