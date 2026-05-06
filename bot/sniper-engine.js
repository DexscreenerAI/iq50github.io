// ═══════════════════════════════════════════════════════════════════════════════
// 🎯 SNIPER ENGINE v8.2 - ULTIMATE EDITION
// Server-side sniper with Helius + Moralis + CoinGecko + Pump.fun + DexScreener
// ═══════════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

// API Keys (from environment)
const HELIUS_KEY = process.env.HELIUS_KEY || 'e2f9fdd3-dffc-40b8-abb7-3fb07aadeb55';
const MORALIS_KEY = process.env.MORALIS_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6ImY4YzVkZjU3LWUyM2ItNDBkNS04NTMwLTJkMmVhNzQ3OGI4MCIsIm9yZ0lkIjoiNTA4MjA5IiwidXNlcklkIjoiNTIyOTExIiwidHlwZUlkIjoiYzJkNWQ2OTQtY2UwNC00OWM0LWJiZDEtMDQwNDQ1ODVlODRhIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NzUyNDE2NTEsImV4cCI6NDkzMTAwMTY1MX0.oMBstGfuVMK64RdNXcHlAgDk0X2crdk-uxjJxhDNCcM';

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const HELIUS_API = `https://api.helius.xyz/v0`;

// Fallback RPC endpoints for holder checks (when Helius is rate-limited)
const SOLANA_RPC_ENDPOINTS = [
  HELIUS_RPC,
  'https://api.mainnet-beta.solana.com',
  'https://solana-mainnet.g.alchemy.com/v2/demo',
  'https://mainnet.rpcpool.com',
  'https://solana.public-rpc.com',
  'https://rpc.ankr.com/solana',
];
const MORALIS_API = 'https://solana-gateway.moralis.io';
const PUMP_API = 'https://frontend-api-v3.pump.fun';
const DEX_API = 'https://api.dexscreener.com';

// In-process cache for DexScreener responses. Same URL within DEX_CACHE_TTL_MS
// short-circuits to the cached JSON. Cuts redundant calls when the same pair
// is hit by monitorPositions + megaScan + checkEntryQuality in the same tick.
const _dexCache = new Map();
const DEX_CACHE_TTL_MS = 30 * 1000;
async function cachedDexFetch(url, opts) {
  const hit = _dexCache.get(url);
  if (hit && Date.now() - hit.ts < DEX_CACHE_TTL_MS) {
    return { ok: true, json: async () => hit.data };
  }
  const r = await fetch(url, opts);
  if (!r.ok) return r;
  const data = await r.json();
  _dexCache.set(url, { data, ts: Date.now() });
  if (_dexCache.size > 1000) {
    const entries = Array.from(_dexCache.entries()).sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < 200; i++) _dexCache.delete(entries[i][0]);
  }
  return { ok: true, json: async () => data };
}
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const GMGN_API = 'https://gmgn.ai/defi/quotation/v1';
const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

// ═══════════════════════════════════════════════════════════════════════════════
// SUPPORTED CHAINS
// ═══════════════════════════════════════════════════════════════════════════════
const SUPPORTED_CHAINS = ['solana', 'ethereum'];

// ═══════════════════════════════════════════════════════════════════════════════
// MEGA KEYWORDS (300+)
// ═══════════════════════════════════════════════════════════════════════════════
const MEGA_KEYWORDS = [
  // MEME CLASSICS
  'pepe', 'wojak', 'apu', 'doge', 'shib', 'bonk', 'wif', 'popcat', 'mew', 'cat', 'dog', 'frog',
  'moon', 'pump', 'gem', 'degen', 'based', 'chad', 'giga', 'mega', 'ultra', 'hyper',
  'cope', 'wagmi', 'ngmi', 'hodl', 'diamond', 'ape', 'monkey', 'gorilla',
  // CELEBRITIES
  'trump', 'elon', 'musk', 'biden', 'kanye', 'drake', 'tate', 'rogan', 'snoop',
  'taylor', 'swift', 'mrbeast', 'pewdiepie', 'logan', 'paul', 'ksi', 'ninja',
  // AI & TECH
  'ai', 'gpt', 'claude', 'agent', 'bot', 'neural', 'quantum', 'cyber', 'meta',
  'nft', 'web3', 'defi', 'dao', 'pixel', 'retro', 'virtual', 'openai', 'gemini',
  // ANIMALS
  'bear', 'bull', 'wolf', 'lion', 'tiger', 'whale', 'shark', 'panda', 'koala',
  'bird', 'eagle', 'owl', 'bunny', 'hamster', 'penguin', 'dragon', 'phoenix',
  'snake', 'spider', 'bat', 'fox', 'raccoon', 'turtle', 'octopus', 'bee',
  // SOLANA
  'sol', 'solana', 'raydium', 'jupiter', 'orca', 'meteora', 'jito', 'pumpfun',
  'bonding', 'graduated', 'pump.fun', 'marinade', 'tensor',
  // ETHEREUM
  'eth', 'ethereum', 'uniswap', 'aave', 'lido', 'vitalik', 'buterin',
  'erc20', 'gas', 'gwei', 'layer2', 'l2', 'rollup',
  // BASE
  'base', 'coinbase', 'brian', 'armstrong', 'onchain', 'basechain',
  'friend', 'farcaster', 'warpcast', 'degen base',
  // BSC
  'bnb', 'bsc', 'pancake', 'binance', 'cz',
  // WEALTH
  'rich', 'money', 'gold', 'lambo', 'yacht', 'million', 'billion', 'rocket', 'profit',
  'jackpot', 'winner', 'gains', 'alpha', 'sigma', 'omega',
  // FOOD
  'pizza', 'burger', 'sushi', 'coffee', 'beer', 'banana', 'taco', 'ramen', 'steak',
  'chocolate', 'donut', 'cake', 'cookie', 'nugget', 'tendies',
  // TRENDING CULTURE
  'sigma', 'skibidi', 'rizz', 'ohio', 'gyatt', 'mewing', 'goat', 'bussin',
  'fire', 'lit', 'vibe', 'slay', 'cap', 'nocap', 'brainrot', 'cooked',
  'delulu', 'simp', 'ratio', 'sus', 'yeet', 'oof', 'rekt', 'fomo',
  // MYTHOLOGY & POWER
  'god', 'devil', 'angel', 'demon', 'zeus', 'thor', 'wizard', 'samurai',
  'king', 'queen', 'emperor', 'lord', 'master', 'legend', 'hero', 'warrior',
  // MODIFIERS
  'baby', 'mini', 'micro', 'super', 'turbo', 'nitro', 'power', 'force',
  'new', 'hot', 'fast', 'safe', 'fair', 'real', 'true', 'dark', 'light',
  // COLORS & ELEMENTS
  'red', 'blue', 'green', 'black', 'white', 'neon', 'gold', 'silver',
  'fire', 'ice', 'water', 'earth', 'storm', 'thunder', 'lightning',
  // GAMING
  'game', 'gamer', 'twitch', 'stream', 'mario', 'sonic', 'pokemon',
  'minecraft', 'fortnite', 'roblox', 'casino', 'poker', 'dice', 'loot',
  'zelda', 'pikachu', 'gta', 'cod', 'valorant', 'league',
  // COUNTRIES & CITIES
  'usa', 'america', 'china', 'japan', 'korea', 'india', 'russia', 'brazil',
  'uk', 'france', 'germany', 'australia', 'africa', 'europe', 'asia',
  'tokyo', 'london', 'paris', 'dubai', 'vegas', 'miami', 'mars', 'moon',
  'new york', 'hong kong', 'singapore', 'toronto',
  // CRYPTO CULTURE
  'rug', 'moon', 'lambo', 'whale', 'paper hands', 'diamond hands',
  'btc', 'bitcoin', 'satoshi', 'nakamoto', 'halving', 'mining',
  'staking', 'yield', 'farm', 'pool', 'swap', 'bridge',
  // SOCIAL MEDIA
  'tiktok', 'instagram', 'youtube', 'twitter', 'reddit', 'discord',
  'viral', 'trending', 'influencer', 'clout', 'hype', 'breaking',
  // SPACE & SCIENCE
  'space', 'nasa', 'spacex', 'starship', 'alien', 'ufo', 'galaxy',
  'cosmos', 'nebula', 'quantum', 'atom', 'photon', 'laser',
  // RANDOM VIRAL
  'karen', 'chad', 'boomer', 'zoomer', 'milady', 'remilio', 'npc',
  'matrix', 'simulation', 'glitch', 'hack', 'exploit', 'snipe',
  // PUMP.FUN TRENDING
  'graduated', 'bonding curve', 'king of hill', 'koth', 'pump fun',
  'dev sold', 'dev left', 'community takeover', 'cto', 'stealth',
  // LOW CAP GEMS
  'lowcap', 'microcap', 'nanocap', 'presale', 'launch', 'new token',
  'just launched', 'fair launch', 'stealth launch', 'no presale',
  '1000x', '100x', '10x', 'early', 'hidden gem',
  // MORE ANIMALS
  'hippo', 'rhino', 'crab', 'lobster', 'jellyfish', 'dolphin', 'gorilla',
  'chimp', 'parrot', 'flamingo', 'sloth', 'capybara', 'alpaca', 'llama',
  'moth', 'ant', 'fly', 'mosquito', 'worm', 'snail',
  // MORE CELEBRITIES & INFLUENCERS
  'obama', 'bezos', 'zuck', 'mark', 'jack', 'dorsey', 'sam', 'altman',
  'andrew', 'joe', 'mike', 'tyson', 'conor', 'mcgregor', 'floyd',
  'eminem', 'post malone', 'dababy', 'lil', 'yachty', 'carti',
  // EMOTIONS & STATES
  'happy', 'sad', 'angry', 'love', 'hate', 'fear', 'hope', 'dream',
  'lost', 'found', 'rise', 'fall', 'win', 'lose', 'alive', 'dead',
  'sleep', 'wake', 'fight', 'peace', 'war', 'chaos', 'zen',
  // OBJECTS & THINGS
  'sword', 'shield', 'crown', 'throne', 'ring', 'key', 'lock',
  'bomb', 'gun', 'tank', 'ship', 'plane', 'train', 'car', 'bike',
  'phone', 'computer', 'robot', 'machine', 'tool', 'weapon',
  // SEASONS & TIME
  'spring', 'summer', 'winter', 'fall', 'morning', 'night', 'midnight',
  'dawn', 'dusk', 'sunrise', 'sunset', 'eclipse', 'solstice',
  // BODY & SLANG
  'brain', 'skull', 'bone', 'blood', 'heart', 'eye', 'hand', 'fist',
  'muscle', 'flex', 'pump', 'juice', 'gas', 'sauce', 'drip',
  // MONEY & FINANCE
  'dollar', 'euro', 'yen', 'pound', 'bank', 'vault', 'safe', 'cash',
  'stock', 'bond', 'trade', 'invest', 'hedge', 'fund', 'capital',
  // INTERNET CULTURE
  'meme', 'dank', 'kek', 'lol', 'lmao', 'xd', 'gg', 'ez', 'noob',
  'pro', 'swag', 'yolo', 'fomo', 'jomo', 'cope', 'seethe', 'mald',
  'based', 'cringe', 'chad', 'virgin', 'stacy', 'normie',
  // NATURE
  'tree', 'flower', 'forest', 'mountain', 'ocean', 'river', 'lake',
  'island', 'volcano', 'desert', 'jungle', 'reef', 'crystal',
  // PROFESSIONS
  'doctor', 'lawyer', 'chef', 'pilot', 'captain', 'soldier',
  'pirate', 'cowboy', 'sheriff', 'detective', 'spy', 'assassin',
  // FICTIONAL
  'batman', 'superman', 'spiderman', 'hulk', 'thanos', 'joker',
  'naruto', 'goku', 'saitama', 'luffy', 'eren', 'itachi',
  'homer', 'bart', 'spongebob', 'patrick', 'shrek', 'donkey'
];

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
const formatNumber = n => {
  if (!n || isNaN(n)) return '0';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(0);
};

