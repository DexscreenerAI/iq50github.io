# 🧠 IQ CTO — Telegram Bot

Light fork of the byeboss bot. Two features only:

- 🤝 **CTO Listing** — community-take-over tracker (same engine as `byeboss.live/cto-listing.html`)
- 🎯 **Sniper Terminal** — live signal scanner

The byeboss bot in `dexscreener-telegram-bot` is **not modified**. This is a separate deployment with its own Telegram token and Railway project.

---

## 🚀 Deploy on Railway

### 1. Create the Telegram bot

1. Open Telegram → `@BotFather` → `/newbot`
2. Set the username `QCTOBot` (or anything ending in `bot`)
3. Copy the token

### 2. Create a Railway project

1. https://railway.app → New Project → **Deploy from GitHub repo**
2. Pick `DexscreenerAI/iq50github.io`
3. **Settings → Root Directory → `bot`**
4. **Settings → Branch → `claude/telegram-bot-iq-cto-xOMrr`** (or `main` after merge)

### 3. Add environment variables

Variables tab → add:

| Variable           | Required | What it does                                              |
|--------------------|----------|-----------------------------------------------------------|
| `TELEGRAM_TOKEN`   | ✅       | The token from @BotFather (step 1)                        |
| `GROUP_CHAT_ID`    | optional | Telegram chat ID where new CTOs are broadcast             |
| `SNIPER_CHAT_ID`   | optional | Chat ID for sniper signals (falls back to `GROUP_CHAT_ID`)|
| `ADMIN_IDS`        | optional | Comma-separated user IDs allowed to run admin commands    |
| `CTO_ADMIN_KEY`    | optional | Protects `POST /api/cto/add` & `/api/cto/clear`           |
| `SITE_URL`         | optional | Default `https://iq50.io`                                 |
| `CTO_PAGE_URL`     | optional | Default `https://iq50.io/cto.html`                        |
| `HELIUS_KEY`       | optional | Better Solana RPC throughput (sniper engine)              |
| `MORALIS_KEY`      | optional | Better wallet/holder data (sniper engine)                 |
| `ANTHROPIC_API_KEY`| optional | Only if Claude AI analysis is enabled in sniper           |

Railway will auto-set `PORT` and `RAILWAY_VOLUME_MOUNT_PATH`.

### 4. (Recommended) Attach a persistent volume

Railway service → **Volumes → Add volume** → mount path `/data`.
Without it, the CTO list and sniper state are wiped on every redeploy.

### 5. Deploy

Push to the branch — Railway auto-deploys. Check logs for:

```
🧠 IQ CTO Bot started
🎯 Sniper Engine loaded
🚀 Sniper Engine auto-started (24/7)
🌐 HTTP API listening on :3000
```

Send `/start` to your bot in Telegram.

---

## 🧪 Run locally

```bash
cd bot
cp .env.example .env
# fill TELEGRAM_TOKEN
npm install
npm start
```

---

## 📱 Bot commands

| Command       | What it does                                  |
|---------------|-----------------------------------------------|
| `/start`      | Welcome message                               |
| `/help`       | Help                                          |
| `/listcto`    | Last 15 CTO listings (ticker, MC, peak X)     |
| `/statscto`   | Total CTOs, per chain, best X                 |
| `/sniper`     | Sniper engine status (24h signals, win rate)  |
| `/sniperreset`| (admin) Reset sniper stats                    |
| `/chatid`     | Print the current chat ID                     |

## 🌐 HTTP API (consumed by `iq50.io/cto.html`)

```
GET  /api/cto/list         → { ctos, stats }
GET  /api/cto/stats        → stats
GET  /api/cto/resolve?q=…  → debug resolver
POST /api/cto/add          → { address, key?, addedBy?, note? }
POST /api/cto/clear        → { key }

GET  /api/sniper/status    → engine state
GET  /api/sniper/stream    → SSE feed
POST /api/sniper/start
POST /api/sniper/stop
POST /api/sniper/close/:id
POST /api/sniper/extend/:id
POST /api/sniper/sellmoon/:id
POST /api/sniper/reset
GET  /api/sniper/backup
POST /api/sniper/restore
```

---

## 🛡️ Why a separate repo / Railway / token?

- The byeboss bot keeps its own DB, sniper history and chat IDs untouched.
- IQ CTO has its own Telegram identity (`@QCTOBot`) and its own state file.
- A Railway crash on one side never takes down the other.
