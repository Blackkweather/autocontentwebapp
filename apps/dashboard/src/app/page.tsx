"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PosterStudio from "./_components/PosterStudio";
import VideoStudio from "./_components/VideoStudio";

type ModuleId = "ceo" | "poster" | "video" | "flyer" | "guests" | "revenue" | "growth" | "promoters" | "city";
const MODULES: { id: ModuleId; label: string; tag: string; live?: boolean }[] = [
  { id: "ceo", label: "AI CEO", tag: "Daily brief", live: true },
  { id: "poster", label: "Poster Studio", tag: "Live", live: true },
  { id: "video", label: "Video Studio", tag: "Live", live: true },
  { id: "flyer", label: "Flyer Engine", tag: "AI" },
  { id: "guests", label: "Guest Intelligence", tag: "DB" },
  { id: "revenue", label: "Revenue Engine", tag: "DB" },
  { id: "growth", label: "Growth Engine", tag: "DB" },
  { id: "promoters", label: "Promoter Intel", tag: "DB" },
  { id: "city", label: "City Intelligence", tag: "DB" },
];

type Json = Record<string, unknown>;
async function getJson(url: string): Promise<Json> {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Request failed (${res.status})`);
  return res.json();
}

export default function ClubOS() {
  const router = useRouter();
  const [active, setActive] = useState<ModuleId>("ceo");
  const [menuOpen, setMenuOpen] = useState(false);
  const [cache, setCache] = useState<Record<string, Json>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function load(key: string, url: string) {
    if (cache[key]) return;
    try {
      const data = await getJson(url);
      setCache((c) => ({ ...c, [key]: data }));
    } catch (e) {
      setErrors((x) => ({ ...x, [key]: e instanceof Error ? e.message : "Failed to load" }));
    }
  }

  useEffect(() => {
    const map: Partial<Record<ModuleId, [string, string]>> = {
      ceo: ["ceo", "/api/ceo"], guests: ["guests", "/api/guests"], promoters: ["promoters", "/api/promoters"],
      city: ["city", "/api/city"], flyer: ["events", "/api/events"], revenue: ["ceo", "/api/ceo"], growth: ["ceo", "/api/ceo"],
    };
    const m = map[active];
    if (m) load(m[0], m[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const mod = MODULES.find((m) => m.id === active)!;

  return (
    <div className="app">
      <aside className={"side" + (menuOpen ? " open" : "")}>
        <div className="brand"><div className="os">CLUB OS</div><div className="sub">Amaze Live · Nightlife OS</div></div>
        <div className="navgroup">
          <div className="gl">Modules</div>
          {MODULES.map((m) => (
            <button key={m.id} className={"nav" + (m.id === active ? " active" : "")} onClick={() => { setActive(m.id); setMenuOpen(false); }}>
              <span className="dot" />{m.label}<span className={"tag" + (m.live ? " live" : "")}>{m.tag}</span>
            </button>
          ))}
        </div>
        <button className="nav logout" onClick={logout}>Sign out</button>
      </aside>
      {menuOpen && <div className="scrim on" onClick={() => setMenuOpen(false)} />}

      <main className="main">
        <div className="top">
          <button className="menu-btn" onClick={() => setMenuOpen((o) => !o)}>☰</button>
          <div className="mtitle">{mod.label}</div>
          <span className={"mtag" + (mod.live ? " live" : "")}>{mod.tag}</span>
        </div>

        <section className="view">
          {active === "ceo" && <Ceo data={cache.ceo} err={errors.ceo} />}
          {active === "poster" && <PosterStudio />}
          {active === "video" && <VideoStudio />}
          {active === "flyer" && <Flyer data={cache.events} err={errors.events} />}
          {active === "guests" && <Guests data={cache.guests} err={errors.guests} />}
          {active === "revenue" && <Revenue />}
          {active === "growth" && <Growth />}
          {active === "promoters" && <Promoters data={cache.promoters} err={errors.promoters} />}
          {active === "city" && <City data={cache.city} err={errors.city} />}
        </section>
      </main>
    </div>
  );
}

function Loading({ err }: { err?: string }) {
  if (err) return <p className="lead" style={{ color: "var(--bad)" }}>Couldn&apos;t load: {err}</p>;
  return <p className="lead">Loading live data…</p>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function Ceo({ data, err }: { data?: any; err?: string }) {
  if (!data) return <Loading err={err} />;
  const k = data.kpis ?? {};
  const hour = new Date().getHours();
  const hello = (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening") + ", boss.";
  return (
    <>
      <p className="lead">{hello} Here&apos;s the club at a glance — pulled live from your database.</p>
      <div className="grid g4">
        <Tile k="Revenue yesterday" v={"€" + (k.revenueYesterday ?? 0).toLocaleString()} d="▲ 12% vs last Sat" cls="up" />
        <Tile k="Attendance forecast" v={String(k.attendanceForecast ?? 0)} d="tonight · projected" cls="up" />
        <Tile k="Events in system" v={String(k.eventsTotal ?? 0)} d={`${k.postersTotal ?? 0} posters generated`} />
        <Tile k="Known guests" v={String(k.guestsTotal ?? 0)} d={`${k.vipCount ?? 0} VIPs · €${k.avgSpend ?? 0} avg`} />
      </div>
      <h2 className="sec">Best actions today</h2>
      <div className="card">
        {(data.actions ?? []).map((a: any, i: number) => (
          <div className="rowline" key={i}>
            <span className={"pill " + (a.kind === "do" ? "good" : a.kind === "stop" ? "bad" : "warn")}>{a.kind}</span>
            <div className="grow"><b>{a.title}</b><div className="mut" style={{ marginTop: 3 }}>{a.body}</div></div>
          </div>
        ))}
      </div>
      {(data.upcoming ?? []).length > 0 && (
        <>
          <h2 className="sec">Upcoming events</h2>
          <div className="card">
            {data.upcoming.map((e: any) => (
              <div className="rowline" key={e.id}><div className="grow"><b>{e.artist_name_raw}</b><div className="mut">{e.venue} — {e.city}</div></div><span className="mut">{e.event_date}</span></div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Flyer({ data, err }: { data?: any; err?: string }) {
  if (!data) return <Loading err={err} />;
  const events = data.events ?? [];
  const st: Record<string, string> = { done: "good", generating: "warn", photo_missing: "warn", pending: "", failed: "bad" };
  return (
    <>
      <p className="lead">The AI Flyer Engine sources a verified artist photo, screens it with vision AI, and composites a branded poster — backed by Supabase, Groq and Replicate. These events are live from your database.</p>
      {events.length === 0 ? <p className="lead">No events yet. Add them via the pipeline API.</p> : (
        <div className="card"><h3>Events</h3>
          <table><thead><tr><th>Date</th><th>Artist</th><th>Venue / City</th><th>Status</th></tr></thead>
            <tbody>{events.map((e: any) => (
              <tr key={e.id}><td>{e.event_date}</td><td><b>{e.artist_name_raw}</b></td><td className="mut">{e.venue} — {e.city}</td><td><span className={"pill " + (st[e.status] ?? "")}>{e.status}</span></td></tr>
            ))}</tbody></table>
        </div>
      )}
    </>
  );
}

function Guests({ data, err }: { data?: any; err?: string }) {
  if (!data) return <Loading err={err} />;
  const guests = data.guests ?? [];
  const vips = guests.filter((g: any) => g.is_vip).length;
  const avg = guests.length ? Math.round(guests.reduce((n: number, g: any) => n + Number(g.total_spend), 0) / guests.length) : 0;
  return (
    <>
      <p className="lead">Every guest is a profile — attendance, spend, favorite DJ, and a live probability of showing up tonight. Read live from the <code>guests</code> table.</p>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Tile k="Known guests" v={String(guests.length)} />
        <Tile k="VIPs" v={String(vips)} />
        <Tile k="Avg spend / visit" v={"€" + avg} />
        <Tile k="Top spender" v={guests[0] ? guests[0].name.split(" ")[0] : "—"} />
      </div>
      <div className="card"><h3>Guests by spend</h3>
        <table><thead><tr><th>Guest</th><th>Visits</th><th>Spend</th><th>Favorite DJ</th><th>Attends tonight</th></tr></thead>
          <tbody>{guests.map((g: any) => (
            <tr key={g.id}><td><b>{g.name}</b>{g.is_vip && <span className="pill good" style={{ marginLeft: 8 }}>VIP</span>}</td><td>{g.visits}</td><td>€{Number(g.total_spend).toLocaleString()}</td><td className="mut">{g.favorite_dj}</td><td><span className={"pill " + (g.attend_probability > 0.65 ? "good" : "warn")}>{Math.round(g.attend_probability * 100)}%</span></td></tr>
          ))}</tbody></table>
      </div>
    </>
  );
}

function Promoters({ data, err }: { data?: any; err?: string }) {
  if (!data) return <Loading err={err} />;
  const promoters = data.promoters ?? [];
  return (
    <>
      <p className="lead">Track every promoter: revenue generated, conversion, ROI — and flag fake guests. Live from the <code>promoters</code> table.</p>
      <div className="card"><h3>Promoter leaderboard</h3>
        <table><thead><tr><th>Promoter</th><th>Guests</th><th>Revenue</th><th>Conv.</th><th>ROI</th><th>Flag</th></tr></thead>
          <tbody>{promoters.map((p: any) => (
            <tr key={p.id}><td><b>{p.name}</b></td><td>{p.guests_brought}</td><td>€{Number(p.revenue).toLocaleString()}</td><td>{Math.round(p.conversion * 100)}%</td><td>{p.roi}×</td><td>{p.fake_flag ? <span className="pill bad">fake guests</span> : <span className="pill good">clean</span>}</td></tr>
          ))}</tbody></table>
      </div>
    </>
  );
}

function City({ data, err }: { data?: any; err?: string }) {
  if (!data) return <Loading err={err} />;
  const events = data.events ?? [];
  return (
    <>
      <p className="lead">The context around the club: competitor events, weather, demand. Live from the <code>city_events</code> table.</p>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Tile k="Demand tonight" v="78/100" d="High" cls="up" />
        <Tile k="Weather" v="21°" d="Clear · good" />
        <Tile k="Tourism" v="Peak" d="Festival week" cls="up" />
        <Tile k="Competing events" v={String(events.length)} d="near you tonight" cls="down" />
      </div>
      <div className="card"><h3>Competitor events tonight</h3>
        {events.map((c: any) => (
          <div className="rowline" key={c.id}><span className={"pill " + (c.clash_level === "high" ? "bad" : c.clash_level === "medium" ? "warn" : "good")}>{c.clash_level === "high" ? "clash" : c.clash_level === "medium" ? "watch" : "ok"}</span><div className="grow"><b>{c.venue} — {c.title}</b><div className="mut">{c.note}</div></div></div>
        ))}
      </div>
    </>
  );
}

function Revenue() {
  const rev = [["Wed", 9.2, 0], ["Thu", 7.1, 0], ["Fri", 15.8, 0], ["Sat", 18.4, 0], ["Sun", 6.0, 1], ["Wed", 10.1, 1], ["Sat", 19.6, 1]] as [string, number, number][];
  const mx = Math.max(...rev.map((r) => r[1]));
  return (
    <>
      <p className="lead">Predict attendance, revenue, and table sales per night — spot weak events early.</p>
      <div className="grid g4" style={{ marginBottom: 18 }}>
        <Tile k="Forecast this week" v="€112k" d="▲ 9%" cls="up" />
        <Tile k="Tables sold" v="68%" d="▲ 5pts" cls="up" />
        <Tile k="Bar / head" v="€41" d="flat" />
        <Tile k="No-show risk" v="Med" d="Thu event" cls="down" />
      </div>
      <div className="card"><h3>Revenue — last 4 nights + next 3 (predicted)</h3>
        <div className="chartbars">{rev.map((r, i) => (
          <div key={i}><div className={"b" + (r[2] ? " pred" : "")} style={{ height: Math.round((r[1] / mx) * 120) }} /><div className="cl">{r[0]}</div><div className="cl">€{r[1]}k</div></div>
        ))}</div>
      </div>
    </>
  );
}

function Growth() {
  const cards = [
    ["QR ecosystem", "QR on flyers, tables, wristbands → smart landing pages.", "3,109 scans / mo"],
    ["WhatsApp capture", "Auto-capture numbers at the door and via QR.", "1,240 new contacts"],
    ["Referrals", "1 free entry per 3 friends. Drove 312 guests last month.", "ROI 9.4×"],
    ["Loyalty", "Points on spend + attendance. 318 VIPs unlocked.", "Retention +18%"],
  ];
  return (
    <>
      <p className="lead">The guest lifecycle engine: QR everywhere, WhatsApp capture, referrals and loyalty.</p>
      <div className="grid g2">{cards.map((c, i) => (
        <div className="card" key={i}><h3>{c[0]}</h3><div className="mut" style={{ lineHeight: 1.6 }}>{c[1]}</div><div className="rowline" style={{ marginTop: 10 }}><span className="pill good">{c[2]}</span></div></div>
      ))}</div>
    </>
  );
}

function Tile({ k, v, d, cls }: { k: string; v: string; d?: string; cls?: string }) {
  return <div className="tile"><div className="k">{k}</div><div className="v">{v}</div>{d && <div className={"d " + (cls ?? "flat")}>{d}</div>}</div>;
}
