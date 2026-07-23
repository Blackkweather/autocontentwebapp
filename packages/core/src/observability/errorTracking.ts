// Error tracking for failed generations. Two layers, deliberately independent:
//
//  1. A structured console.error on every real failure — this alone is enough to make failures
//     visible: Vercel captures stdout/stderr into Runtime Logs regardless of any other setup,
//     so this works the moment it ships, with zero configuration.
//  2. Sentry, gated entirely on SENTRY_DSN — if it's unset, init() is skipped and captureException
//     is never called, so this is a true no-op until someone deliberately turns it on. That's the
//     one piece that actually pages a human; the console.error alone only helps if someone goes
//     looking.
//
// Deliberately NOT wired to "photo_missing" — an artist with no findable photo is an expected,
// routine outcome of the sourcing pipeline, not a bug. Reporting it here would just be noise that
// trains whoever's on the other end to ignore this channel.

import * as Sentry from "@sentry/node";

export interface GenerationFailureContext {
  eventId: string;
  artistName: string;
  stage: "claim" | "generation";
  variant?: string;
}

export function captureGenerationFailure(error: unknown, context: GenerationFailureContext): void {
  const message = error instanceof Error ? error.message : String(error);

  console.error(
    "[poster-generation-failed]",
    JSON.stringify({ ...context, message, stack: error instanceof Error ? error.stack : undefined })
  );

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  // Cheap to call on every failure — this only ever runs on the error path, never per-request —
  // and reconfiguring an already-initialized client is a harmless no-op in the SDK.
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0, // error tracking only — no perf/tracing overhead
  });
  Sentry.captureException(error, {
    tags: { eventId: context.eventId, stage: context.stage },
    extra: { artistName: context.artistName, variant: context.variant },
  });
}
