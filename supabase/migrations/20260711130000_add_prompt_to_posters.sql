-- Persists the actual (enhanced) prompt used for a cinematic/lineup AI scene poster, so the
-- gallery can show exactly what was sent to the image model rather than only the raw brief the
-- user typed — the enhancer (src/lib/groq.ts's enhanceScenePrompt) rewrites that brief before
-- it reaches Replicate, and users asked to be able to see the result.
alter table public.posters add column if not exists prompt text;
