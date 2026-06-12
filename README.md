# WhatsApp Service API (Standalone)

A reusable **WhatsApp gateway** for any project. It connects to WhatsApp Web, normalizes incoming messages (text + voice transcription), and forwards them to your external backend (LLM, CRM, bot logic, etc.) via webhook or polling. Your backend replies through a simple REST send API.

## What it does

| Capability | Status |
|------------|--------|
| Connect via QR + persistent session | ✅ |
| Receive text messages from all chats (or filtered) | ✅ |
| Transcribe voice notes to text (Whisper local or OpenAI) | ✅ |
| Forward normalized JSON to external webhook | ✅ |
| Polling fallback (`GET /api/webhook`) | ✅ |
| Persistent webhook retry queue | ✅ |
| Send text/media replies via REST API | ✅ |
| Optional API key auth | ✅ |
| Example LLM backend integration | ✅ |

## Architecture

```
WhatsApp Web  ←→  whatsapp-service  ←→  YOUR backend (LLM / app logic)
                      │                        │
                      │  POST webhook JSON       │  POST /api/send
                      └──────────────────────────┘
```

This service **does not include an LLM**. It is the transport layer — plug in any backend that receives webhooks and calls `/api/send`.

## Quick start

```bash
cd whatsapp-service-standalone
npm install
copy env-example.txt .env   # Windows
# edit .env — set WEBHOOK_URL and optionally API_KEY

npm start
# Scan QR at http://127.0.0.1:3002/api/qr
```

### Example backend (test integration)

```bash
# Terminal 1
npm start

# Terminal 2
node integrations/example-backend.js
```

Set in `.env`:
```env
WEBHOOK_URL=http://127.0.0.1:3000/whatsapp/webhook
API_KEY=dev-secret
```

## Configuration

See `env-example.txt`. Key variables:

| Variable | Purpose |
|----------|---------|
| `WEBHOOK_URL` | Where inbound messages are POSTed |
| `API_KEY` | Protects `/api/send` and other endpoints (except `/health`, `/api/status`, `/api/qr`) |
| `WEBHOOK_SECRET` | Sent as `X-Webhook-Secret` header to your backend |
| `TARGET_GROUP_NAME` | Only process messages from a group with this exact name |
| `ALLOWED_CHAT_IDS` | Comma-separated chat IDs (overrides group name filter) |
| `TRANSCRIPTION_PROVIDER` | `whisper` (local) or `openai` |
| `WHISPER_LANGUAGE` | e.g. `he`, `en`, or `auto` |
| `WEBHOOK_INCLUDE_MEDIA` | Include base64 image data in webhook payload (default true, max 5MB) |

## Voice transcription

**Local (default):**
```bash
pip install -r requirements.txt
```

**Cloud (OpenAI):**
```env
TRANSCRIPTION_PROVIDER=openai
OPENAI_API_KEY=sk-...
WHISPER_LANGUAGE=he
```

## Webhook message format

```json
{
  "id": "true_123@c.us_ABC",
  "timestamp": 1710000000,
  "from": { "id": "1234567890@c.us", "name": "John" },
  "chat": { "id": "120363@g.us", "name": "My Group", "isGroup": true },
  "body": "Hello or transcribed voice text",
  "type": "text | voice | image",
  "hasMedia": false,
  "mediaType": "chat",
  "media": {
    "mimetype": "image/jpeg",
    "data": "<base64 when enabled>",
    "sizeBytes": 12345
  },
  "transcription": {
    "provider": "whisper",
    "language": "he"
  }
}
```

Headers sent to your webhook:
- `X-Webhook-Secret` (if configured)
- `X-API-Key` (if configured)
- `X-WhatsApp-Service-Event: message.received`
- `X-Message-Id`

## API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Liveness check |
| GET | `/api/status` | No | Full service status |
| GET | `/api/qr` | No | QR code page |
| GET | `/api/webhook` | Yes* | Poll queued messages |
| POST | `/api/webhook` | Yes* | Set webhook URL |
| POST | `/api/send` | Yes* | Send text reply |
| POST | `/api/send-media` | Yes* | Send media from URL |
| GET | `/api/chats` | Yes* | List chats |

\* Required when `API_KEY` is set. Pass via `X-API-Key` or `Authorization: Bearer <key>`.

## Integrating your LLM backend

1. Create a webhook endpoint (e.g. `POST /whatsapp/webhook`)
2. Set `WEBHOOK_URL` to that endpoint
3. On each message, call your LLM with `message.body`
4. Reply with:

```javascript
await fetch('http://127.0.0.1:3002/api/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.API_KEY,
  },
  body: JSON.stringify({
    chatId: message.chat.id,
    message: llmResponse,
    replyToMessageId: message.id,  // optional quote reply
  }),
});
```

See `integrations/example-backend.js` for a complete working example.

## Project structure

```
lib/
  auth.js              — API key middleware
  ingress.js           — Historical message filter
  webhook-delivery.js  — Webhook POST + retry queue
  message-handler.js   — Inbound message processing
  message-utils.js     — Payload normalization
  routes.js            — Express routes
config.js
transcription.js
index.js               — Local/dev entry point
index-cloud.js         — Cloud/Docker entry point
integrations/
  example-backend.js   — Sample external backend
```

## Cloud / Docker

```bash
docker build -t whatsapp-service .
docker run -p 8080:8080 -e WEBHOOK_URL=https://your-app/webhook -v wa-session:/tmp/.wwebjs_auth whatsapp-service
```

Uses `index-cloud.js` and headless Chromium.

## Requirements

- Node.js >= 18
- WhatsApp account
- Python 3 + Whisper (optional, for local voice transcription)
- External backend for LLM / business logic

## Notes

- Uses **WhatsApp Web** (unofficial). Not the Meta Business API.
- Session is stored in `.wwebjs_auth/` — keep this directory between restarts.
- Failed webhook deliveries are queued in `.data/webhook-queue.json` and retried every 30s.
