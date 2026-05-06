// ═══════════════════════════════════════════════════════════════
// 🧠 IQ CTO — TELEGRAM BOT
// ═══════════════════════════════════════════════════════════════
// Light fork of byeboss bot — only CTO listing + sniper terminal.
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { createSniperEngine } = require('./sniper-engine');
const ctoTracker = require('./cto-tracker');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
if (!TELEGRAM_TOKEN) {
  console.error('❌ ERROR: TELEGRAM_TOKEN missing');
  process.exit(1);
}

const ADMIN_IDS       = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const GROUP_CHAT_ID   = process.env.GROUP_CHAT_ID || null;
const SNIPER_CHAT_ID  = process.env.SNIPER_CHAT_ID || GROUP_CHAT_ID || null;
const SITE_URL        = process.env.SITE_URL || 'https://iq50.io';
const CTO_PAGE_URL    = process.env.CTO_PAGE_URL || `${SITE_URL}/cto.html`;
const PORT            = parseInt(process.env.PORT, 10) || 3000;

const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const isAdmin = (uid) => !ADMIN_IDS.length || ADMIN_IDS.includes(String(uid));

console.log('🧠 IQ CTO Bot started');
console.log(`📁 Data dir: ${dataDir}`);

function formatNumber(n) {
  const v = parseFloat(n);
  if (!v || isNaN(v)) return '0';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
  return v.toFixed(2);
}
const fmtX = (x) => (x >= 100 ? Math.round(x) : x.toFixed(x >= 10 ? 1 : 2)) + 'X';

// ─── Sniper engine ────────────────────────────────────────────────────
async function sniperBroadcast(event) {
  if (!SNIPER_CHAT_ID || !event) return;
  try {
    const t = String(event.type || '').toUpperCase();
    if (t === 'OPEN' || t === 'SIGNAL') {
      const m = event.position || event;
      const sym = m.symbol || '?';
      const ca = m.address || '';
      const dex = m.dexUrl || '';
      const text = `🎯 *NEW SIGNAL · $${sym}*\n\n` +
        (ca ? `\`${ca}\`\n\n` : '') +
        (dex ? `📈 [Chart](${dex})` : '');
      await bot.sendMessage(SNIPER_CHAT_ID, text, { parse_mode: 'Markdown', disable_web_page_preview: true });
    }
  } catch (e) {
    console.error('Sniper broadcast error:', e.message?.slice(0, 80));
  }
}

const sniper = createSniperEngine({
  broadcastFn: sniperBroadcast,
  dataDir: dataDir,
  aiApiUrl: null,
});

console.log('🎯 Sniper Engine loaded');

setTimeout(() => {
  try {
    const st = sniper.getState();
    if (!st.isRunning) {
      sniper.start();
      console.log('🚀 Sniper Engine auto-started (24/7)');
    }
  } catch (e) {
    console.error('Sniper auto-start failed:', e.message);
  }
}, 5000);

ctoTracker.start({ dataDir });

