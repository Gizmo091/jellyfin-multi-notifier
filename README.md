# Jellyfin WhatsApp Notifier

Autonomous service that monitors a Jellyfin media server and automatically notifies a WhatsApp group when new content is added or removed.

## Features

- Receive and process Jellyfin webhook events (additions/deletions)
- Connect to WhatsApp via pairing code
- Intelligent notification aggregation (films and series separately)
- Cover images from TMDB/IMDB with Jellyfin fallback
- Direct links to content via redirect service
- Persistent message queue with automatic retry
- Multi-channel alerts (Email, Telegram, Discord)
- Admin web UI for configuration

## Quick Start

### Prerequisites

- Node.js 20+
- Docker and Docker Compose

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start admin UI development
npm run dev:admin
```

### Production (Docker)

```bash
# Copy environment file
cp .env.example .env

# Edit .env with your configuration
nano .env

# Start with Docker Compose
docker-compose up -d
```

### First-time Setup

1. Start the service
2. Check logs for WhatsApp pairing code
3. On your phone: WhatsApp > Linked Devices > Link a Device
4. Enter the pairing code
5. Configure target group in admin UI (http://localhost:3000)

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3000) | No |
| `ADMIN_PASSWORD` | Admin UI password | Yes |
| `JELLYFIN_URL` | Jellyfin server URL | Yes |
| `WEBHOOK_SECRET` | Shared secret for webhook validation | Yes |
| `WHATSAPP_GROUP_ID` | Target WhatsApp group ID | Yes |
| `TMDB_API_KEY` | TMDB API key for covers | No |
| `PUBLIC_URL` | Public URL for redirect links (default: http://localhost:3000) | No |
| `AGGREGATION_WINDOW_MINUTES` | Aggregation window duration (default: 15) | No |

### Jellyfin Webhook Setup

1. Install Jellyfin Webhook plugin
2. Add new webhook:
   - URL: `http://your-server:3000/webhook/jellyfin`
   - Request Header: `X-Webhook-Secret: your-secret-here`
   - Events: Item Added, Item Removed

## Project Structure

```
jellyfin-whatsapp-notifier/
├── packages/
│   ├── server/          # Fastify backend
│   └── admin/           # Vue 3 admin UI
├── data/                # Persistent data (Docker volume)
├── docker-compose.yml
└── Dockerfile
```

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
| `/api/alerts/status` | GET | View configured alert channels |
| `/api/alerts/test` | POST | Send test alert to all channels |
| `/api/config` | GET | View current configuration |
| `/api/status` | GET | Service status with uptime and activity |
| `/r/:id` | GET | Redirect to Jellyfin content |
| `/health` | GET | Health check |

## License

MIT
