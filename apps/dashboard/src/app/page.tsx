import { redirect } from "next/navigation";

// The app's front door is the browser-only Poster Studio (public/studio.html) — a
// self-contained canvas poster generator that needs no database, AI keys, or auth. It replaces
// the previous server-driven flyer-pipeline admin UI as the primary experience. The old pipeline
// code (API routes, modules/flyer-engine, packages/core) remains in the repo and git history.
export default function Home() {
  redirect("/studio.html");
}
