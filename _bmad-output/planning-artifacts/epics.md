---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
status: 'complete'
completedAt: '2026-01-27'
inputDocuments: ['prd.md', 'architecture.md']
---

# Jellyfin WhatsApp Notifier - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Jellyfin WhatsApp Notifier, decomposing the requirements from the PRD and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

**Media Event Reception:**
- FR1: System can receive webhook events from Jellyfin for media additions
- FR2: System can receive webhook events from Jellyfin for media deletions
- FR3: System can validate incoming webhooks using a shared secret
- FR4: System can extract media metadata (title, year, type, cover URL, Jellyfin ID) from webhook payload

**WhatsApp Integration:**
- FR5: Admin can connect the service to WhatsApp using a pairing code
- FR6: System can send text messages to a configured WhatsApp group
- FR7: System can send images with captions to a configured WhatsApp group
- FR8: Admin can view the current WhatsApp connection status
- FR9: System can automatically detect WhatsApp disconnection
- FR10: System can generate a new pairing code when reconnection is needed

**Message Aggregation:**
- FR11: System can aggregate multiple media additions into a single notification
- FR12: System can separate film aggregation from series aggregation
- FR13: Admin can configure the aggregation time window
- FR14: System can format aggregated notifications with cover image, titles, and years

**Content Links & Redirection:**
- FR15: System can generate unique redirect links for each notified media
- FR16: User can access Jellyfin content via redirect link (web or app deep-link)
- FR17: System can include clickable links in WhatsApp messages

**Admin Configuration:**
- FR18: Admin can configure the target WhatsApp group
- FR19: Admin can configure Jellyfin server URL
- FR20: Admin can configure alert notification channels (email/Telegram/Discord)
- FR21: Admin can view service status and configuration via web UI

**System Alerts:**
- FR22: System can send alerts when WhatsApp connection is lost
- FR23: System can include reconnection code in alert messages
- FR24: Admin can receive alerts via email
- FR25: Admin can receive alerts via Telegram
- FR26: Admin can receive alerts via Discord

**Resilience & Message Queue:**
- FR27: System can persist pending messages to survive restarts
- FR28: System can retry failed message deliveries automatically
- FR29: System can process queued messages when WhatsApp reconnects
- FR30: Admin can view pending messages in the queue

### Non-Functional Requirements

**Performance:**
- NFR1: Service consumes less than 100MB RAM in idle state
- NFR2: Service consumes less than 5% CPU in idle state
- NFR3: Webhook processing completes within 500ms of receipt
- NFR4: Aggregation window timer accuracy within 1 second
- NFR5: Docker image size under 200MB

**Security:**
- NFR6: Webhook requests are validated using shared secret before processing
- NFR7: WhatsApp session credentials are stored locally only (not transmitted externally)
- NFR8: Admin UI is accessible only on configured network (localhost by default)
- NFR9: No sensitive data (credentials, tokens) is logged

