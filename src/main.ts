import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'

// Glance Markets — Track 02 Crypto & DeFi (G2, 576x288 monochrome green).
// Read-only: live crypto prices (CoinGecko) + prediction-market odds
// (Polymarket Gamma). No keys, no funds, no trading, no advice beyond the
// on-screen disclaimer. Polls every 60 s; caches last-known values in
// localStorage and shows them with a STALE mark when the network fails.

const bridge = await waitForEvenAppBridge()

// ---------------------------------------------------------------------------
// Data sources (both keyless, public)
// ---------------------------------------------------------------------------
const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple,dogecoin&vs_currencies=usd&include_24hr_change=true'
const POLYMARKET_URL =
  'https://gamma-api.polymarket.com/markets?limit=10&active=true&closed=false'
const POLL_MS = 60_000
const STALE_MS = 5 * 60_000
const FETCH_TIMEOUT_MS = 15_000

interface CoinDef {
  id: string
  symbol: string
}
const COINS: CoinDef[] = [
  { id: 'bitcoin', symbol: 'BTC' },
  { id: 'ethereum', symbol: 'ETH' },
  { id: 'solana', symbol: 'SOL' },
  { id: 'ripple', symbol: 'XRP' },
  { id: 'dogecoin', symbol: 'DOGE' },
]

interface CoinQuote {
  symbol: string
  usd: number
  change24h: number
}
interface PolyMarket {
  question: string
  yesPct: number
  volume: number
}

// ---------------------------------------------------------------------------
// State + cache
// ---------------------------------------------------------------------------
let quotes: CoinQuote[] = []
let markets: PolyMarket[] = []
let updatedAt: number | null = null
let stale = false
let page = 0 // 0 Prices, 1 Polymarket, 2 Movers
let polyOffset = 0 // scroll window into the Polymarket list (3 at a time)

function loadCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
function saveCache(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable — app still works from live data
  }
}

const cachedQuotes = loadCache<{ quotes: CoinQuote[]; at: number }>('gm-prices')
if (cachedQuotes) {
  quotes = cachedQuotes.quotes
  updatedAt = cachedQuotes.at
  stale = Date.now() - cachedQuotes.at > STALE_MS
}
const cachedMarkets = loadCache<{ markets: PolyMarket[]; at: number }>('gm-markets')
if (cachedMarkets) {
  markets = cachedMarkets.markets
  if (updatedAt === null || cachedMarkets.at > updatedAt) updatedAt = cachedMarkets.at
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------
async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as unknown
  } finally {
    clearTimeout(timer)
  }
}

async function refreshPrices(): Promise<boolean> {
  try {
    const data = (await fetchJson(COINGECKO_URL)) as Record<
      string,
      { usd?: number; usd_24h_change?: number }
    >
    const next: CoinQuote[] = []
    for (const coin of COINS) {
      const row = data[coin.id]
      if (typeof row?.usd !== 'number') continue
      next.push({
        symbol: coin.symbol,
        usd: row.usd,
        change24h: typeof row.usd_24h_change === 'number' ? row.usd_24h_change : 0,
      })
    }
    if (next.length === 0) return false
    quotes = next
    updatedAt = Date.now()
    stale = false
    saveCache('gm-prices', { quotes, at: updatedAt })
    return true
  } catch (err) {
    console.log('Glance Markets: CoinGecko fetch failed:', err)
    return false
  }
}

