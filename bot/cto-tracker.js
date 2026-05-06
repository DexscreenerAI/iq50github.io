// cto-tracker.js — Community Take Over (CTO) listing.
// When a token is "rescued" by its community after being abandoned by its
// dev, anyone can add it here. The tracker records the call moment, then
// periodically refreshes its MC and tracks the peak X multiple from the
// call point. Data is persisted to JSON so the listing is permanent.

const fs = require('fs');
const path = require('path');

const DEX_TOKEN_API = 'https://api.dexscreener.com/latest/dex/tokens/';
const DEX_PAIR_API = 'https://api.dexscreener.com/latest/dex/pairs/';
const DEX_SEARCH_API = 'https://api.dexscreener.com/latest/dex/search?q=';
const GT_SEARCH_API = 'https://api.geckoterminal.com/api/v2/search/pools';
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

// GeckoTerminal network → DexScreener chain id
const GT_NETWORK_MAP = {
  eth: 'ethereum', bsc: 'bsc', polygon_pos: 'polygon', polygon: 'polygon',
  base: 'base', arbitrum: 'arbitrum', avax: 'avalanche', optimism: 'optimism',
  solana: 'solana', sui: 'sui', ton: 'ton',
};

let DB = { ctos: {} }; // key = chain:addr (lowercase)
let dbFile = null;
let refreshTimer = null;

// ─── helpers ──────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ctoKey = (chain, addr) => `${(chain || '').toLowerCase()}:${(addr || '').toLowerCase()}`;

// Tiny in-process response cache + 429 retry. DexScreener rate-limits
// aggressively when the bot is also running rugsheet + og scanners.
const _fetchCache = new Map(); // url → { ts, body }
const FETCH_CACHE_TTL = 30 * 1000; // 30s

async function fetchSafe(url, opts = {}, timeoutMs = 8000) {
  const cached = _fetchCache.get(url);
  if (cached && Date.now() - cached.ts < FETCH_CACHE_TTL) return cached.body;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const r = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(t);
      if (r.status === 429) {
        const ra = parseFloat(r.headers.get('retry-after') || '0');
        const wait = ra ? Math.min(ra * 1000, 5000) : (700 * (attempt + 1));
        await sleep(wait);
        continue;
      }
      if (!r.ok) return null;
      const body = await r.json();
      _fetchCache.set(url, { ts: Date.now(), body });
      return body;
    } catch (_) { return null; }
  }
  return null;
}

function loadJSON() {
  if (!dbFile) return;
  try {
    if (fs.existsSync(dbFile)) {
      const raw = fs.readFileSync(dbFile, 'utf8');
      DB = { ...DB, ...JSON.parse(raw) };
    }
  } catch (e) { console.warn('[cto-tracker] load failed:', e.message); }
}

function saveJSON() {
  if (!dbFile) return;
  try { fs.writeFileSync(dbFile, JSON.stringify(DB)); }
  catch (e) { console.warn('[cto-tracker] save failed:', e.message); }
}

function pickPair(pairs) {
  if (!pairs || !pairs.length) return null;
  return [...pairs].sort((a, b) => (parseFloat(b.liquidity?.usd) || 0) - (parseFloat(a.liquidity?.usd) || 0))[0];
}

async function fetchTokenData(addr) {
  const data = await fetchSafe(DEX_TOKEN_API + encodeURIComponent(addr));
  return pickPair(data?.pairs || []);
}

// Try multiple strategies to resolve a user input into a DexScreener pair.
// Accepts:
//   - raw contract address (EVM 0x... or Solana base58)
//   - DexScreener URL (https://dexscreener.com/{chain}/{pairAddress})
//   - DexTools URL (https://www.dextools.io/app/{chain}/pair-explorer/{pairAddress})
//   - Plain symbol / token name (search across DexScreener + GeckoTerminal)
async function resolvePair(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  // 1) DexScreener URL — extract chain + pair address
  let m = raw.match(/dexscreener\.com\/([^/]+)\/([A-Za-z0-9]+)/i);
  if (m) {
    const chain = m[1];
    const pairAddr = m[2];
    const data = await fetchSafe(`${DEX_PAIR_API}${chain}/${pairAddr}`);
    const pair = data?.pair || (data?.pairs ? data.pairs[0] : null);
    if (pair) return pair;
  }

  // 2) DexTools URL — extract pair address (often EVM 0x...) — DexTools doesn't
  //    have a public API, but DexScreener indexes the same pair, so we can
  //    look it up by pair address across all chains.
  m = raw.match(/dextools\.io\/[^/]+\/[^/]+\/[^/]+\/([0-9a-fA-Fx]{40,})/);
  if (m) {
    const pairAddr = m[1];
    // Try search by pair address — DexScreener returns the matching pair
    const data = await fetchSafe(DEX_SEARCH_API + encodeURIComponent(pairAddr));
    const found = (data?.pairs || []).find(p => (p.pairAddress || '').toLowerCase() === pairAddr.toLowerCase());
    if (found) return found;
  }

  // 3) Plain CA (EVM or Solana) — direct DexScreener lookup
  if (/^0x[a-fA-F0-9]{40}$/.test(raw) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw)) {
    const direct = await fetchTokenData(raw);
    if (direct) return direct;
    // EVM fallback via GeckoTerminal — DexScreener sometimes lacks early ETH tokens
    const gt = await searchGeckoTerminal(raw, 'address');
    if (gt) return gt;
  }

  // 4) Symbol / name — search DexScreener first, GeckoTerminal as fallback
  const search = await fetchSafe(DEX_SEARCH_API + encodeURIComponent(raw));
  let pair = pickPair(search?.pairs || []);
  if (pair) return pair;

  const gtPair = await searchGeckoTerminal(raw, 'symbol');
  if (gtPair) return gtPair;

  return null;
}