const formatPrice = p => {
  if (!p || isNaN(p)) return '$0';
  if (p >= 1) return '$' + p.toFixed(2);
  if (p >= 0.0001) return '$' + p.toFixed(6);
  return '$' + p.toExponential(2);
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════════════════════════
// SNIPER ENGINE FACTORY
// ═══════════════════════════════════════════════════════════════════════════════
function createSniperEngine(options = {}) {
  const { broadcastFn, dataDir, wsServer } = options;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════
  let state = {
    isRunning: false,
    balance: 100000,
    totalPnL: 0,
    securedPnL: 0,
    totalTrades: 0,
    wins: 0,
    bestTrade: 0,
    worstTrade: 0,
    positions: [],
    history: [],
    logs: [],
    
    // Scan stats
    heliusScanned: 0,
    pumpScanned: 0,
    dexScanned: 0,
    safeFound: 0,
    scannedTotal: 0,
    oppsTotal: 0,
    lastScanTime: null,
    currentPhase: '-',
    scanStatus: 'Ready',
    
    // Session
    sessionStartTime: null,
    uptime: '00:00'
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS v13 — RADICAL CUT (data-driven from 338 real trades)
  // Philosophy: only keep the exits that actually make money.
  //   ✅ AI EXIT  → +$4211 at 52% WR — runs every 5min now
  //   ✅ TRAIL    → +$4082 at 64% WR — post-+60% with wide distances
  //   ❌ STOP LOSS → -$9134 at 0% WR — REMOVED (was the #1 account killer)
  //   ❌ STALE / NO MOMENTUM / PROTECTED SL → all 0% WR — REMOVED
  //   ❌ RAPID DROP → kept only POST-x2 (pre-x2 was cutting winners)
  // Safety nets kept: RUG (-85%), LIQ PULL (<25% liq), MAX LOSS (-$300 cap)
  // ═══════════════════════════════════════════════════════════════════════════
  const SETTINGS = {
    // PORTFOLIO
    positionSizePct: 1.0,
    maxPositions: 500,
    scanInterval: 15000,            // Was 35s → 60s (reduce API usage)
    updateInterval: 3000,
    maxTradesPerScan: 3,

    // TOKEN SELECTION — loosened after "0 signals since yesterday" report.
    // Filters were tuned for a high-volume regime and were starving the
    // feed during quieter market phases. Wider MC window, lower score
    // threshold, fewer required buys, and single-scan survivors bring the
    // signal rate back up while still rejecting obvious rug-shapes via
    // GoPlus / RugCheck / GMGN hard gates downstream.
    minScore: 20,                // restore flow first, tighten later
    minMC: 3000,
    maxMC: 200000,               // back up — bias is in the scoring, not the cap
    minLiquidity: 1000,          // was 3000 — sub-$10K pump.fun tokens often have $1-2K liq
    maxPoolAge: 1800,
    minHolders: 15,
    maxTop10Pct: 65,
    maxTopHolderPct: 30,
    requireSocials: false,
    minVolume24h: 1000,          // was 5000 — sub-$10K often <$2K vol
    minBuys10m: 3,
    minLiqToMcRatio: 0.02,       // was 0.06 → 0.04 → 0.02 (2% — was killing too many)
    requireHolderData: false,

    // TAKE PROFIT — Moved up: aim for x2 minimum before any serious secure
    tp0Pct: 50,                  // Was 10 → 50 (small early secure, let it run)
    tp0Sell: 15,                 // Was 30 → 15 (keep most of position for x2)
    tp1Pct: 100,                 // Was 40 → 100 (main secure AT x2)
    tp1Sell: 30,                 // Was 35 → 30 (still keeping most for x3+)
    tp2Pct: 300,                 // Was 150 → 300 (big win at x4)
    tp2Sell: 25,

    // DCA — Still disabled (amplifies losses on rugs)
    dca1Pct: -999,
    dca1Add: 0,
    dca2Pct: -999,
    dca2Add: 0,

    // TRAILING STOP — Don't activate until we're approaching x2
    trailActivation: 60,         // Was 6 → 60 (wait for real momentum first)

    // x2 TARGET MODE — patient hold until the token shows its real potential
    x2MinPeak: 100,              // Require peak >= +100% before peak-drop exits engage
    x2RapidDropPct: -15,         // Rapid-drop sensitivity pre-x2 (was -8, too trigger-happy)
    x2PreTargetSLFloor: -8,      // Break-even / small-loss floor BEFORE hitting x2 (was 0)

    // EXIT RULES — Patient before x2, firm after
    maxHoldQuick: 20,            // Was 12 → 20 (more time to develop)
    maxHoldLong: 60,             // Was 45 → 60
    staleExitMin: 25,            // Was 20 → 25
    staleExitPct: 1.5,
    neverGreenExitMin: 18,       // Was 12 → 18 (give tokens time before giving up)
    peakDropExit: 65,            // Was 55 → 65 (only exit on big drop from peak)
    volumeDropExit: 80,          // Was 70 → 80 (stricter before cutting for volume)
    stopLossPct: -25,            // Was -15 → -25 (breathing room vs normal volatility)
    liqDropExitPct: 30,          // Keep — real rug signal

    // MOON BAG
    moonBagPct: 5,
    moonBagMinScore: 101,
    moonBagStopLoss: -50,

    // ═══ SHANE SIMPSON METHODOLOGY — filtering is the moat, speed is a commodity
    // Deep quality check via GMGN: bundler%, bot%, KOL, smart money, rug ratio.
    // Multi-scan survivor requirement: don't buy fresh sightings, buy confirmed runners.
    gmgnEnabled: true,
    maxBundlerPct: 40,           // Reject tokens with >40% supply held by bundlers
    maxBotTxPct: 50,             // Reject tokens with >50% bot-driven transactions
    maxInsiderPct: 25,           // Reject tokens with >25% insider supply
    maxRugRatio: 0.7,            // Reject if rug probability >= 70%
    minSurvivorScans: 1,         // was 2 — fire signal on first sighting to avoid the 60 s minimum delay
    maxLiqDropBetweenScans: 15,  // Reject survivor if liq dropped >15% between scans
  };
  
  // Caches
  const analyzedCache = new Map();
  const holderCache = new Map();
  const securityCache = new Map();
  const CACHE_DURATION = 30 * 60 * 1000; // 30min cache (was 4min — saves Helius/RugCheck/GoPlus/Claude calls)
  const rugCheckCache = new Map();
  const goPlusCache = new Map();
  const gmgnCache = new Map();

  // Survivor tracking — Shane Simpson methodology: only trade tokens that
  // pass multiple scans with stable liquidity and growing holders.
  // Map: address -> { firstSeen, scans, metrics: [{ time, price, liq, holders, vol }] }
  const survivorTracking = new Map();
  const SURVIVOR_MAX_AGE = 60 * 60 * 1000; // Drop tracking after 1h without re-sight

  // Recent-signal cooldown — block re-signaling the same address within the
  // last hour. Map<address, lastSignalTimestamp>. After 60 min the token
  // becomes eligible again (intentional: a token can run twice on different days).
  const tradedAddresses = new Map();
  const SIGNAL_COOLDOWN_MS = 60 * 60 * 1000;
  const isOnCooldown = (addr) => {
    const t = tradedAddresses.get(addr);
    return typeof t === 'number' && (Date.now() - t < SIGNAL_COOLDOWN_MS);
  };

  // Narrative tracker — bucket recent peak Xs by ticker keyword. Tickers
  // matching a narrative whose 7-day avg peak X is high get a score boost.
  // Cheap heuristic: don't try NLP, just substring-match well-known meta words.
  const NARRATIVE_KEYWORDS = {
    cat:     ['cat', 'kit', 'meow', 'paw', 'purr'],
    dog:     ['dog', 'doge', 'shib', 'inu', 'pup', 'wif', 'bork'],
    pepe:    ['pepe', 'frog'],
    ai:      ['ai', 'gpt', 'agi', 'agent', 'neuro', 'brain'],
    politik: ['trump', 'biden', 'maga', 'elon', 'kamala'],
    food:    ['pizza', 'taco', 'burger', 'sushi', 'cookie'],
  };
  const narrativeStats = new Map(); // narrative -> [{ x, t }]
  const NARRATIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

  function detectNarrative(symbol) {
    const s = (symbol || '').toLowerCase();
    for (const [name, kws] of Object.entries(NARRATIVE_KEYWORDS)) {
      if (kws.some(kw => s.includes(kw))) return name;
    }
    return null;
  }

  function recordNarrativePeak(symbol, peakPct) {
    const narr = detectNarrative(symbol);
    if (!narr) return;
    const peakX = 1 + (peakPct || 0) / 100;
    if (!narrativeStats.has(narr)) narrativeStats.set(narr, []);
    const arr = narrativeStats.get(narr);
    arr.push({ x: peakX, t: Date.now() });
    // Trim to last 7d
    const cutoff = Date.now() - NARRATIVE_WINDOW_MS;
    narrativeStats.set(narr, arr.filter(e => e.t > cutoff));
  }

  function getNarrativeBoost(symbol) {
    const narr = detectNarrative(symbol);
    if (!narr) return 0;
    const stats = (narrativeStats.get(narr) || [])
      .filter(e => Date.now() - e.t < NARRATIVE_WINDOW_MS);
    if (stats.length < 3) return 0; // need a meaningful sample
    const avgX = stats.reduce((s, e) => s + e.x, 0) / stats.length;
    if (avgX >= 5) return 18; // very hot
    if (avgX >= 3) return 10; // hot
    if (avgX >= 2) return 5;  // warm
    return 0;
  }

  // BLACKLIST — symbols/addresses that are known honeypots, rugs, or scams
  const BLACKLISTED_SYMBOLS = new Set(['ROAR', 'Peace', 'PEACE', 'PEPE', 'pepe']);
  const BLACKLISTED_ADDRESSES = new Set([
    // ROAR honeypots
    '5sGn1bJPwywibEW2sZ1CcQ7utSkTPYvrN1snuS2Cmphn',
    '3EcDtV3jbRXQspsSc6HPaDAeVhzaf6cpmyv7EPVzLEmJ',
    '2cs5ewUdoc3VzRXAoxW7iB7CJ4bVkPjcoj1hhLZBjTnX',
    'aikBcUw2tK4yi9yc4tU8yoNs7DuMkGvxGZvPV4KePbR',
    '5yA4gwgdH16h6rvUi77xSGYqwYbg7QjcF3HHvcw1RVzf',
    'BT9dmk1d2r7s7STbuZxJuD8nnJejkyJe7vbs3Co6gUzA',
    'HC43VQEsknC8k1grNFFQS1bRRd8cHqeHeb4qmj1VWE8o',
    '2TiiXArfLWoNB51xU6kSKFgwPoMYyr3suuNgBdubRmvX',
    'DwHzkEY1shpBQFWuUHYWvYYttE1DsjWScMFBjpTzDB9V',
    '2EoizCk3MauYPvgpUBpvcAyGTfD1DdE9Cac9o3MTYqoU',
    'C2q2jQYutie5WSksA9M8PsruVfwDMeebU4rzQfbBvezh',
    'Dh3gx75X6mzMvwjKwPa6sTdkz4qQbQJeYqjxbseeLoTT',
    'DFMbpNTxGzWdM1PyMuquSbYi2CTVK8uwZxdui5msjUqc',
    'Hg8qK7Lj4SSAnhYdm4swvEBGAjBTtu5HT9KUqYjJpump',
    // Peace honeypots
    'HNZWbTacmtr5S1bYdX77qQxM3gRU67xNtmRBVHG5NNUA',
    '9FriKGvYdfeCfUqtbRcBHuSryfSxxiyuWrqvSBay3jXz',
  ]);

  // WATCHLIST — tokens with good fundamentals but bad entry timing
  // Format: { address, pair, score, analysis, addedAt, rechecks }
  const watchlist = new Map();
  const WATCHLIST_RECHECK = 10 * 60 * 1000; // Recheck every 10 min (first hour)
  const WATCHLIST_MAX_AGE = Infinity; // Never expire
  const WATCHLIST_MAX_RECHECKS = Infinity; // No recheck limit
  
  // Dynamic position size (1.5% of current balance)
  function getPositionSize() {
    return Math.floor(state.balance * SETTINGS.positionSizePct / 100);
  }

  // Intervals
  let scanInterval = null;
  let updateInterval = null;
  let uptimeInterval = null;
  let scanning = false;
  
  // WebSocket clients
  const wsClients = new Set();

  // SSE clients (Server-Sent Events) — same broadcasts as WS, plain HTTP
  const sseClients = new Set();
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BROADCAST TO ALL CLIENTS
  // ═══════════════════════════════════════════════════════════════════════════
  function broadcast(type, data) {
    const message = JSON.stringify({ type, data, timestamp: Date.now() });
    
    // WebSocket clients
    wsClients.forEach(ws => {
      try {
        if (ws.readyState === 1) ws.send(message);
      } catch (e) {}
    });

    // SSE clients
    sseClients.forEach(res => {
      try { res.write(`data: ${message}\n\n`); } catch (e) {}
    });
    
    // Telegram broadcast
    if (broadcastFn) {
      try {
        broadcastFn(type, data.action || type, data);
      } catch (e) {}
    }
  }
  
  function broadcastState() {
    broadcast('STATE', getState());
  }
  
  function addLog(icon, text) {
    const entry = {
      time: new Date().toLocaleTimeString('en-US', { hour12: false }),
      icon,
      text,
      timestamp: Date.now()
    };
    state.logs.unshift(entry);
    if (state.logs.length > 300) state.logs.pop();
    broadcast('LOG', entry);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // HELIUS - Holder Distribution
  // ═══════════════════════════════════════════════════════════════════════════
  async function getHolderDistribution(tokenAddress) {
    const cached = holderCache.get(tokenAddress);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) return cached.data;

    // Try each RPC endpoint until one works
    for (const rpcUrl of SOLANA_RPC_ENDPOINTS) {
      if (!rpcUrl || rpcUrl.includes('api_key=')) continue; // Skip empty/unconfigured
      try {
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTokenLargestAccounts',
            params: [tokenAddress]
          }),
          signal: AbortSignal.timeout(5000)
        });
        const data = await res.json();
        if (data.result?.value) {
          const holders = data.result.value;
          const totalSupply = holders.reduce((sum, h) => sum + parseFloat(h.uiAmount || 0), 0);
          const top10 = holders.slice(0, 10);
          const top10Amount = top10.reduce((sum, h) => sum + parseFloat(h.uiAmount || 0), 0);
          const top10Pct = totalSupply > 0 ? (top10Amount / totalSupply) * 100 : 100;
          const topHolderPct = totalSupply > 0 && holders[0] ? (parseFloat(holders[0].uiAmount || 0) / totalSupply) * 100 : 100;

          const result = { totalHolders: holders.length, top10Pct, topHolderPct, isDistributed: top10Pct < 60 && topHolderPct < 30 };
          holderCache.set(tokenAddress, { data: result, timestamp: Date.now() });
          return result;
        }
      } catch (e) {
        // This endpoint failed, try next
        continue;
      }
    }
    return { totalHolders: 0, top10Pct: 100, topHolderPct: 100, isDistributed: false };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // HELIUS - Early Buyers / Smart Money
  // ═══════════════════════════════════════════════════════════════════════════
  async function getEarlyBuyers(tokenAddress) {
    try {
      const res = await fetch(`${HELIUS_API}/addresses/${tokenAddress}/transactions?api-key=${HELIUS_KEY}&type=SWAP&limit=50`, {
        signal: AbortSignal.timeout(8000)
      });
      if (res.ok) {
        const txs = await res.json();
        const earlyBuyers = new Set();
        const buyAmounts = {};
        
        for (const tx of txs.slice(0, 30)) {
          const buyer = tx.feePayer;
          if (buyer) {
            earlyBuyers.add(buyer);
            buyAmounts[buyer] = (buyAmounts[buyer] || 0) + 1;
          }
        }
        
        const whales = Object.entries(buyAmounts)
          .filter(([_, count]) => count >= 2)
          .map(([addr, count]) => ({ address: addr, txCount: count }));
        
        return { earlyBuyerCount: earlyBuyers.size, whales, hasSmartMoney: whales.length > 0 };
      }
    } catch (e) {}
    return { earlyBuyerCount: 0, whales: [], hasSmartMoney: false };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PUMP.FUN - Bonding Curve + Socials
  // ═══════════════════════════════════════════════════════════════════════════
  async function getBondingCurveProgress(tokenAddress) {
    try {
      const res = await fetch(`${PUMP_API}/coins/${tokenAddress}`, {
        signal: AbortSignal.timeout(4000),
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        const virtualSolReserves = parseFloat(data.virtual_sol_reserves) || 0;
        const realSolReserves = parseFloat(data.real_sol_reserves) || 0;
        const totalSol = virtualSolReserves + realSolReserves;
        const curveProgress = Math.min(100, (totalSol / 85) * 100);
        
        // Fix IPFS URLs to use HTTP gateway
        let imageUri = data.image_uri || '';
        if (imageUri.startsWith('ipfs://')) {
          imageUri = imageUri.replace('ipfs://', 'https://ipfs.io/ipfs/');
        } else if (imageUri && !imageUri.startsWith('http')) {
          // Try pump.fun CDN for relative paths
          imageUri = `https://pump.mypinata.cloud/ipfs/${imageUri}`;
        }
        
        return {
          progress: curveProgress,
          completed: curveProgress >= 100 || data.complete,
          hasSocials: !!(data.twitter || data.telegram || data.website),
          twitter: data.twitter,
          telegram: data.telegram,
          website: data.website,
          imageUri
        };
      }
    } catch (e) {}
    return { progress: 0, completed: false, hasSocials: false };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // COINGECKO - Security Info
  // ═══════════════════════════════════════════════════════════════════════════
  async function getCoinGeckoSecurity(tokenAddress, chain = 'solana') {
    const cached = securityCache.get(tokenAddress);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) return cached.data;

    try {
      const cgPlatform = chain === 'ethereum' ? 'ethereum' : 'solana';
      const res = await fetch(`${COINGECKO_API}/coins/${cgPlatform}/contract/${tokenAddress}`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        const result = {
          found: true,
          name: data.name,
          trustScore: data.tickers?.[0]?.trust_score || 'unknown',
          communityScore: data.community_score || 0,
          twitterFollowers: data.community_data?.twitter_followers || 0
        };
        securityCache.set(tokenAddress, { data: result, timestamp: Date.now() });
        return result;
      }
    } catch (e) {}
    return { found: false, trustScore: 'unknown', communityScore: 0 };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FULL TOKEN ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════════════
  // RUGCHECK.XYZ — Solana token safety analysis
  // ═══════════════════════════════════════════════════════════════════════════
  async function getRugCheck(tokenAddress) {
    const cached = rugCheckCache.get(tokenAddress);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) return cached.data;
    try {
      const res = await fetch(`https://api.rugcheck.xyz/v1/tokens/${tokenAddress}/report/summary`, {
        signal: AbortSignal.timeout(5000),
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        return {
          found: true,
          score: data.score || 0,                    // 0 = safe, higher = riskier
          risks: data.risks || [],                    // Array of risk descriptions
          tokenMeta: data.tokenMeta || {},
          topHolders: data.topHolders || [],
          totalMarketLiquidity: data.totalMarketLiquidity || 0,
          mintAuthority: data.mintAuthority || null,
          freezeAuthority: data.freezeAuthority || null,
        };
        rugCheckCache.set(tokenAddress, { data: result, timestamp: Date.now() });
        return result;
      }
    } catch (e) {}
    return { found: false, score: 0, risks: [] };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GOPLUS SECURITY — Honeypot & scam detection (multi-chain)
  // ═══════════════════════════════════════════════════════════════════════════
  async function getGoPlusSecurity(tokenAddress, chain) {
    const cacheKey = `${chain}_${tokenAddress}`;
    const cached = goPlusCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) return cached.data;
    try {
      const chainId = chain === 'ethereum' ? '1' : chain === 'bsc' ? '56' : chain === 'base' ? '8453' : 'solana';
      const url = chainId === 'solana'
        ? `https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=${tokenAddress}`
        : `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${tokenAddress}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        const info = data.result?.[tokenAddress.toLowerCase()] || data.result?.[tokenAddress] || {};
        return {
          found: true,
          isHoneypot: info.is_honeypot === '1',
          hasHiddenOwner: info.hidden_owner === '1',
          canTakeBackOwnership: info.can_take_back_ownership === '1',
          cannotSellAll: info.cannot_sell_all === '1',
          isBlacklisted: info.is_blacklisted === '1',
          isMintable: info.is_mintable === '1',
          sellTax: parseFloat(info.sell_tax) || 0,
          buyTax: parseFloat(info.buy_tax) || 0,
          holderCount: parseInt(info.holder_count) || 0,
          lpHolderCount: parseInt(info.lp_holder_count) || 0,
          ownerAddress: info.owner_address || '',
        };
        goPlusCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
      }
    } catch (e) {}
    return { found: false, isHoneypot: false };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GMGN DEEP QUALITY — bundler%, bot%, KOL, smart money, rug ratio, whales
  // The core of Shane Simpson's methodology: separate real runners from noise
  // ═══════════════════════════════════════════════════════════════════════════
  async function getGMGNTokenInfo(tokenAddress, chain = 'solana') {
    const cached = gmgnCache.get(tokenAddress);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) return cached.data;
    try {
      const gChain = chain === 'ethereum' ? 'eth' : chain === 'base' ? 'base' : chain === 'bsc' ? 'bsc' : 'sol';
      const url = `${GMGN_API}/tokens/${gChain}/${tokenAddress}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
      });
      if (res.ok) {
        const json = await res.json();
        const d = json?.data?.token || json?.data || {};
        const result = {
          found: true,
          bundlerPct: parseFloat(d.bundler_supply_pct ?? d.bundler_holder_ratio ?? 0) * (d.bundler_holder_ratio ? 100 : 1),
          botTxPct: parseFloat(d.bot_tx_ratio ?? d.bot_ratio ?? 0) * (d.bot_tx_ratio && d.bot_tx_ratio <= 1 ? 100 : 1),
          insiderPct: parseFloat(d.insider_holder_ratio ?? d.insider_pct ?? 0) * (d.insider_holder_ratio && d.insider_holder_ratio <= 1 ? 100 : 1),
          kolCount: parseInt(d.kol_count ?? d.kols ?? 0) || 0,
          smartMoneyCount: parseInt(d.smart_money_count ?? d.smart_wallets ?? 0) || 0,
          whaleCount: parseInt(d.whale_count ?? d.whales ?? 0) || 0,
          holderGrowth1h: parseFloat(d.holder_change_1h ?? d.holder_growth_1h ?? 0),
          rugRatio: parseFloat(d.rug_ratio ?? d.rug_risk ?? 0),
          entrapmentRatio: parseFloat(d.entrapment_ratio ?? 0),
          socialDuplicates: parseInt(d.twitter_reuse_count ?? d.social_duplicates ?? 0) || 0,
          washTradePct: parseFloat(d.wash_trading_ratio ?? 0) * (d.wash_trading_ratio && d.wash_trading_ratio <= 1 ? 100 : 1),
        };
        gmgnCache.set(tokenAddress, { data: result, timestamp: Date.now() });
        return result;
      }
    } catch (e) {}
    return { found: false };
  }

  async function analyzeTokenComplete(tokenAddress, pair) {
    const analysis = {
      score: 40,
      safe: true,
      reasons: [],
      holders: null,
      bondingCurve: null,
      earlyBuyers: null,
      security: null,
      rugCheck: null,
      goPlus: null,
      hasSocials: false,
      imageUri: null
    };
    
    const mc = parseFloat(pair.marketCap) || 0;
    const liq = parseFloat(pair.liquidity?.usd) || 0;
    const chg5m = parseFloat(pair.priceChange?.m5) || 0;
    const chg1h = parseFloat(pair.priceChange?.h1) || 0;
    const buys5m = pair.txns?.m5?.buys || 0;
    const sells5m = pair.txns?.m5?.sells || 0;
    const buys1h = pair.txns?.h1?.buys || 0;
    const sells1h = pair.txns?.h1?.sells || 0;
    
    // HONEYPOT CHECK — more lenient
    if (sells5m === 0 && buys5m > 15) {
      analysis.safe = false;
      analysis.reasons.push('🚨 Honeypot: 0 sells');
      return analysis;
    }
    if (sells1h === 0 && buys1h > 30) {
      analysis.safe = false;
      analysis.reasons.push('🚨 Honeypot: 0 sells 1h');
      return analysis;
    }
    
    // PUMP CHECK — more lenient
    if (chg5m > 400 || chg1h > 800) {
      analysis.safe = false;
      analysis.reasons.push('🚨 Pump & Dump risk');
      return analysis;
    }

    // DEAD TOKEN CHECK — very lenient
    const buys10m = (pair.txns?.m5?.buys || 0) * 2;
    if (buys10m < 1) {
      analysis.safe = false;
      analysis.reasons.push(`🚨 Dead token (${buys10m} buys/10m)`);
      return analysis;
    }

    // DUMP CHECK — only reject extreme dumps
    const chg6h = parseFloat(pair.priceChange?.h6) || 0;
    const chg24h = parseFloat(pair.priceChange?.h24) || 0;
    if (chg5m < -15 && chg1h < -30 && chg6h < -50) {
      analysis.safe = false;
      analysis.reasons.push('🚨 Freefall (all timeframes red)');
      return analysis;
    }
    // Only reject severe crashes
    if (chg1h < -50 && chg5m < -10) {
      analysis.safe = false;
      analysis.reasons.push('🚨 Crash (-50% 1h, no bounce)');
      return analysis;
    }

    // MC Scoring — heavy bias toward sub-$50K (where x10+ gems live)
    // but mid-range still scores positively so signal flow doesn't dry up.
    if (mc >= 5000 && mc < 10000) analysis.score += 35;          // Sweet spot
    else if (mc >= 3000 && mc < 5000) analysis.score += 30;      // Earliest
    else if (mc >= 10000 && mc <= 30000) analysis.score += 32;   // Best x10+ bucket
    else if (mc > 30000 && mc <= 50000) analysis.score += 25;    // Solid x3-5
    else if (mc > 50000 && mc <= 80000) analysis.score += 15;    // OK if other signals strong
    else if (mc > 80000 && mc <= 150000) analysis.score += 5;    // Mid — needs strong fundamentals
    else if (mc > 150000) analysis.score -= 10;                  // Mature — penalty
    
    // Liquidity — adjusted for lower thresholds
    if (liq >= 15000) analysis.score += 15;
    else if (liq >= 8000) analysis.score += 12;
    else if (liq >= 5000) analysis.score += 8;
    else if (liq >= 3000) analysis.score += 5;
    
    const liqRatio = mc > 0 ? (liq / mc) * 100 : 0;
    // Anti-rug: reject if liquidity too low relative to MC
    if (SETTINGS.minLiqToMcRatio && liqRatio < SETTINGS.minLiqToMcRatio * 100) {
      analysis.safe = false;
      analysis.reasons.push(`🚨 Low liq ratio ${liqRatio.toFixed(0)}% (min ${(SETTINGS.minLiqToMcRatio*100).toFixed(0)}%)`);
      return analysis;
    }
    if (liqRatio >= 5 && liqRatio <= 20) analysis.score += 8;
    
    // Buy ratio — healthy tokens have both buys AND sells
    const total5m = buys5m + sells5m;
    const buyRatio = total5m > 0 ? (buys5m / total5m) * 100 : 50;
    const total1h = buys1h + sells1h;
    const sellRatio1h = total1h > 0 ? (sells1h / total1h) * 100 : 0;

    if (buyRatio >= 40 && buyRatio < 75) analysis.score += 10;

    // Healthy sell activity = NOT a honeypot (sells prove you can exit)
    if (sells1h >= 10 && sellRatio1h >= 20) {
      analysis.score += 10;
      analysis.reasons.push(`✅ Sells OK (${sells1h} sells 1h)`);
    } else if (sells1h < 3 && buys1h > 10) {
      analysis.score -= 15;  // Very suspicious — lots of buys, almost no sells
      analysis.reasons.push(`⚠️ Low sells (${sells1h}/${buys1h})`);
    }

    // Momentum — prefer steady growth over pumps
    if (chg5m > 1 && chg5m < 15) analysis.score += 10;  // Steady up
    else if (chg5m > 15 && chg5m < 50) analysis.score += 4; // Fast but risky
    if (chg1h > 5 && chg1h < 50) analysis.score += 6;
    if (chg1h > 100) analysis.score -= 10; // Over-pumped

    // Volume scoring
    const vol24h = parseFloat(pair.volume?.h24) || 0;
    if (vol24h >= 50000) analysis.score += 15;
    else if (vol24h >= 20000) analysis.score += 12;
    else if (vol24h >= 10000) analysis.score += 8;
    else if (vol24h >= 5000) analysis.score += 5;

    // Volume/MC ratio — higher = more active trading
    const volMcRatio = mc > 0 ? vol24h / mc : 0;
    if (volMcRatio >= 2) analysis.score += 8;       // Very active
    else if (volMcRatio >= 1) analysis.score += 5;  // Good activity
    else if (volMcRatio < 0.1) analysis.score -= 5; // Dead trading

    // Smart entry — prefer dips, penalize pumps
    if (chg5m < 0 && chg1h > 5) {
      analysis.score += 12;
      analysis.reasons.push('📉 Dip entry (5m red, 1h green)');
    }
    // Consolidation entry — flat 5m after green 1h = good entry
    if (Math.abs(chg5m) < 3 && chg1h > 10 && chg1h < 50) {
      analysis.score += 8;
      analysis.reasons.push('📊 Consolidating after pump');
    }
    // HARD REJECT active pumps >30% in 5m
    if (chg5m > 30) {
      analysis.safe = false;
      analysis.reasons.push('🚨 Pump reject (5m +' + chg5m.toFixed(0) + '%)');
      return analysis;
    }
    if (chg5m > 15) {
      analysis.score -= 20;  // Strong penalty for moderate pumps
      analysis.reasons.push('⚠️ Pump penalty (5m +' + chg5m.toFixed(0) + '%)');
    }
    
    // CHAIN-SPECIFIC ANALYSIS
    const isSolana = pair.chainId === 'solana';

    // HELIUS HOLDER ANALYSIS — Solana only (Helius API is Solana-specific)
    if (isSolana) {
      analysis.holders = await getHolderDistribution(tokenAddress);

      // Anti-honeypot: reject if no holder data AND suspicious liq ratio (liq > MC)
      // Honeypot tokens often have artificially high liquidity to lure buyers
      if (analysis.holders.totalHolders === 0 && liq > mc * 1.2) {
        analysis.safe = false;
        analysis.reasons.push('🚨 Honeypot suspect (no holders + liq > MC)');
        return analysis;
      }
      // Anti-rug: reject if holder data unavailable (can't verify distribution)
      if (SETTINGS.requireHolderData && analysis.holders.totalHolders === 0) {
        analysis.safe = false;
        analysis.reasons.push('🚨 No holder data (possible rug)');
        return analysis;
      }

      if (analysis.holders.totalHolders > 0) {
        // Hard reject — tightened to restore flow. Original was 80%/40%,
        // we trialed 70%/35% but combined with other filters it killed
        // signal flow. 80%/40% catches the worst rug-bait while letting
        // healthy meme distribution through.
        if (analysis.holders.top10Pct > 80) {
          analysis.safe = false;
          analysis.reasons.push(`🚨 Top10 hold ${analysis.holders.top10Pct.toFixed(0)}%`);
          return analysis;
        }
        if (analysis.holders.topHolderPct > 40) {
          analysis.safe = false;
          analysis.reasons.push(`🚨 Top holder ${analysis.holders.topHolderPct.toFixed(0)}%`);
          return analysis;
        }
        if (analysis.holders.totalHolders < 10) {
          analysis.score -= 10;
          analysis.reasons.push(`⚠️ Only ${analysis.holders.totalHolders} holders`);
        }

        if (analysis.holders.isDistributed) {
          analysis.score += 15;
          analysis.reasons.push('✅ Well distributed');
        } else if (analysis.holders.top10Pct > 60) {
          // Heavy penalty in the 60-70% danger zone — not enough to reject
          // alone but enough to drop most candidates below minScore.
          analysis.score -= 15;
          analysis.reasons.push(`⚠️ Top10: ${analysis.holders.top10Pct.toFixed(0)}%`);
        }
        if (analysis.holders.topHolderPct > 30) analysis.score -= 5;
      }
    }

    // PUMP.FUN BONDING CURVE — Solana only
    if (isSolana) {
      analysis.bondingCurve = await getBondingCurveProgress(tokenAddress);
      analysis.imageUri = analysis.bondingCurve.imageUri;

      if (analysis.bondingCurve.progress > 0) {
        // Data: still-bonding tokens win more (43% vs 28%). Reward early curve, not late.
        if (analysis.bondingCurve.progress < 50) {
          analysis.score += 12;
          analysis.reasons.push(`📈 Early curve: ${analysis.bondingCurve.progress.toFixed(0)}%`);
        } else if (analysis.bondingCurve.progress < 90) {
          analysis.score += 8;
          analysis.reasons.push(`📈 Curve: ${analysis.bondingCurve.progress.toFixed(0)}%`);
        } else if (analysis.bondingCurve.progress < 100) {
          analysis.score += 3;
        }
        // hasSocials kept as a flag but no longer scored — data says it is neutral/negative.
        if (analysis.bondingCurve.hasSocials) {
          analysis.hasSocials = true;
          analysis.reasons.push('🐦 Has socials');
        }
      }

      // EARLY BUYERS — Solana only
      analysis.earlyBuyers = await getEarlyBuyers(tokenAddress);
      if (analysis.earlyBuyers.hasSmartMoney) {
        analysis.score += 10;
        analysis.reasons.push(`🐋 ${analysis.earlyBuyers.whales.length} whales`);
        // Data: ≥5 whales nearly doubles win rate. Tier bonus.
        if (analysis.earlyBuyers.whales.length >= 5) {
          analysis.score += 12;
          analysis.reasons.push('🐋🐋 5+ whales');
        }
      }
    }

    // ETH tokens: check DexScreener socials info instead
    if (!isSolana) {
      try {
        const info = pair.info || {};
        if (info.socials && info.socials.length > 0) {
          analysis.hasSocials = true;
          analysis.reasons.push('🐦 Has socials');
        }
        if (info.websites && info.websites.length > 0) {
          analysis.score += 5;
          analysis.reasons.push('🌐 Has website');
        }
      } catch (e) {}
      // ETH tokens get a small base bonus for being on a more established chain
      analysis.score += 5;
      analysis.reasons.push(`⛓ ${pair.chainId.toUpperCase()}`);
    }

    // HARD REJECT: no socials if required (Solana only — ETH tokens may not have pump.fun socials)
    if (isSolana && SETTINGS.requireSocials && !analysis.hasSocials) {
      analysis.safe = false;
      analysis.reasons.push('🚨 No socials (required)');
      return analysis;
    }

    // COINGECKO SECURITY — works for all chains
    const cgChain = isSolana ? 'solana' : 'ethereum';
    analysis.security = await getCoinGeckoSecurity(tokenAddress, cgChain);

    if (analysis.security.found) {
      analysis.score += 10;
      analysis.reasons.push('✅ CoinGecko listed');
      if (analysis.security.trustScore === 'green') analysis.score += 5;
    }

    // RUGCHECK.XYZ — Solana token safety (runs in parallel with GoPlus)
    const [rugCheck, goPlus] = await Promise.all([
      isSolana ? getRugCheck(tokenAddress) : Promise.resolve({ found: false }),
      getGoPlusSecurity(tokenAddress, pair.chainId),
    ]);

    // RugCheck analysis
    analysis.rugCheck = rugCheck;
    if (rugCheck.found) {
      if (rugCheck.score >= 500) {
        analysis.safe = false;
        analysis.reasons.push(`🚨 RugCheck DANGER (score ${rugCheck.score})`);
        return analysis;
      }
      if (rugCheck.score >= 300) {
        analysis.score -= 25;
        analysis.reasons.push(`⚠️ RugCheck risky (${rugCheck.score})`);
      }
      if (rugCheck.mintAuthority) {
        analysis.score -= 10;
        analysis.reasons.push('⚠️ Mint not renounced');
      }
      if (rugCheck.freezeAuthority) {
        analysis.score -= 10;
        analysis.reasons.push('⚠️ Freeze authority active');
      }
      if (rugCheck.score < 100 && !rugCheck.mintAuthority && !rugCheck.freezeAuthority) {
        analysis.score += 10;
        analysis.reasons.push('✅ RugCheck safe');
      }
    }

    // GoPlus Security analysis
    analysis.goPlus = goPlus;
    if (goPlus.found) {
      if (goPlus.isHoneypot) {
        analysis.safe = false;
        analysis.reasons.push('🚨 HONEYPOT (GoPlus)');
        return analysis;
      }
      if (goPlus.cannotSellAll) {
        analysis.safe = false;
        analysis.reasons.push('🚨 Cannot sell (GoPlus)');
        return analysis;
      }
      if (goPlus.sellTax > 10) {
        analysis.safe = false;
        analysis.reasons.push(`🚨 Sell tax ${goPlus.sellTax}% (GoPlus)`);
        return analysis;
      }
      if (goPlus.isMintable) {
        analysis.score -= 10;
        analysis.reasons.push('⚠️ Mintable (GoPlus)');
      }
      if (goPlus.hasHiddenOwner) {
        analysis.score -= 10;
        analysis.reasons.push('⚠️ Hidden owner');
      }
      if (goPlus.holderCount > 0) {
        analysis.score += 5;
        analysis.reasons.push(`👥 ${goPlus.holderCount} holders (GoPlus)`);
      }
      if (!goPlus.isHoneypot && !goPlus.cannotSellAll && goPlus.sellTax <= 5) {
        analysis.score += 8;
        analysis.reasons.push('✅ GoPlus safe');
      }
    }

    // ═══ GMGN DEEP QUALITY — the moat (Shane Simpson methodology) ═══
    // Runs last, can reject or boost score based on on-chain behavioral data.
    if (SETTINGS.gmgnEnabled) {
      analysis.gmgn = await getGMGNTokenInfo(tokenAddress, pair.chainId);
      if (analysis.gmgn.found) {
        // ── HARD REJECTS — untradeable (bundled / botted / rug-shaped) ──
        if (analysis.gmgn.bundlerPct >= SETTINGS.maxBundlerPct) {
          analysis.safe = false;
          analysis.reasons.push(`🚨 Bundler ${analysis.gmgn.bundlerPct.toFixed(0)}% (GMGN)`);
          return analysis;
        }
        if (analysis.gmgn.botTxPct >= SETTINGS.maxBotTxPct) {
          analysis.safe = false;
          analysis.reasons.push(`🚨 Bot tx ${analysis.gmgn.botTxPct.toFixed(0)}% (GMGN)`);
          return analysis;
        }
        if (analysis.gmgn.insiderPct >= SETTINGS.maxInsiderPct) {
          analysis.safe = false;
          analysis.reasons.push(`🚨 Insiders ${analysis.gmgn.insiderPct.toFixed(0)}% (GMGN)`);
          return analysis;
        }
        if (analysis.gmgn.rugRatio >= SETTINGS.maxRugRatio) {
          analysis.safe = false;
          analysis.reasons.push(`🚨 Rug risk ${(analysis.gmgn.rugRatio * 100).toFixed(0)}% (GMGN)`);
          return analysis;
        }
        if (analysis.gmgn.washTradePct >= 60) {
          analysis.safe = false;
          analysis.reasons.push(`🚨 Wash ${analysis.gmgn.washTradePct.toFixed(0)}% (GMGN)`);
          return analysis;
        }
        if (analysis.gmgn.socialDuplicates >= 3) {
          analysis.score -= 15;
          analysis.reasons.push(`⚠️ Social dup ×${analysis.gmgn.socialDuplicates}`);
        }
        // ── BOOSTS — real runner signals (KOL / smart money / whales / growth) ──
        if (analysis.gmgn.kolCount > 0) {
          analysis.score += Math.min(15, 6 + analysis.gmgn.kolCount * 3);
          analysis.reasons.push(`📣 ${analysis.gmgn.kolCount} KOL (GMGN)`);
        }
        if (analysis.gmgn.smartMoneyCount >= 2) {
          analysis.score += Math.min(15, analysis.gmgn.smartMoneyCount * 4);
          analysis.reasons.push(`🧠 ${analysis.gmgn.smartMoneyCount} smart money`);
        }
        if (analysis.gmgn.whaleCount >= 1) {
          analysis.score += Math.min(10, analysis.gmgn.whaleCount * 4);
          analysis.reasons.push(`🐋 ${analysis.gmgn.whaleCount} whale (GMGN)`);
        }
        if (analysis.gmgn.holderGrowth1h >= 20) {
          analysis.score += 10;
          analysis.reasons.push(`📈 Holders +${analysis.gmgn.holderGrowth1h.toFixed(0)}/h`);
        } else if (analysis.gmgn.holderGrowth1h < 0) {
          analysis.score -= 8;
          analysis.reasons.push(`📉 Holders ${analysis.gmgn.holderGrowth1h.toFixed(0)}/h`);
        }
      }
    }

    // Narrative boost — reward tickers matching recently-hot meta narratives
    const narrSymbol = pair?.baseToken?.symbol || '';
    const narrBoost = getNarrativeBoost(narrSymbol);
    if (narrBoost > 0) {
      analysis.score += narrBoost;
      analysis.reasons.push(`🌊 Narrative boost +${narrBoost} (${detectNarrative(narrSymbol)} hot)`);
    }

    analysis.score = Math.min(150, Math.max(0, Math.round(analysis.score)));

    return analysis;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AI TRADE CONFIRMATION — Ask Claude before buying
  // ═══════════════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════════════
  // MULTI-AGENT AI SYSTEM — 3 specialized agents
  // ═══════════════════════════════════════════════════════════════════════════

  async function callAgent(systemPrompt, userPrompt, maxTokens = 30) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        }),
        signal: AbortSignal.timeout(10000)
      });
      const data = await res.json();
      return (data.content?.[0]?.text || '').trim();
    } catch (e) { return ''; }
  }

  function buildTokenData(pair) {
    const symbol = pair.baseToken?.symbol || '???';
    const chain = pair.chainId || 'solana';
    const mc = parseFloat(pair.marketCap) || 0;
    const liq = parseFloat(pair.liquidity?.usd) || 0;
    const vol = parseFloat(pair.volume?.h24) || 0;
    const chg5m = parseFloat(pair.priceChange?.m5) || 0;
    const chg1h = parseFloat(pair.priceChange?.h1) || 0;
    const chg6h = parseFloat(pair.priceChange?.h6) || 0;
    const chg24h = parseFloat(pair.priceChange?.h24) || 0;
    const buys5m = pair.txns?.m5?.buys || 0;
    const sells5m = pair.txns?.m5?.sells || 0;
    const buys1h = pair.txns?.h1?.buys || 0;
    const sells1h = pair.txns?.h1?.sells || 0;
    const liqRatio = mc > 0 ? ((liq / mc) * 100).toFixed(1) : '0';
    const volMcRatio = mc > 0 ? (vol / mc).toFixed(2) : '0';

    return { symbol, chain, mc, liq, vol, chg5m, chg1h, chg6h, chg24h, buys5m, sells5m, buys1h, sells1h, liqRatio, volMcRatio,
      text: `$${symbol} | ${chain} | MC:$${formatNumber(mc)} | Liq:$${formatNumber(liq)} (${liqRatio}% of MC) | Vol:$${formatNumber(vol)} (${volMcRatio}x MC) | 5m:${chg5m>0?'+':''}${chg5m.toFixed(1)}% | 1h:${chg1h>0?'+':''}${chg1h.toFixed(1)}% | 6h:${chg6h>0?'+':''}${chg6h.toFixed(1)}% | 24h:${chg24h>0?'+':''}${chg24h.toFixed(1)}% | Buys5m:${buys5m} Sells5m:${sells5m} | Buys1h:${buys1h} Sells1h:${sells1h}`
    };
  }

  // AGENT 1: SCOUT — "Is this token worth trading?"
  async function agentScout(pair) {
    const d = buildTokenData(pair);
    const answer = await callAgent(
      `You are an aggressive meme coin SCOUT. Your job is to find pumping tokens EARLY.
SAY BUY for: any token with positive momentum, active volume, buy pressure, dip after pump, new token with activity, consolidating tokens. You want to catch pumps early — if it's moving, BUY IT.
SAY SKIP ONLY for: literally crashing -30%+ right now, zero volume, or 100% pump already happened in 5min (already too late).
Default answer is BUY. You are a degen. You buy first, ask questions later.
Reply "BUY" or "SKIP" + max 5 words:`,
      d.text
    );
    const isBuy = !answer.toUpperCase().includes('SKIP');
    addLog('🔍', `SCOUT: ${isBuy ? 'BUY' : 'SKIP'} $${d.symbol} — ${answer.replace(/^(BUY|SKIP)\s*/i, '').slice(0, 40)}`);
    return { buy: isBuy, reason: answer };
  }

  // AGENT 2: SECURITY — "Is this a scam?" (enriched with RugCheck + GoPlus data)
  async function agentSecurity(pair, analysis) {
    const d = buildTokenData(pair);

    // Build security context from all sources
    let securityData = `${d.text} | SellRatio1h: ${d.sells1h > 0 ? ((d.sells1h / (d.buys1h + d.sells1h)) * 100).toFixed(0) : 0}%`;

    if (analysis?.rugCheck?.found) {
      const rc = analysis.rugCheck;
      securityData += ` | RugCheck: score=${rc.score} mint=${rc.mintAuthority ? 'YES' : 'renounced'} freeze=${rc.freezeAuthority ? 'YES' : 'none'} risks=${rc.risks.length}`;
    }
    if (analysis?.goPlus?.found) {
      const gp = analysis.goPlus;
      securityData += ` | GoPlus: honeypot=${gp.isHoneypot} cantSell=${gp.cannotSellAll} sellTax=${gp.sellTax}% mintable=${gp.isMintable} holders=${gp.holderCount}`;
    }
    if (analysis?.holders?.totalHolders > 0) {
      securityData += ` | Holders: top10=${analysis.holders.top10Pct.toFixed(0)}% topHolder=${analysis.holders.topHolderPct.toFixed(0)}% total=${analysis.holders.totalHolders}`;
    }

    const answer = await callAgent(
      `You are a meme coin SECURITY checker. Most meme coins are volatile with low liquidity — that's NORMAL, not dangerous.
SAY DANGER ONLY for CONFIRMED scams: GoPlus honeypot=true, cantSell=true, sellTax>5%, RugCheck score>400, freeze authority active on low-holder token.
SAY SAFE for everything else. Low liquidity, volatility, high price changes are NORMAL for meme coins. Don't reject tokens just because they're risky — that's the nature of meme trading.
Default answer is SAFE. Only block confirmed scams.
Reply "SAFE" or "DANGER" + max 5 words:`,
      securityData
    );
    const isSafe = !answer.toUpperCase().includes('DANGER');
    addLog('🛡️', `SECURITY: ${isSafe ? 'SAFE' : 'DANGER'} $${d.symbol} — ${answer.replace(/^(SAFE|DANGER)\s*/i, '').slice(0, 40)}`);
    return { safe: isSafe, reason: answer };
  }

  // AGENT 3: EXIT — "Should I sell this position now?"
  async function agentExit(pos) {
    try {
      const res = await cachedDexFetch(`${DEX_API}/latest/dex/pairs/${pos.chain || 'solana'}/${pos.pairAddress}`, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      if (!data.pair) return { sell: false, reason: 'no data' };
      const pair = data.pair;
      const d = buildTokenData(pair);
      const holdMin = Math.floor((Date.now() - pos.entryTime) / 60000);

      const answer = await callAgent(
        `You are a crypto EXIT agent. Your DEFAULT answer is HOLD. Only SELL if you see STRONG evidence the pump is over and recovery is unlikely.

BIAS: On pump.fun / memecoin trades, patience captures 10x–100x runners. Premature exits kill the strategy. A token can dip 30-50% from peak and then go to a new ATH. HOLD is almost always correct.

SELL only if ALL of these are true:
- Position held >30min AND PnL is flat or red
- 5m change is deeply negative (<-15%)
- Sells >> buys in the last 5m (ratio > 2x)
- Volume is collapsing vs 1h average
- Peak was >50% above current and price keeps dropping

HOLD in all other cases, including:
- Healthy uptrend, even with minor dips
- Sideways consolidation with positive buy ratio
- Any position in strong profit (>50%) with active volume
- Just entered (<15min hold)
- Recent pullback but buy pressure returning

Reply ONLY "SELL" or "HOLD" followed by max 5 words reason.`,
        `${d.text} | Held:${holdMin}min | PnL:${pos.pnlPct.toFixed(1)}% | Peak:${pos.highestPnlPct.toFixed(1)}% | TP:${pos.tpLevel}`
      );
      const isSell = answer.toUpperCase().includes('SELL');
      if (isSell) addLog('🤖', `EXIT AGENT: SELL $${pos.symbol} — ${answer.replace(/^(SELL|HOLD)\s*/i, '').slice(0, 40)}`);
      return { sell: isSell, reason: answer };
    } catch (e) { return { sell: false, reason: 'error' }; }
  }

  // COMBINED: Run Scout + Security agents before buying
  async function aiConfirmTrade(pair, analysis) {
    try {
      const symbol = pair.baseToken?.symbol || '???';

      // Agent 1: Scout — is it worth trading?
      const scout = await agentScout(pair);
      if (!scout.buy) return false;

      // Agent 2: Security — is it safe? (enriched with RugCheck + GoPlus data)
      const security = await agentSecurity(pair, analysis);
      if (!security.safe) return false;

      addLog('✅', `AGENTS APPROVED $${symbol}`);
      return true;
    } catch (e) {
      return true; // If agents fail, default to BUY
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENTRY QUALITY CHECK - Is this a good moment to buy?
  // Returns: { good: true/false, reason: '...', watchlist: true/false }
  // ═══════════════════════════════════════════════════════════════════════════
  function checkEntryQuality(pair) {
    const chg5m = parseFloat(pair.priceChange?.m5) || 0;
    const chg1h = parseFloat(pair.priceChange?.h1) || 0;

    // Anti-pump-déjà-fait — calling a token that already pumped >50% in the last
    // hour means we'd enter near peak. Skip outright (not even watchlisted).
    if (chg1h > 50) return { good: false, reason: 'Already pumped +' + chg1h.toFixed(0) + '% in 1h — too late', watchlist: false };

    const buys5m = pair.txns?.m5?.buys || 0;
    const sells5m = pair.txns?.m5?.sells || 0;
    const total5m = buys5m + sells5m;
    const buyRatio5m = total5m > 0 ? (buys5m / total5m) * 100 : 50;

    // ❌ ONLY DROP if absolutely dead (0 activity)
    if (total5m === 0 && buys5m === 0 && sells5m === 0) return { good: false, reason: 'Dead token', watchlist: false };

    // ✅ IDEAL ENTRIES - trade immediately
    if (chg5m < 0 && chg5m > -15 && chg1h > 5) return { good: true, reason: 'Dip entry: 5m ' + chg5m.toFixed(0) + '%, 1h +' + chg1h.toFixed(0) + '%' };
    if (chg5m > 0 && chg5m < 15 && buyRatio5m > 45) return { good: true, reason: 'Steady up: +' + chg5m.toFixed(0) + '% 5m, buys ' + buyRatio5m.toFixed(0) + '%' };
    if (Math.abs(chg5m) < 5 && buyRatio5m > 50) return { good: true, reason: 'Consolidating, buys ' + buyRatio5m.toFixed(0) + '%' };
    if (chg1h === 0 && buys5m > 2) return { good: true, reason: 'Fresh token, active buys' };

    // 🟡 EVERYTHING ELSE -> WATCHLIST (pump, crash, sell pressure, uncertain)
    return { good: false, reason: '5m ' + chg5m.toFixed(0) + '%, buys ' + buyRatio5m.toFixed(0) + '%', watchlist: true };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WATCHLIST RECHECK — Re-evaluate tokens every 10 minutes
  // ═══════════════════════════════════════════════════════════════════════════
  async function recheckWatchlist() {
    if (watchlist.size === 0) return;

    const now = Date.now();
    const toRemove = [];

    for (const [address, item] of watchlist) {
      // Too old or too many rechecks → drop
      if (now - item.addedAt > WATCHLIST_MAX_AGE || item.rechecks >= WATCHLIST_MAX_RECHECKS) {
        toRemove.push(address);
        continue;
      }
      // Not ready for recheck yet
      // Progressive recheck: 10min for first hour, then 30min after
      const age = now - item.addedAt;
      const recheckDelay = age < 60 * 60 * 1000 ? WATCHLIST_RECHECK : 30 * 60 * 1000;
      if (now - item.lastCheck < recheckDelay) continue;

      // Already in position or traded
      if (state.positions.find(p => p.address === address)) { toRemove.push(address); continue; }
      if (isOnCooldown(address)) { toRemove.push(address); continue; }
      // Blacklist check on watchlist
      const wlSymbol = item.pair?.baseToken?.symbol || '';
      if (BLACKLISTED_SYMBOLS.has(wlSymbol) || BLACKLISTED_ADDRESSES.has(address)) { toRemove.push(address); continue; }
      if (state.balance < getPositionSize()) continue;
      if (state.positions.length >= SETTINGS.maxPositions) continue;

      try {
        // Re-fetch fresh data
        const res = await cachedDexFetch(`${DEX_API}/latest/dex/tokens/${address}`, { signal: AbortSignal.timeout(4000) });
        const data = await res.json();
        const pair = data.pairs && data.pairs[0];
        if (!pair) { toRemove.push(address); continue; }

        item.rechecks++;
        item.lastCheck = now;

        const currentPrice = parseFloat(pair.priceUsd) || 0;

        // Auto-remove dead watchlist tokens (crashed >50% from initial price)
        if (item.initialPrice > 0 && currentPrice > 0) {
          const dropFromInitial = ((item.initialPrice - currentPrice) / item.initialPrice) * 100;
          if (dropFromInitial > 50) {
            toRemove.push(address);
            addLog('💀', `WATCHLIST DEAD $${pair.baseToken?.symbol} (-${dropFromInitial.toFixed(0)}%)`);
            continue;
          }
        }

        const entry = checkEntryQuality(pair);

        // Check if price hit our -7% target (dip catch)
        const hitTarget = item.targetPrice > 0 && currentPrice > 0 && currentPrice <= item.targetPrice;
        const priceDrop = item.initialPrice > 0 ? ((currentPrice - item.initialPrice) / item.initialPrice * 100).toFixed(1) : 0;

        if (entry.good || hitTarget) {
          const reason = hitTarget
            ? `DIP TARGET HIT (${priceDrop}% from initial)`
            : entry.reason;
          const mc = parseFloat(pair.marketCap) || 0;
          const tradeType = mc < 100000 ? 'LONG' : 'QUICK';
          // AI confirmation before trading from watchlist
          const aiBuy = await aiConfirmTrade(pair);
          if (aiBuy) {
            addLog('🧠', `WATCHLIST + AI CONFIRMED $${pair.baseToken?.symbol} — ${reason} (${item.rechecks} rechecks)`);
            executeTrade(pair, item.score, tradeType, false, item.analysis);
            toRemove.push(address);
          } else {
            addLog('🧠', `WATCHLIST AI SKIP $${pair.baseToken?.symbol} — still watching`);
          }
        } else if (!entry.watchlist) {
          // No longer worth watching
          toRemove.push(address);
        }
      } catch (e) {}
    }

    toRemove.forEach(addr => watchlist.delete(addr));
    if (toRemove.length > 0) broadcastState();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXECUTE TRADE
  // ═══════════════════════════════════════════════════════════════════════════
  function executeTrade(pair, score, tradeType, isPump, analysis) {
    if (state.balance < getPositionSize()) return null;
    if (state.positions.length >= SETTINGS.maxPositions) return null;

    const symbol = pair.baseToken?.symbol || 'UNKNOWN';
    const address = pair.baseToken?.address;
    const pairAddress = pair.pairAddress;
    const entryPrice = parseFloat(pair.priceUsd) || 0;
    const logo = analysis?.imageUri || pair.info?.imageUrl || '';
    const chain = pair.chainId || 'solana';

    if (!address || entryPrice === 0) return null;
    if (state.positions.find(p => p.address === address)) return null;
    // Block duplicate symbols (no 3x HYPER, 5x PIXEL etc.)
    if (state.positions.find(p => p.symbol.toUpperCase() === symbol.toUpperCase())) return null;
    // 60-min cooldown on re-signaling the same address (timestamps persist across restarts)
    if (isOnCooldown(address)) return null;
    // BLACKLIST — known honeypots, rugs, scams
    if (BLACKLISTED_SYMBOLS.has(symbol) || BLACKLISTED_ADDRESSES.has(address)) {
      addLog('🚫', `BLACKLISTED $${symbol}`);
      return null;
    }

    // Entry checks now handled by checkEntryQuality() before executeTrade()
    const mc = parseFloat(pair.marketCap) || 0;
    const liq = parseFloat(pair.liquidity?.usd) || 0;
    const isLong = tradeType === 'LONG';
    const maxHold = isLong ? SETTINGS.maxHoldLong : SETTINGS.maxHoldQuick;

    // Split into trading bag + moon bag for high-score tokens
    const createMoonBag = score >= SETTINGS.moonBagMinScore;
    const tradingSize = createMoonBag ? getPositionSize() * (1 - SETTINGS.moonBagPct / 100) : getPositionSize();
    const moonBagSize = createMoonBag ? getPositionSize() * (SETTINGS.moonBagPct / 100) : 0;

    // TRADING BAG
    const position = {
      id: Date.now(),
      symbol, address, pairAddress, chain, logo,
      entryPrice, currentPrice: entryPrice,
      entryMarketCap: mc, entryLiquidity: liq,
      entryVolume: parseFloat(pair.volume?.h24) || 0,
      dexUrl: pair.url || `https://dexscreener.com/${chain}/${pairAddress}`,
      pumpUrl: `https://pump.fun/coin/${address}`,
      initialSize: tradingSize,
      currentSize: tradingSize,
      score, tradeType, isPump, analysis,
      pnl: 0, pnlPct: 0, highestPnlPct: 0, highestVolume: 0,
      entryTime: Date.now(),
      trailingActivated: false, trailingHigh: 0, currentTrailDistance: 20,
      tpLevel: 0, dcaLevel: 0, dcaSecured: 0, totalDcaAdded: 0,
      isMoonBag: false,
      maxHold,
      label: isLong ? '🌙 LONG' : '⚡ QUICK'
    };

    state.positions.push(position);
    state.balance -= getPositionSize();
    tradedAddresses.set(address, Date.now());

    // MOON BAG (separate position, no trailing, no TP, runs forever)
    if (createMoonBag) {
      const moonPos = {
        ...position,
        id: Date.now() + 1,
        initialSize: moonBagSize, currentSize: moonBagSize,
        tradeType: 'MOON', isMoonBag: true,
        label: '🌕 MOON ∞',
        maxHold: 999999, // Never timeout
        tpLevel: 99, // Skip all TP
      };
      state.positions.push(moonPos);
      addLog('🌕', `MOON BAG $${symbol} $${moonBagSize.toFixed(0)} — runs forever`);
    }

    const sourceTag = isPump ? '🎰 PUMP' : '📈 DEX';
    addLog('🎯', `${sourceTag} $${symbol} Score:${score} @ ${formatPrice(entryPrice)} ${createMoonBag ? '+ MOON' : ''}`);

    broadcast('TRADE', { action: 'OPEN', position });
    broadcastState();
    return position;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TAKE PROFIT — Sell portion at profit targets
  // ═══════════════════════════════════════════════════════════════════════════
  function takeProfit(pos, sellPercent, tpLevel) {
    const currentValue = pos.currentSize * (1 + pos.pnlPct / 100);
    const sellValue = currentValue * (sellPercent / 100);
    const costBasisSold = pos.currentSize * (sellPercent / 100);
    const profitSecured = sellValue - costBasisSold;

    pos.currentSize -= costBasisSold;
    pos.dcaSecured += profitSecured;
    pos.tpLevel = tpLevel;

    state.securedPnL += profitSecured;
    state.balance += sellValue;

    addLog('🎯', `TP${tpLevel} $${pos.symbol} sold $${sellValue.toFixed(0)} (+$${profitSecured.toFixed(2)} profit)`);
    broadcast('TRADE', { action: 'TP', symbol: pos.symbol, tpLevel, secured: profitSecured });
    broadcastState();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DCA DOWN — Add to position when it dips (average down)
  // ═══════════════════════════════════════════════════════════════════════════
  function dcaDown(pos, addPercent, dcaLevel) {
    const addAmount = pos.initialSize * (addPercent / 100);
    if (state.balance < addAmount) return;

    // Average down: add more capital at lower price
    pos.currentSize += addAmount;
    pos.totalDcaAdded = (pos.totalDcaAdded || 0) + addAmount;
    pos.dcaLevel = dcaLevel;
    state.balance -= addAmount;

    const totalCost = pos.initialSize + pos.totalDcaAdded;
    const currentValue = totalCost * (1 + pos.pnlPct / 100);
    addLog('📉', `DCA${dcaLevel} $${pos.symbol} added $${addAmount.toFixed(0)} (avg down)`);
    broadcast('TRADE', { action: 'DCA', symbol: pos.symbol, dcaLevel, added: addAmount });
    broadcastState();
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CLOSE TRADE
  // ═══════════════════════════════════════════════════════════════════════════
  function closeTrade(pos, reason, opts = {}) {
    const silent = !!opts.silent;
    const idx = state.positions.findIndex(p => p.id === pos.id);
    if (idx === -1) return;

    const remainingValue = pos.currentSize * (1 + pos.pnlPct / 100);
    const remainingPnl = remainingValue - pos.currentSize;
    const holdMin = Math.floor((Date.now() - pos.entryTime) / 60000);

    state.positions.splice(idx, 1);
    const finalPnl = pos.dcaSecured + remainingPnl;

    state.totalPnL += remainingPnl;
    state.balance += remainingValue;
    state.totalTrades++;

    if (finalPnl > 0) {
      state.wins++;
      if (finalPnl > state.bestTrade) state.bestTrade = finalPnl;
    } else {
      if (finalPnl < state.worstTrade) state.worstTrade = finalPnl;
    }
    
    const historyEntry = {
      symbol: pos.symbol,
      address: pos.address,
      chain: pos.chain || 'solana',
      dexUrl: pos.dexUrl,
      tradeType: pos.tradeType,
      score: pos.score,
      pnl: finalPnl,
      pnlPct: pos.pnlPct,
      highestPnlPct: pos.highestPnlPct || 0,
      dcaSecured: pos.dcaSecured,
      dcaLevel: pos.dcaLevel || 0,
      tpLevel: pos.tpLevel || 0,
      reason,
      holdMin,
      closeTime: Date.now(),
      entryPrice: pos.entryPrice,
      exitPrice: pos.currentPrice,
      entryMarketCap: pos.entryMarketCap || 0,
      entryLiquidity: pos.entryLiquidity || 0,
      entryVolume: pos.entryVolume || 0,
      initialSize: pos.initialSize || 0,
      currentSize: pos.currentSize || 0,
      trailingActivated: pos.trailingActivated || false,
      trailingHigh: pos.trailingHigh || 0,
      hasSocials: pos.hasSocials || false,
      holdersTop10: pos.holdersTop10 || null,
      holdersTopHolder: pos.holdersTopHolder || null,
      holdersCount: pos.holdersCount || null,
      bondingCurve: pos.bondingCurve || null,
      analysisReasons: pos.analysisReasons || [],
    };
    
    state.history.unshift(historyEntry);
    if (state.history.length > 500) state.history.pop();

    // Feed the narrative tracker with this position's peak X
    recordNarrativePeak(pos.symbol, pos.highestPnlPct || 0);
    
    const icon = finalPnl >= 0 ? '✅' : '❌';
    addLog(icon, `${reason} $${pos.symbol} ${finalPnl >= 0 ? '+' : ''}$${finalPnl.toFixed(2)}`);

    // Silent mode (e.g. 7d auto-retire): move signal to history without
    // posting a CLOSE alert on Telegram. The peak-X is still preserved so
    // win-rate stats update normally.
    if (!silent) {
      broadcast('TRADE', { action: 'CLOSE', symbol: pos.symbol, pnl: finalPnl, pnlPct: pos.pnlPct, reason });
    }
    broadcastState();
    saveState();
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE POSITIONS — v13 radical cut applied
  // ═══════════════════════════════════════════════════════════════════════════
  async function updatePositions() {
    if (state.positions.length === 0) return;

    // SIGNAL-ONLY MODE — v14
    //   We don't trade, we signal. Positions never auto-close: we just
    //   record peak multiple. Win-rate is computed from peakX >= 2X.
    //   A silent auto-retire after SIGNAL_MAX_AGE moves old signals into
    //   history to free slots for new ones — no CLOSE alert is posted.
    const SIGNAL_MAX_AGE_MIN = 7 * 24 * 60; // 7 days

    for (let i = state.positions.length - 1; i >= 0; i--) {
      const pos = state.positions[i];
      try {
        const res = await cachedDexFetch(`${DEX_API}/latest/dex/pairs/${pos.chain || 'solana'}/${pos.pairAddress}`, { signal: AbortSignal.timeout(5000) });
        const data = await res.json();
        if (!data.pair) continue;

        const newPrice = parseFloat(data.pair.priceUsd) || pos.currentPrice;

        // CTO / promotion injections start with entryPrice=0; on the first
        // good poll we lock in the entry price so X is measured from add
        // time, not from a divide-by-zero.
        if (!pos.entryPrice || pos.entryPrice <= 0) {
          if (!newPrice) continue;
          pos.entryPrice = newPrice;
          pos.currentPrice = newPrice;
          pos.pnlPct = 0;
          pos.highestPnlPct = 0;
          pos.alertedX = 1;
          continue;
        }

        // Sanity: reject glitched price reads. DexScreener occasionally
        // returns a stale/off-by-orders-of-magnitude price; without a
        // guard it poisons pos.highestPnlPct (e.g. CHUD showed peak
        // 1768X while real PnL was +1.8%). >20x jump in one poll = glitch.
        if (pos.currentPrice && (newPrice > pos.currentPrice * 20 || newPrice < pos.currentPrice / 20)) {
          continue;
        }

        const priceChange = (newPrice - pos.entryPrice) / pos.entryPrice * 100;
        const currentVol = parseFloat(data.pair.volume?.h24) || 0;

        // Update snapshot + peak tracking — no closes, ever.
        pos.currentPrice = newPrice;
        pos.pnlPct = priceChange;
        const currentValue = pos.currentSize * (1 + priceChange / 100);
        pos.pnl = (currentValue - pos.currentSize) + (pos.dcaSecured || 0);

        // Heal stuck bad peaks: a past glitched read can inflate
        // highestPnlPct massively. If peak is in the stratosphere but
        // current PnL has settled, snap peak back down.
        if (pos.highestPnlPct > 10000 && pos.pnlPct < 200) {
          pos.highestPnlPct = Math.max(pos.pnlPct, 0);
          pos.alertedX = 1;
        }

        const prevPeakPct = pos.highestPnlPct || 0;
        if (pos.pnlPct > pos.highestPnlPct) pos.highestPnlPct = pos.pnlPct;
        if (!pos.highestVolume) pos.highestVolume = 0;
        if (currentVol > pos.highestVolume) pos.highestVolume = currentVol;

        // Milestone alert — broadcast the first time a signal crosses
        // each X threshold (2, 3, 5, 10, 25, 50, 100). pos.alertedX stores
        // the highest milestone already announced so we never double-post.
        const MILESTONES = Array.from({length: 999}, (_, i) => i + 2); // every integer 2..1000, no skipping
        const prevX = 1 + prevPeakPct / 100;
        const curX  = 1 + pos.highestPnlPct / 100;
        pos.alertedX = pos.alertedX || 1;
        for (const m of MILESTONES) {
          if (curX >= m && prevX < m && pos.alertedX < m) {
            pos.alertedX = m;
            broadcast('TRADE', {
              action: 'MILESTONE',
              symbol: pos.symbol,
              address: pos.address,
              chain: pos.chain || 'solana',
              pairAddress: pos.pairAddress,
              logo: pos.logo || null,
              milestone: m,
              currentX: curX,
              entryMarketCap: pos.entryMarketCap || 0,
            });
            break;
          }
        }

        const holdTime = (Date.now() - pos.entryTime) / 60000;
        const peakPnl = pos.highestPnlPct || 0;
        const curPnl = pos.pnlPct || 0;
        // Proper drawdown from peak as a percentage of peak gain.
        // peakPnl=963, curPnl=801 → drawdown = (963-801)/963 = 17% (alive!)
        // peakPnl=300, curPnl=50 → drawdown = (300-50)/300 = 83% (dead, retire OK)
        const drawdownPct = peakPnl > 0 ? ((peakPnl - curPnl) / peakPnl) * 100 : 0;

        // Silent auto-retire — archive the signal (keeping peakX) so the
        // slot frees up for newer signals. No Telegram alert.
        // Survivor rule: a position that already hit ≥ 3X is a winner — we
        // only retire it when current price has crashed ≥ 60% from peak
        // (the run is genuinely dead). Old code measured drawdown in
        // percentage points which incorrectly retired huge winners (CHUD
        // hit 10X but retired because 963-801=162pp > 70pp threshold).
        if (peakX >= 3 && drawdownPct < 60) {
          // Survivor still alive — keep watching, don't retire on age
        } else if (holdTime >= SIGNAL_MAX_AGE_MIN) {
          closeTrade(pos, 'RETIRED', { silent: true });
          continue;
        }
      } catch (e) {}
    }

    broadcastState();
    saveState();
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MEGA SCAN
  // ═══════════════════════════════════════════════════════════════════════════
  async function megaScan() {
    if (!state.isRunning || scanning) return;
    
    scanning = true;
    const allTokens = new Map();
    
    addLog('🔍', 'Starting ULTIMATE MEGA SCAN...');
    state.scanStatus = 'Scanning...';
    state.currentPhase = '1: Helius';
    broadcastState();
    
    // PHASE 1: HELIUS
    try {
      const res = await fetch(`${HELIUS_API}/addresses/${PUMP_PROGRAM}/transactions?api-key=${HELIUS_KEY}&type=SWAP&limit=100`, {
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        const txs = await res.json();
        const addresses = new Set();
        for (const tx of txs) {
          if (tx.tokenTransfers) {
            for (const transfer of tx.tokenTransfers) {
              if (transfer.mint && transfer.mint !== 'So11111111111111111111111111111111111111112') {
                addresses.add(transfer.mint);
              }
            }
          }
        }
        addresses.forEach(addr => {
          if (!allTokens.has(addr)) {
            allTokens.set(addr, { address: addr, source: 'helius', boost: 35 });
          }
        });
        state.heliusScanned = addresses.size;
        addLog('🔭', `Helius: ${addresses.size} tokens`);
      }
    } catch (e) {}
    
    // PHASE 2: PUMP.FUN
    state.currentPhase = '2: Pump.fun';
    broadcastState();
    
    const pumpEndpoints = [
      { url: `${PUMP_API}/coins/latest?limit=200`, boost: 30 },
      { url: `${PUMP_API}/coins/king-of-the-hill?includeNsfw=false`, boost: 35 },
      { url: `${PUMP_API}/coins?offset=0&limit=100&sort=last_trade_timestamp&order=DESC`, boost: 25 },
      { url: `${PUMP_API}/coins?offset=0&limit=100&sort=created_timestamp&order=DESC`, boost: 28 },
      { url: `${PUMP_API}/coins?offset=100&limit=100&sort=created_timestamp&order=DESC`, boost: 22 },
      // Lower-MC discovery passes — these surface the sub-$10K snowballs that
      // rarely appear in DexScreener boosted feeds.
      { url: `${PUMP_API}/coins?offset=0&limit=100&sort=usd_market_cap&order=ASC&includeNsfw=false`, boost: 32 },
      { url: `${PUMP_API}/coins?offset=0&limit=100&sort=last_trade_timestamp&order=DESC&currentlyLive=true`, boost: 30 },
      { url: `${PUMP_API}/coins/featured?limit=100`, boost: 28 },
    ];
    
    for (const ep of pumpEndpoints) {
      try {
        const res = await fetch(ep.url, { signal: AbortSignal.timeout(8000), headers: { 'Accept': 'application/json' } });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            data.forEach(c => {
              if (c.mint && !allTokens.has(c.mint)) {
                allTokens.set(c.mint, { address: c.mint, source: 'pump', boost: ep.boost, pumpData: c });
              }
            });
          }
        }
      } catch (e) {}
    }
    
    state.pumpScanned = Array.from(allTokens.values()).filter(t => t.source === 'pump').length;
    addLog('🎰', `Pump.fun: ${state.pumpScanned} tokens`);
    
    // PHASE 3-4: DEXSCREENER
    state.currentPhase = '3: DEX';
    broadcastState();

    try {
      const res = await cachedDexFetch(`${DEX_API}/token-profiles/latest/v1`, { signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      if (Array.isArray(data)) {
        data.filter(t => SUPPORTED_CHAINS.includes(t.chainId)).slice(0, 400).forEach(t => {
          if (t.tokenAddress && !allTokens.has(t.tokenAddress)) {
            allTokens.set(t.tokenAddress, { address: t.tokenAddress, source: 'dex-new', boost: 22 });
          }
        });
      }
    } catch (e) {}

    try {
      const res = await cachedDexFetch(`${DEX_API}/token-boosts/top/v1`, { signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      if (Array.isArray(data)) {
        data.filter(t => SUPPORTED_CHAINS.includes(t.chainId)).slice(0, 400).forEach(t => {
          if (t.tokenAddress && !allTokens.has(t.tokenAddress)) {
            allTokens.set(t.tokenAddress, { address: t.tokenAddress, source: 'dex-boost', boost: 26 });
          }
        });
      }
    } catch (e) {}

    try {
      const res = await cachedDexFetch(`${DEX_API}/token-boosts/latest/v1`, { signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      if (Array.isArray(data)) {
        data.filter(t => SUPPORTED_CHAINS.includes(t.chainId)).slice(0, 300).forEach(t => {
          if (t.tokenAddress && !allTokens.has(t.tokenAddress)) {
            allTokens.set(t.tokenAddress, { address: t.tokenAddress, source: 'dex-boost-new', boost: 20 });
          }
        });
      }
    } catch (e) {}

    // PHASE 3.5: GeckoTerminal new pools — fresh launches across chains,
    // includes very-low-MC pools DexScreener boosted misses.
    state.currentPhase = '3.5: GeckoTerminal';
    broadcastState();
    const GT_NETWORKS = ['solana', 'eth', 'base', 'bsc', 'arbitrum'];
    for (const net of GT_NETWORKS) {
      try {
        const res = await fetch(`https://api.geckoterminal.com/api/v2/networks/${net}/new_pools?include=base_token&page=1`, {
          signal: AbortSignal.timeout(8000),
          headers: { 'Accept': 'application/json;version=20230302' }
        });
        if (!res.ok) continue;
        const data = await res.json();
        const tokenLookup = {};
        for (const inc of (data.included || [])) {
          if (inc.type === 'token') tokenLookup[inc.id] = inc.attributes;
        }
        for (const pool of (data.data || [])) {
          const baseId = pool.relationships?.base_token?.data?.id;
          const baseTok = tokenLookup[baseId] || {};
          const addr = baseTok.address;
          if (!addr || allTokens.has(addr)) continue;
          allTokens.set(addr, { address: addr, source: `gt-${net}`, boost: 24 });
        }
      } catch (e) {}
    }
    state.gtScanned = Array.from(allTokens.values()).filter(t => String(t.source).startsWith('gt-')).length;
    addLog('🦎', `GeckoTerminal: ${state.gtScanned} tokens (${GT_NETWORKS.length} chains)`);

    // PHASE 4: TARGETED SEARCHES
    state.currentPhase = '4: Smart search';
    broadcastState();

    const smartQueries = [
      'solana new', 'pump graduated', 'trending meme',
      'sol gem', 'eth meme', 'base new',
      '100x', 'ai agent', 'trump', 'pepe',
    ];
    for (const q of smartQueries) {
      try {
        const res = await cachedDexFetch(`${DEX_API}/latest/dex/search?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(5000) });
        const data = await res.json();
        if (data.pairs) {
          data.pairs.filter(p => SUPPORTED_CHAINS.includes(p.chainId)).slice(0, 100).forEach(p => {
            const addr = p.baseToken?.address;
            if (addr && !allTokens.has(addr)) {
              allTokens.set(addr, { address: addr, source: 'dex-smart', boost: 18, pair: p });
            }
          });
        }
      } catch (e) {}
    }

    state.dexScanned = allTokens.size - state.heliusScanned - state.pumpScanned;
    state.scannedTotal += allTokens.size;
    
    addLog('📊', `Total: ${state.heliusScanned} Helius + ${state.pumpScanned} Pump + ${state.dexScanned} DEX = ${allTokens.size}`);
    
    // PHASE 7: FAST FILTER
    state.currentPhase = '7: Fast filter';
    state.scanStatus = `Filtering ${allTokens.size} tokens...`;
    broadcastState();

    const candidates = Array.from(allTokens.values()).sort((a, b) => (b.boost || 0) - (a.boost || 0));
    const fastFiltered = [];

    for (const cand of candidates) {
      if (analyzedCache.has(cand.address)) {
        const cached = analyzedCache.get(cand.address);
        if (Date.now() - cached.timestamp < CACHE_DURATION) continue;
      }
      if (state.positions.find(p => p.address === cand.address)) continue;
      if (isOnCooldown(cand.address)) continue;
      const sym = cand.pair?.baseToken?.symbol || '';
      if (BLACKLISTED_SYMBOLS.has(sym) || BLACKLISTED_ADDRESSES.has(cand.address)) continue;

      let pair = cand.pair;
      if (!pair && cand.boost >= 20) {
        try {
          const res = await cachedDexFetch(`${DEX_API}/latest/dex/tokens/${cand.address}`, { signal: AbortSignal.timeout(3000) });
          const data = await res.json();
          if (data.pairs) pair = data.pairs.find(p => SUPPORTED_CHAINS.includes(p.chainId));
        } catch (e) {}
      }
      if (!pair || !SUPPORTED_CHAINS.includes(pair.chainId)) continue;

      const mc = parseFloat(pair.marketCap) || 0;
      const liq = parseFloat(pair.liquidity?.usd) || 0;
      const vol = parseFloat(pair.volume?.h24) || 0;
      const buys5m = pair.txns?.m5?.buys || 0;
      const sells5m = pair.txns?.m5?.sells || 0;

      if (mc < SETTINGS.minMC || mc > SETTINGS.maxMC) continue;
      if (liq < SETTINGS.minLiquidity) continue;
      if (vol < SETTINGS.minVolume24h) continue;
      if (buys5m === 0 && sells5m === 0) continue;

      // Low-cap hunt: reward smallest MCs hardest. We only pass MCs up
      // to 200k (hard gate above). Inside that window, 3k-30k gets the
      // top tier — that's where big-X moves start.
      let quickScore = 40;
      if (mc >= 3000 && mc <= 30000) quickScore += 28;
      else if (mc > 30000 && mc <= 80000) quickScore += 22;
      else if (mc > 80000 && mc <= 150000) quickScore += 16;
      else quickScore += 10;
      if (liq >= 15000) quickScore += 15;
      else if (liq >= 5000) quickScore += 8;
      else quickScore += 5;
      if (vol >= 10000) quickScore += 8;
      else if (vol >= 1000) quickScore += 3;
      quickScore += (cand.boost || 0) > 20 ? 5 : 0;

      if (quickScore >= SETTINGS.minScore - 15) {
        fastFiltered.push({ ...cand, pair, quickScore });
      }
    }

    addLog('⚡', `Fast filter: ${fastFiltered.length} passed from ${candidates.length}`);

    // PHASE 8: DEEP ANALYSIS
    state.currentPhase = '8: Deep analysis';
    broadcastState();

    fastFiltered.sort((a, b) => b.quickScore - a.quickScore);
    const opportunities = [];
    let analyzed = 0;
    let rejUnsafe = 0, rejLowScore = 0;     // funnel counters for diagnostic log

    for (const cand of fastFiltered.slice(0, 100)) {
      analyzed++;
      try {
        const analysis = await analyzeTokenComplete(cand.address, cand.pair);

        if (analysis.safe && analysis.score >= SETTINGS.minScore) {
          state.safeFound++;
          cand.pair._source = cand.source;
          cand.pair._boost = cand.boost;
          opportunities.push({ pair: cand.pair, score: analysis.score, analysis });
          addLog('✨', `OPP: $${cand.pair.baseToken?.symbol} Score:${analysis.score} MC:$${formatNumber(parseFloat(cand.pair.marketCap)||0)}`);
        } else if (!analysis.safe) {
          rejUnsafe++;
        } else {
          rejLowScore++;
        }

        analyzedCache.set(cand.address, { result: analysis.safe && analysis.score >= SETTINGS.minScore ? 'GOOD' : 'SKIP', timestamp: Date.now() });
      } catch (e) {}

      if (analyzed % 10 === 0) await sleep(20);
    }
    
    opportunities.sort((a, b) => b.score - a.score);
    state.oppsTotal = opportunities.length;
    addLog('🔍', `Found ${opportunities.length} safe opportunities (from ${analyzed} analyzed · rejected: ${rejUnsafe} unsafe, ${rejLowScore} low-score <${SETTINGS.minScore})`);
    console.log(`[sniper] scan funnel: analyzed=${analyzed} unsafe=${rejUnsafe} lowScore=${rejLowScore} opps=${opportunities.length}`);
    
    // PHASE 9: SMART EXECUTION — Survivor tracking + entry quality
    state.currentPhase = '9: Smart entry';
    broadcastState();

    let tradesOpened = 0;
    let watchlisted = 0;
    // Entry funnel counters for diagnostic log
    let dropAlreadyIn = 0, dropSurvivor = 0, dropLiqDrain = 0, dropEntryBad = 0, dropAiSkip = 0;
    const maxTrades = SETTINGS.maxTradesPerScan || 10;

    // Purge stale survivor tracking entries (not re-sighted in last hour)
    const nowTs = Date.now();
    for (const [addr, t] of survivorTracking) {
      if (nowTs - (t.lastSeen || t.firstSeen) > SURVIVOR_MAX_AGE) survivorTracking.delete(addr);
    }

    for (const opp of opportunities.slice(0, 20)) {
      if (state.balance < getPositionSize()) break;
      if (tradesOpened >= maxTrades) break;
      // Silent rotation: when the position list is full, retire dead
      // positions (≤ -99% from entry) so a fresh signal can open. We
      // never touch positions that still have life — only the corpses.
      if (state.positions.length >= SETTINGS.maxPositions) {
        const dead = state.positions
          .filter(p => (p.pnlPct || 0) <= -99)
          .sort((a, b) => (a.pnlPct || 0) - (b.pnlPct || 0));
        if (!dead.length) break; // no corpses → wait, don't sacrifice a live signal
        const victim = dead[0];
        state.positions = state.positions.filter(p => p !== victim);
        state.history.unshift({
          symbol: victim.symbol, address: victim.address, chain: victim.chain || 'solana',
          dexUrl: victim.dexUrl, tradeType: victim.tradeType, score: victim.score,
          pnl: 0, pnlPct: victim.pnlPct || 0, highestPnlPct: victim.highestPnlPct || 0,
          dcaSecured: victim.dcaSecured || 0, reason: 'rotated-dead',
          holdMin: Math.floor((Date.now() - (victim.entryTime || Date.now())) / 60000),
          closeTime: Date.now(), entryPrice: victim.entryPrice, exitPrice: victim.currentPrice,
          entryMarketCap: victim.entryMarketCap || 0, entryLiquidity: victim.entryLiquidity || 0,
          openedAt: victim.entryTime,
        });
        if (state.history.length > 500) state.history.length = 500;
      }

      const addr = opp.pair.baseToken?.address;
      if (!addr || state.positions.find(p => p.address === addr)) { dropAlreadyIn++; continue; }
      if (watchlist.has(addr)) { dropAlreadyIn++; continue; }

      // ═══ SURVIVOR TRACKING — Shane methodology ═══
      // Buy confirmed runners, not fresh sightings. Track price / liq / holders
      // across multiple scans and require stability before executing.
      const liqNow = parseFloat(opp.pair.liquidity?.usd) || 0;
      const priceNow = parseFloat(opp.pair.priceUsd) || 0;
      const volNow = parseFloat(opp.pair.volume?.h24) || 0;
      const holdersNow = opp.analysis?.holders?.totalHolders || 0;

      const track = survivorTracking.get(addr) || {
        firstSeen: Date.now(), scans: 0, metrics: []
      };
      track.scans++;
      track.lastSeen = Date.now();
      track.metrics.push({ time: Date.now(), price: priceNow, liq: liqNow, holders: holdersNow, vol: volNow });
      if (track.metrics.length > 10) track.metrics.shift();
      survivorTracking.set(addr, track);

      // Not enough scans yet → keep monitoring, skip trade
      if (track.scans < (SETTINGS.minSurvivorScans || 2)) {
        addLog('👁', `TRACK $${opp.pair.baseToken?.symbol} scan ${track.scans}/${SETTINGS.minSurvivorScans}`);
        dropSurvivor++;
        continue;
      }

      // Liquidity stability check — Shane's "survivors" need stable/growing liq
      if (track.metrics.length >= 2) {
        const first = track.metrics[0];
        const last = track.metrics[track.metrics.length - 1];
        const liqChange = first.liq > 0 ? ((last.liq - first.liq) / first.liq) * 100 : 0;
        if (liqChange <= -(SETTINGS.maxLiqDropBetweenScans || 15)) {
          addLog('💧', `LIQ DRAIN $${opp.pair.baseToken?.symbol} ${liqChange.toFixed(0)}% — skip`);
          survivorTracking.delete(addr);
          dropLiqDrain++;
          continue;
        }
        // Growing holders across scans is a strong runner signal
        if (last.holders > first.holders && last.holders - first.holders >= 5) {
          opp.score += 5;
        }
      }

      // CHECK ENTRY QUALITY
      const entry = checkEntryQuality(opp.pair);

      if (entry.good) {
        const symbol = opp.pair.baseToken?.symbol || '???';
        const aiBuy = await aiConfirmTrade(opp.pair);
        if (aiBuy) {
          const mc = parseFloat(opp.pair.marketCap) || 0;
          const isPump = opp.pair._source?.startsWith('pump');
          const tradeType = mc < 100000 ? 'LONG' : 'QUICK';
          addLog('🧠', `AI CONFIRMED $${symbol} — ${entry.reason}`);
          const pos = executeTrade(opp.pair, opp.score, tradeType, isPump, opp.analysis);
          if (pos) tradesOpened++;
        } else {
          addLog('🧠', `AI SKIPPED $${symbol} — watchlisted`);
          watchlist.set(addr, {
            address: addr, pair: opp.pair, score: opp.score, analysis: opp.analysis,
            addedAt: Date.now(), lastCheck: Date.now(), rechecks: 0,
            initialPrice: parseFloat(opp.pair.priceUsd) || 0,
            targetPrice: (parseFloat(opp.pair.priceUsd) || 0) * 0.80
          });
          watchlisted++;
          dropAiSkip++;
        }
      } else if (entry.watchlist) {
        dropEntryBad++;
        watchlist.set(addr, {
          address: addr, pair: opp.pair, score: opp.score, analysis: opp.analysis,
          addedAt: Date.now(), lastCheck: Date.now(), rechecks: 0,
          initialPrice: parseFloat(opp.pair.priceUsd) || 0,
          targetPrice: (parseFloat(opp.pair.priceUsd) || 0) * 0.80
        });
        watchlisted++;
        addLog('👁', `WATCHLIST $${opp.pair.baseToken?.symbol} — ${entry.reason} (recheck 10m)`);
      }

      await sleep(80);
    }

    state.currentPhase = 'Complete';
    state.scanStatus = `✅ ${tradesOpened} trades, ${watchlisted} watchlisted from ${opportunities.length} opps`;
    state.lastScanTime = new Date().toLocaleTimeString('en-US', { hour12: false });

    addLog('✅', `Scan — ${tradesOpened} trades, ${watchlisted} watchlisted, ${watchlist.size} watching`);
    console.log(`[sniper] entry funnel: opps=${opportunities.length} alreadyIn=${dropAlreadyIn} survivorWait=${dropSurvivor} liqDrain=${dropLiqDrain} entryBad=${dropEntryBad} aiSkip=${dropAiSkip} → trades=${tradesOpened} watchlisted=${watchlisted}`);
    
    broadcast('SCAN', { action: 'RESULT', scanned: allTokens.size, opportunities: opportunities.length, tradesOpened });
    broadcastState();
    saveState();
    
    scanning = false;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // START / STOP
  // ═══════════════════════════════════════════════════════════════════════════
  function start() {
    if (state.isRunning) return;
    
    state.isRunning = true;
    state.sessionStartTime = Date.now();
    
    addLog('🚀', 'ULTIMATE SNIPER STARTED');
    
    setTimeout(() => megaScan(), 2000);
    scanInterval = setInterval(() => megaScan(), SETTINGS.scanInterval);
    updateInterval = setInterval(() => updatePositions(), SETTINGS.updateInterval);

    setInterval(() => recheckWatchlist(), 2 * 60 * 1000);
    
    uptimeInterval = setInterval(() => {
      if (state.sessionStartTime) {
        const elapsed = Date.now() - state.sessionStartTime;
        const mins = Math.floor(elapsed / 60000);
        const secs = Math.floor((elapsed % 60000) / 1000);
        state.uptime = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      }
    }, 1000);
    
    broadcastState();
  }
  
  function stop() {
    state.isRunning = false;
    
    if (scanInterval) clearInterval(scanInterval);
    if (updateInterval) clearInterval(updateInterval);
    if (uptimeInterval) clearInterval(uptimeInterval);
    scanInterval = null;
    updateInterval = null;
    uptimeInterval = null;
    
    state.scanStatus = 'Stopped';
    state.currentPhase = '-';
    
    addLog('⏹️', 'Sniper stopped');
    broadcastState();
    saveState();
  }
  
  function forceScan() {
    if (!state.isRunning) return;
    megaScan();
  }
  
  function closePosition(positionId) {
    const pos = state.positions.find(p => p.id === positionId);
    if (pos) closeTrade(pos, 'MANUAL');
  }

  function extendPosition(positionId) {
    const pos = state.positions.find(p => p.id === positionId);
    if (!pos) return false;
    pos.entryTime = Date.now();
    pos.maxHold += 15;
    addLog('🔄', `Extended $${pos.symbol} +15min (max ${pos.maxHold}min)`);
    broadcastState();
    return true;
  }

  function sellMoonBag(positionId) {
    const pos = state.positions.find(p => p.id === positionId);
    if (!pos || !pos.isMoonBag) return false;
    closeTrade(pos, 'MOON SOLD');
    return true;
  }
  
  function closeAllPositions() {
    [...state.positions].forEach(pos => closeTrade(pos, 'MANUAL'));
  }
  
  function reset() {
    stop();
    state.balance = 100000;
    state.totalPnL = 0;
    state.securedPnL = 0;
    state.totalTrades = 0;
    state.wins = 0;
    state.bestTrade = 0;
    state.worstTrade = 0;
    state.positions = [];
    state.history = [];
    state.logs = [];
    state.heliusScanned = 0;
    state.pumpScanned = 0;
    state.dexScanned = 0;
    state.safeFound = 0;
    state.scannedTotal = 0;
    state.oppsTotal = 0;
    tradedAddresses.clear();
    analyzedCache.clear();
    holderCache.clear();
    securityCache.clear();
    rugCheckCache.clear();
    goPlusCache.clear();
    gmgnCache.clear();
    survivorTracking.clear();
    addLog('🔄', 'Full reset — all stats, positions, history cleared');
    broadcastState();
    saveState();
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PERSISTENCE
  // ═══════════════════════════════════════════════════════════════════════════
  const stateFile = dataDir ? path.join(dataDir, 'sniper-state.json') : null;
  
  function saveState() {
    if (!stateFile) return;
    try {
      const saveData = {
        balance: state.balance,
        totalPnL: state.totalPnL,
        securedPnL: state.securedPnL,
        totalTrades: state.totalTrades,
        wins: state.wins,
        bestTrade: state.bestTrade,
        worstTrade: state.worstTrade,
        positions: state.positions,
        history: state.history.slice(0, 500),
        tradedAddresses: Array.from(tradedAddresses.entries()).slice(-500)
      };
      fs.writeFileSync(stateFile, JSON.stringify(saveData, null, 2));
    } catch (e) {
      console.error('Save state error:', e.message);
    }
  }
  
  function loadState() {
    if (!stateFile || !fs.existsSync(stateFile)) return;
    try {
      const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      state.balance = data.balance || 100000;
      state.totalPnL = data.totalPnL || 0;
      state.securedPnL = data.securedPnL || 0;
      state.totalTrades = data.totalTrades || 0;
      state.wins = data.wins || 0;
      state.bestTrade = data.bestTrade || 0;
      state.worstTrade = data.worstTrade || 0;
      state.history = data.history || [];
      state.positions = data.positions || [];
      // Heal any persisted positions with broken pnlPct/highestPnlPct
      // (e.g. CTO injections that hit the entryPrice=0 divide-by-zero
      // before the fix shipped — they end up with Infinity multipliers).
      for (const p of state.positions) {
        if (!isFinite(p.pnlPct)) p.pnlPct = 0;
        if (!isFinite(p.highestPnlPct) || p.highestPnlPct > 100000) {
          p.highestPnlPct = Math.max(p.pnlPct || 0, 0);
        }
        if (!isFinite(p.alertedX)) p.alertedX = 1;
      }
      if (data.tradedAddresses) {
        // Backward-compat: old saves stored an array of strings, new saves store [addr, timestamp] tuples.
        data.tradedAddresses.forEach(item => {
          if (Array.isArray(item)) tradedAddresses.set(item[0], item[1] || 0);
          else if (typeof item === 'string') tradedAddresses.set(item, 0); // legacy entry — already past cooldown
        });
      }
      // Recently-opened positions count as on cooldown from their entry time.
      state.positions.forEach(p => { if (p.address) tradedAddresses.set(p.address, p.entryTime || Date.now()); });
      // Older history entries are treated as past cooldown (timestamp 0).
      state.history.forEach(h => { if (h.address && !tradedAddresses.has(h.address)) tradedAddresses.set(h.address, 0); });
      addLog('💾', `Loaded ${state.history.length} trades, ${state.positions.length} positions, ${tradedAddresses.size} cooldown entries`);
    } catch (e) {
      console.error('Load state error:', e.message);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // WEBSOCKET HANDLER
  // ═══════════════════════════════════════════════════════════════════════════
  function handleWebSocket(ws) {
    wsClients.add(ws);
    
    ws.send(JSON.stringify({ type: 'STATE', data: getState(), timestamp: Date.now() }));
    
    state.logs.slice(0, 50).forEach(log => {
      ws.send(JSON.stringify({ type: 'LOG', data: log, timestamp: Date.now() }));
    });
    
    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg);
        switch (data.action) {
          case 'START': start(); break;
          case 'STOP': stop(); break;
          case 'FORCE_SCAN': forceScan(); break;
          case 'CLOSE_POSITION': closePosition(data.positionId); break;
          case 'CLOSE_ALL': closeAllPositions(); break;
          case 'RESET': reset(); break;
          case 'GET_STATE': ws.send(JSON.stringify({ type: 'STATE', data: getState(), timestamp: Date.now() })); break;
        }
      } catch (e) {}
    });
    
    ws.on('close', () => {
      wsClients.delete(ws);
    });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════
  function getState() {
    const openValue = state.positions.reduce((sum, p) => {
      return sum + p.currentSize * (1 + (p.pnlPct || 0) / 100);
    }, 0);
    const totalValue = state.balance + openValue;
    const simplePnL = totalValue - 100000;

    const history = state.history || [];
    const reasonCounts = {};
    const chainCounts = {};
    let totalHoldMin = 0;
    let winnersHoldMin = 0;
    let winnersCount = 0;
    let losersHoldMin = 0;
    let losersCount = 0;
    let totalSecured = 0;
    let avgEntryMC = 0;
    let avgEntryVol = 0;
    let avgEntryLiq = 0;
    let trailedCount = 0;
    let dcaCount = 0;

    for (const t of history) {
      reasonCounts[t.reason] = (reasonCounts[t.reason] || 0) + 1;
      const ch = t.chain || 'solana';
      chainCounts[ch] = (chainCounts[ch] || 0) + 1;
      totalHoldMin += t.holdMin || 0;
      if (t.pnl > 0) { winnersHoldMin += t.holdMin || 0; winnersCount++; }
      else { losersHoldMin += t.holdMin || 0; losersCount++; }
      totalSecured += t.dcaSecured || 0;
      avgEntryMC += t.entryMarketCap || 0;
      avgEntryVol += t.entryVolume || 0;
      avgEntryLiq += t.entryLiquidity || 0;
      if (t.trailingActivated) trailedCount++;
      if (t.dcaLevel > 0) dcaCount++;
    }
    const n = history.length || 1;

    return {
      ...state,
      totalPnL: simplePnL,
      totalValue,
      watchlistCount: watchlist.size,
      watchlistTokens: Array.from(watchlist.values()).map(w => ({
        symbol: w.pair?.baseToken?.symbol || '???',
        address: w.address,
        chainId: w.pair?.chainId || 'solana',
        dexUrl: w.pair?.url || null,
        score: w.score,
        rechecks: w.rechecks,
        addedAt: w.addedAt,
        initialPrice: w.initialPrice || 0,
        targetPrice: w.targetPrice || 0
      })),
      settings: SETTINGS,
      wsClients: wsClients.size,
      analytics: {
        reasonCounts,
        chainCounts,
        avgHoldMin: Math.round(totalHoldMin / n),
        avgWinnerHoldMin: winnersCount ? Math.round(winnersHoldMin / winnersCount) : 0,
        avgLoserHoldMin: losersCount ? Math.round(losersHoldMin / losersCount) : 0,
        avgEntryMC: Math.round(avgEntryMC / n),
        avgEntryVol: Math.round(avgEntryVol / n),
        avgEntryLiq: Math.round(avgEntryLiq / n),
        totalSecured,
        trailedPct: Math.round(trailedCount / n * 100),
        dcaPct: Math.round(dcaCount / n * 100),
      }
    };
  }
  
  // Initialize
  function handleSSE(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders && res.flushHeaders();
    sseClients.add(res);
    // Initial state
    try { res.write(`data: ${JSON.stringify({ type: 'STATE', data: getState(), timestamp: Date.now() })}\n\n`); } catch (e) {}
    // Heartbeat (comment line) every 25s — keeps proxies from closing
    const hb = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch (e) {} }, 25000);
    req.on('close', () => { clearInterval(hb); sseClients.delete(res); });
  }

  loadState();
  
  // Inject a CTO listing as a synthetic position so it appears in the
  // sniper terminal with a "PROMOTION/CTO" badge. Bypasses the scanner
  // funnel — used for community-take-over additions.
  function injectPromotion(opts = {}) {
    const addr = opts.address;
    if (!addr) return null;
    if (state.positions.find(p => p.address === addr)) return null; // already in
    const now = Date.now();
    // Caller may pass entryPrice from DexScreener; if not, the periodic
    // updater will lock it in on first poll (entryPrice=0 path).
    const entryPrice = parseFloat(opts.entryPrice) || 0;
    const position = {
      id: now,
      symbol: opts.symbol || '?',
      address: addr,
      pairAddress: opts.pairAddress || '',
      chain: (opts.chain || 'solana').toLowerCase(),
      logo: opts.logo || '',
      name: opts.name || '',
      entryPrice,
      currentPrice: entryPrice,
      entryMarketCap: opts.entryMarketCap || 0,
      entryLiquidity: opts.entryLiquidity || 0,
      entryVolume: 0,
      dexUrl: opts.dexUrl || '',
      pumpUrl: '',
      initialSize: 0,
      currentSize: 0,
      score: 100,
      tradeType: 'CTO',
      isPump: false,
      analysis: { score: 100, safe: true, reasons: ['CTO listing — community take over'] },
      pnl: 0, pnlPct: 0, highestPnlPct: 0, highestVolume: 0,
      entryTime: now,
      trailingActivated: false, trailingHigh: 0, currentTrailDistance: 20,
      tpLevel: 0, dcaLevel: 0, dcaSecured: 0, totalDcaAdded: 0,
      isMoonBag: false,
      maxHold: 60 * 24 * 365, // a year — CTOs are tracked for life
      label: '🤝 CTO',
      status: 'PROMOTION',
      source: opts.source || 'CTO',
    };
    state.positions.push(position);
    addLog('🤝', `CTO injected: $${position.symbol} @ $${(position.entryMarketCap || 0).toLocaleString()} MC`);
    saveState();
    broadcastState();
    return position;
  }

  return {
    handleSSE,
    getState,
    start,
    stop,
    forceScan,
    closePosition,
    extendPosition,
    sellMoonBag,
    closeAllPositions,
    reset,
    handleWebSocket,
    addLog,
    loadState,
    injectPromotion,
  };
}

module.exports = { createSniperEngine };
