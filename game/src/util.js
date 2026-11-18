// Small math and random helpers shared by every system.
/** Mulberry32 seeded random: deterministic per seed, used for the whole city. */
export function createRandom(seed) {
  let a = seed >>> 0;
  return {
    next() {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range(min, max) { return min + this.next() * (max - min); },
    int(min, max) { return Math.floor(this.range(min, max + 1)); },
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; },
  };
}

export function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
/** Shortest signed angle difference, for steering and camera yaw. */
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function distance2D(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }
/** Format cash like $12,450. */
export function money(n) { return '$' + Math.floor(n).toLocaleString('en-US'); }
