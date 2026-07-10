-- Adds the "cinematic" poster variant: a fully AI-generated/edited scene from a free-text
-- creative brief (see src/lib/replicate.ts's generateCinematicScene, src/lib/poster/render.ts's
-- renderCinematic). Unlike the four template variants, it isn't user-selectable via the layout
-- dropdown — it's derived server-side whenever an event's generate request includes a
-- creativeBrief (src/app/api/events/[id]/generate/route.ts).
alter table public.posters drop constraint posters_variant_check;
alter table public.posters add constraint posters_variant_check
  check (variant in ('masthead', 'light', 'flyer', 'halo', 'cinematic'));
