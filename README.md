# Jellyfin Media Notifier

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?style=flat&logo=buy-me-a-coffee)](https://buymeacoffee.com/mathieuvedie)

Autonomous service that monitors a Jellyfin media server and automatically notifies multiple platforms (WhatsApp, Discord, Telegram) when new content is added or removed.

## Features

### Notifications
- Receive and process Jellyfin webhook events (additions/deletions)
- **Multi-platform notifications**: WhatsApp, Discord, and Telegram
- Intelligent notification aggregation (films and series separately)
- Cover images from TMDB with Jellyfin fallback (with composite patchwork for multiple items)
- Direct links to content via redirect service
- Multi-language support (English, French, Spanish, German, Italian, Portuguese)

### Reliability
- **Persistent message queue** with automatic retry (exponential backoff)
- **Dead-letter queue** for permanently failed messages (after 5 retries)
- **Graceful shutdown** - flushes pending notifications on SIGTERM/SIGINT
- **Auto-reconnect WhatsApp** with slow retry (5, 10, 20, 30 min intervals)
- **Persistent logs** survive restarts (SQLite, 7-day retention)

### Administration
- Auto-connect WhatsApp on startup (QR code displayed in terminal and sent via alerts)
- Multi-channel admin alerts (Email, Telegram, Discord for connection status)
- Admin web UI for configuration
- Config validation at startup (URL validation, port range, warnings for weak secrets)

## Quick Start

### Prerequisites

- Node.js 20+
- Docker and Docker Compose (for production)

### Architecture

The project uses a monorepo structure with two packages:
- `packages/server` - Fastify API backend
- `packages/admin` - Vue 3 admin interface

**In production**, the server serves both the API and the admin UI on a **single port** (default: 3000). No reverse proxy needed.

### Development

```bash
# Install dependencies
npm install

# Option 1: Full build + run (recommended for testing)
npm run build
npm run start -w packages/server
# Access everything at http://localhost:3000

# Option 2: Development with hot-reload
# Terminal 1: Start API server
npm run dev -w packages/server

# Terminal 2: Start admin UI with hot-reload (optional)
npm run dev -w packages/admin
# API at http://localhost:3000, Admin at http://localhost:5173
```

### Production (Docker)

Le déploiement en production ne nécessite que 2 fichiers : `docker-compose.yml` et `.env`.

```bash
# Créer un dossier pour le projet
mkdir jellyfin-notifier && cd jellyfin-notifier

# Télécharger docker-compose.yml
curl -O https://raw.githubusercontent.com/Gizmo091/jellyfin-multi-notifier/main/docker-compose.yml

# Télécharger le fichier .env d'exemple
curl -O https://raw.githubusercontent.com/Gizmo091/jellyfin-multi-notifier/main/.env.example
mv .env.example .env

# Éditer .env avec votre configuration
nano .env

# Créer le dossier data pour la persistance
mkdir data

# Lancer le service
docker compose up -d

# Accéder à l'interface : http://localhost:3000
```

**Mise à jour** :
```bash
docker compose pull
docker compose up -d
```

### First-time Setup

1. Start the service
2. Open the admin UI at **http://localhost:3000** (same URL for API and UI)
3. Log in with your `ADMIN_PASSWORD`
4. Navigate to the Configuration page
5. Add notification channels:
   - **WhatsApp**: Connect WhatsApp first (via pairing code), then select your target group
   - **Discord**: Create a webhook URL in your Discord server and paste it
   - **Telegram**: Create a bot with @BotFather, get the token, and find your chat ID
6. Test each channel to verify it works
7. Configure Jellyfin webhooks (see below)

#### WhatsApp Setup

**QR Code (Recommended)**
- Leave `WHATSAPP_PHONE_NUMBER` empty in your `.env` file
- Click "Connect WhatsApp" in the admin UI
- A QR code will be displayed
- On your phone: WhatsApp > Linked Devices > Link a Device > Scan QR Code

**Pairing Code (Experimental)**
> Note: Pairing code authentication has known reliability issues with the Baileys library. Use QR code for initial setup.

- Set `WHATSAPP_PHONE_NUMBER` in your `.env` file (international format without +, e.g., 33612345678)
- Pairing code will be sent to your configured alert channels (email, Discord, Telegram)
- On your phone: WhatsApp > Linked Devices > Link a Device > Link with phone number
- Enter the pairing code immediately (codes expire quickly)

#### Discord Setup
- In your Discord server: Server Settings > Integrations > Webhooks > New Webhook
- Copy the webhook URL and paste it when adding a Discord channel

#### Telegram Setup
- Create a bot with @BotFather and copy the token
- Find your chat ID using @userinfobot or use @channelname for public channels

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3000) | No |
| `ADMIN_PASSWORD` | Admin UI password | Yes |
| `JELLYFIN_URL` | Jellyfin server URL | Yes |
| `JELLYFIN_API_KEY` | Jellyfin API key for upgrade detection (skips notifications for quality upgrades) | No |
| `WEBHOOK_SECRET` | Shared secret for webhook validation | Yes |
| `WHATSAPP_LOGIN_ON_STARTUP` | Auto-connect WhatsApp on startup (default: true) | No |
| `WHATSAPP_PHONE_NUMBER` | Phone number for pairing code auth (international format without +). If empty, QR code is used. | No |
| `TMDB_API_KEY` | TMDB API key for covers | No |
| `PUBLIC_URL` | Public URL for redirect links (default: http://localhost:3000) | No |
| `AGGREGATION_WINDOW_MINUTES` | Default aggregation window in minutes (default: 15) | No |
| `AGGREGATION_WINDOW_MOVIES_MINUTES` | Aggregation window for movies added | No |
| `AGGREGATION_WINDOW_SERIES_MINUTES` | Aggregation window for series added | No |
| `AGGREGATION_WINDOW_MOVIES_REMOVED_MINUTES` | Aggregation window for movies removed | No |
| `AGGREGATION_WINDOW_SERIES_REMOVED_MINUTES` | Aggregation window for series removed | No |

### Jellyfin Webhook Setup

1. Install Jellyfin Webhook plugin
2. Add new webhook:
   - URL: `http://your-server:3000/webhook/jellyfin`
   - Request Header: `X-Webhook-Secret: your-secret-here`
   - Events: Item Added, Item Removed

## Project Structure

```
jellyfin-multi-notifier/
├── packages/
│   ├── server/          # Fastify backend (serves API + admin UI)
│   │   ├── src/         # TypeScript source
│   │   └── dist/        # Compiled JavaScript
│   └── admin/           # Vue 3 admin UI
│       ├── src/         # Vue source
│       └── dist/        # Built static files (served by server)
├── data/                # Persistent data (SQLite DB, WhatsApp session)
├── docker-compose.yml
└── Dockerfile
```

### Data Persistence

The `data/` directory contains:
- `queue.db` - SQLite database containing:
  - Message queue (pending, sent, failed messages)
  - Dead-letter queue (permanently failed messages for analysis)
  - Notification channel settings
  - Application logs (7-day retention)
  - Redirect links (30-day retention, auto-cleanup)
  - Aggregation state
- `whatsapp-session/` - WhatsApp authentication session

**Important**: In Docker, this is mounted as a volume (`/app/data`). Back up this directory to preserve your configuration and WhatsApp session.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook/jellyfin` | POST | Jellyfin webhook receiver |
| `/api/whatsapp/status` | GET | WhatsApp connection status |
| `/api/whatsapp/connect` | POST | Trigger WhatsApp connection |
| `/api/whatsapp/send` | POST | Send text message |
| `/api/whatsapp/send-image` | POST | Send image with caption |
| `/api/aggregation/status` | GET | View aggregation window status |
| `/api/aggregation/flush` | POST | Force flush aggregation windows |
| `/api/redirects` | GET | List all redirect entries |
| `/api/queue` | GET | View message queue status |
| `/api/queue/pending` | GET | View pending messages |
| `/api/alerts/status` | GET | View configured alert channels (admin alerts) |
| `/api/alerts/test` | POST | Send test alert to all admin channels |
| `/api/config` | GET | View current configuration |
| `/api/config/notification-channels` | GET | List all notification channels |
| `/api/config/notification-channels` | POST | Add a notification channel |
| `/api/config/notification-channels/:id` | PUT | Update a notification channel |
| `/api/config/notification-channels/:id` | DELETE | Remove a notification channel |
| `/api/config/notification-channels/:id/toggle` | POST | Enable/disable a channel |
| `/api/config/notification-channels/:id/test` | POST | Test a notification channel |
| `/api/status` | GET | Service status with uptime and activity |
| `/r/:id` | GET | Redirect to Jellyfin content |
| `/health` | GET | Health check |

## License

MIT
