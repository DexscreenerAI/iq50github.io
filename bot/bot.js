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
const SNIPER_PAGE_URL = process.env.SNIPER_PAGE_URL || `${SITE_URL}/sniper_terminal.html`;
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

// ─── Sniper broadcast (mirrors byeboss format) ────────────────────────
// Sniper engine calls broadcastFn(type, action, data) for each event.
// Supported events: TRADE/OPEN, TRADE/CLOSE, TRADE/TP, TRADE/MILESTONE.
// SCAN/RESULT and TRADE/DCA are intentionally silent — users only want
// real signals + closes + milestones, not scan chatter.
const sniperMsgQueue = [];
let sniperQueueTimer = null;

async function processSniperQueue() {
  sniperQueueTimer = null;
  if (!sniperMsgQueue.length) return;
  const { chatId, text, opts } = sniperMsgQueue.shift();
  try {
    await bot.sendMessage(chatId, text, opts);
  } catch (e) {
    console.warn('[sniper] sendMessage failed:', e.message?.slice(0, 80));
  }
  // 100ms gap between messages to stay under Telegram's per-chat rate limit
  if (sniperMsgQueue.length) sniperQueueTimer = setTimeout(processSniperQueue, 100);
}

function queueSniperMessage(chatId, text, opts = {}) {
  sniperMsgQueue.push({ chatId, text, opts });
  if (!sniperQueueTimer) sniperQueueTimer = setTimeout(processSniperQueue, 100);
}

function buildTweetIntentUrl(text) {
  return 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text);
}

function buildOpenTweet(p) {
  const ca = p.address || p.tokenAddress || '';
  return `🎯 NEW SIGNAL · $${p.symbol}\n\n` +
    `⛓ ${(p.chain || 'solana').toUpperCase()}\n` +
    `📊 MCap $${formatNumber(p.entryMarketCap)} · Liq $${formatNumber(p.entryLiquidity)}\n` +
    (ca ? `\nCA: ${ca}\n` : '') +
    `\nLive on ${SNIPER_PAGE_URL}`;
}

function buildMilestoneTweet(data) {
  const m = data.milestone;
  const x = data.currentX || m;
  const xStr = x >= 10 ? x.toFixed(0) + 'X' : x.toFixed(2) + 'X';
  const ca = data.address || '';
  const emoji = m >= 50 ? '🌕' : m >= 10 ? '🚀' : m >= 5 ? '🔥' : m >= 3 ? '💥' : '📈';
  return `${emoji} ${m}X HIT · $${data.symbol}\n\n` +
    `Signal called at $${formatNumber(data.entryMarketCap)} MC.\n` +
    `Now trading at ${xStr} from entry.\n` +
    (ca ? `\nCA: ${ca}\n` : '') +
    `\nLive on ${SNIPER_PAGE_URL}`;
}

function buildCtoTweet(c) {
  const ca = c.addr || '';
  return `🤝 NEW CTO LISTED · $${c.ticker}\n\n` +
    `Called at $${formatNumber(c.calledMc)} MC on ${(c.chain || 'solana').toUpperCase()}\n` +
    (ca ? `\nCA: ${ca}\n` : '') +
    `\nTracking on ${CTO_PAGE_URL}`;
}