async function refreshMarkets(): Promise<boolean> {
  try {
    const data = (await fetchJson(POLYMARKET_URL)) as Array<Record<string, unknown>>
    if (!Array.isArray(data)) return false
    const next: PolyMarket[] = []
    for (const row of data) {
      if (typeof row.question !== 'string' || row.question.trim() === '') continue
      let yes: number | null = null
      if (typeof row.outcomePrices === 'string') {
        try {
          const parsed = JSON.parse(row.outcomePrices) as unknown
          if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
            const v = parseFloat(parsed[0])
            if (Number.isFinite(v)) yes = v
          }
        } catch {
          // unusable prices — skip this market
        }
      }
      if (yes === null) continue
      const volume =
        typeof row.volumeNum === 'number'
          ? row.volumeNum
          : typeof row.volume === 'string'
            ? parseFloat(row.volume) || 0
            : 0
      next.push({ question: row.question.trim(), yesPct: yes * 100, volume })
    }
    if (next.length === 0) return false
    next.sort((a, b) => b.volume - a.volume)
    markets = next.slice(0, 9)
    if (updatedAt === null) updatedAt = Date.now()
    stale = false
    saveCache('gm-markets', { markets, at: Date.now() })
    polyOffset = Math.min(polyOffset, Math.max(0, markets.length - 3))
    return true
  } catch (err) {
    console.log('Glance Markets: Polymarket fetch failed:', err)
    return false
  }
}

async function refreshAll(): Promise<void> {
  const hadData = quotes.length > 0 || markets.length > 0
  const [okPrices, okMarkets] = await Promise.all([refreshPrices(), refreshMarkets()])
  if (!okPrices && !okMarkets && hadData) {
    // Network failed but we have cached values: keep showing them, marked stale.
    stale = true
  }
  render()
}

// ---------------------------------------------------------------------------
// Formatting (ASCII only — the G2 built-in font is a single font; '^'/'v'
// are the up/down arrows)
// ---------------------------------------------------------------------------
function fmtPrice(usd: number): string {
  if (usd >= 1000) return '$' + Math.round(usd).toLocaleString('en-US')
  if (usd >= 1) return '$' + usd.toFixed(2)
  return '$' + usd.toFixed(4)
}

function fmtChange(change24h: number): string {
  const arrow = change24h >= 0 ? '^' : 'v'
  return `${arrow} ${Math.abs(change24h).toFixed(1)}%`
}

function fmtTime(at: number | null): string {
  if (at === null) return '--:--'
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 3) + '...' : text
}

function footer(): string {
  return `Updated ${fmtTime(updatedAt)}${stale ? ' STALE' : ''} - read-only, not advice`
}

// ---------------------------------------------------------------------------
// Rendering — one text container, 576x288, plain lines
// ---------------------------------------------------------------------------
function pageContent(): string {
  const lines: string[] = []
  if (page === 0) {
    lines.push('GLANCE MARKETS  1/3  PRICES')
    if (quotes.length === 0) {
      lines.push('', 'Loading live prices...', '', 'Check connection,')
      lines.push('cached prices will show here.')
    } else {
      for (const q of quotes) {
        lines.push(`${q.symbol.padEnd(4)} ${fmtPrice(q.usd).padEnd(10)} ${fmtChange(q.change24h)}`)
      }
    }
  } else if (page === 1) {
    const shown = markets.slice(polyOffset, polyOffset + 3)
    const range =
      markets.length > 0 ? `${polyOffset + 1}-${Math.min(polyOffset + 3, markets.length)}/${markets.length}` : ''
    lines.push(`GLANCE MARKETS  2/3  POLYMARKET ${range}`)
    if (shown.length === 0) {
      lines.push('', 'Loading live markets...', '', 'Check connection,')
      lines.push('cached markets will show here.')
    } else {
      shown.forEach((m, i) => {
        lines.push(`${polyOffset + i + 1}. ${truncate(m.question, 44)}`)
        lines.push(`   Yes ${m.yesPct.toFixed(0)}%`)
      })
    }
  } else {
    lines.push('GLANCE MARKETS  3/3  MOVERS 24H')
    if (quotes.length === 0) {
      lines.push('', 'Loading live prices...', '', 'Check connection,')
      lines.push('cached prices will show here.')
    } else {
      const sorted = [...quotes].sort((a, b) => b.change24h - a.change24h)
      const gainer = sorted[0]
      const loser = sorted[sorted.length - 1]
      lines.push('TOP GAINER')
      lines.push(`${gainer.symbol} ${fmtPrice(gainer.usd)} ${fmtChange(gainer.change24h)}`)
      lines.push('TOP LOSER')
      lines.push(`${loser.symbol} ${fmtPrice(loser.usd)} ${fmtChange(loser.change24h)}`)
    }
  }
  lines.push(footer())
  return lines.join('\n')
}