// Hit GeckoTerminal — used as a fallback for symbol search and EVM CA lookups.
// Returns the highest-liquidity pool converted to the DexScreener pair shape.
async function searchGeckoTerminal(query, mode = 'symbol') {
  const data = await fetchSafe(
    `${GT_SEARCH_API}?query=${encodeURIComponent(query)}&include=base_token&page=1`,
    { headers: { 'Accept': 'application/json;version=20230302' } }
  );
  if (!data?.data?.length) return null;
  const tokenLookup = {};
  for (const inc of (data.included || [])) {
    if (inc.type === 'token') tokenLookup[inc.id] = inc.attributes;
  }
  const pools = [...data.data].sort((a, b) =>
    (parseFloat(b.attributes?.reserve_in_usd) || 0) - (parseFloat(a.attributes?.reserve_in_usd) || 0)
  );
  for (const pool of pools) {
    const attr = pool.attributes || {};
    const baseId = pool.relationships?.base_token?.data?.id;
    const baseTok = tokenLookup[baseId] || {};
    const network = (baseId || '').split('_')[0] || '';
    const chainId = GT_NETWORK_MAP[network] || network;
    const sym = (baseTok.symbol || '').trim();
    if (!sym) continue;
    if (mode === 'address' && (baseTok.address || '').toLowerCase() !== String(query).toLowerCase()) continue;
    return {
      chainId,
      pairAddress: attr.address || '',
      url: attr.address ? `https://www.geckoterminal.com/${network}/pools/${attr.address}` : '',
      pairCreatedAt: attr.pool_created_at ? new Date(attr.pool_created_at).getTime() : 0,
      baseToken: { address: baseTok.address || '', name: baseTok.name || '', symbol: sym },
      info: { imageUrl: baseTok.image_url || '', socials: [], websites: [] },
      marketCap: parseFloat(attr.market_cap_usd) || parseFloat(attr.fdv_usd) || 0,
      fdv: parseFloat(attr.fdv_usd) || 0,
      liquidity: { usd: parseFloat(attr.reserve_in_usd) || 0 },
      volume: { h24: parseFloat(attr.volume_usd?.h24) || 0 },
      priceChange: { h24: parseFloat(attr.price_change_percentage?.h24) || 0 },
    };
  }
  return null;
}

function recordFromPair(pair, addr) {
  const tok = pair.baseToken || {};
  const info = pair.info || {};
  const mc = parseFloat(pair.marketCap || pair.fdv) || 0;
  return {
    addr: tok.address || addr,
    chain: (pair.chainId || 'solana').toLowerCase(),
    ticker: (tok.symbol || '?').toString(),
    name: tok.name || '',
    logo: info.imageUrl || '',
    pairAddress: pair.pairAddress || '',
    dexUrl: pair.url || `https://dexscreener.com/${pair.chainId}/${pair.pairAddress}`,
    twitter: (info.socials || []).find(s => /twitter/i.test(s.type || s.platform || ''))?.url || '',
    telegram: (info.socials || []).find(s => /telegram/i.test(s.type || s.platform || ''))?.url || '',
    website: (info.websites || [])[0]?.url || '',
    currentMc: mc,
  };
}

// ─── public API ───────────────────────────────────────────────────────
async function addCto(input, opts = {}) {
  if (!input) return { error: 'token address, link or symbol required' };
  const pair = await resolvePair(input);
  if (!pair) return { error: 'token not found on DexScreener / GeckoTerminal — check the link or paste the contract address' };
  const base = recordFromPair(pair, pair.baseToken?.address || input);
  const key = ctoKey(base.chain, base.addr);
  if (DB.ctos[key]) {
    return { error: 'already listed', cto: DB.ctos[key] };
  }
  const now = Date.now();
  const callMc = base.currentMc;
  DB.ctos[key] = {
    ...base,
    calledAt: now,
    calledMc: callMc,
    peakMc: callMc,
    peakX: 1,
    currentX: 1,
    lastChecked: now,
    addedBy: opts.addedBy || '',
    note: opts.note || '',
  };
  saveJSON();
  return { ok: true, cto: DB.ctos[key] };
}