function sniperBroadcast(type, action, data) {
  const chatId = SNIPER_CHAT_ID;
  if (!chatId) return;

  try {
    if (type === 'TRADE' && action === 'OPEN') {
      const p = data.position;
      const ca = p.address || p.tokenAddress || '';
      const shortCa = ca ? (ca.slice(0, 4) + '…' + ca.slice(-4)) : '';
      const caption = `🎯 *NEW SIGNAL* · *$${p.symbol}*

⛓ ${(p.chain || 'solana').toUpperCase()}
📊 MCap $${formatNumber(p.entryMarketCap)} · Liq $${formatNumber(p.entryLiquidity)}
${ca ? '\n\`' + ca + '\`' : ''}

📈 [Chart](https://dexscreener.com/${p.chain}/${p.pairAddress})${shortCa ? ' · 🎯 [Track on IQ](' + SNIPER_PAGE_URL + ')' : ''}`;

      const tweetKb = { inline_keyboard: [[{ text: '🐦 Tweet this signal', url: buildTweetIntentUrl(buildOpenTweet(p)) }]] };
      const logoUrl = p.logo || p.imageUrl || p.logoUrl || '';
      if (logoUrl) {
        bot.sendPhoto(chatId, logoUrl, { caption, parse_mode: 'Markdown', reply_markup: tweetKb })
          .catch(err => {
            console.warn('[sniper] sendPhoto failed, falling back to text:', err.message?.slice(0, 80));
            queueSniperMessage(chatId, caption, { parse_mode: 'Markdown', disable_web_page_preview: true, reply_markup: tweetKb });
          });
      } else {
        queueSniperMessage(chatId, caption, { parse_mode: 'Markdown', disable_web_page_preview: true, reply_markup: tweetKb });
      }
    }

    else if (type === 'TRADE' && action === 'CLOSE') {
      const pct = typeof data.pnlPct === 'number' ? data.pnlPct : 0;
      const x = 1 + pct / 100;
      const win = x >= 1.25;
      const icon = win ? '✅' : (x >= 1 ? '➖' : '❌');
      const xStr = x >= 10 ? x.toFixed(0) + 'X' : x.toFixed(2) + 'X';
      const msg = `${icon} *SIGNAL CLOSED* · *$${data.symbol}*

Peak: *${xStr}*
Reason: _${data.reason}_`;
      queueSniperMessage(chatId, msg, { parse_mode: 'Markdown' });
    }

    else if (type === 'TRADE' && action === 'TP') {
      const msg = `🚀 *$${data.symbol}* hit TP${data.tpLevel || ''}`;
      queueSniperMessage(chatId, msg, { parse_mode: 'Markdown' });
    }

    else if (type === 'TRADE' && action === 'MILESTONE') {
      const m = data.milestone;
      const x = data.currentX || m;
      const xStr = x >= 10 ? x.toFixed(0) + 'X' : x.toFixed(2) + 'X';
      const emoji = m >= 50 ? '🌕' : m >= 10 ? '🚀' : m >= 5 ? '🔥' : m >= 3 ? '💥' : '📈';
      const ca = data.address || '';
      const caption =
        `${emoji} *${m}X HIT* · *$${data.symbol}*\n\n` +
        `Signal called at $${formatNumber(data.entryMarketCap)} MC.\n` +
        `Now trading at *${xStr}* from entry.\n` +
        (ca ? `\n\`${ca}\`\n` : '') +
        `\n📈 [Chart](https://dexscreener.com/${data.chain}/${data.pairAddress}) · 🎯 [Terminal](${SNIPER_PAGE_URL})`;

      const tweetKbMs = { inline_keyboard: [[{ text: '🐦 Tweet ' + m + 'X', url: buildTweetIntentUrl(buildMilestoneTweet(data)) }]] };
      const logoUrl = data.logo || '';
      if (logoUrl) {
        bot.sendPhoto(chatId, logoUrl, { caption, parse_mode: 'Markdown', reply_markup: tweetKbMs })
          .catch(err => {
            console.warn('[sniper] milestone sendPhoto failed:', err.message?.slice(0, 80));
            queueSniperMessage(chatId, caption, { parse_mode: 'Markdown', disable_web_page_preview: true, reply_markup: tweetKbMs });
          });
      } else {
        queueSniperMessage(chatId, caption, { parse_mode: 'Markdown', disable_web_page_preview: true, reply_markup: tweetKbMs });
      }
    }

    // SCAN/RESULT and TRADE/DCA intentionally silent.
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

// Test endpoint — manually fire a sniper alert into SNIPER_CHAT_ID so an
// admin can verify the channel + token + alert format without waiting for
// the sniper engine to organically detect a real signal. Protected by
// CTO_ADMIN_KEY so randoms can't spam the channel.
app.post('/api/test/broadcast', (req, res) => {
  const ADMIN = process.env.CTO_ADMIN_KEY || '';
  const { key, type = 'TRADE', action = 'OPEN', data } = req.body || {};
  if (!ADMIN || key !== ADMIN) return res.status(403).json({ error: 'admin key required' });
  if (!SNIPER_CHAT_ID) return res.status(400).json({ error: 'SNIPER_CHAT_ID not configured — set it in env vars and redeploy' });

  // Sensible defaults so a curl with just {key} fires a recognizable demo
  // signal without requiring the caller to know every field of the schema.
  const filled = data || {
    position: {
      symbol: 'TEST',
      address: '0x0000000000000000000000000000000000000000',
      chain: 'solana',
      pairAddress: 'DemoPairAddress11111111111111111111111111111',
      entryMarketCap: 50000,
      entryLiquidity: 10000,
      logo: '',
    },
  };

  sniperBroadcast(type, action, filled);
  res.json({ ok: true, sent: { type, action, chatId: SNIPER_CHAT_ID } });
});

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
    const { address, addedBy, note, key, calledMc, calledAt } = req.body || {};
    if (!address) return res.status(400).json({ error: 'address required' });
    const ADMIN = process.env.CTO_ADMIN_KEY || '';
    if (ADMIN && key !== ADMIN) return res.status(403).json({ error: 'admin key required' });

    const r = await ctoTracker.addCto(address, { addedBy, note, calledMc, calledAt });
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
        const tweetKbCto = { inline_keyboard: [[{ text: '🐦 Tweet this CTO', url: buildTweetIntentUrl(buildCtoTweet(c)) }]] };
        const logoUrl = c.logo
          || `https://dd.dexscreener.com/ds-data/tokens/${(c.chain || 'solana').toLowerCase()}/${(c.addr || '').toLowerCase()}.png`;
        bot.sendPhoto(SNIPER_CHAT_ID, logoUrl, { caption, parse_mode: 'Markdown', reply_markup: tweetKbCto }).catch(() => {
          bot.sendMessage(SNIPER_CHAT_ID, caption, { parse_mode: 'Markdown', disable_web_page_preview: true, reply_markup: tweetKbCto }).catch(() => {});
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