// ─── Telegram commands ────────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.first_name || 'Trader';
  const userId = msg.from.id;
  const adminBlock = isAdmin(userId)
    ? `\n👑 *Admin:*\n\`/sniperreset\` — Reset sniper stats\n`
    : '';
  bot.sendMessage(chatId, `
🧠 *Welcome to IQ CTO, ${username}!*

Track Community Take Over (CTO) tokens & live sniper signals.

📊 *Commands:*
🤝 \`/listcto\` — Show all CTO listings
📈 \`/statscto\` — Global CTO stats
🎯 \`/sniper\` — Sniper engine status
❓ \`/help\` — Full help
${adminBlock}
🌐 [Site](${SITE_URL}) · 🤝 [CTO Listing](${CTO_PAGE_URL})

🆔 Your ID: \`${userId}\`
`, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id, `
❓ *HELP — IQ CTO Bot*

━━━ *🤝 CTO Listing* ━━━
🤝 \`/listcto\` — Last CTO listings (top 15)
📈 \`/statscto\` — Total / per chain / best X

━━━ *🎯 Sniper Terminal* ━━━
🎯 \`/sniper\` — 24h signals, win rate, best call

━━━━━━━━━━
🌐 [Site](${SITE_URL}) · 🤝 [CTO Listing](${CTO_PAGE_URL})
`, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

bot.onText(/\/listcto(?:@\w+)?$/, (msg) => {
  const chatId = msg.chat.id;
  const list = ctoTracker.getList().slice(0, 15);
  if (!list.length) {
    return bot.sendMessage(chatId, `🤝 No CTO listed yet.\n\nAdd one via [${CTO_PAGE_URL}](${CTO_PAGE_URL})`, { parse_mode: 'Markdown', disable_web_page_preview: true });
  }
  let txt = `🤝 *CTO LISTINGS* (last ${list.length})\n━━━━━━━━━━━━━━━━━━━\n\n`;
  for (const c of list) {
    const peakX = c.peakX || 1;
    txt += `*$${c.ticker}* · ${(c.chain || 'sol').toUpperCase()}\n` +
      `  Called: $${formatNumber(c.calledMc)} → Now: $${formatNumber(c.currentMc)} · Peak: ${fmtX(peakX)}\n` +
      `  [Chart](${c.dexUrl})\n\n`;
  }
  bot.sendMessage(chatId, txt, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

bot.onText(/\/statscto(?:@\w+)?$/, (msg) => {
  const s = ctoTracker.getStats();
  bot.sendMessage(msg.chat.id, `📈 *CTO STATS*
━━━━━━━━━━━━

Total: *${s.total}*
Solana: ${s.solana} · Ethereum: ${s.ethereum} · Base: ${s.base} · BSC: ${s.bsc} · Other: ${s.other}

🏆 Best call: ${s.bestX ? fmtX(s.bestX) + ' $' + s.bestSym : '—'}`, { parse_mode: 'Markdown' });
});

bot.onText(/\/sniper(?:@\w+)?$/, async (msg) => {
  const chatId = msg.chat.id;
  const state = sniper.getState();

  const sigs = [];
  for (const p of (state.positions || [])) {
    sigs.push({
      symbol: p.symbol || '',
      peakX: 1 + ((p.highestPnlPct || 0) / 100),
      openedAt: p.entryTime || Date.now(),
    });
  }
  for (const h of (state.history || [])) {
    sigs.push({
      symbol: h.symbol || '',
      peakX: 1 + ((h.highestPnlPct || h.pnlPct || 0) / 100),
      openedAt: h.openedAt || h.entryTime || (h.closeTime ? h.closeTime - 10 * 60 * 1000 : Date.now()),
    });
  }

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const week = 7 * day;
  const last24h = sigs.filter(s => (now - s.openedAt) <= day);
  const last7d  = sigs.filter(s => (now - s.openedAt) <= week);

  const count24 = last24h.length;
  const wins24 = last24h.filter(s => s.peakX >= 1.25).length;
  const winRate24 = count24 ? (100 * wins24 / count24) : 0;
  const avgX24 = count24 ? (last24h.reduce((a, s) => a + s.peakX, 0) / count24) : 0;
  const totalX24 = last24h.reduce((a, s) => a + s.peakX, 0);
  const best = sigs.reduce((b, s) => (s.peakX > (b?.peakX || 0) ? s : b), null);

  await bot.sendMessage(chatId, `🎯 *SNIPER ENGINE STATUS*
━━━━━━━━━━━━━━━━━━━━━

${state.isRunning ? '🟢 *RUNNING*' : '🔴 *STOPPED*'}

🎯 *24h Signals:* ${count24}
📈 *Win Rate:* ${count24 ? winRate24.toFixed(1) + '%' : '—'}
✨ *Avg Xs:* ${count24 ? fmtX(avgX24) : '—'}
🚀 *Total Xs:* ${count24 ? fmtX(totalX24) : '—'}
🏆 *Best Call:* ${best ? `${fmtX(best.peakX)} $${best.symbol}` : '—'}
📅 *7d Signals:* ${last7d.length}

🔍 Last scan: ${state.lastScanTime || 'Never'}
📊 Scanned: ${state.scannedTotal || 0} | Opps: ${state.oppsTotal || 0}`, { parse_mode: 'Markdown' });
});

bot.onText(/\/sniperreset(?:@\w+)?$/, (msg) => {
  if (!isAdmin(msg.from.id)) return;
  sniper.reset();
  bot.sendMessage(msg.chat.id, '✅ Sniper stats reset.', { parse_mode: 'Markdown' });
});

bot.onText(/\/chatid/, (msg) => {
  bot.sendMessage(msg.chat.id, `🆔 Chat ID: \`${msg.chat.id}\``, { parse_mode: 'Markdown' });
});

// ─── Express HTTP API ─────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/', (req, res) => res.json({ ok: true, name: 'IQ CTO Bot', version: '1.0.0' }));
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// CTO endpoints
app.get('/api/cto/list', (req, res) => res.json({ ctos: ctoTracker.getList(), stats: ctoTracker.getStats() }));
app.get('/api/cto/stats', (req, res) => res.json(ctoTracker.getStats()));
app.get('/api/cto/resolve', async (req, res) => {
  const q = req.query.q || '';
  if (!q) return res.json({ error: 'q required' });
  try { res.json(await ctoTracker.resolveTest(q)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/cto/clear', (req, res) => {
  const ADMIN = process.env.CTO_ADMIN_KEY || '';
  const key = (req.body && req.body.key) || '';
  if (!ADMIN || key !== ADMIN) return res.status(403).json({ error: 'admin key required' });
  res.json(ctoTracker.clearAll());
});
app.post('/api/cto/add', async (req, res) => {
  try {
    const { address, addedBy, note, key } = req.body || {};
    if (!address) return res.status(400).json({ error: 'address required' });
    const ADMIN = process.env.CTO_ADMIN_KEY || '';
    if (ADMIN && key !== ADMIN) return res.status(403).json({ error: 'admin key required' });

    const r = await ctoTracker.addCto(address, { addedBy, note });
    if (r.error) return res.status(400).json(r);

    try {
      const c = r.cto;
      if (sniper && typeof sniper.injectPromotion === 'function') {
        sniper.injectPromotion({
          symbol: c.ticker, address: c.addr, chain: c.chain,
          pairAddress: c.pairAddress, dexUrl: c.dexUrl,
          entryMarketCap: c.calledMc, entryLiquidity: 0,
          logo: c.logo, name: c.name,
          source: 'CTO',
        });
      }
    } catch (_) {}

    if (SNIPER_CHAT_ID) {
      try {
        const c = r.cto;
        const ca = c.addr || '';
        const caption = `🤝 *NEW CTO LISTED* · *$${c.ticker}*\n\n` +
          `⛓ ${(c.chain || 'solana').toUpperCase()}\n` +
          `📊 Called at $${formatNumber(c.calledMc)} MC\n` +
          (ca ? `\n\`${ca}\`\n` : '') +
          `\n📈 [Chart](${c.dexUrl}) · 🤝 [CTO Listing](${CTO_PAGE_URL})`;
        const logoUrl = c.logo
          || `https://dd.dexscreener.com/ds-data/tokens/${(c.chain || 'solana').toLowerCase()}/${(c.addr || '').toLowerCase()}.png`;
        bot.sendPhoto(SNIPER_CHAT_ID, logoUrl, { caption, parse_mode: 'Markdown' }).catch(() => {
          bot.sendMessage(SNIPER_CHAT_ID, caption, { parse_mode: 'Markdown', disable_web_page_preview: true }).catch(() => {});
        });
      } catch (_) {}
    }

    res.json({ ok: true, cto: r.cto });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Sniper endpoints (mirror byeboss surface)
app.get('/api/sniper/stream', (req, res) => {
  if (!sniper || typeof sniper.handleSSE !== 'function') {
    return res.status(503).json({ error: 'sniper engine not ready' });
  }
  sniper.handleSSE(req, res);
});
app.get('/api/sniper/status', (req, res) => res.json(sniper.getState()));
app.post('/api/sniper/start', (req, res) => {
  if (sniper.getState().isRunning) return res.json({ success: false, message: 'Already running' });
  sniper.start();
  res.json({ success: true, message: 'Sniper started', state: sniper.getState() });
});
app.post('/api/sniper/stop', (req, res) => {
  if (!sniper.getState().isRunning) return res.json({ success: false, message: 'Already stopped' });
  sniper.stop();
  res.json({ success: true, message: 'Sniper stopped', state: sniper.getState() });
});
app.post('/api/sniper/close/:id', (req, res) => {
  sniper.closePosition(parseInt(req.params.id, 10));
  res.json({ success: true, state: sniper.getState() });
});
app.post('/api/sniper/extend/:id', (req, res) => {
  const ok = sniper.extendPosition(parseInt(req.params.id, 10));
  res.json({ success: ok, state: sniper.getState() });
});
app.post('/api/sniper/sellmoon/:id', (req, res) => {
  const ok = sniper.sellMoonBag(parseInt(req.params.id, 10));
  res.json({ success: ok, state: sniper.getState() });
});
app.post('/api/sniper/reset', (req, res) => {
  sniper.reset();
  res.json({ success: true, state: sniper.getState() });
});
app.get('/api/sniper/backup', (req, res) => {
  const stateFile = path.join(dataDir, 'sniper-state.json');
  if (fs.existsSync(stateFile)) {
    const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    res.json({ success: true, timestamp: Date.now(), data });
  } else {
    res.json({ success: false, message: 'No state file found' });
  }
});
app.post('/api/sniper/restore', (req, res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'No data provided' });
    const stateFile = path.join(dataDir, 'sniper-state.json');
    fs.writeFileSync(stateFile, JSON.stringify(data, null, 2));
    if (typeof sniper.loadState === 'function') sniper.loadState();
    res.json({ success: true, message: 'State restored' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`🌐 HTTP API listening on :${PORT}`));

bot.on('polling_error', (e) => console.error('Polling error:', e.code, String(e.message).slice(0, 120)));
bot.on('error', (e) => console.error('Bot error:', String(e.message).slice(0, 120)));
