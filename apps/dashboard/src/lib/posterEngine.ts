// Framework-agnostic canvas poster engine, shared by the Poster Studio and Video Studio React
// components. All rendering is local (no network) — the same approach as the standalone studio.

export const PW = 1620;
export const PH = 2160;

export type PosterValues = {
  layout: string;
  grade: string;
  brand?: string;
  title: string;
  tag: string;
  tl: string;
  tr: string;
  bl: string;
  serial: string;
  fx: number;
  fy: number;
  grain: number;
  vig: number;
};

export const PRESETS: Record<string, PosterValues> = {
  "DAMSO — Beyond the Silence": { layout: "classic", grade: "steel", title: "DAMSO", tag: "VIE.  MORT.  REBIRTH.", tl: "2026", tr: "WORLDWIDE", bl: "50.85 N  4.35 E", serial: "AL:003", fx: 0.5, fy: 0.61, grain: 9, vig: 24 },
  "DAMSO — The Crowd (zine)": { layout: "zine", grade: "bwhard", title: "DAMSO", tag: "LA VIE EST BELLE MAIS COURTE", tl: "LIMITED SHOWS", tr: "SOLD OUT", bl: "MMXXVI", serial: "AL:004", fx: 0.5, fy: 0.5, grain: 16, vig: 18 },
  "JUL — Live Experience": { layout: "classic", grade: "teal", title: "JUL", tag: "LIVE EXPERIENCE", tl: "MARSEILLE", tr: "MMXXVI", bl: "43.29 N 5.36 E", serial: "AL:006", fx: 0.55, fy: 0.5, grain: 9, vig: 24 },
  "JUL — Vélodrome": { layout: "stadium", grade: "slate", title: "JUL", tag: "STADE VELODROME - MARSEILLE", tl: "AMAZE LIVE", tr: "COMING SOON", bl: "43.26 N 5.39 E", serial: "AL:007", fx: 0.5, fy: 0.56, grain: 11, vig: 20 },
  "G2B — After Hours": { layout: "classic", grade: "amber", title: "G2B", tag: "AFTER HOURS", tl: "2026", tr: "WORLDWIDE", bl: "TICKETS ON AMAZELIVE.COM", serial: "AL:002", fx: 0.5, fy: 0.5, grain: 9, vig: 26 },
  "G2B — No Signal (ghost)": { layout: "ghost", grade: "bwhard", title: "G2B", tag: "[ NO SIGNAL ]", tl: "NO FEED", tr: "REC", bl: "SIGNAL LOST 00:00:00", serial: "AL:009", fx: 0.5, fy: 0.54, grain: 14, vig: 20 },
  "NINHO — Destin pour briller": { layout: "sky", grade: "mattecolor", title: "NINHO", tag: "DESTIN POUR BRILLER", tl: "AMAZE LIVE", tr: "OPEN AIR - MMXXVI", bl: "WORLDWIDE", serial: "AL:011", fx: 0.47, fy: 0.5, grain: 7, vig: 0 },
  "NISKA — Captured Live": { layout: "skyright", grade: "bwkey", title: "NISKA", tag: "CAPTURED LIVE", tl: "AMAZE LIVE - WORLDWIDE", tr: "", bl: "MMXXVI", serial: "AL:012", fx: 0.45, fy: 0.5, grain: 9, vig: 0 },
  "TIAKOLA — Noise (amber)": { layout: "leftblock", grade: "amber", title: "TIAKOLA", tag: "NOISE", tl: "AMAZE LIVE PRESENTS", tr: "MMXXVI", bl: "LIVE SHOWS - COMING SOON", serial: "AL:008", fx: 0.5, fy: 0.57, grain: 9, vig: 24 },
};

type Grade = { duo?: number[][]; gamma?: number; contrast?: number; matte?: number; desat?: number };
const GRADES: Record<string, Grade> = {
  steel: { duo: [[4, 7, 12], [66, 88, 108], [223, 230, 234]], gamma: 1.05, contrast: 1.06 },
  teal: { duo: [[2, 9, 11], [26, 73, 80], [216, 232, 230]], gamma: 1.04, contrast: 1.08 },
  amber: { duo: [[13, 7, 3], [138, 74, 22], [246, 217, 174]], gamma: 1.02, contrast: 1.07 },
  slate: { duo: [[5, 7, 10], [61, 71, 80], [213, 218, 222]], gamma: 1.0, contrast: 1.1, matte: 8 },
  bwhard: { duo: [[6, 6, 6], [104, 104, 104], [242, 242, 242]], gamma: 0.98, contrast: 1.12 },
  bwkey: { duo: [[8, 8, 8], [122, 122, 122], [250, 250, 250]], gamma: 0.96, contrast: 1.1 },
  mattecolor: { desat: 0.85, contrast: 1.05, matte: 12 },
  warmboost: { desat: 1.05, contrast: 1.08 },
  none: {},
};

