-- Enable Row Level Security across all public tables.
--
-- Context: the anon key is public (shipped in the browser bundle as
-- NEXT_PUBLIC_SUPABASE_ANON_KEY). With RLS disabled and the anon role holding full
-- table grants, anyone could read/write/delete every table directly via PostgREST
-- (including flipping users.admin = true or truncating tables).
--
-- Fix: all server-side DB access now runs through the service-role client (see
-- lib/supabase.js — the exported `supabase` is service-role on the server, anon in the
-- browser). Service role bypasses RLS, so enabling RLS with no policies locks the anon
-- role out of every table without breaking the app. The browser's only direct DB call is
-- the get_challenge_leaderboard RPC, handled below.

-- 1. Enable RLS on all 20 public tables (no policies = deny-all for anon/authenticated).
ALTER TABLE public.api_tracking_data         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backgrounds               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cache                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_ruleset_winners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donations                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlists                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_webhook_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_challenges      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_cooldowns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_queue                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_challenges           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_osu_tokens           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                     ENABLE ROW LEVEL SECURITY;

-- 2. The only browser-side (anon) DB call is this leaderboard RPC. Make it SECURITY DEFINER
--    so it can still read the public leaderboard tables under RLS. It returns public data
--    only (username, avatar, country, aggregated scores) — no tokens/donations/admin flags.
ALTER FUNCTION public.get_challenge_leaderboard(integer)
  SECURITY DEFINER SET search_path = public, pg_temp;

-- 3. Defense-in-depth: revoke write grants from the public roles. RLS already blocks these;
--    this ensures a future loose policy or accidental RLS-disable can't reopen writes.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
