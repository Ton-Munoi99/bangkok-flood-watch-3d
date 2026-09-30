// Tiny inline-SVG line charts for popups (pure: numbers in, markup out, so it can be tested without a browser).
import { slotMs, type DayFile } from './history.ts';

export type Pt = [ms: number, v: number];

/** One station's readings from day files, oldest first, inside [from, to]. Road: a bucket that exists means the feed
 *  was live, so a station missing from it read 0 cm. Canal: only buckets that actually carry the station. */
export function stationSeries(files: [day: string, f: DayFile][], kind: 'road' | 'canal', id: string, from: number, to: number): Pt[] {
  const out: Pt[] = [];
  for (const [day, f] of files) for (const [b, vals] of Object.entries(f[kind])) {
    const ms = slotMs(day, b);
    if (ms < from || ms > to) continue;
    const v = vals[id] ?? (kind === 'road' ? 0 : undefined);
    if (v != null) out.push([ms, v]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

const p2 = (n: number) => String(n).padStart(2, '0');
/** "28/09 14:30" in Bangkok time. */
const stamp = (ms: number) => { const d = new Date(ms + 7 * 3600_000); return `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`; };

export interface ChartOpts { bank?: number | null; unit: string; digits: number; color?: string; from: number; to: number; w?: number; h?: number; title?: string }
/** Line chart with min/max labels, optional dashed bank line, and start/end times. Returns '' when there is too little data. */
export function chartSvg(pts: Pt[], o: ChartOpts) {
  if (pts.length < 3) return '';
  const w = o.w ?? 260, h = o.h ?? 92, L = 34, R = 6, T = 8, B = 20;
  let lo = Math.min(...pts.map((p) => p[1])), hi = Math.max(...pts.map((p) => p[1]));
  // Show the bank only when it is near the data; a bank far above would flatten the line to nothing.
  const bank = o.bank != null && o.bank >= lo - 1 && o.bank <= hi + 1 ? o.bank : null;
  if (bank != null) { lo = Math.min(lo, bank); hi = Math.max(hi, bank); }
  if (hi - lo < (o.unit === 'cm' ? 5 : 0.1)) { const mid = (hi + lo) / 2, half = o.unit === 'cm' ? 2.5 : 0.05; lo = mid - half; hi = mid + half; }
  const x = (ms: number) => L + ((ms - o.from) / Math.max(1, o.to - o.from)) * (w - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (h - T - B);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join('');
  const f = (v: number) => v.toFixed(o.digits);
  const lbl = (txt: string, xx: number, yy: number, anchor = 'end') => `<text x="${xx}" y="${yy}" text-anchor="${anchor}" font-size="9" fill="currentColor" opacity=".7">${txt}</text>`;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${o.title ?? ''}">` +
    `<line x1="${L}" y1="${T}" x2="${w - R}" y2="${T}" stroke="currentColor" opacity=".12"/><line x1="${L}" y1="${h - B}" x2="${w - R}" y2="${h - B}" stroke="currentColor" opacity=".25"/>` +
    (bank != null ? `<line x1="${L}" y1="${y(bank).toFixed(1)}" x2="${w - R}" y2="${y(bank).toFixed(1)}" stroke="#f2495c" stroke-dasharray="4 3"/>` : '') +
    `<path d="${d}" fill="none" stroke="${o.color ?? '#38bdf8'}" stroke-width="1.8" stroke-linejoin="round"/>` +
    `<circle cx="${x(pts.at(-1)![0]).toFixed(1)}" cy="${y(pts.at(-1)![1]).toFixed(1)}" r="2.6" fill="${o.color ?? '#38bdf8'}"/>` +
    lbl(f(hi), L - 4, T + 3) + lbl(f(lo), L - 4, h - B) +
    lbl(stamp(o.from), L, h - 6, 'start') + lbl(stamp(o.to), w - R, h - 6) + `</svg>`;
}
