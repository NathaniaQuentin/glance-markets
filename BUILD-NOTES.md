# Glance Markets — Build Notes

Built 23 Nov 2026 (Day 1 of build week). Deadline 30 Nov 2026 03:59 WITA.
No DoraHacks registration, no submission, no API keys, no personal details
anywhere in the code or docs.

## What was built

Scaffolded by copying `template-minimal` (not re-typed), then renamed:
`package.json` name `glance-markets`; `app.json` package_id
`com.glancemarkets.app`, name `Glance Markets`, `min_sdk_version` 0.0.10,
edition 202601, entrypoint `index.html`.

`src/main.ts` (single file, Vite + `@evenrealities/even_hub_sdk` 0.0.10):
- One 576×288 text container; the template's event-routing pattern reused
  exactly (`eventTypeOf` resolving the CLICK default inside the envelope
  check; DOUBLE_CLICK checked before CLICK; scroll via `textEvent`).
- Tap cycles Pages 1 → 2 → 3 → 1. Scroll down/up moves the Polymarket
  3-market window (9 markets fetched, top by volume). Double-tap always
  calls `bridge.shutDownPageContainer(1)`.
- CoinGecko (5 coins, 60 s poll) + Polymarket Gamma (top 3 by volume,
  `outcomePrices` JSON string, index 0 = Yes; markets without usable prices
  skipped). `localStorage` cache + STALE mark on network failure.
- ASCII-only rendering (`^`/`v` for up/down — the G2 font is a single font
  with no size control); questions truncated to 44 chars.

## Toolchain actually used

- Node v24.22.1, npm 10.9.4, ffmpeg 8.1.2, xvfb-run.
- Global CLI restored during the build: `evenhub` 0.2.0,
  `evenhub-simulator` 0.9.5 (`npm install -g @evenrealities/evenhub-cli@latest
  @evenrealities/evenhub-simulator@latest`). Template-local fallbacks also
  present: CLI 0.1.14, simulator 0.7.3, SDK 0.0.10, Vite 5.4.21, TS 5.9.3.
- `npm run build` (tsc + vite build) passes: `dist/index.html` + 74.02 kB JS.
- Pack: `evenhub pack app.json dist -o glance-markets.ehpk --sdk-ver 0.0.10`
  → stamped 32,224-byte `.ehpk`. Warning heeded: the CLI stamps the SDK
  floor `min_app_version` 2.2.5 (above the manifest's 2.0.0).

## Verification (simulator, 23 Nov 2026)

All via the automation API on port 9898, under `xvfb-run`:
- `GET /api/ping` → `pong`; console shows `[EvenAppBridge] Bridge initialized`
  and `Glance Markets page created: success`.
- Page 1 screenshot: real prices (e.g. BTC $60,949 ^1.7%, ETH $1,712 ^1.8%,
  SOL $70.45 ^0.4%, XRP $0.9192 v1.1%, DOGE $0.0548 v0.5%, "Updated 01:43").
  Prices moved between checks, confirming live data.
- `click` → Page 2 Polymarket (Yes 10%/0%/2%, "1-3/9"); `down` → markets
  4-6/9 (Xi Jinping 2%, AOC 14%, Harris 5%); `up` → back to 1-3/9;
  `click` → Page 3 Movers (gainer ETH ^1.8%, loser XRP v1.1%);
  `double_click` → display goes blank (exit). Proof in `sim-proof/`
  (`shot-p1/p2/p2-scrolled/p3`, raw RGBA + viewable renders).
- Demo video `demo-video.mp4`: 44.08 s, 1152×576-cropped simulator capture +
  title card; shows live prices, all 3 pages, the scroll, and the double-tap
  exit. Recorded with `ffmpeg x11grab` on the Xvfb display while driving the
  simulator through its automation API. No keys or personal data on screen.

## Environment quirks (this VM — read before re-running)

The VM resets `/usr` and `/etc` between sessions (a cell rebuild replayed
during this build). System packages installed with apt do **not** persist.
Everything below is re-applied inside one run by the record script
(`/tmp/record-demo3.sh`); the extracted libraries persist in home:

- `~/workspace/.syslibs/` (223 MB): all `.deb`s from `/var/cache/apt/archives`
  (webkit2gtk-4.1, mesa/DRI, libsoup, gstreamer, …) extracted with
  `dpkg-deb -x`. Run the simulator with
  `LD_LIBRARY_PATH=$HOME/workspace/.syslibs/usr/lib/x86_64-linux-gnu`.
- `~/workspace/.gio-tls/modules/` (symlinks): only `libgiognutls.so` (TLS),
  `libgiognomeproxy.so`, `libgiolibproxy.so`; set
  `GIO_MODULE_DIR=$HOME/workspace/.gio-tls/modules`. Do **not** point GIO at
  the full modules dir — the proxy modules crash the network process if the
  GSettings schema is missing.
- `~/workspace/.syslibs/usr/share/glib-2.0/schemas/gschemas.compiled` was
  built once with `glib-compile-schemas` (the `.deb` extract has no postinst);
  export `GSETTINGS_SCHEMA_DIR` to it.
- Symlinks recreated per run under `/usr/lib/x86_64-linux-gnu/`: `webkit2gtk-4.1`
  (WebKit helper processes), `dri` (Mesa drivers), `libproxy`.
- EGL: `__EGL_VENDOR_LIBRARY_DIRS=$HOME/workspace/.syslibs/usr/share/glvnd/egl_vendor.d`
  (libglvnd has no vendor JSONs in this image → `EGL_BAD_PARAMETER` without it).
  Software rendering: `LIBGL_ALWAYS_SOFTWARE=1`, `GALLIUM_DRIVER=llvmpipe`,
  `LIBGL_DRIVERS_PATH=…/dri`. Xvfb must be (re)started after the `dri` symlink.
- Network: the VM reaches the internet only through its egress proxy (env
  `http_proxy`/`https_proxy`). WebKit needs the libproxy resolver module
  (above) to pick it up; without it both API fetches fail and the app shows
  cached values marked STALE. Direct connections fail (verified: curl 000
  without proxy env, 200 with it).
- The simulator's WebView profile persists `localStorage` across launches,
  so a stale cache can outlive a fresh simulator start; a successful fetch
  overwrites it. The 60 s poll also refreshes in place.
- `apt-get` may be locked by the cell's own os-intent replay after a rebuild;
  the `.syslibs` approach avoids apt entirely.

## Known limitations

- ASCII-only glyphs (`^`/`v` arrows); no font-size control on G2.
- Polymarket page shows the top markets by volume, which are often near-duplicate
  long-shot questions; questions are truncated mid-word at 44 chars.
- CoinGecko free tier: if rate-limited, the app shows STALE cached values.
- No voice query (stretch goal in prep notes; needs a keyed STT service).
- Demo video is silent (no narration); title card carries the pitch.