function getList() {
  const arr = Object.values(DB.ctos);
  arr.sort((a, b) => (b.calledAt || 0) - (a.calledAt || 0));
  return arr;
}

function getStats() {
  const arr = Object.values(DB.ctos);
  const counts = { total: arr.length, solana: 0, ethereum: 0, base: 0, bsc: 0, other: 0 };
  let bestX = 0, bestSym = '';
  for (const c of arr) {
    const ch = (c.chain || '').toLowerCase();
    if (ch === 'solana') counts.solana++;
    else if (ch === 'ethereum') counts.ethereum++;
    else if (ch === 'base') counts.base++;
    else if (ch === 'bsc') counts.bsc++;
    else counts.other++;
    if ((c.peakX || 0) > bestX) { bestX = c.peakX; bestSym = c.ticker; }
  }
  return { ...counts, bestX, bestSym };
}

async function refreshOne(key) {
  const cto = DB.ctos[key];
  if (!cto) return;
  const pair = await fetchTokenData(cto.addr);
  if (!pair) { cto.lastChecked = Date.now(); return; }
  const mc = parseFloat(pair.marketCap || pair.fdv) || 0;
  cto.currentMc = mc;
  cto.currentX = cto.calledMc > 0 ? mc / cto.calledMc : 1;
  if (mc > cto.peakMc) {
    cto.peakMc = mc;
    cto.peakX = cto.calledMc > 0 ? mc / cto.calledMc : 1;
  }
  cto.lastChecked = Date.now();
  DB.ctos[key] = cto;
}

async function refreshAll() {
  const keys = Object.keys(DB.ctos);
  for (const k of keys) {
    try { await refreshOne(k); } catch (_) {}
    await sleep(250);
  }
  saveJSON();
}

async function start(opts = {}) {
  if (opts.dataDir) dbFile = path.join(opts.dataDir, 'cto-tracker.json');
  else if (opts.dbFile) dbFile = opts.dbFile;
  loadJSON();

  setTimeout(() => refreshAll().catch(e => console.error('[cto-tracker] refresh err:', e.message)), 10 * 1000);
  refreshTimer = setInterval(() => refreshAll().catch(e => console.error('[cto-tracker] refresh err:', e.message)), REFRESH_INTERVAL_MS);
  console.log(`[cto-tracker] started (refresh ${REFRESH_INTERVAL_MS / 60000}m, ${Object.keys(DB.ctos).length} CTOs loaded)`);
}

function stop() { if (refreshTimer) clearInterval(refreshTimer); }

async function resolveTest(input) {
  const debug = { input, urlMatch: null, dexTokenStatus: null, dexSearchStatus: null, gtStatus: null };
  const raw = String(input || '').trim();
  const urlM = raw.match(/dexscreener\.com\/([^/]+)\/([A-Za-z0-9]+)/i);
  if (urlM) debug.urlMatch = { chain: urlM[1], pairAddr: urlM[2] };

  // Test the actual DexScreener API directly (bypass fetchSafe wrapper)
  try {
    const r = await fetch(DEX_TOKEN_API + encodeURIComponent(raw), { signal: AbortSignal.timeout(10000) });
    debug.dexTokenStatus = { ok: r.ok, status: r.status };
    if (r.ok) {
      const j = await r.json();
      debug.dexTokenPairs = (j?.pairs || []).length;
    }
  } catch (e) { debug.dexTokenError = String(e?.message || e); }

  try {
    const r = await fetch(DEX_SEARCH_API + encodeURIComponent(raw), { signal: AbortSignal.timeout(10000) });
    debug.dexSearchStatus = { ok: r.ok, status: r.status };
    if (r.ok) {
      const j = await r.json();
      debug.dexSearchPairs = (j?.pairs || []).length;
    }
  } catch (e) { debug.dexSearchError = String(e?.message || e); }

  try {
    const pair = await resolvePair(input);
    debug.resolved = pair ? {
      chain: pair.chainId, pairAddress: pair.pairAddress, baseAddr: pair.baseToken?.address,
      symbol: pair.baseToken?.symbol, mc: parseFloat(pair.marketCap || pair.fdv) || 0,
    } : null;
  } catch (e) { debug.resolveError = String(e?.message || e); }

  return debug;
}

function clearAll() {
  const before = Object.keys(DB.ctos).length;
  DB.ctos = {};
  saveJSON();
  return { cleared: before };
}

module.exports = { start, stop, addCto, getList, getStats, refreshAll, resolveTest, clearAll };
