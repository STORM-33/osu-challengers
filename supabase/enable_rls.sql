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

-- 4. These views ran as SECURITY DEFINER (owner privileges), so querying them bypassed the
--    RLS above — a back door to sync_queue and user_achievements. security_invoker=true makes
--    them run with the caller's privileges, so RLS on the base tables applies. The app doesn't
--    query these client-side; server-side runs as service_role, which bypasses RLS regardless.
ALTER VIEW public.challenge_summary         SET (security_invoker = true);
ALTER VIEW public.sync_queue_status         SET (security_invoker = true);
ALTER VIEW public.user_achievements_summary SET (security_invoker = true);

-- 5. Policy cleanup (clears "multiple permissive policies" + "per-row auth" perf advisories).
--    Dedupe to one public-read policy per public table; drop the users UPDATE landmine policies
--    (app updates users via service_role, which bypasses RLS); drop redundant service_role
--    policies (service_role has BYPASSRLS); lock the internal cache/tracking tables.
--    No app impact — server-side uses service_role; only client DB call is the DEFINER RPC.
DROP POLICY IF EXISTS "Allow public read access to challenges"    ON public.challenges;      -- keep "Public challenges are viewable by everyone"
DROP POLICY IF EXISTS "Service role can manage challenges"        ON public.challenges;
DROP POLICY IF EXISTS "Public playlists are viewable by everyone" ON public.playlists;       -- keep "Allow public read access to playlists"
DROP POLICY IF EXISTS "Service role can manage playlists"         ON public.playlists;
DROP POLICY IF EXISTS "Public scores are viewable by everyone"    ON public.scores;           -- keep "Allow public read access to scores"
DROP POLICY IF EXISTS "Service role can manage scores"            ON public.scores;
DROP POLICY IF EXISTS "Service role can manage user_challenges"   ON public.user_challenges;  -- keep "Allow public read access to user_challenges"
DROP POLICY IF EXISTS "Users can view all user profiles"          ON public.users;            -- keep "Allow public read access to user profiles"
DROP POLICY IF EXISTS "Authenticated users can view profiles"     ON public.users;
DROP POLICY IF EXISTS "Service role can manage all users"         ON public.users;
DROP POLICY IF EXISTS "Users can update own profile"              ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile"        ON public.users;
DROP POLICY IF EXISTS "allow_authenticated_upsert"                ON public.users;
DROP POLICY IF EXISTS "Cache is accessible by service role"       ON public.cache;
DROP POLICY IF EXISTS "Admin only access"                         ON public.api_tracking_data;
