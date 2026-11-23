# Glance Markets

**One glance, on the glasses: live crypto prices + prediction-market odds.**
Built for the Even Realities G2 smart glasses (576×288 monochrome green display).
Entry for the **"Heads Up: Even Realities Hackathon" — Track 02 Crypto & DeFi**.

- **Page 1 — Prices:** BTC, ETH, SOL, XRP, DOGE with price and 24h % change (^ / v arrows).
- **Page 2 — Polymarket:** top live markets with Yes % odds, sorted by volume (scroll for more).
- **Page 3 — Movers:** biggest 24h gainer and loser of the day.
- Footer on every page: `Updated HH:MM · read-only · not financial advice`.

**Interaction:** single tap cycles pages · ring / up-down scrolls the Polymarket list ·
double-tap exits (required pattern).

## Read-only, no keys, no funds, not financial advice

- No API keys, no accounts, no sign-in, no trading, no funds held.
- Data comes from two free, keyless public APIs (see below). Prices refresh every 60 s.
- Last-known values are cached in `localStorage`; if the network fails the app keeps
  showing cached values marked **STALE** instead of a blank screen.
- Nothing on screen is financial advice — the disclaimer is on every page.

## Data sources

| Source | Use | Key? |
|---|---|---|
| CoinGecko `simple/price` — BTC, ETH, SOL, XRP, DOGE, USD + 24h change | Pages 1 & 3 | No |
| Polymarket Gamma API — active markets, `outcomePrices` (index 0 = Yes) | Page 2 | No |

## Run in the simulator

Requires Node 24+ and the Even Hub CLI/simulator (see `BUILD-NOTES.md` for the
exact toolchain versions used and the Linux library setup).

```bash
npm install
npm run dev            # Vite dev server on http://localhost:5173
# in another shell:
xvfb-run -a evenhub-simulator http://localhost:5173 --automation-port 9898
```

Automation API (for scripted testing): `GET /api/ping` → `pong`,
`GET /api/screenshot/glasses` (576×288 PNG),
`POST /api/input {"action":"click|down|up|double_click"}`.

## Build & pack

```bash
npm run build          # tsc + vite build -> dist/
evenhub pack app.json dist -o glance-markets.ehpk --sdk-ver 0.0.10
```

## What's in here

| File | Purpose |
|---|---|
| `src/main.ts` | App: fetches, 3 pages, tap/scroll/double-tap routing, cache + STALE fallback. |
| `index.html` | WebView host; mirrors the glasses text for debugging. |
| `app.json` | Even Hub manifest (`com.glancemarkets.app`, SDK 0.0.10). |
| `demo-video.mp4` | 44 s demo: simulator's green display, all 3 pages, scroll, double-tap exit. |
| `glance-markets.ehpk` | Packaged build (SDK 0.0.10, min_app_version stamped 2.2.5). |
| `sim-proof/` | Automation-API screenshots proving each page renders with live data. |
| `BUILD-NOTES.md` | What was built, toolchain, verification results, limitations. |

## Known limitations

- The G2 built-in font is a single font with no size control, so up/down arrows are
  ASCII `^` / `v` and all text is ASCII-only.
- Polymarket questions are truncated to fit the 576 px width.
- CoinGecko free tier is rate-limited; the app polls once a minute, well inside it.
