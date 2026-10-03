import type { Vec } from "./types.ts";

export interface Lane {
  points: Vec[];
  cum: number[]; // distance along the lane at each point
  length: number;
}

export function makeLane(points: Vec[]): Lane {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]!;
    const [bx, by] = points[i]!;
    cum.push(cum[i - 1]! + Math.hypot(bx - ax, by - ay));
  }
  return { points, cum, length: cum[cum.length - 1]! };
}

/** Position at distance `s` along the lane, clamped to its ends. */
export function pointAt(lane: Lane, s: number, out: Vec = [0, 0]): Vec {
  const { points, cum } = lane;
  if (s <= 0) return set(out, points[0]!);
  for (let i = 1; i < points.length; i++) {
    if (s <= cum[i]!) {
      const a = points[i - 1]!;
      const b = points[i]!;
      const t = (s - cum[i - 1]!) / (cum[i]! - cum[i - 1]! || 1);
      out[0] = a[0] + (b[0] - a[0]) * t;
      out[1] = a[1] + (b[1] - a[1]) * t;
      return out;
    }
  }
  return set(out, points[points.length - 1]!);
}

/** Unit direction of travel at distance `s`. */
export function directionAt(lane: Lane, s: number): Vec {
  const { points, cum } = lane;
  let i = 1;
  while (i < points.length - 1 && s > cum[i]!) i++;
  const a = points[i - 1]!;
  const b = points[i]!;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
}

/** The closest point on the lane to `p`, as a distance along the lane. */
export function closestS(lane: Lane, p: Vec): { s: number; dist: number } {
  let best = { s: 0, dist: Infinity };
  for (let i = 1; i < lane.points.length; i++) {
    const [ax, ay] = lane.points[i - 1]!;
    const [bx, by] = lane.points[i]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2));
    const dist = Math.hypot(ax + dx * t - p[0], ay + dy * t - p[1]);
    if (dist < best.dist) best = { s: lane.cum[i - 1]! + Math.sqrt(len2) * t, dist };
  }
  return best;
}

function set(out: Vec, p: Vec): Vec {
  out[0] = p[0];
  out[1] = p[1];
  return out;
}