export const GRADE_LABELS: [string, string][] = [
  ["steel", "Steel blue"], ["teal", "Deep teal"], ["amber", "Warm amber"], ["slate", "Slate cinematic"],
  ["bwhard", "B&W hard"], ["bwkey", "B&W high-key"], ["mattecolor", "Matte color"], ["warmboost", "Warm boost"], ["none", "None"],
];
export const LAYOUT_LABELS: [string, string][] = [
  ["cobrand", "Co-brand — SNOB × WHET"],
  ["classic", "Classic — bottom title"], ["zine", "Zine — top bleed"], ["vertical", "Vertical left title"],
  ["leftblock", "Left-aligned block"], ["sky", "Sky — top title"], ["skyright", "Sky — right tagline"],
  ["gallery", "Gallery inset (paper)"], ["ghost", "Ghost echo"], ["stadium", "Stadium cinematic"],
];

// Brand identity for the lockup. Each brand ships a real logo that auto-loads onto the
// poster/video when selected; `wordmark` is the fallback text if the logo fails to load,
// and a manual logo upload in the studio still overrides the baked-in one.
export const BRANDS: Record<string, { wordmark: string; logo?: string }> = {
  snob: { wordmark: "SNOB BEACH", logo: "/brands/snob.png" },
  whet: { wordmark: "WHET", logo: "/brands/whet.png" },
};
export const BRAND_LABELS: [string, string][] = [["snob", "SNOB BEACH"], ["whet", "WHET"]];

