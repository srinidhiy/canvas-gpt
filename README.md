# Canvas GPT

A canvas-based chat application with branching conversations, built with React, TypeScript, and Tailwind CSS.

## Features

- Interactive canvas with draggable chat nodes
- Branching conversations from selected text
- Multiple AI model support (Claude, GPT-4, etc.)
- Zoom and pan controls
- Real-time streaming chat interface
- Visual connection lines between nodes
- Multiple canvases per user

## Architecture

- **Frontend** — React + Vite app (static build, deployable anywhere)
- **PocketBase** — auth and database, self-hosted on your VPS
- **API server** — Node/Hono server in `server/`, self-hosted on your VPS, holds your AI API keys

---

## VPS Setup

### 1. PocketBase

Run PocketBase via Docker:

```bash
docker run -d \
  --name canvas-gpt-pb \
  -p 8090:8090 \
  -v /path/to/pb_data:/pb_data \
  ghcr.io/muchobien/pocketbase:latest
```

Open the admin UI at `http://YOUR_VPS_IP:8090/_/` and complete first-time setup.

Create a collection called `canvas_states` with these fields:

| Field | Type |
|---|---|
| `user` | Relation → users (required) |
| `nodes` | JSON |
| `title` | Text |
| `summary` | Text |

Set API rules on the collection:

| Rule | Value |
|---|---|
| List/Search | `user = @request.auth.id` |
| View | `user = @request.auth.id` |
| Create | `@request.auth.id != ""` |
| Update | `user = @request.auth.id` |
| Delete | `user = @request.auth.id` |

### 2. API Server

Copy the `server/` directory to your VPS, then:

```bash
cd server
cp .env.example .env
# fill in your values
npm install
npm start        # or use pm2: pm2 start node_modules/.bin/tsx --name canvas-gpt-server -- src/index.ts
```

`server/.env`:

```
POCKETBASE_URL=http://localhost:8090
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
ALLOWED_ORIGIN=https://yourdomain.com
```

Open the port in your firewall:

```bash
ufw allow 3001
```

---

## Frontend Setup

```bash
npm install
cp .env.example .env
# fill in your values
```

`.env`:

```
VITE_POCKETBASE_URL=http://YOUR_VPS_IP:8090
VITE_API_URL=http://YOUR_VPS_IP:3001
```

Run in development:

```bash
npm run dev
```

Build for production (outputs to `dist/`):

```bash
npm run build
```

Deploy `dist/` to any static host (Vercel, Netlify, Cloudflare Pages, nginx, etc.).