function render(): void {
  const content = pageContent()
  bridge.textContainerUpgrade(
    new TextContainerUpgrade({
      containerID: 1,
      containerName: 'main',
      content,
    }),
  )
  // Mirror the same content in the companion WebView (debugging / demo).
  const app = document.getElementById('app')
  if (app) app.textContent = content
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
const mainText = new TextContainerProperty({
  xPosition: 0,
  yPosition: 0,
  width: 576,
  height: 288,
  borderWidth: 0,
  borderColor: 5,
  paddingLength: 4,
  containerID: 1,
  containerName: 'main',
  content: 'Glance Markets\nLoading live prices...',
  isEventCapture: 1,
})

const result = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({
    containerTotalNum: 1,
    textObject: [mainText],
  }),
)

console.log('Glance Markets page created:', result === 0 ? 'success' : `failed (${result})`)

render()
void refreshAll()
setInterval(() => {
  void refreshAll()
}, POLL_MS)

// Reads the event type out of one envelope.
//
// CLICK_EVENT is 0, and protobuf omits zero-value fields on the wire, so a
// single tap arrives as an envelope whose `eventType` is `undefined`. The
// default has to be resolved INSIDE the envelope check. Writing
// `event.sysEvent?.eventType ?? OsEventTypeList.CLICK_EVENT` instead would
// read CLICK on events that carry no `sysEvent` at all, so every scroll,
// exit and audio frame would fire the tap handler.
function eventTypeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
  if (!envelope) return null
  return envelope.eventType ?? OsEventTypeList.CLICK_EVENT
}

// Event routing, critical details:
//   • Taps/double-taps/lifecycle come through `event.sysEvent`.
//     Scroll gestures come through `event.textEvent`. Never mix them.
//   • Double-tap → `shutDownPageContainer(1)` is a root-level check: it
//     must fire no matter which envelope the event arrives in, so users
//     can always exit the app.
//   • Check DOUBLE_CLICK_EVENT before CLICK_EVENT.
const unsubscribe = bridge.onEvenHubEvent(event => {
  const sysType = eventTypeOf(event.sysEvent)
  const textType = eventTypeOf(event.textEvent)

  if (sysType === OsEventTypeList.DOUBLE_CLICK_EVENT || textType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    bridge.shutDownPageContainer(1)
    return
  }

  if (sysType === OsEventTypeList.CLICK_EVENT || textType === OsEventTypeList.CLICK_EVENT) {
    page = (page + 1) % 3
    render()
    return
  }

  // Ring / up-down scroll: on the Polymarket page it moves the 3-market
  // window; on other pages there is nothing to scroll.
  if (
    sysType === OsEventTypeList.SCROLL_TOP_EVENT ||
    textType === OsEventTypeList.SCROLL_TOP_EVENT
  ) {
    if (page === 1 && markets.length > 3) {
      polyOffset = Math.max(0, polyOffset - 3)
      render()
    }
    return
  }
  if (
    sysType === OsEventTypeList.SCROLL_BOTTOM_EVENT ||
    textType === OsEventTypeList.SCROLL_BOTTOM_EVENT
  ) {
    if (page === 1 && markets.length > 3) {
      polyOffset = Math.min(markets.length - 3, polyOffset + 3)
      render()
    }
    return
  }

  if (sysType === OsEventTypeList.SYSTEM_EXIT_EVENT || sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
    unsubscribe()
  }
})