**Integration:**
- NFR10: Service operates normally when TMDB/IMDB APIs are unavailable (graceful degradation)
- NFR11: Service supports Jellyfin webhook format without modification
- NFR12: Alert channels (email/Telegram/Discord) operate independently (one failure doesn't block others)
- NFR13: WhatsApp library can be swapped without major refactoring (abstraction layer)

**Reliability:**
- NFR14: Service uptime target of 99.9% (excluding planned maintenance)
- NFR15: No message loss during service restart (queue persistence)
- NFR16: Automatic WhatsApp reconnection attempt within 60 seconds of disconnection detection
- NFR17: Failed messages retry up to 5 times with exponential backoff
- NFR18: Service starts and accepts webhooks within 30 seconds of container launch

### Additional Requirements (from Architecture)

- Project uses monorepo structure with npm workspaces (packages/server + packages/admin)
- Backend: Node.js 20 LTS + Fastify + TypeScript
- Frontend: Vue 3 + Vite + Pinia + Tailwind CSS
- WhatsApp: Baileys library (direct WebSocket)
- Storage: SQLite via better-sqlite3 (no ORM)
- CI/CD: GitHub Actions builds and pushes to ghcr.io on main branch
- Docker: Multi-stage build with node:20-alpine base
- Session WhatsApp stored in separate file for easy export/backup
- Admin authentication via single password (ADMIN_PASSWORD env var)

### FR Coverage Map

| FR | Epic | Description |
|----|------|-------------|
| FR1 | Epic 1 | Receive webhook for additions |
| FR2 | Epic 1 | Receive webhook for deletions |
| FR3 | Epic 1 | Validate webhook secret |
| FR4 | Epic 1 | Extract media metadata |
| FR5 | Epic 2 | Connect WhatsApp with pairing code |
| FR6 | Epic 2 | Send text messages |
| FR7 | Epic 2 | Send images with captions |
| FR8 | Epic 2 | View WhatsApp status |
| FR9 | Epic 2 | Detect disconnection |
| FR10 | Epic 2 | Generate new pairing code |
| FR11 | Epic 3 | Aggregate notifications |
| FR12 | Epic 3 | Separate films/series |
| FR13 | Epic 3 | Configure aggregation window |
| FR14 | Epic 3 | Format with covers and titles |
| FR15 | Epic 3 | Generate redirect links |
| FR16 | Epic 3 | Redirect to Jellyfin content |
| FR17 | Epic 3 | Include clickable links |
| FR18 | Epic 5 | Configure target group |
| FR19 | Epic 5 | Configure Jellyfin URL |
| FR20 | Epic 5 | Configure alert channels |
| FR21 | Epic 5 | View status via web UI |
| FR22 | Epic 4 | Alert on disconnection |
| FR23 | Epic 4 | Include reconnection code |
| FR24 | Epic 4 | Alerts via email |
| FR25 | Epic 4 | Alerts via Telegram |
| FR26 | Epic 4 | Alerts via Discord |
| FR27 | Epic 4 | Persist pending messages |
| FR28 | Epic 4 | Auto-retry failed messages |
| FR29 | Epic 4 | Process queue on reconnect |
| FR30 | Epic 4 | View pending messages |

## Epic List

### Epic 1: Project Foundation & Webhook Reception
Le service peut recevoir et traiter les webhooks Jellyfin, validant les événements d'ajout et suppression de médias.

**User outcome:** Quand Jellyfin ajoute du contenu, le service le capture et extrait les métadonnées.

**FRs covered:** FR1, FR2, FR3, FR4

### Epic 2: WhatsApp Connection & Basic Messaging
L'admin peut connecter le service à WhatsApp et le système peut envoyer des messages basiques vers un groupe.

**User outcome:** L'admin lie son numéro WhatsApp et le service peut envoyer des messages texte et images.

**FRs covered:** FR5, FR6, FR7, FR8, FR9, FR10

### Epic 3: Intelligent Notification Delivery
Les notifications sont agrégées intelligemment (films/séries séparés) avec covers, titres et liens de redirection.

**User outcome:** Les membres du groupe reçoivent des notifications bien formatées avec images et liens cliquables vers Jellyfin.

**FRs covered:** FR11, FR12, FR13, FR14, FR15, FR16, FR17

### Epic 4: Resilience & Admin Alerts
Le système gère les erreurs avec queue persistante, retry automatique et alertes multi-canal à l'admin.

**User outcome:** L'admin est alerté si WhatsApp se déconnecte, reçoit le code de reconnexion, et aucun message n'est perdu.

**FRs covered:** FR22, FR23, FR24, FR25, FR26, FR27, FR28, FR29, FR30

### Epic 5: Admin Dashboard
L'admin peut configurer et monitorer le service via une interface web Vue.js.

**User outcome:** L'admin configure le groupe cible, visualise le statut WhatsApp et la queue de messages.

**FRs covered:** FR18, FR19, FR20, FR21

---

## Epic 1: Project Foundation & Webhook Reception

Le service peut recevoir et traiter les webhooks Jellyfin, validant les événements d'ajout et suppression de médias.

### Story 1.1: Project Scaffolding & Docker Setup

As a **developer**,
I want **a fully configured project structure with Docker and CI/CD**,
So that **I can start implementing features with a working development and deployment environment**.

**Acceptance Criteria:**

**Given** the project repository is initialized
**When** I run `npm install` at the root
**Then** both server and admin packages are installed via npm workspaces

**Given** the project is set up
**When** I run `docker-compose up`
**Then** the service starts and listens on the configured port

**Given** code is pushed to main branch
**When** GitHub Actions workflow runs
**Then** a Docker image is built and pushed to ghcr.io

**Given** the service is starting
**When** the container launches
**Then** it is ready to accept requests within 30 seconds (NFR18)

---

### Story 1.2: Webhook Endpoint with Secret Validation

As a **system**,
I want **to receive and validate Jellyfin webhooks**,
So that **only authorized requests are processed** (FR3).

**Acceptance Criteria:**

**Given** the webhook endpoint `/webhook/jellyfin` exists
**When** a POST request arrives with valid `X-Webhook-Secret` header
**Then** the request is accepted for processing (200 OK)

**Given** a webhook request arrives
**When** the `X-Webhook-Secret` header is missing or invalid
**Then** the request is rejected with 401 Unauthorized

**Given** a valid webhook is received
**When** processed
**Then** processing completes within 500ms (NFR3)

---

### Story 1.3: Media Metadata Extraction

As a **system**,
I want **to extract media metadata from Jellyfin webhook payloads**,
So that **I have all the information needed for notifications** (FR1, FR2, FR4).

**Acceptance Criteria:**

**Given** a valid webhook for media addition (FR1)
**When** the payload is parsed
**Then** the system extracts: title, year, type (movie/series), cover URL, Jellyfin ID

**Given** a valid webhook for media deletion (FR2)
**When** the payload is parsed
**Then** the system extracts the same metadata fields

**Given** a webhook with incomplete data
**When** parsed
**Then** missing fields are handled gracefully with defaults or logged warnings

**Given** extracted metadata
**When** stored temporarily
**Then** it is available for the aggregation system (prepared for Epic 3)

---

## Epic 2: WhatsApp Connection & Basic Messaging

L'admin peut connecter le service à WhatsApp et le système peut envoyer des messages basiques vers un groupe.

### Story 2.1: WhatsApp Connection with Pairing Code

As an **admin**,
I want **to connect the service to my WhatsApp account using a pairing code**,
So that **the service can send messages on my behalf** (FR5, FR10).

**Acceptance Criteria:**

**Given** the service is running and WhatsApp is not connected
**When** I request a connection
**Then** a pairing code is generated and displayed/logged

**Given** I have a pairing code
**When** I enter it in WhatsApp > Linked Devices on my phone
**Then** the service connects successfully

**Given** a successful connection
**When** the session is established
**Then** credentials are stored in `data/whatsapp-session/` (NFR7)

**Given** a connection attempt fails
**When** an error occurs
**Then** a clear error message is logged and a new code can be requested

---

### Story 2.2: Send Text Messages to Group

As a **system**,
I want **to send text messages to a configured WhatsApp group**,
So that **users receive notifications** (FR6).

**Acceptance Criteria:**

**Given** WhatsApp is connected
**When** a text message is sent to the configured group ID
**Then** the message appears in the WhatsApp group

**Given** WhatsApp is not connected
**When** a message send is attempted
**Then** the operation fails gracefully with an error (prepared for queue in Epic 4)

**Given** a message is sent
**When** delivery is confirmed
**Then** the success is logged

---

### Story 2.3: Send Images with Captions

As a **system**,
I want **to send images with captions to a WhatsApp group**,
So that **notifications include media covers** (FR7).

**Acceptance Criteria:**

**Given** WhatsApp is connected and I have an image URL
**When** I send an image with a caption to the group
**Then** the image and caption appear in the WhatsApp group

**Given** the image URL is inaccessible
**When** sending is attempted
**Then** the system falls back to text-only message or logs warning

**Given** an image is sent
**When** the caption contains special characters or emojis
**Then** they are rendered correctly in WhatsApp

---

### Story 2.4: Connection Status & Disconnection Detection

As an **admin**,
I want **to know the current WhatsApp connection status and be notified of disconnections**,
So that **I can take action if needed** (FR8, FR9).

**Acceptance Criteria:**

**Given** the service is running
**When** I query the WhatsApp status
**Then** I receive: connected/disconnected, last connected time, phone number

**Given** WhatsApp is connected
**When** the connection is lost (logout, network issue, etc.)
**Then** the system detects this within 60 seconds (NFR16)

**Given** a disconnection is detected
**When** the event occurs
**Then** an internal event is emitted (prepared for alerts in Epic 4)

**Given** a disconnection occurred
**When** I request a new pairing code (FR10)
**Then** a fresh code is generated for reconnection

---

## Epic 3: Intelligent Notification Delivery

Les notifications sont agrégées intelligemment (films/séries séparés) avec covers, titres et liens de redirection.

### Story 3.1: Temporal Aggregation with Separate Windows

As a **system**,
I want **to aggregate multiple media additions into batched notifications with separate windows for films and series**,
So that **users don't receive spam notifications** (FR11, FR12, FR13).

**Acceptance Criteria:**

**Given** a media addition event arrives
**When** it's a movie
**Then** it's added to the "films" aggregation window

**Given** a media addition event arrives
**When** it's a series/episode
**Then** it's added to the "series" aggregation window

**Given** the aggregation window time (default 15 min) elapses
**When** there are items in the window
**Then** the window is flushed and items are sent for notification

**Given** no items arrive during a window
**When** the timer elapses
**Then** no notification is sent

**Given** admin configures a custom aggregation window (FR13)
**When** the value is set (e.g., 5 min, 30 min)
**Then** subsequent windows use the new duration (NFR4 accuracy)

---

### Story 3.2: Cover Image Fetching with Graceful Degradation

As a **system**,
I want **to fetch high-quality cover images from TMDB/IMDB with fallback to Jellyfin**,
So that **notifications always have visuals** (FR14, NFR10).

**Acceptance Criteria:**

**Given** media metadata with title and year
**When** TMDB/IMDB API is available
**Then** the cover image URL is fetched from external API

**Given** TMDB/IMDB API is unavailable or returns no result
**When** fetching fails
**Then** the system uses the Jellyfin cover URL as fallback (NFR10)

**Given** no cover is available from any source
**When** generating notification
**Then** the notification is sent as text-only without error

**Given** a cover URL is obtained
**When** stored with media data
**Then** it's available for notification formatting

---

### Story 3.3: Redirect Link Service

As a **user**,
I want **to click a link in the notification and be redirected to the content in Jellyfin**,
So that **I can watch immediately** (FR15, FR16).

**Acceptance Criteria:**

**Given** media metadata with Jellyfin ID
**When** generating a notification
**Then** a unique redirect link is created (e.g., `/redirect/abc123`)

**Given** a user clicks the redirect link
**When** the request reaches the service
**Then** they are redirected to the Jellyfin web URL for that content

**Given** the redirect link is accessed from a mobile device
**When** Jellyfin app is installed
**Then** the deep-link opens the app directly (if supported)

**Given** an invalid or expired redirect ID
**When** accessed
**Then** a friendly error page is shown

---

### Story 3.4: Formatted Notification Delivery

As a **group member**,
I want **to receive well-formatted notifications with cover, titles, and clickable links**,
So that **I know what's new and can access it easily** (FR14, FR17).

**Acceptance Criteria:**

**Given** an aggregation window flushes with movies
**When** the notification is generated
**Then** it includes: cover image, "🎬 Nouveaux films" header, list of "Title (Year)" with links

**Given** an aggregation window flushes with series
**When** the notification is generated
**Then** it includes: cover image, "📺 Nouveautés séries" header, list with episode info and links

**Given** multiple items in one notification
**When** formatted
**Then** each item has its own clickable link (FR17)

**Given** a notification is ready
**When** sent via WhatsApp (using Epic 2 capabilities)
**Then** the message appears with image and formatted text

---

## Epic 4: Resilience & Admin Alerts

Le système gère les erreurs avec queue persistante, retry automatique et alertes multi-canal à l'admin.

### Story 4.1: Persistent Message Queue with SQLite

As a **system**,
I want **to persist pending messages in SQLite**,
So that **no notifications are lost during restarts** (FR27, NFR15).

**Acceptance Criteria:**

**Given** a notification is ready to send
**When** WhatsApp is disconnected
**Then** the message is saved to the `message_queue` table

**Given** messages are in the queue
**When** the service restarts
**Then** all pending messages are still in the queue

**Given** a message is queued
**When** stored
**Then** it includes: id, content, media_type, status, retry_count, created_at, updated_at

**Given** a message is successfully sent
**When** delivery is confirmed
**Then** it is removed from the queue (or marked as sent)

---

### Story 4.2: Automatic Retry with Exponential Backoff

As a **system**,
I want **to automatically retry failed message deliveries**,
So that **temporary failures don't cause message loss** (FR28, NFR17).

**Acceptance Criteria:**

**Given** a message send fails
**When** the failure is detected
**Then** the message stays in queue with incremented retry_count

**Given** a message needs retry
**When** the retry is scheduled
**Then** it uses exponential backoff (e.g., 1min, 2min, 4min, 8min, 16min)

**Given** a message has been retried 5 times (NFR17)
**When** all retries fail
**Then** the message is marked as "failed" and an alert is triggered

**Given** retry is in progress
**When** WhatsApp reconnects
**Then** pending retries are processed

---

### Story 4.3: Queue Processing on Reconnection

As a **system**,
I want **to automatically process queued messages when WhatsApp reconnects**,
So that **pending notifications are delivered** (FR29).

**Acceptance Criteria:**

**Given** WhatsApp was disconnected and messages are queued
**When** WhatsApp reconnects
**Then** queued messages are processed in order (oldest first)

**Given** multiple messages in queue
**When** processing
**Then** messages are sent with a small delay between them (rate limiting)

**Given** queue processing is in progress
**When** a message fails
**Then** it follows the retry logic (Story 4.2)

**Given** all queued messages are processed
**When** complete
**Then** the queue is empty and status is logged

---

### Story 4.4: Multi-Channel Alert System

As an **admin**,
I want **to receive alerts via email, Telegram, or Discord when WhatsApp disconnects**,
So that **I can reconnect quickly** (FR22, FR23, FR24, FR25, FR26).

**Acceptance Criteria:**

**Given** WhatsApp disconnection is detected (FR22)
**When** alert is triggered
**Then** configured alert channels are notified

**Given** email alerts are configured (FR24)
**When** an alert is sent
**Then** email is delivered with disconnection info and reconnection code (FR23)

**Given** Telegram alerts are configured (FR25)
**When** an alert is sent
**Then** Telegram message is delivered with disconnection info and reconnection code

**Given** Discord alerts are configured (FR26)
**When** an alert is sent
**Then** Discord webhook is called with disconnection info and reconnection code

**Given** one alert channel fails
**When** sending alerts
**Then** other channels still receive alerts (NFR12)

**Given** no alert channels are configured
**When** an alert is triggered
**Then** the event is logged but no error occurs

---

### Story 4.5: Queue Visibility API

As an **admin**,
I want **to view pending messages in the queue**,
So that **I know what's waiting to be sent** (FR30).

**Acceptance Criteria:**

**Given** the API endpoint `/api/queue` exists
**When** I request the queue status
**Then** I receive: count of pending messages, list of messages with metadata

**Given** messages are in the queue
**When** viewing the list
**Then** each entry shows: id, media title, status, retry_count, created_at

**Given** the queue is empty
**When** requested
**Then** an empty list is returned with count: 0

---

## Epic 5: Admin Dashboard

L'admin peut configurer et monitorer le service via une interface web Vue.js.

### Story 5.1: Admin UI Foundation with Authentication

As an **admin**,
I want **a secure web interface to manage the service**,
So that **I can configure and monitor without command line access**.

**Acceptance Criteria:**

**Given** the admin UI is built with Vue 3 + Vite + Tailwind
**When** I access the admin URL
**Then** I see a login page

**Given** I enter the correct password (ADMIN_PASSWORD env var)
**When** I submit
**Then** I'm authenticated and redirected to the dashboard

**Given** I enter an incorrect password
**When** I submit
**Then** I see an error message and remain on login

**Given** I'm authenticated
**When** a session cookie is set
**Then** it's HTTP-only and expires after configured duration

**Given** the UI is accessed
**When** from a non-localhost address (if not configured otherwise)
**Then** access is restricted (NFR8)

---

### Story 5.2: WhatsApp Configuration & Status View

As an **admin**,
I want **to configure the target WhatsApp group and view connection status**,
So that **I can manage where notifications are sent** (FR18, FR8 UI).

**Acceptance Criteria:**

**Given** I'm on the dashboard
**When** I view the WhatsApp section
**Then** I see: connection status, phone number, last connected time

**Given** WhatsApp is not connected
**When** I click "Connect"
**Then** a pairing code is displayed for me to enter on my phone

**Given** I want to configure the target group (FR18)
**When** I enter a WhatsApp group ID
**Then** it's saved and used for future notifications

**Given** the group ID is invalid
**When** I try to save
**Then** a validation error is shown

---

### Story 5.3: Jellyfin & Alert Channel Configuration

As an **admin**,
I want **to configure Jellyfin server URL and alert channels**,
So that **the service knows where to redirect and how to alert me** (FR19, FR20).

**Acceptance Criteria:**

**Given** I'm on the configuration page
**When** I enter the Jellyfin server URL (FR19)
**Then** it's validated and saved

**Given** I want to configure email alerts (FR20)
**When** I enter SMTP settings and recipient email
**Then** a test email can be sent to verify

**Given** I want to configure Telegram alerts (FR20)
**When** I enter bot token and chat ID
**Then** a test message can be sent to verify

**Given** I want to configure Discord alerts (FR20)
**When** I enter webhook URL
**Then** a test message can be sent to verify

**Given** configuration is saved
**When** I reload the page
**Then** all settings are persisted and displayed

---

### Story 5.4: Service Status Dashboard

As an **admin**,
I want **to view the overall service status and configuration**,
So that **I know everything is working** (FR21).

**Acceptance Criteria:**

**Given** I'm on the dashboard (FR21)
**When** I view the status section
**Then** I see: WhatsApp status, queue count, last notification sent, uptime

**Given** there are pending messages in the queue
**When** viewing the dashboard
**Then** I see the count and can navigate to queue details (from Epic 4)

**Given** the aggregation window is active
**When** viewing status
**Then** I see items waiting in current film/series windows

**Given** recent notifications were sent
**When** viewing activity
**Then** I see a summary of recent successful deliveries

---

## Epic 6: Multi-Platform Enhancements (Post-MVP)

Enrichissements ajoutés après la livraison du MVP, étendant les capacités au-delà du scope initial WhatsApp-only.

### Story 6.1: Multi-Platform Notification Channels

As an **admin**,
I want **to send notifications to Discord and Telegram in addition to WhatsApp**,
So that **I can reach users on their preferred platform**.

**Acceptance Criteria:**

**Given** the admin UI configuration page
**When** I add a notification channel
**Then** I can choose between WhatsApp, Discord, or Telegram

**Given** a Discord channel is configured with a webhook URL
**When** a notification is triggered
**Then** the message is sent as a Discord embed with image

**Given** a Telegram channel is configured with bot token and chat ID
**When** a notification is triggered
**Then** the message is sent via Telegram Bot API with photo

**Given** multiple channels of different types are configured
**When** a notification is triggered
**Then** all enabled channels receive the notification independently

**Implementation:**
- New `notification_channels` table replacing `whatsapp_groups`
- Sender abstraction layer (`services/senders/`)
- Discord webhook integration (native fetch)
- Telegram Bot API integration (native fetch)

---

### Story 6.2: Multi-Language Support per Channel

As an **admin**,
I want **to configure a different language for each notification channel**,
So that **users receive notifications in their preferred language**.

**Acceptance Criteria:**

**Given** I configure a notification channel
**When** I select a language (en, fr, es, de, it, pt)
**Then** notifications to that channel use the selected language

**Given** multiple channels with different languages
**When** a notification is triggered
**Then** each channel receives the message in its configured language

**Given** a language is selected
**When** covers are fetched from TMDB
**Then** the search uses the channel's language for better accuracy and localized posters

**Implementation:**
- Language field in `notification_channels` table
- Message formatter with translations for 6 languages
- TMDB API calls with language parameter per channel group

---

### Story 6.3: Per-Type Aggregation Windows

As an **admin**,
I want **to configure different aggregation windows for each notification type**,
So that **I can fine-tune notification frequency by content type**.

**Acceptance Criteria:**

**Given** the configuration
**When** I set aggregation windows
**Then** I can configure separate durations for:
  - Movies added
  - Series added
  - Movies removed
  - Series removed

**Given** different window durations are configured
**When** content is added/removed
**Then** each type uses its own timer independently

**Implementation:**
- Environment variables: `AGGREGATION_WINDOW_MOVIES_MINUTES`, `AGGREGATION_WINDOW_SERIES_MINUTES`, etc.
- Config object with per-type durations
- Aggregation service with separate window management

---

### Story 6.4: Smart Redirect with App Deep-Linking

As a **user**,
I want **notification links to open the Jellyfin app when installed**,
So that **I can start watching immediately without going through the browser**.

**Acceptance Criteria:**

**Given** I click a notification link on mobile
**When** the Jellyfin app is installed
**Then** the app opens directly to the content

**Given** I click a notification link
**When** the Jellyfin app is not installed or doesn't respond
**Then** I'm redirected to the Jellyfin web interface after 2.5 seconds

**Given** the redirect page is displayed
**When** waiting for the app to open
**Then** I see a loading spinner and a manual "open in browser" link

**Implementation:**
- HTML page with JavaScript attempting `jellyfin://details?id=xxx`
- Timeout fallback to web URL
- Visibility change detection to cancel fallback if app opens

---

### Story 6.5: Persistent Redirect Links

As a **user**,
I want **notification links to work even after server restarts**,
So that **I can access content from older notifications**.

**Acceptance Criteria:**

**Given** a redirect link was created
**When** the server restarts
**Then** the link still works

**Given** redirect links are stored
**When** checking storage
**Then** they are persisted in SQLite (same database as other data)

**Given** old redirect links exist
**When** cleanup is needed (optional)
**Then** a method exists to remove entries older than a configurable duration

**Implementation:**
- SQLite `redirects` table with `short_id`, `jellyfin_id`, `title`, `created_at`
- Index on `created_at` for cleanup queries
- Default retention: 30 days (cleanup not automatic)

---

### Story 6.6: Project Rebranding to Multi Notifier

As a **user**,
I want **the project name to reflect its multi-platform capabilities**,
So that **I understand it supports more than just WhatsApp**.

**Acceptance Criteria:**

**Given** the project
**When** viewing any user-facing element
**Then** it's named "Jellyfin Multi Notifier" instead of "Jellyfin WhatsApp Notifier"

**Implementation:**
- Updated package.json names
- Updated UI titles (header, login page, browser tab)
- Updated Docker container name
- Updated alert messages
