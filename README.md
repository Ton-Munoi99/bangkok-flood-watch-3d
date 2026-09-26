# Bangkok Flood Watch 3D

แผนที่ 3D กรุงเทพฯ แสดงสถานการณ์น้ำท่วมจากข้อมูลจริง: เซนเซอร์น้ำท่วมถนนของ กทม., ระดับน้ำคลอง/ฝนจากคลังข้อมูลน้ำแห่งชาติ และเรื่องแจ้งน้ำท่วมจาก Traffy Fondue

3D map of Bangkok showing live flooding from BMA road-flood sensors, ThaiWater canal levels and rainfall, and Traffy Fondue citizen reports.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
node scripts/check-sources.ts   # parser self-check
```

`VITE_DATA_MODE=mock` (see `.env.example`) forces the saved snapshots in `src/data/mock/`. In live mode each source falls back to its snapshot on failure, and the page always labels snapshot data.

## History (7 days)

- `netlify/functions/collect.mts` runs every 10 min on Netlify and stores readings in Netlify Blobs (`history` store, one JSON file per Bangkok day, older than 7 days deleted).
- `netlify/functions/history.mts` serves them at `/api/history/meta` and `/api/history/YYYY-MM-DD`; the page's date/time picker reads these.
- `scripts/backfill.ts` fills the days before the collector existed (road-flood and canal graphs from ThaiWater, Traffy by date). Run once: `NETLIFY_SITE_ID=… NETLIFY_AUTH_TOKEN=… node scripts/backfill.ts`, or `--dry <dir>` to write files locally. For local UI testing: `HISTORY_DIR=<dir> npm run dev`.
- History stores no Traffy report text, photos or addresses — only id, position, time and state.
- The collector runs outside Thailand, so it cannot read weather.bangkok.go.th directly (Thai IPs only). Road-flood history comes from ThaiWater's relay of the same BMA sensors, and has gaps whenever that relay stalls.

## Live BMA road flooding (Thai-side collector)

weather.bangkok.go.th only answers Thai IP addresses, so neither Netlify nor any overseas server can read it.
`scripts/collect-bma.ts` runs on a machine in Thailand, reads the public home page once (with an honest
User-Agent), and POSTs the readings to `/api/ingest` (`netlify/functions/ingest.mts`), which also records them into history.
The page prefers these readings when they are under 45 min old, then ThaiWater's relay (under 1 h), then the labelled snapshot.

```bash
node scripts/collect-bma.ts --dry                   # test from a Thai IP
INGEST_TOKEN=<secret> node scripts/collect-bma.ts   # push; the same secret must be set as INGEST_TOKEN in Netlify env vars
```

Schedule it (this project uses every 30 min) with launchd/cron on a Mac or PC in Thailand, or an AWS Lambda in `ap-southeast-7` (Bangkok).

## Data sources & attribution

| Layer | Source | Notes |
|---|---|---|
| Road flooding (cm) | สำนักการระบายน้ำ กรุงเทพมหานคร — [weather.bangkok.go.th](https://weather.bangkok.go.th/flood/) | No official API, and the site only answers Thai IPs. Deployed, readings come from the Thai-side collector (below), then ThaiWater's relay of the same sensors. The dev server reads `/flood/` directly through a Vite proxy. Ask the department for an official feed before heavy public use. |
| Canal/river level, 24h rain | คลังข้อมูลน้ำแห่งชาติ (สสน./HII) — [thaiwater.net](https://www.thaiwater.net) public API | |
| Citizen flood reports | [Traffy Fondue](https://share.traffy.in.th/teamchadchart) public share API (NECTEC × BMA) | Filtered to reports mentioning "ท่วม" in the last 24h. |
| District boundaries | [OpenGISData-Thailand](https://github.com/chingchai/OpenGISData-Thailand) (chingchai) | |
| Basemap, 3D buildings | [OpenFreeMap](https://openfreemap.org) / OpenMapTiles, © OpenStreetMap contributors | |
| Satellite | Esri World Imagery — "Powered by Esri" | Esri basemap terms apply; commercial use needs an ArcGIS account. |
| Terrain | [AWS Terrain Tiles](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) (Terrarium) | ~30 m resolution; Bangkok is too flat for this to be a primary flood-elevation source. |
| Simulation mode ground heights | `data/bkk_data.json` from the prototype | **Simulated**, not a real DEM. Labelled in the UI. |
