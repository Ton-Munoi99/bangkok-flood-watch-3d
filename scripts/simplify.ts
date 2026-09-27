// Douglas–Peucker for boundary files (build-time only).
type Pt = [number, number];
function dp(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts.at(-1)!];
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i], dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.abs(dy * x - dx * y + b[0] * a[1] - b[1] * a[0]) / (Math.hypot(dx, dy) || 1);
    if (d > max) { max = d; idx = i; }
  }
  return max > tol ? [...dp(pts.slice(0, idx + 1), tol).slice(0, -1), ...dp(pts.slice(idx), tol)] : [a, b];
}
/** A ring starts and ends on the same point, so split it at its middle and simplify both halves. null = collapsed. */
export function simplifyRing(r: Pt[], tol: number, decimals = 3): Pt[] | null {
  const mid = r.length >> 1;
  const out = [...dp(r.slice(0, mid + 1), tol).slice(0, -1), ...dp(r.slice(mid), tol)].map(([x, y]) => [+x.toFixed(decimals), +y.toFixed(decimals)] as Pt);
  return out.length >= 4 ? out : null;
}
export function simplifyPolys(geom: { type: string; coordinates: unknown }, tol: number): Pt[][][] {
  const polys = (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates) as Pt[][][];
  return polys.map((p) => p.map((r) => simplifyRing(r, tol)).filter((r): r is Pt[] => !!r)).filter((p) => p.length);
}
