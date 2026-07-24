"use client";

import { useEffect, useRef, useState } from "react";
import { PRESETS, GRADE_LABELS, BRAND_LABELS, BRANDS, loadBrandLogo, mkEngine, PW, PH, type PosterValues } from "@/lib/posterEngine";

const presetNames = Object.keys(PRESETS);
const VIDEO_LAYOUTS: [string, string][] = [
  ["cobrand", "Co-brand — SNOB × WHET"],
  ["classic", "Classic"], ["zine", "Zine"], ["vertical", "Vertical"], ["leftblock", "Left block"],
  ["sky", "Sky"], ["skyright", "Sky right"], ["ghost", "Ghost"], ["stadium", "Stadium"],
];

function ease(t: number) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

export default function VideoStudio() {
  const previewRef = useRef<HTMLCanvasElement>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<ReturnType<typeof mkEngine> | null>(null);
  const photoRef = useRef<(CanvasImageSource & { width: number; height: number }) | null>(null);
  const logoRef = useRef<(CanvasImageSource & { width: number; height: number }) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const rendering = useRef(false);

  const [title, setTitle] = useState("DAMSO");
  const [tag, setTag] = useState("VIE.  MORT.  REBIRTH.");
  const [brand, setBrand] = useState("snob");
  const [layout, setLayout] = useState("cobrand");
  const [grade, setGrade] = useState("steel");
  const [motion, setMotion] = useState("in");
  const [dur, setDur] = useState(6);
  const [dropLabel, setDropLabel] = useState("DROP PHOTO HERE — OR CLICK TO UPLOAD");
  const [logoLabel, setLogoLabel] = useState("USING BRAND LOGO — DROP TO OVERRIDE");
  // true once the user uploads their own logo; suppresses brand auto-loading until removed.
  const [manualLogo, setManualLogo] = useState(false);
  const [status, setStatus] = useState("WEBM output · recorded locally in your browser.");

  function vals(): PosterValues {
    const wm = BRANDS[brand]?.wordmark ?? "SNOB BEACH";
    return { layout, grade, brand, title: title.toUpperCase(), tag: tag.toUpperCase(), tl: wm, tr: "MMXXVI", bl: "WORLDWIDE", serial: "AL:001", fx: 0.5, fy: 0.5, grain: 8, vig: 22 };
  }

  async function preview() {
    if (!offRef.current) { offRef.current = document.createElement("canvas"); offRef.current.width = PW; offRef.current.height = PH; }
    if (!engineRef.current) engineRef.current = mkEngine(offRef.current.getContext("2d")!);
    await engineRef.current.draw(vals(), photoRef.current, logoRef.current);
    const cv = previewRef.current;
    if (cv) cv.getContext("2d")!.drawImage(offRef.current, 0, 0, cv.width, cv.height);
  }

  useEffect(() => {
    preview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, tag, layout, grade]);
  // Swap in the selected brand's baked-in logo (unless the user uploaded one), then repaint.
  useEffect(() => {
    if (manualLogo) return;
    loadBrandLogo(brand).then((img) => { logoRef.current = img; preview(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, manualLogo]);

  async function loadFile(f: File | undefined) {
    if (!f) return;
    photoRef.current = await createImageBitmap(f);
    setDropLabel(f.name.toUpperCase() + " — LOADED");
    preview();
  }

  async function loadLogo(f: File | undefined) {
    if (!f) return;
    logoRef.current = await createImageBitmap(f);
    setManualLogo(true);
    setLogoLabel(f.name.toUpperCase() + " — LOADED (OVERRIDING BRAND)");
    preview();
  }

  // Drop the manual upload and fall back to the current brand's baked-in logo.
  function clearLogo() {
    if (logoFileRef.current) logoFileRef.current.value = "";
    setLogoLabel("USING BRAND LOGO — DROP TO OVERRIDE");
    setManualLogo(false); // triggers the brand-logo effect, which reloads + repaints
  }

  async function renderVideo() {
    if (rendering.current) return;
    rendering.current = true;
    setStatus("Preparing…");
    await preview();
    const cv = previewRef.current!, off = offRef.current!;
    const fps = 30, frames = dur * fps;
    const stream = cv.captureStream(fps);
    let mime = "video/webm;codecs=vp9";
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported(mime)) mime = "video/webm";
    let rec: MediaRecorder;
    try { rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 }); }
    catch { setStatus("Video recording isn't supported in this browser."); rendering.current = false; return; }
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const btag = (BRANDS[brand]?.wordmark ?? "").replace(/\s+/g, "-");
      a.download = (title || "FLYER") + (btag ? "-" + btag : "") + ".webm";
      a.click();
      setStatus("Done — video downloaded.");
      rendering.current = false;
    };
    rec.start();
    const ctx = cv.getContext("2d")!, W2 = cv.width, H2 = cv.height;
    let i = 0;
    function frame() {
      const t = ease(i / frames);
      let z = 1, oy = 0;
      if (motion === "in") z = 1 + 0.12 * t;
      else if (motion === "out") z = 1.12 - 0.12 * t;
      else { z = 1.06; oy = -(H2 * 0.06) * t; }
      const dw = W2 * z, dh = H2 * z;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W2, H2);
      ctx.drawImage(off, (W2 - dw) / 2, (H2 - dh) / 2 + oy, dw, dh);
      const gd = ctx.getImageData(0, 0, W2, H2), gp = gd.data;
      for (let j = 0; j < gp.length; j += 4) { const n = (Math.random() - 0.5) * 14; gp[j] += n; gp[j + 1] += n; gp[j + 2] += n; }
      ctx.putImageData(gd, 0, 0);
      setStatus("Recording… " + Math.round((i / frames) * 100) + "%");
      i++;
      if (i <= frames) requestAnimationFrame(frame); else rec.stop();
    }
    requestAnimationFrame(frame);
  }

  return (
    <div className="studio">
      <div className="spanel">
        <div className="drop" onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>{dropLabel}</div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => loadFile(e.target.files?.[0])} />
        <label className="f">Preset</label>
        <select onChange={(e) => { const p = PRESETS[e.target.value]; setLayout(p.layout === "gallery" ? "classic" : p.layout); setGrade(p.grade); setTitle(p.title); setTag(p.tag); }}>
          {presetNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <label className="f">Brand</label>
        <select value={brand} onChange={(e) => setBrand(e.target.value)}>
          {BRAND_LABELS.map(([val, l]) => <option key={val} value={val}>{l}</option>)}
        </select>
        <label className="f">Brand logo (auto-loaded — upload to override)</label>
        <div className="drop" onClick={() => logoFileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); loadLogo(e.dataTransfer.files[0]); }}>{logoLabel}</div>
        <input ref={logoFileRef} type="file" accept="image/*" hidden onChange={(e) => loadLogo(e.target.files?.[0])} />
        {manualLogo && <button className="btn" style={{ marginTop: 8 }} onClick={clearLogo}>Remove logo — use brand logo</button>}
        <label className="f">Artist name</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value.toUpperCase())} />
        <label className="f">Tagline</label>
        <input type="text" value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} />
        <label className="f">Layout</label>
        <select value={layout} onChange={(e) => setLayout(e.target.value)}>{VIDEO_LAYOUTS.map(([val, l]) => <option key={val} value={val}>{l}</option>)}</select>
        <label className="f">Color grade</label>
        <select value={grade} onChange={(e) => setGrade(e.target.value)}>{GRADE_LABELS.map(([val, l]) => <option key={val} value={val}>{l}</option>)}</select>
        <label className="f">Motion</label>
        <select value={motion} onChange={(e) => setMotion(e.target.value)}>
          <option value="in">Slow push in</option><option value="out">Slow pull out</option><option value="up">Drift up</option>
        </select>
        <label className="f">Duration {dur}s</label>
        <input type="range" min={3} max={10} value={dur} onChange={(e) => setDur(+e.target.value)} />
        <button className="btn" onClick={renderVideo}>Render video</button>
        <p className="hint">{status}</p>
      </div>
      <div className="sstage"><canvas ref={previewRef} width={810} height={1080} /></div>
    </div>
  );
}
