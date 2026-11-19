-- LOCAL DEVELOPMENT ONLY. Applied by `supabase db reset` on a developer machine or CI runner.
-- Hosted environments provision the desk_app password out of band (docs/DESK.md) and are never seeded.
alter role desk_app password 'desk_app_local_only';
