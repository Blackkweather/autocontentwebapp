"use client";

import { useEffect, useRef, useState } from "react";
import { PRESETS, GRADE_LABELS, LAYOUT_LABELS, mkEngine, type PosterValues } from "@/lib/posterEngine";

const presetNames = Object.keys(PRESETS);

export default function PosterStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ReturnType<typeof mkEngine> | null>(null);
  const photoRef = useRef<(CanvasImageSource & { width: number; height: number }) | null>(null);
  const [v, setV] = useState<PosterValues>(PRESETS[presetNames[0]]);
  const [dropLabel, setDropLabel] = useState("DROP PHOTO HERE — OR CLICK TO UPLOAD");
  const fileRef = useRef<HTMLInputElement>(null);

  function render(next: PosterValues) {
    const cv = canvasRef.current;
    if (!cv) return;
    if (!engineRef.current) engineRef.current = mkEngine(cv.getContext("2d")!);
    engineRef.current.draw(next, photoRef.current);
  }

  useEffect(() => {
    render(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(patch: Partial<PosterValues>) {
    const next = { ...v, ...patch };
    setV(next);
    render(next);
  }

  async function loadFile(f: File | undefined) {
    if (!f) return;
    photoRef.current = await createImageBitmap(f);
    setDropLabel(f.name.toUpperCase() + " — LOADED");
    render(v);
  }

  function download() {
    canvasRef.current?.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = (v.title || "POSTER") + "-AMAZE-LIVE.png";
      a.click();
    }, "image/png");
  }

  return (
    <div className="studio">
      <div className="spanel">
        <div className="drop" onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>{dropLabel}</div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => loadFile(e.target.files?.[0])} />

        <label className="f">Preset (campaign direction)</label>
        <select onChange={(e) => update(PRESETS[e.target.value])}>
          {presetNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>

        <label className="f">Artist name (title)</label>
        <input type="text" value={v.title} onChange={(e) => update({ title: e.target.value.toUpperCase() })} />
        <label className="f">Tagline</label>
        <input type="text" value={v.tag} onChange={(e) => update({ tag: e.target.value.toUpperCase() })} />
        <div className="r2">
          <div><label className="f">Top-left</label><input type="text" value={v.tl} onChange={(e) => update({ tl: e.target.value.toUpperCase() })} /></div>
          <div><label className="f">Top-right</label><input type="text" value={v.tr} onChange={(e) => update({ tr: e.target.value.toUpperCase() })} /></div>
        </div>
        <div className="r2">
          <div><label className="f">Bottom-left</label><input type="text" value={v.bl} onChange={(e) => update({ bl: e.target.value.toUpperCase() })} /></div>
          <div><label className="f">Serial</label><input type="text" value={v.serial} onChange={(e) => update({ serial: e.target.value.toUpperCase() })} /></div>
        </div>

        <label className="f">Layout</label>
        <select value={v.layout} onChange={(e) => update({ layout: e.target.value })}>
          {LAYOUT_LABELS.map(([val, l]) => <option key={val} value={val}>{l}</option>)}
        </select>
        <label className="f">Color grade</label>
        <select value={v.grade} onChange={(e) => update({ grade: e.target.value })}>
          {GRADE_LABELS.map(([val, l]) => <option key={val} value={val}>{l}</option>)}
        </select>

        <div className="r2">
          <div><label className="f">Focal X</label><input type="range" min={0} max={100} value={v.fx * 100} onChange={(e) => update({ fx: +e.target.value / 100 })} /></div>
          <div><label className="f">Focal Y</label><input type="range" min={0} max={100} value={v.fy * 100} onChange={(e) => update({ fy: +e.target.value / 100 })} /></div>
        </div>
        <div className="r2">
          <div><label className="f">Grain</label><input type="range" min={0} max={24} value={v.grain} onChange={(e) => update({ grain: +e.target.value })} /></div>
          <div><label className="f">Vignette</label><input type="range" min={0} max={60} value={v.vig} onChange={(e) => update({ vig: +e.target.value })} /></div>
        </div>
        <button className="btn" onClick={download}>Download PNG</button>
        <p className="hint">3:4 · 1620×2160 px · rendered locally in your browser.</p>
      </div>
      <div className="sstage"><canvas ref={canvasRef} width={1620} height={2160} /></div>
    </div>
  );
}
