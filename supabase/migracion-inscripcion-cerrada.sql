-- =====================================================================
-- Copa Abogados — Migracion: Bloqueo de inscripcion en categorias cerradas
-- =====================================================================
-- Ejecutalo UNA vez en Supabase: SQL Editor -> New query -> pegar -> Run.
-- (Es idempotente: puedes correrlo de nuevo sin problema.)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Helper para validar si un equipo pertenece a una categoria habilitada
-- ---------------------------------------------------------------------
create or replace function public.registration_allowed(team_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams t
    left join public.settings s on s.id = 'app'
    where t.id = team_id
      and coalesce((s.data->>'registrationsOpen')::boolean, true) = true
      and not (coalesce(s.data->'closedRegistrationCategories', '[]'::jsonb) ? (t.data->>'category'))
      and not (coalesce(s.data->'suspendedCategories', '[]'::jsonb) ? (t.data->>'category'))
      and not (coalesce(s.data->'pausedCategories', '[]'::jsonb) ? (t.data->>'category'))
  );
$$;

revoke all on function public.registration_allowed(text) from public;
grant execute on function public.registration_allowed(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) Politica RLS para insercion publica de jugadores
-- ---------------------------------------------------------------------
drop policy if exists "players_public_insert" on public.players;

create policy "players_public_insert" on public.players
  for insert to anon
  with check (
    coalesce(data->>'approvalStatus', 'PENDING') = 'PENDING'
    and public.registration_allowed(data->>'teamId')
  );

-- ---------------------------------------------------------------------
-- 3) Politica RLS para insercion publica de documentos de respaldo
-- ---------------------------------------------------------------------
-- La clave foranea player_docs.id -> players.id ya impide documentos sin
-- jugador. Una subconsulta sobre players no funciona para anon por RLS.
drop policy if exists "player_docs_public_insert" on public.player_docs;

create policy "player_docs_public_insert" on public.player_docs
  for insert to anon
  with check (true);
