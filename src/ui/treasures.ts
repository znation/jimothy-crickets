// Jimothy's treasures: little SVG pictures of the junk he finds in each pile, drawn like the other
// icons (thick plum outline, flat fills). A painted sprite named `treasure-<id>` replaces one.

const INK = "#2a2233";
const wrap = (body: string) =>
  `<svg viewBox="0 0 64 64"><g stroke="${INK}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`;

/** A ring of `n` points alternating between two radii: bottle-cap crimps, stars, sunflower petals. */
function star(cx: number, cy: number, r1: number, r2: number, n: number, rot = -90) {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    const r = i % 2 ? r2 : r1;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`);
  }
  return pts.join(" ");
}

const duck = (body: string, beak: string) =>
  `<path d="M8 40c0-6 6-9 12-8l4 1c-4-3-6-7-5-12 1-7 7-11 14-10s11 7 10 13c0 3-2 6-4 8 6-2 13-1 15 4 3 9-6 18-22 18C17 54 8 48 8 40z" fill="${body}"/>` +
  `<path d="M42 24c4 0 9 1 12 3-2 3-7 4-12 3" fill="${beak}"/>` +
  `<circle cx="35" cy="20" r="2.6" fill="${INK}" stroke="none"/>` +
  `<path d="M22 42c4 4 11 5 16 1" fill="none"/>`;

const ICONS: Record<string, string> = {
  // ---- the alley
  duck: duck("#ffd23f", "#ff8a3d"),
  sock: `<path d="M22 6h18v28l9 9c5 5 2 14-6 14-3 0-5-1-7-3L22 41z" fill="#e8504f"/><path d="M22 6h18v9H22z" fill="#fff"/><path d="M22 23h18M22 30h18" stroke="#fff" stroke-width="4"/><path d="M22 6h18v28l9 9c5 5 2 14-6 14-3 0-5-1-7-3L22 41z" fill="none"/>`,
  sandwich: `<path d="M8 50 50 10l4 40z" fill="#f5d08a"/><path d="M14 46 49 15l2 31z" fill="#fff4dc" stroke="none"/><path d="M12 44c8-1 14-5 18-10 4 3 9 4 14 2" fill="none" stroke="#6cc24a" stroke-width="5"/><path d="M28 40c5 0 10-1 14-4" fill="none" stroke="#e8504f" stroke-width="5"/><path d="M8 50 50 10l4 40z" fill="none"/>`,
  bottleCap: `<polygon points="${star(32, 32, 25, 21, 14)}" fill="#e8504f"/><circle cx="32" cy="32" r="13" fill="#ff8a8a"/><path d="M26 28c2-2 6-3 9-1" fill="none" stroke="#fff" stroke-width="3"/>`,
  fishBone: `<path d="M44 32l12-12v24z" fill="#e6ecf2"/><path d="M8 32c4-9 14-10 20-4l-4 4 4 4c-6 6-16 5-20-4z" fill="#e6ecf2"/><path d="M26 32h22M32 22v20M38 24v16M44 27v10" fill="none"/><circle cx="14" cy="30" r="2" fill="${INK}" stroke="none"/>`,
  tinCan: `<path d="M16 16h32v34c0 4-7 7-16 7s-16-3-16-7z" fill="#c9d1d9"/><path d="M16 26h32v16H16z" fill="#4aa3df"/><ellipse cx="32" cy="16" rx="16" ry="6" fill="#e6ecf2"/><path d="M26 34h12" stroke="#fff" stroke-width="3"/>`,
  bananaPeel: `<path d="M25 58h14l2-24H23z" fill="#ffd23f"/><path d="M24 36c-8-3-16 3-18 14 9-2 14-7 18-14z" fill="#ffd23f"/><path d="M40 36c8-3 16 3 18 14-9-2-14-7-18-14z" fill="#ffd23f"/><path d="M26 36c0-12 2-22 6-28 4 6 6 16 6 28z" fill="#fff4b0"/><path d="M28 36c-1 8 1 14 4 18 3-4 5-10 4-18z" fill="#f2c230"/><path d="M27 52h10" stroke="#9b6a3c" stroke-width="2.5"/>`,
  button: `<circle cx="32" cy="32" r="22" fill="#9c6ade"/><circle cx="32" cy="32" r="15" fill="#b98cf0" stroke-width="2.5"/><g fill="${INK}" stroke="none"><circle cx="27" cy="27" r="3"/><circle cx="37" cy="27" r="3"/><circle cx="27" cy="37" r="3"/><circle cx="37" cy="37" r="3"/></g>`,
  cheese: `<path d="M6 44 48 18l10 8v20z" fill="#ffd23f"/><path d="M6 44h52v8H6z" fill="#f2b632"/><path d="M6 44 48 18l10 8" fill="none"/><g fill="#f2b632" stroke="none"><circle cx="40" cy="36" r="4"/><circle cx="24" cy="40" r="3"/><circle cx="50" cy="31" r="2.5"/></g>`,
  boot: `<path d="M18 6h18v30c0 4 4 6 10 7 7 1 12 5 12 11v4H14V38z" fill="#9b6a3c"/><path d="M14 52h44v6H14z" fill="#5a3a22"/><path d="M18 14h18" stroke-width="3"/><path d="M26 22l6 3M26 29l6 3" stroke="#f5e6c8" stroke-width="3"/>`,
  key: `<circle cx="18" cy="22" r="11" fill="#ffcc4d"/><circle cx="18" cy="22" r="4.5" fill="none"/><path d="M26 30l24 24" stroke-width="9"/><path d="M26 30l24 24" stroke="#ffcc4d" stroke-width="3"/><path d="M42 46l6-6M48 52l5-5" stroke-width="4"/>`,
  appleCore: `<path d="M18 10c6 0 10 4 14 4s8-4 14-4c5 0 7 6 2 11-5 5-7 7-7 11s2 6 7 11c5 5 3 11-2 11-6 0-10-4-14-4s-8 4-14 4c-5 0-7-6-2-11 5-5 7-7 7-11s-2-6-7-11c-5-5-3-11 2-11z" fill="#fff4dc"/><path d="M18 10c6 0 10 4 14 4s8-4 14-4c5 0 7 6 2 11H16c-5-5-3-11 2-11zM16 43h32c5 5 3 11-2 11-6 0-10-4-14-4s-8 4-14 4c-5 0-7-6-2-11z" fill="#e8504f"/><path d="M32 14V5"/><path d="M33 7c4-4 10-4 12-1-4 3-8 3-12 1z" fill="#6cc24a"/><g fill="#5a3a22" stroke="none"><ellipse cx="29" cy="32" rx="1.8" ry="3"/><ellipse cx="35" cy="32" rx="1.8" ry="3"/></g>`,
  penny: `<circle cx="32" cy="32" r="22" fill="#d9864e"/><circle cx="32" cy="32" r="15" fill="none" stroke="#a85a2a" stroke-width="3"/><path d="M28 26l5-3v18" fill="none" stroke="#a85a2a" stroke-width="4"/><path d="M18 22c3-5 8-8 14-8" fill="none" stroke="#f2b07a" stroke-width="3"/>`,
  spoon: `<g transform="rotate(-40 32 32)"><ellipse cx="32" cy="18" rx="10" ry="13" fill="#e6ecf2"/><path d="M29 30h6v28h-6z" fill="#c9d1d9"/><path d="M28 12c1-3 3-4 5-4" fill="none" stroke="#fff" stroke-width="3"/></g>`,
  pizza: `<path d="M10 14c14-6 30-6 44 0L32 58z" fill="#ffd23f"/><path d="M10 14c14-6 30-6 44 0l-2 6c-13-5-27-5-40 0z" fill="#d9a35f"/><g fill="#e8504f"><circle cx="28" cy="28" r="5"/><circle cx="40" cy="30" r="4"/><circle cx="33" cy="42" r="4"/></g>`,

  // ---- the back yards
  tennisBall: `<circle cx="32" cy="32" r="22" fill="#d4e94a"/><path d="M14 18c10 6 10 22 0 28M50 18c-10 6-10 22 0 28" fill="none" stroke="#fff" stroke-width="3.5"/><circle cx="32" cy="32" r="22" fill="none"/>`,
  gardenGlove: `<path d="M18 58V30c0-3 1-4 3-4s3 1 3 4V14c0-3 1-4 3-4s3 1 3 4v-4c0-3 1-4 3-4s3 1 3 4v6c0-3 1-4 3-4s3 1 3 4v20l6-6c2-2 5-1 5 2 0 2-1 3-2 5L42 50v8z" fill="#6cc24a"/><path d="M18 50h24v8H18z" fill="#ffcc4d"/><path d="M24 30v6M30 26v8M36 26v8" fill="none" stroke-width="3"/>`,
  flowerPot: `<path d="M16 34h32l-5 24H21z" fill="#d9864e"/><path d="M13 30h38v7H13z" fill="#e89a62"/><path d="M32 30V16" stroke="#3f8f3a"/><path d="M32 24c-4-4-10-3-11 1 4 3 8 2 11-1z" fill="#6cc24a"/><polygon points="${star(32, 13, 9, 5, 5)}" fill="#ff7fae"/><circle cx="32" cy="13" r="3" fill="#ffd23f" stroke-width="2"/>`,
  frisbee: `<ellipse cx="32" cy="34" rx="26" ry="13" fill="#e8504f"/><ellipse cx="32" cy="31" rx="15" ry="6" fill="#ff8a8a" stroke-width="3"/><path d="M8 37c6 7 42 7 48 0" fill="none" stroke="#b83232" stroke-width="3"/>`,
  dogBone: `<g transform="rotate(-30 32 32)"><path d="M16 26h32M16 38h32" /><path d="M16 26h32v12H16z" fill="#fff4dc" stroke="none"/><circle cx="12" cy="25" r="7" fill="#fff4dc"/><circle cx="12" cy="39" r="7" fill="#fff4dc"/><circle cx="52" cy="25" r="7" fill="#fff4dc"/><circle cx="52" cy="39" r="7" fill="#fff4dc"/><path d="M17 27h30v10H17z" fill="#fff4dc" stroke="none"/><path d="M18 26h28M18 38h28" fill="none"/></g>`,
  pinecone: `<path d="M32 6c10 4 16 14 16 26S40 56 32 58c-8-2-16-14-16-26S22 10 32 6z" fill="#9b6a3c"/><path d="M20 22c6 4 18 4 24 0M17 32c8 5 22 5 30 0M19 42c7 5 19 5 26 0M24 51c4 3 12 3 16 0" fill="none" stroke="#5a3a22" stroke-width="3"/><path d="M32 6V2" stroke-width="4"/>`,
  wateringCan: `<path d="M14 26h28v26c0 3-3 5-6 5H20c-3 0-6-2-6-5z" fill="#4aa3df"/><path d="M42 40 56 22" stroke-width="6"/><path d="M42 40 56 22" stroke="#4aa3df" stroke-width="2"/><path d="M52 18l8 2-3 6z" fill="#4aa3df"/><path d="M14 30c-8 0-10 14 0 16" fill="none" stroke-width="5"/><path d="M14 26c4-8 24-8 28 0" fill="none" stroke-width="4"/><path d="M20 34h16" stroke="#9fd3f5" stroke-width="3"/>`,
  gnomeHat: `<path d="M12 54c8-12 14-30 26-44 6 4 4 12 0 14l12 30z" fill="#e8504f"/><path d="M8 52c10-4 34-4 46 0v6H8z" fill="#fff"/><path d="M38 10c6 2 8 8 4 12" fill="none"/><circle cx="44" cy="22" r="4" fill="#fff"/>`,
  snailShell: `<path d="M32 10a22 22 0 1 1-1 0z" fill="#f2b07a"/><path d="M32 54a22 22 0 0 0 0-44 16 16 0 0 0 0 32 10 10 0 0 0 0-20 5 5 0 0 0 0 10" fill="none" stroke="#a85a2a" stroke-width="3.5"/>`,
  lightbulb: `<path d="M32 6c11 0 18 8 18 17 0 8-6 12-8 18H22c-2-6-8-10-8-18 0-9 7-17 18-17z" fill="#fff0a8"/><path d="M22 42h20v6H22zM24 48h16v5H24z" fill="#c9d1d9"/><path d="M28 56h8" stroke-width="4"/><path d="M27 41c0-8-3-12-3-16M37 41c0-8 3-12 3-16" fill="none" stroke="#f2b632" stroke-width="2.5"/><path d="M22 18c2-4 6-6 10-6" fill="none" stroke="#fff" stroke-width="3"/>`,
  marble: `<circle cx="32" cy="32" r="21" fill="#4aa3df"/><path d="M14 36c8-2 10-12 20-14s12 8 18 6" fill="none" stroke="#9fd3f5" stroke-width="5"/><path d="M18 46c8 2 18-2 22-8" fill="none" stroke="#2f6fb0" stroke-width="4"/><circle cx="24" cy="22" r="4" fill="#fff" stroke="none"/><circle cx="32" cy="32" r="21" fill="none"/>`,
  feather: `<g transform="rotate(35 32 32)"><path d="M32 4c10 8 12 22 8 36-2 6-5 10-8 12-3-2-6-6-8-12-4-14-2-28 8-36z" fill="#8fd3ff"/><path d="M32 10v50" fill="none"/><path d="M32 22l7-5M32 30l8-5M32 38l7-5M32 22l-7-5M32 30l-8-5M32 38l-7-5" fill="none" stroke="#4aa3df" stroke-width="2.5"/></g>`,
  kite: `<path d="M32 4 50 24 32 44 14 24z" fill="#ffd23f"/><path d="M32 4v40M14 24h36" fill="none" stroke-width="2.5"/><path d="M32 4 50 24H32z" fill="#e8504f" stroke-width="2.5"/><path d="M32 24v20L14 24z" fill="#4aa3df" stroke-width="2.5"/><path d="M32 44c-4 4 4 6 0 10s4 6 2 8" fill="none" stroke-width="2.5"/><path d="M28 50l4 2-4 2zM36 50l-4 2 4 2z" fill="#e8504f" stroke-width="2"/>`,
  shovel: `<g transform="rotate(-35 32 32)"><path d="M29 4h6v32h-6z" fill="#ffd23f"/><path d="M24 4h16" stroke-width="5"/><path d="M20 34h24v10c0 8-6 14-12 16-6-2-12-8-12-16z" fill="#e8504f"/><path d="M32 40v12" stroke="#ff8a8a" stroke-width="3"/></g>`,
  birdhouse: `<path d="M16 28h32v28H16z" fill="#f2b07a"/><path d="M10 30 32 10l22 20" fill="#e8504f"/><circle cx="32" cy="38" r="5" fill="${INK}"/><path d="M32 48v6" stroke-width="4"/><path d="M10 30 32 10l22 20" fill="none" stroke-width="5"/>`,

  // ---- the cul-de-sac
  toyCar: `<path d="M6 40c0-6 4-8 8-8l6-10h20l8 10c6 0 10 2 10 8v6H6z" fill="#4aa3df"/><path d="M22 24h7v8h-11zM34 24h5l6 8H34z" fill="#c8ecff" stroke-width="2.5"/><circle cx="18" cy="46" r="6" fill="${INK}"/><circle cx="46" cy="46" r="6" fill="${INK}"/><circle cx="18" cy="46" r="2" fill="#c9d1d9" stroke="none"/><circle cx="46" cy="46" r="2" fill="#c9d1d9" stroke="none"/>`,
  crayon: `<g transform="rotate(-40 32 32)"><path d="M26 14h12v44H26z" fill="#9c6ade"/><path d="M26 14 32 2l6 12z" fill="#9c6ade"/><path d="M26 22h12v18H26z" fill="#fff4dc" stroke-width="2.5"/><path d="M29 28h6M29 33h6" stroke="#9c6ade" stroke-width="2.5"/></g>`,
  yoyo: `<circle cx="28" cy="38" r="18" fill="#6cc24a"/><circle cx="28" cy="38" r="8" fill="#b7f08a" stroke-width="3"/><path d="M28 38C34 20 42 10 50 4" fill="none" stroke-width="2.5"/><path d="M15 30c2-4 6-7 10-8" fill="none" stroke="#fff" stroke-width="3"/>`,
  paperclip: `<path d="M24 54V18c0-6 4-10 10-10s10 4 10 10v30c0 4-3 7-7 7s-7-3-7-7V22" fill="none" stroke-width="8"/><path d="M24 54V18c0-6 4-10 10-10s10 4 10 10v30c0 4-3 7-7 7s-7-3-7-7V22" fill="none" stroke="#c9d1d9" stroke-width="3"/>`,
  toyBlock: `<path d="M12 22 32 12l20 10v22L32 54 12 44z" fill="#ffd23f"/><path d="M12 22l20 10 20-10M32 32v22" fill="none"/><path d="M12 22l20 10v22L12 44z" fill="#e8504f"/><path d="M32 32l20-10v22L32 54z" fill="#4aa3df"/><path d="M18 44l4-12 4 12M19 40h6" fill="none" stroke="#fff" stroke-width="2.5"/><path d="M36 38c4-6 10-4 10 0s-6 6-10 4" fill="none" stroke="#fff" stroke-width="2.5"/>`,
  dice: `<rect x="10" y="10" width="44" height="44" rx="10" fill="#fff"/><g fill="${INK}" stroke="none"><circle cx="22" cy="22" r="4"/><circle cx="32" cy="32" r="4"/><circle cx="42" cy="42" r="4"/><circle cx="42" cy="22" r="4"/><circle cx="22" cy="42" r="4"/></g>`,
  sunglasses: `<path d="M6 24h52" stroke-width="4"/><path d="M8 24h20c0 10-4 16-10 16S8 34 8 24zM36 24h20c0 10-4 16-10 16s-10-6-10-16z" fill="${INK}"/><path d="M12 28c2 3 4 4 7 4M40 28c2 3 4 4 7 4" fill="none" stroke="#8fd3ff" stroke-width="3"/><path d="M28 26c2-2 6-2 8 0" fill="none"/>`,
  bow: `<path d="M32 30c-8-12-24-16-24-6s16 14 24 6z" fill="#ff7fae"/><path d="M32 30c8-12 24-16 24-6s-16 14-24 6z" fill="#ff7fae"/><path d="M29 32 20 54l7-3 4 6zM35 32l9 22-7-3-4 6z" fill="#ff7fae"/><circle cx="32" cy="30" r="6" fill="#e8508a"/>`,
  bell: `<path d="M32 8c-11 0-16 9-16 20 0 9-4 14-8 18h48c-4-4-8-9-8-18 0-11-5-20-16-20z" fill="#ffcc4d"/><circle cx="32" cy="52" r="6" fill="#d99a1a"/><path d="M8 46h48" fill="none"/><path d="M32 8V4" stroke-width="5"/><path d="M22 26c0-6 3-10 7-11" fill="none" stroke="#fff4b0" stroke-width="3"/>`,
  starSticker: `<polygon points="${star(32, 34, 26, 12, 5)}" fill="#ffd23f"/><circle cx="26" cy="32" r="2.5" fill="${INK}" stroke="none"/><circle cx="38" cy="32" r="2.5" fill="${INK}" stroke="none"/><path d="M27 39c3 3 7 3 10 0" fill="none" stroke-width="2.5"/>`,
  toothbrush: `<g transform="rotate(-40 32 32)"><path d="M28 18h8v42h-8z" fill="#8fd3ff"/><path d="M26 4h12v14H26z" fill="#fff"/><path d="M29 4v14M32 4v14M35 4v14" stroke-width="1.8"/><path d="M26 4h12v14H26z" fill="none"/></g>`,
  umbrella: `<path d="M6 32a26 22 0 0 1 52 0c-4-3-9-3-13 0-4-3-9-3-13 0-4-3-9-3-13 0-4-3-9-3-13 0z" fill="#9c6ade"/><path d="M32 10v40c0 6-8 6-8 0" fill="none"/><path d="M32 10c-6 6-6 16-6 22M32 10c6 6 6 16 6 22" fill="none" stroke-width="2.5"/>`,
  snowGlobe: `<circle cx="32" cy="28" r="20" fill="#c8ecff"/><path d="M14 48h36l4 10H10z" fill="#d9864e"/><path d="M32 16l8 18H24z" fill="#6cc24a"/><path d="M30 34h4v5h-4z" fill="#9b6a3c" stroke-width="2"/><g fill="#fff" stroke="none"><circle cx="22" cy="20" r="2"/><circle cx="42" cy="18" r="2"/><circle cx="40" cy="30" r="1.6"/><circle cx="20" cy="32" r="1.6"/></g>`,
  balloon: `<ellipse cx="32" cy="24" rx="17" ry="20" fill="#e8504f"/><path d="M29 44h6l-3 4z" fill="#e8504f"/><path d="M32 48c-4 4 4 6 0 10" fill="none" stroke-width="2.5"/><path d="M22 18c1-5 5-8 9-9" fill="none" stroke="#ff9e9e" stroke-width="3.5"/>`,
  trophy: `<path d="M18 8h28v14c0 10-6 16-14 16s-14-6-14-16z" fill="#ffcc4d"/><path d="M18 14H10c0 10 6 12 10 12M46 14h8c0 10-6 12-10 12" fill="none"/><path d="M28 38h8v8h-8z" fill="#ffcc4d"/><path d="M18 46h28v10H18z" fill="#9b6a3c"/><polygon points="${star(32, 21, 7, 3.2, 5)}" fill="#fff4b0" stroke-width="2"/>`,

  // ---- the strip mall
  donut: `<circle cx="32" cy="34" r="22" fill="#e5a35c"/><path d="M12 30c4-10 14-14 22-13 10 1 16 7 18 14 0 4-4 3-6 6-3 4-8 2-12 4-6 2-10-2-14-2-4 0-8 0-8-9z" fill="#ff7fae"/><ellipse cx="32" cy="32" rx="7" ry="5" fill="#fff8ee"/><g stroke-width="3"><path d="M20 26l3 2" stroke="#fff"/><path d="M42 24l-2 3" stroke="#ffd23f"/><path d="M28 22h3" stroke="#4aa3df"/><path d="M44 36l-3 1" stroke="#6cc24a"/><path d="M22 38l3-1" stroke="#ffd23f"/></g>`,
  candy: `<path d="M20 32 6 22v20zM44 32l14-10v20z" fill="#ffd23f"/><circle cx="32" cy="32" r="13" fill="#e8504f"/><path d="M24 28c4-4 10-5 16 0M24 37c4 4 10 4 16 0" fill="none" stroke="#fff" stroke-width="3"/>`,
  lollipop: `<path d="M32 40v20" stroke-width="5"/><path d="M32 40v20" stroke="#fff" stroke-width="2"/><circle cx="32" cy="24" r="18" fill="#ff7fae"/><path d="M32 24c2 0 3 2 2 4-2 3-7 2-8-2-1-6 6-9 11-6 6 4 5 13-2 16" fill="none" stroke="#fff" stroke-width="3"/>`,
  sodaBottle: `<path d="M26 4h12v6c0 6 8 10 8 18v26c0 3-2 5-5 5H23c-3 0-5-2-5-5V28c0-8 8-12 8-18z" fill="#6cc24a"/><path d="M18 32h28v14H18z" fill="#e8504f"/><path d="M24 4h16" stroke-width="5"/><path d="M24 20c-2 3-2 6-2 8" fill="none" stroke="#b7f08a" stroke-width="3"/>`,
  pretzel: `<path d="M32 46c-10 12-26 6-24-8 2-12 16-14 24-2 8-12 22-10 24 2 2 14-14 20-24 8z" fill="none" stroke-width="12"/><path d="M32 46c-10 12-26 6-24-8 2-12 16-14 24-2 8-12 22-10 24 2 2 14-14 20-24 8z" fill="none" stroke="#c8833e" stroke-width="5"/><path d="M22 54 32 36l10 18" fill="none" stroke-width="12"/><path d="M22 54 32 36l10 18" fill="none" stroke="#c8833e" stroke-width="5"/><g fill="#fff" stroke="none"><circle cx="14" cy="34" r="1.5"/><circle cx="48" cy="32" r="1.5"/><circle cx="40" cy="46" r="1.5"/></g>`,
  popcorn: `<g fill="#fff8e0"><circle cx="22" cy="20" r="7"/><circle cx="32" cy="14" r="7"/><circle cx="42" cy="20" r="7"/><circle cx="27" cy="24" r="6"/><circle cx="38" cy="24" r="6"/></g><path d="M16 26h32l-4 32H20z" fill="#fff"/><path d="M24 26l2 32M32 26v32M40 26l-2 32" stroke="#e8504f" stroke-width="4"/><path d="M16 26h32l-4 32H20z" fill="none"/>`,
  teddy: `<circle cx="16" cy="16" r="8" fill="#b07a4a"/><circle cx="48" cy="16" r="8" fill="#b07a4a"/><circle cx="32" cy="34" r="22" fill="#c8915a"/><ellipse cx="32" cy="42" rx="10" ry="8" fill="#f2d2a8"/><circle cx="32" cy="38" r="3" fill="${INK}" stroke="none"/><path d="M28 45c2 2 6 2 8 0" fill="none" stroke-width="2.5"/><circle cx="24" cy="28" r="2.6" fill="${INK}" stroke="none"/><circle cx="40" cy="28" r="2.6" fill="${INK}" stroke="none"/>`,
  magnifier: `<path d="M38 38 56 56" stroke-width="10"/><path d="M40 40 54 54" stroke="#9b6a3c" stroke-width="5"/><circle cx="26" cy="26" r="17" fill="#c8ecff" stroke-width="5"/><path d="M18 20c2-4 6-6 10-6" fill="none" stroke="#fff" stroke-width="3.5"/>`,
  cupcake: `<path d="M14 34h36l-6 24H20z" fill="#8fd3ff"/><path d="M22 34l2 24M32 34v24M42 34l-2 24" stroke-width="2.5"/><path d="M12 36c-4-8 4-14 10-12 2-8 18-8 20 0 6-2 14 4 10 12z" fill="#ff7fae"/><circle cx="32" cy="14" r="5" fill="#e8504f"/><path d="M32 9c1-3 3-4 5-5" fill="none" stroke-width="2.5"/>`,
  ring: `<circle cx="32" cy="40" r="17" fill="none" stroke-width="10"/><circle cx="32" cy="40" r="17" fill="none" stroke="#ffcc4d" stroke-width="4"/><path d="M24 14h16l4 6-12 10-12-10z" fill="#8fd3ff"/><path d="M24 14l8 16 8-16M20 20h24" fill="none" stroke-width="2.5"/>`,
  whistle: `<path d="M8 30h24c0-4 4-8 10-8 8 0 14 6 14 14s-6 14-14 14c-7 0-12-5-13-11H8z" fill="#c9d1d9"/><path d="M26 30h8" fill="none"/><circle cx="42" cy="36" r="4" fill="${INK}" stroke="none"/><path d="M50 26c4-6 8-6 10-2" fill="none" stroke-width="3"/>`,
  mitten: `<path d="M20 56V30c0-14 6-22 16-22s14 8 14 18v12l6-8c2-2 5 0 4 3l-8 14v9z" fill="#4aa3df"/><path d="M18 46h26v12H18z" fill="#fff"/><path d="M22 52h4M30 52h4M38 52h4" stroke="#4aa3df" stroke-width="3"/><path d="M28 20l4 4 4-4 4 4" fill="none" stroke="#fff" stroke-width="3"/>`,
  crown: `<path d="M8 48 10 18l12 14 10-20 10 20 12-14 2 30z" fill="#ffd23f"/><path d="M8 48h48v8H8z" fill="#f2b632"/><circle cx="32" cy="38" r="4" fill="#e8504f" stroke-width="2.5"/><circle cx="18" cy="40" r="3" fill="#4aa3df" stroke-width="2.5"/><circle cx="46" cy="40" r="3" fill="#6cc24a" stroke-width="2.5"/>`,
  locket: `<path d="M18 6c4 8 10 12 14 14 4-2 10-6 14-14" fill="none" stroke="#d99a1a" stroke-width="3"/><path d="M32 58C12 44 10 26 22 22c5-1 8 2 10 5 2-3 5-6 10-5 12 4 10 22-10 36z" fill="#ffcc4d"/><path d="M24 30c0-2 1-3 3-3" fill="none" stroke="#fff4b0" stroke-width="3"/><circle cx="32" cy="38" r="5" fill="#e8504f" stroke-width="2.5"/>`,
  goldenDuck:
    duck("#ffcc4d", "#ff8a3d") +
    `<polygon points="${star(52, 12, 8, 3, 4, 0)}" fill="#fff4b0" stroke-width="2"/><polygon points="${star(10, 26, 5, 2, 4, 0)}" fill="#fff4b0" stroke-width="2"/>`,

  // ---- the surprise yard: one a day of the week, Sunday first (Date.getDay order)
  sunflower: `<path d="M32 40v20" stroke="#3f8f3a" stroke-width="5"/><polygon points="${star(32, 26, 22, 12, 12)}" fill="#ffd23f"/><circle cx="32" cy="26" r="10" fill="#9b6a3c"/><g fill="#5a3a22" stroke="none"><circle cx="29" cy="23" r="1.6"/><circle cx="35" cy="24" r="1.6"/><circle cx="31" cy="29" r="1.6"/></g>`,
  muffin: `<path d="M16 36h32l-5 22H21z" fill="#d9a35f"/><path d="M24 36l1 22M32 36v22M40 36l-1 22" stroke-width="2.5"/><path d="M12 38c-4-14 10-26 20-26s24 12 20 26z" fill="#9b6a3c"/><g fill="#4a2a5a" stroke="none"><circle cx="24" cy="26" r="2.5"/><circle cx="36" cy="22" r="2.5"/><circle cx="40" cy="31" r="2.5"/><circle cx="28" cy="33" r="2.5"/></g>`,
  teapot: `<path d="M14 34c0-10 8-16 18-16s18 6 18 16-6 18-18 18-18-8-18-18z" fill="#8fd3ff"/><path d="M50 30c8 0 10 8 2 14" fill="none" stroke-width="5"/><path d="M14 36 4 26c-2 0-2 3 0 4l8 14" fill="#8fd3ff"/><path d="M22 18c4-4 16-4 20 0" fill="#c8ecff"/><circle cx="32" cy="12" r="4" fill="#ff7fae"/><path d="M20 38c4 2 8 2 12 0s8-2 12 0" fill="none" stroke="#fff" stroke-width="3"/>`,
  watermelon: `<path d="M6 22h52c0 18-12 30-26 30S6 40 6 22z" fill="#3f8f3a"/><path d="M11 22h42c0 14-9 25-21 25S11 36 11 22z" fill="#ff6b7a" stroke="none"/><path d="M11 22c0 14 9 25 21 25s21-11 21-25" fill="none" stroke="#b7f08a" stroke-width="3"/><g fill="${INK}" stroke="none"><ellipse cx="22" cy="30" rx="1.8" ry="2.8"/><ellipse cx="32" cy="34" rx="1.8" ry="2.8"/><ellipse cx="42" cy="30" rx="1.8" ry="2.8"/><ellipse cx="27" cy="40" rx="1.8" ry="2.8"/><ellipse cx="37" cy="40" rx="1.8" ry="2.8"/></g><path d="M6 22h52" fill="none"/>`,
  thimble: `<path d="M18 54V30c0-12 6-20 14-20s14 8 14 20v24z" fill="#c9d1d9"/><path d="M14 50h36v8H14z" fill="#e6ecf2"/><g fill="#8a95a3" stroke="none"><circle cx="26" cy="24" r="2"/><circle cx="32" cy="20" r="2"/><circle cx="38" cy="24" r="2"/><circle cx="26" cy="33" r="2"/><circle cx="32" cy="29" r="2"/><circle cx="38" cy="33" r="2"/><circle cx="26" cy="42" r="2"/><circle cx="32" cy="38" r="2"/><circle cx="38" cy="42" r="2"/></g>`,
  fork: `<g transform="rotate(-35 32 32)"><path d="M29 30h6v30h-6z" fill="#c9d1d9"/><path d="M22 4v16c0 6 4 10 10 10s10-4 10-10V4" fill="#e6ecf2"/><path d="M27 4v14M32 4v14M37 4v14" stroke-width="3"/></g>`,
  seashell: `<path d="M32 54 10 30c0-14 10-22 22-22s22 8 22 22z" fill="#ffb3c7"/><path d="M32 54 18 14M32 54V8M32 54l14-40M32 54 11 26M32 54l21-28" fill="none" stroke="#e8508a" stroke-width="2.5"/><path d="M26 54h12l-6 6z" fill="#ffb3c7"/>`,
};

export const TREASURE_IDS = Object.keys(ICONS);

/** The SVG markup for a treasure, or a plain sparkle for an unknown id. */
export function treasureSvg(id: string): string {
  return wrap(ICONS[id] ?? `<polygon points="${star(32, 32, 24, 9, 4, 0)}" fill="#ffe08a"/>`);
}