// Load a brand's baked-in logo as a canvas-ready image. Resolves to null when the brand
// has no logo or the file fails to load, in which case the engine falls back to the
// wordmark text. Browser-only (uses Image); called from the studio client components.
export async function loadBrandLogo(
  brand: string | undefined,
): Promise<(CanvasImageSource & { width: number; height: number }) | null> {
  const src = brand ? BRANDS[brand]?.logo : undefined;
  if (!src) return null;
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

const INK = { light: "#e6e9ec", cream: "#f0dfc0", dark: "#181614" };
const ANTON = (s: number) => `${s}px Anton`;
const BAR = (s: number, w = 500) => `${w} ${s}px "Barlow Condensed"`;
const MONO = (s: number, b = false) => `${b ? 700 : 400} ${s}px "Space Mono"`;

type C = CanvasRenderingContext2D;

type Img = CanvasImageSource & { width: number; height: number };

// Brand logos used by the co-brand layout, loaded once per module and shared across draws
// (a video render calls draw() ~180 times, so we must not refetch per frame).
let coSnob: Img | null = null, coWhet: Img | null = null, coLoad: Promise<void> | null = null;
function ensureCobrandLogos() {
  if (coSnob && coWhet) return Promise.resolve();
  if (!coLoad) coLoad = Promise.all([loadBrandLogo("snob"), loadBrandLogo("whet")])
    .then(([s, w]) => { coSnob = s; coWhet = w; });
  return coLoad;
}

export function mkEngine(ctx: C) {
  // Brand wordmark + optional uploaded logo, set per-draw by draw().
  let wordmark = "AMAZE LIVE";
  let logo: Img | null = null;
  let logoDrawn = false;
  // Draw any logo image centered at cx, top-aligned at yTop, fit within maxW×maxH. Returns
  // the drawn height (0 if no image).
  function blit(im: Img | null, cx: number, yTop: number, maxW: number, maxH: number) {
    if (!im) return 0;
    const iw = im.width, ih = im.height;
    let w = maxW, h = (w * ih) / iw;
    if (h > maxH) { h = maxH; w = (h * iw) / ih; }
    ctx.drawImage(im, cx - w / 2, yTop, w, h);
    return h;
  }
  function drawLogo(cx: number, yTop: number, maxW: number, maxH: number) {
    const h = blit(logo, cx, yTop, maxW, maxH);
    if (h) logoDrawn = true;
    return h;
  }
  function grade(g: Grade) {
    if (!g || (!g.duo && !g.desat && !g.contrast && !g.matte)) return;
    const d = ctx.getImageData(0, 0, PW, PH), p = d.data;
    const duo = g.duo, gam = g.gamma || 1, con = g.contrast || 1, mat = g.matte || 0, des = g.desat;
    for (let i = 0; i < p.length; i += 4) {
      let r = p[i], gg = p[i + 1], b = p[i + 2];
      if (duo) {
        let t = (0.2126 * r + 0.7152 * gg + 0.0722 * b) / 255;
        if (gam !== 1) t = Math.pow(t, gam);
        const [B, M, Wt] = duo;
        if (t < 0.5) { const u = t * 2; r = B[0] + (M[0] - B[0]) * u; gg = B[1] + (M[1] - B[1]) * u; b = B[2] + (M[2] - B[2]) * u; }
        else { const u = (t - 0.5) * 2; r = M[0] + (Wt[0] - M[0]) * u; gg = M[1] + (Wt[1] - M[1]) * u; b = M[2] + (Wt[2] - M[2]) * u; }
      } else if (des !== undefined) {
        const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
        r = l + (r - l) * des; gg = l + (gg - l) * des; b = l + (b - l) * des;
      }
      if (con !== 1) { r = (r - 128) * con + 128; gg = (gg - 128) * con + 128; b = (b - 128) * con + 128; }
      if (mat) { const k = (250 - mat) / 255; r = r * k + mat; gg = gg * k + mat; b = b * k + mat; }
      p[i] = r; p[i + 1] = gg; p[i + 2] = b;
    }
    ctx.putImageData(d, 0, 0);
  }
  function vign(s: number) {
    if (!s) return;
    const d = ctx.getImageData(0, 0, PW, PH), p = d.data, cx = PW / 2, cy = PH / 2, R = Math.SQRT2;
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const dx = (x - cx) / cx, dy = (y - cy) / cy;
      let t = (Math.sqrt(dx * dx + dy * dy) / R - 0.5) / 0.5;
      if (t <= 0) continue; if (t > 1) t = 1;
      const f = 1 - s * (t * t * (3 - 2 * t));
      const i = (y * PW + x) * 4; p[i] *= f; p[i + 1] *= f; p[i + 2] *= f;
    }
    ctx.putImageData(d, 0, 0);
  }
  function grain(s: number) {
    if (!s) return;
    const d = ctx.getImageData(0, 0, PW, PH), p = d.data;
    for (let i = 0; i < p.length; i += 4) { const n = (Math.random() + Math.random() + Math.random() - 1.5) * s * 1.1; p[i] += n; p[i + 1] += n; p[i + 2] += n; }
    ctx.putImageData(d, 0, 0);
  }
  function twid(t: string, f: string, tr: number) { ctx.font = f; let w = 0; for (const c of t) w += ctx.measureText(c).width + tr; return t.length ? w - tr : 0; }
  function tk(t: string, x: number, y: number, f: string, tr: number, a: string, fill: string) {
    ctx.font = f; ctx.fillStyle = fill; ctx.textBaseline = "alphabetic";
    const tot = twid(t, f, tr); if (a === "c") x -= tot / 2; else if (a === "r") x -= tot;
    for (const c of t) { ctx.fillText(c, x, y); x += ctx.measureText(c).width + tr; }
  }
  function fit(t: string, target: number) { let lo = 20, hi = 1200; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (twid(t, ANTON(m), 0) <= target) lo = m; else hi = m - 1; } return lo; }
  function cap(f: string) { ctx.font = f; return ctx.measureText("DAMSO").actualBoundingBoxAscent; }
  function vt(t: string, x: number, yb: number, f: string, tr: number, fill: string) { ctx.save(); ctx.translate(x, yb); ctx.rotate(-Math.PI / 2); tk(t, 0, 0, f, tr, "l", fill); ctx.restore(); }
  function rule(x1: number, y: number, x2: number, fill: string, w = 3) { ctx.fillStyle = fill; ctx.fillRect(x1, y, x2 - x1, w); }
  function rc(x: number, y: number, s: number, fill: string) { ctx.fillStyle = fill; ctx.fillRect(x - s, y - 1, s * 2, 2); ctx.fillRect(x - 1, y - s, 2, s * 2); }
  function dia(x: number, y: number, s: number, fill: string) { ctx.strokeStyle = fill; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); ctx.stroke(); }
  function glb(x: number, y: number, r: number, fill: string) { ctx.strokeStyle = fill; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.stroke(); ctx.beginPath(); ctx.ellipse(x, y, r * 0.45, r, 0, 0, 7); ctx.stroke(); }
  function bc(x: number, y: number, w: number, h: number, fill: string, seed = 3) { let s = seed; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280; ctx.fillStyle = fill; let cx = x; while (cx < x + w) { const bw = 2 + Math.floor(rnd() * 5); if (rnd() > 0.35) ctx.fillRect(cx, y, bw, h); cx += bw + 2 + Math.floor(rnd() * 3); } }
  function lock(cx: number, y: number, fill: string, sc = 1, pr = true, icon = "diamond") { let yy; if (logo) { const h = drawLogo(cx, y, 460 * sc, 150 * sc); yy = y + h; } else { tk(wordmark, cx, y + 34 * sc, BAR(40 * sc, 600), 26 * sc, "c", fill); yy = y + 52 * sc; } if (pr) { tk("PRESENTS", cx, yy + 20 * sc, BAR(24 * sc, 500), 20 * sc, "c", fill); yy += 40 * sc; } if (icon === "diamond") dia(cx, yy + 18 * sc, 14 * sc, fill); else glb(cx, yy + 20 * sc, 16 * sc, fill); }
  function cover(img: CanvasImageSource, iw: number, ih: number, fx: number, fy: number, box?: number[]) {
    const [bx, by, bw, bh] = box || [0, 0, PW, PH];
    const ir = iw / ih, br = bw / bh; let sw, sh;
    if (ir > br) { sh = ih; sw = sh * br; } else { sw = iw; sh = sw / br; }
    const sx = Math.min(Math.max(fx * iw - sw / 2, 0), iw - sw);
    const sy = Math.min(Math.max(fy * ih - sh / 2, 0), ih - sh);
    ctx.drawImage(img, sx, sy, sw, sh, bx, by, bw, bh);
  }
  const L: Record<string, (v: PosterValues, k: string, ka: string) => void> = {
    classic(v, k) { lock(PW / 2, 60, k, 1, true, "diamond"); tk(v.tl, 150, 122, MONO(26), 8, "l", k); tk(v.tr, PW - 150, 122, MONO(26), 8, "r", k); const ts = fit(v.title, PW - 300); tk(v.title, PW / 2, PH - 252, ANTON(ts), 0, "c", k); tk(v.tag, PW / 2, PH - 172, BAR(40), 22, "c", k); rule(150, PH - 150, PW - 150, k, 2); tk(v.bl, 150, PH - 96, MONO(26), 2, "l", k); tk(v.serial + "   MMXXVI", PW - 150, PH - 96, MONO(26), 2, "r", k); },
    zine(v, k) { const ts = fit(v.title, PW * 1.06); tk(v.title, PW / 2, cap(ANTON(ts)) * 0.7, ANTON(ts), 0, "c", k); ctx.strokeStyle = k; ctx.lineWidth = 3; ctx.strokeRect(56, 56, PW - 112, PH - 112); lock(PW / 2, PH - 262, k, 0.9, false, "globe"); rule(120, PH - 118, PW - 120, k, 2); tk(v.tl, 120, PH - 78, MONO(26), 6, "l", k); tk(v.bl, PW / 2, PH - 78, MONO(26), 6, "c", k); tk(v.tr, PW - 120, PH - 78, MONO(26), 6, "r", k); vt(v.tag, PW - 88, PH - 620, MONO(24), 10, k); },
    vertical(v, k) { const vs = Math.min(fit(v.title, PH - 280), 300); vt(v.title, 34 + cap(ANTON(vs)), PH - 140, ANTON(vs), 0, k); tk(v.tl, PW - 120, 130, BAR(36, 600), 18, "r", k); tk(v.tr, PW - 120, 174, MONO(26), 4, "r", k); tk(v.tag, PW - 120, PH - 268, ANTON(92), 0, "r", k); rule(PW - 470, PH - 190, PW - 120, k, 2); tk(v.bl, PW - 120, PH - 138, MONO(26), 2, "r", k); bc(380, PH - 158, 240, 54, k, 5); tk(v.serial, 380, PH - 70, MONO(24), 4, "l", k); rc(120, 120, 14, k); rc(PW - 60, PH - 60, 14, k); },
    leftblock(v, k) { const x0 = 130; tk(v.tl, x0, PH - 672, BAR(34, 600), 14, "l", k); const ts = fit(v.title, 700), ch = cap(ANTON(ts)); tk(v.title, x0, PH - 640 + ch * 0.62, ANTON(ts), 0, "l", k); const yy = PH - 640 + ch * 0.62 + 80; tk(v.tag, x0, yy, BAR(44), 30, "l", k); rule(x0, yy + 40, x0 + 560, k, 2); tk(v.bl, x0, yy + 92, MONO(26), 2, "l", k); tk("TICKETS ON AMAZELIVE.COM", x0, yy + 136, MONO(26), 2, "l", k); bc(PW - 380, PH - 160, 240, 54, k, 8); tk(v.serial, PW - 380, PH - 72, MONO(24), 4, "l", k); tk(v.tr, PW - 130, 122, MONO(26), 8, "r", k); rc(130, 110, 14, k); },
    sky(v, k, ka) { tk(v.tl, 150, 126, BAR(34, 600), 16, "l", k); glb(174, 172, 16, k); tk(v.tr, PW - 150, 122, MONO(26), 4, "r", k); const ts = fit(v.title, PW - 340), ch = cap(ANTON(ts)); tk(v.title, PW / 2, 250 + ch, ANTON(ts), 0, "c", k); tk(v.tag, PW / 2, 250 + ch + 72, BAR(42), 26, "c", k); rule(150, PH - 150, PW - 150, ka, 2); tk(v.bl, 150, PH - 96, MONO(26), 6, "l", ka); tk(v.serial, PW - 150, PH - 96, MONO(26), 6, "r", ka); },
    skyright(v, k, ka) { tk(v.tl, PW / 2, 122, MONO(26), 8, "c", k); const ts = fit(v.title, PW - 400), ch = cap(ANTON(ts)); tk(v.title, PW / 2, 170 + ch, ANTON(ts), 0, "c", k); rule(PW - 640, 170 + ch + 40, PW - 200, k, 2); tk(v.tag, PW - 200, 170 + ch + 94, BAR(40), 24, "r", k); vt("EVERY CITY EVERY STAGE", PW - 88, PH - 240, MONO(24), 10, ka); tk(v.bl, 120, PH - 86, MONO(26), 6, "l", ka); tk(v.serial, PW - 120, PH - 86, MONO(26), 6, "r", ka); },
    ghost(v, k) { lock(PW / 2, 60, k, 1, true, "globe"); tk(v.tl, 150, 122, MONO(26), 8, "l", k); tk(v.tr, PW - 150, 122, MONO(26), 8, "r", k); const ts = fit(v.title, PW - 600); ctx.globalAlpha = 0.28; tk(v.title, PW / 2 + 16, PH - 314, ANTON(ts), 0, "c", k); ctx.globalAlpha = 1; tk(v.title, PW / 2, PH - 296, ANTON(ts), 0, "c", k); tk(v.tag, PW / 2, PH - 206, MONO(40, true), 10, "c", k); rule(150, PH - 150, PW - 150, k, 2); tk(v.bl, 150, PH - 96, MONO(26), 2, "l", k); tk(v.serial, PW - 150, PH - 170, MONO(26), 2, "r", k); },
    stadium(v, k) { tk(v.tl, 120, 130, BAR(36, 600), 18, "l", k); tk("PRESENTS", 120, 176, BAR(24), 14, "l", k); tk(v.tr, PW - 120, 122, MONO(26), 8, "r", k); const ts = fit(v.title, 660); tk(v.title, PW / 2, PH - 330, ANTON(ts), 0, "c", k); tk(v.tag, PW / 2, PH - 250, BAR(38), 16, "c", k); rule(PW / 2 - 260, PH - 212, PW / 2 + 260, k, 2); tk("ONE NIGHT ONLY", PW / 2, PH - 166, MONO(26), 10, "c", k); tk(v.bl, 120, PH - 78, MONO(26), 2, "l", k); tk(v.serial, PW - 120, PH - 78, MONO(26), 2, "r", k); glb(PW / 2, PH - 88, 18, k); },
    gallery(v, k) { tk(v.tl, PW / 2, 116, BAR(34, 600), 18, "c", k); dia(PW / 2, 156, 12, k); const ts = fit(v.title, PW - 380), ch = cap(ANTON(ts)); const ty = 216 + 1290 + 74 + ch; tk(v.title, 190, ty, ANTON(ts), 0, "l", k); tk(v.tag, 190, ty + 64, BAR(40), 18, "l", k); rule(190, PH - 128, PW - 190, k, 2); bc(190, PH - 108, 220, 44, k, 10); tk(v.serial, PW - 190, PH - 72, MONO(26), 2, "r", k); },
  };
  async function draw(v: PosterValues, img: (CanvasImageSource & { width: number; height: number }) | null, logoImg?: (CanvasImageSource & { width: number; height: number }) | null) {
    if (typeof document !== "undefined" && document.fonts) await document.fonts.ready;
    ctx.globalAlpha = 1;
    wordmark = (v.brand && BRANDS[v.brand]?.wordmark) || "SNOB BEACH";
    logo = logoImg || null; logoDrawn = false;
    if (v.layout === "cobrand") {
      // Reference co-brand: full-bleed photo, SNOB BEACH lockup top, WHET After Dark bottom,
      // artist name/tagline in the lower third. Both brand logos are baked in.
      await ensureCobrandLogos();
      ctx.fillStyle = "#0a0a0a"; ctx.fillRect(0, 0, PW, PH);
      if (img) cover(img, img.width, img.height, v.fx, v.fy);
      grade(GRADES[v.grade]); vign((v.vig || 0) / 100);
      // Gradient scrims top & bottom so the logos always read over a busy crowd shot.
      const gTop = ctx.createLinearGradient(0, 0, 0, 620);
      gTop.addColorStop(0, "rgba(6,6,8,0.82)"); gTop.addColorStop(1, "rgba(6,6,8,0)");
      ctx.fillStyle = gTop; ctx.fillRect(0, 0, PW, 620);
      const gBot = ctx.createLinearGradient(0, PH - 760, 0, PH);
      gBot.addColorStop(0, "rgba(6,6,8,0)"); gBot.addColorStop(1, "rgba(6,6,8,0.9)");
      ctx.fillStyle = gBot; ctx.fillRect(0, PH - 760, PW, 760);
      const k = INK.light;
      blit(coSnob, PW / 2, 150, 640, 520);                 // SNOB BEACH — top-center
      if (v.title) { const ts = Math.min(fit(v.title, PW - 320), 210); tk(v.title, PW / 2, PH - 470, ANTON(ts), 0, "c", k); }
      if (v.tag) tk(v.tag, PW / 2, PH - 402, BAR(42), 20, "c", k);
      blit(coWhet, PW / 2, PH - 348, 760, 232);            // WHET After Dark — bottom-center
      grain(v.grain);
    } else if (v.layout === "gallery") {
      ctx.fillStyle = "#eee8dc"; ctx.fillRect(0, 0, PW, PH);
      if (img) { const ph = 1290; const raw = ph * (img.width / img.height); const pw = Math.round(raw > 1240 ? 1240 : raw); const px = (PW - pw) / 2, py = 216; cover(img, img.width, img.height, v.fx, v.fy, [px, py, pw, ph]); grade(GRADES[v.grade]); ctx.fillStyle = "#eee8dc"; ctx.fillRect(0, 0, PW, py); ctx.fillRect(0, py + ph, PW, PH - py - ph); ctx.fillRect(0, 0, px, PH); ctx.fillRect(px + pw, 0, PW - px - pw, PH); ctx.strokeStyle = "#181614"; ctx.lineWidth = 2; ctx.strokeRect(px - 1, py - 1, pw + 2, ph + 2); }
      L.gallery(v, INK.dark, INK.light); grain(Math.min(v.grain, 7));
    } else {
      ctx.fillStyle = "#0a0a0a"; ctx.fillRect(0, 0, PW, PH);
      if (img) cover(img, img.width, img.height, v.fx, v.fy);
      grade(GRADES[v.grade]); vign((v.vig || 0) / 100);
      const dark = v.layout === "sky" || v.layout === "skyright";
      const k = dark ? INK.dark : (v.grade === "amber" || v.grade === "warmboost" ? INK.cream : INK.light);
      (L[v.layout] || L.classic)(v, k, INK.light); grain(v.grain);
    }
    // Layouts without a lockup (or the paper gallery) still show an uploaded logo — drop it
    // top-center over the finished frame. Co-brand manages its own logos.
    if (logo && !logoDrawn && v.layout !== "cobrand") { ctx.globalAlpha = 1; drawLogo(PW / 2, 54, 460, 150); }
  }
  return { draw };
}
