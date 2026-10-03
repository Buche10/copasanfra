-- =====================================================================
-- Copa Abogados - Migracion: Bloqueo de PIN por conexion (Brief 22 y 23)
-- Versión con refuerzos fuera del cupo (Brief 25)
-- =====================================================================
-- Ejecutalo UNA vez en Supabase: SQL Editor -> New query -> pegar -> Run.
-- (Es idempotente: puedes correrlo de nuevo sin problema.)
-- Requiere haber ejecutado antes supabase/migracion-refuerzos.sql.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1) Tabla team_pin_failures para registro de intentos fallidos
-- ---------------------------------------------------------------------
create table if not exists public.team_pin_failures (
  id bigserial primary key,
  team_id text not null references public.teams(id) on delete cascade,
  client_hash text not null,
  failed_at timestamptz not null default now()
);

create index if not exists team_pin_failures_team_client_idx
  on public.team_pin_failures (team_id, client_hash, failed_at);

create index if not exists team_pin_failures_team_failed_idx
  on public.team_pin_failures (team_id, failed_at);

create index if not exists team_pin_failures_failed_at_idx
  on public.team_pin_failures (failed_at);

alter table public.team_pin_failures enable row level security;
-- Sin politicas RLS: nadie (ni anon ni authenticated) lee o escribe directamente.

-- ---------------------------------------------------------------------
-- 2) Actualizar team_pins eliminando columnas de bloqueo antiguas
-- ---------------------------------------------------------------------
create table if not exists public.team_pins (
  team_id text primary key references public.teams(id) on delete cascade,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.team_pins enable row level security;
alter table public.team_pins drop column if exists failed_attempts;
alter table public.team_pins drop column if exists locked_until;

-- ---------------------------------------------------------------------
-- 3) Funcion auxiliar para calcular el hash de conexion del cliente
-- ---------------------------------------------------------------------
create or replace function public.request_client_hash(p_team_id text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_headers_raw text;
  v_headers jsonb;
  v_ip text;
begin
  begin
    v_headers_raw := current_setting('request.headers', true);
    if v_headers_raw is not null and v_headers_raw <> '' then
      v_headers := v_headers_raw::jsonb;
    end if;
  exception when others then
    v_headers := null;
  end;

  if v_headers is not null then
    v_ip := coalesce(
      nullif(btrim(v_headers->>'cf-connecting-ip'), ''),
      nullif(btrim(split_part(v_headers->>'x-forwarded-for', ',', 1)), ''),
      'desconocida'
    );
  else
    v_ip := 'desconocida';
  end if;

  return encode(extensions.digest(v_ip || ':' || coalesce(p_team_id, ''), 'sha256'), 'hex');
end $$;

revoke all on function public.request_client_hash(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) Diagnostico de IP para el Admin (Solo ADMIN)
-- ---------------------------------------------------------------------
create or replace function public.admin_client_ip_source()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_headers_raw text;
  v_headers jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  begin
    v_headers_raw := current_setting('request.headers', true);
    if v_headers_raw is not null and v_headers_raw <> '' then
      v_headers := v_headers_raw::jsonb;
    end if;
  exception when others then
    v_headers := null;
  end;

  if v_headers is not null then
    if nullif(btrim(v_headers->>'cf-connecting-ip'), '') is not null then
      return 'cloudflare';
    elsif nullif(btrim(split_part(v_headers->>'x-forwarded-for', ',', 1)), '') is not null then
      return 'forwarded';
    end if;
  end if;

  return 'desconocida';
end $$;

revoke all on function public.admin_client_ip_source() from public, anon, authenticated;
grant execute on function public.admin_client_ip_source() to authenticated;

-- ---------------------------------------------------------------------
-- 5) Generar / regenerar PIN de un equipo (Solo ADMIN)
-- ---------------------------------------------------------------------
create or replace function public.admin_set_team_pin(p_team_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw bigint;
  v_pin text;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  if not exists (select 1 from public.teams where id = p_team_id) then
    raise exception 'not_found';
  end if;

  v_raw := ('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint;
  v_pin := lpad((v_raw % 1000000)::text, 6, '0');

  insert into public.team_pins (team_id, pin_hash, updated_at)
  values (
    p_team_id,
    extensions.crypt(v_pin, extensions.gen_salt('bf')),
    now()
  )
  on conflict (team_id) do update set
    pin_hash = excluded.pin_hash,
    updated_at = now();

  delete from public.team_pin_failures where team_id = p_team_id;

  return v_pin;
end $$;

revoke all on function public.admin_set_team_pin(text) from public, anon, authenticated;
grant execute on function public.admin_set_team_pin(text) to authenticated;

-- ---------------------------------------------------------------------
-- 6) Listar estado de PINs por equipo (Solo ADMIN)
-- ---------------------------------------------------------------------
drop function if exists public.admin_list_team_pins();

create or replace function public.admin_list_team_pins()
returns table(team_id text, updated_at timestamptz, locked boolean, failures_24h int)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  return query
  select
    tp.team_id,
    tp.updated_at,
    (count(f.id) filter (where f.failed_at >= now() - interval '60 minutes') >= 30) as locked,
    count(f.id)::int as failures_24h
  from public.team_pins tp
  left join public.team_pin_failures f
    on f.team_id = tp.team_id and f.failed_at >= now() - interval '24 hours'
  group by tp.team_id, tp.updated_at;
end $$;

revoke all on function public.admin_list_team_pins() from public, anon, authenticated;
grant execute on function public.admin_list_team_pins() to authenticated;

-- ---------------------------------------------------------------------
-- 7) Registro de refuerzo con bloqueo por conexion y por equipo
-- ---------------------------------------------------------------------
drop function if exists public.register_reinforcement(text, text, int, text);

create or replace function public.register_reinforcement(
  p_pin text,
  p_cedula text,
  p_team_id text,
  p_dorsal int,
  p_position text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm_cedula         text;
  v_target_team_id      text;
  v_target_category     text;
  v_reinforcements_open boolean;
  v_is_suspended        boolean;
  v_is_paused           boolean;
  v_pin_hash            text;
  v_client              text;
  v_team_failures_60m   int;
  v_client_failures_15m int;
  v_source_id           text;
  v_source_name         text;
  v_source_position     text;
  v_source_affiliation  text;
  v_new_id              text;
  v_iso_now             text;
  v_new_player_data     jsonb;
begin
  -- 1. Validar entradas
  if p_pin is null or p_pin !~ '^\d{6}$' then
    return jsonb_build_object('status', 'INVALID');
  end if;

  v_norm_cedula := public.normalize_cedula(p_cedula);
  if v_norm_cedula !~ '^\d{10}$' then
    return jsonb_build_object('status', 'INVALID');
  end if;

  if p_dorsal is null or p_dorsal < 1 or p_dorsal > 99 then
    return jsonb_build_object('status', 'INVALID');
  end if;

  if p_position is not null and p_position not in ('POR', 'DEF', 'MED', 'DEL') then
    return jsonb_build_object('status', 'INVALID');
  end if;

  -- 2. Bloquear equipo destino
  select t.id, t.data->>'category'
  into v_target_team_id, v_target_category
  from public.teams t
  where t.id = p_team_id
  for update;

  if v_target_team_id is null or v_target_category not in ('Abierta Varones', '+40 Varones') then
    return jsonb_build_object('status', 'INVALID');
  end if;

  -- 3. Leer settings ('app')
  select
    coalesce((s.data->>'reinforcementsOpen')::boolean, true),
    coalesce(s.data->'suspendedCategories', '[]'::jsonb) ? v_target_category,
    coalesce(s.data->'pausedCategories', '[]'::jsonb) ? v_target_category
  into v_reinforcements_open, v_is_suspended, v_is_paused
  from (select 1) _
  left join public.settings s on s.id = 'app';

  if not v_reinforcements_open or v_is_suspended or v_is_paused then
    return jsonb_build_object('status', 'CLOSED');
  end if;

  -- 4. Comprobar PIN con limite por conexion y equipo
  -- 4.1 Limpieza de registros con mas de 24 horas
  delete from public.team_pin_failures where failed_at < now() - interval '24 hours';

  -- 4.2 Verificar si el equipo tiene PIN configurado
  select tp.pin_hash
  into v_pin_hash
  from public.team_pins tp
  where tp.team_id = p_team_id;

  if v_pin_hash is null then
    return jsonb_build_object('status', 'NO_PIN');
  end if;

  -- 4.3 Obtener hash anonimo de la conexion
  v_client := public.request_client_hash(p_team_id);

  -- 4.4 Bloqueo global de equipo: 30 fallos en los ultimos 60 minutos
  select count(*)
  into v_team_failures_60m
  from public.team_pin_failures
  where team_id = p_team_id
    and failed_at >= now() - interval '60 minutes';

  if v_team_failures_60m >= 30 then
    return jsonb_build_object('status', 'LOCKED');
  end if;

  -- 4.5 Bloqueo por conexion (ventana deslizante de 15 minutos):
  -- Cuenta los fallos de esta conexion para este equipo en los ultimos 15 minutos.
  -- Al cumplir 15 minutos el fallo mas antiguo, la conexion recupera un intento
  -- (maximo ~20 intentos por hora). Las 5 primeras respuestas dan BAD_PIN; desde el
  -- 6to intento consecutivo en la ventana da LOCKED.
  select count(*)
  into v_client_failures_15m
  from public.team_pin_failures
  where team_id = p_team_id
    and client_hash = v_client
    and failed_at >= now() - interval '15 minutes';

  if v_client_failures_15m >= 5 then
    return jsonb_build_object('status', 'LOCKED');
  end if;

  -- 4.6 Verificar coincidencia de PIN
  if extensions.crypt(p_pin, v_pin_hash) <> v_pin_hash then
    insert into public.team_pin_failures (team_id, client_hash, failed_at)
    values (p_team_id, v_client, now());
    return jsonb_build_object('status', 'BAD_PIN');
  end if;

  -- 4.7 Acierto: borrar fallos de esta conexion para este equipo
  delete from public.team_pin_failures
  where team_id = p_team_id
    and client_hash = v_client;

  -- 5. Advisory lock en la cedula para evitar condiciones de carrera concurrentes
  perform pg_advisory_xact_lock(hashtext('refuerzo:' || v_norm_cedula));

  -- 6. Buscar registro de origen eligible
  select
    sp.id,
    sp.data->>'name',
    sp.data->>'position',
    sp.data->>'affiliation'
  into
    v_source_id,
    v_source_name,
    v_source_position,
    v_source_affiliation
  from public.players sp
  join public.teams st on st.id = sp.data->>'teamId'
  where public.normalize_cedula(sp.data->>'cedula') = v_norm_cedula
    and coalesce(sp.data->>'approvalStatus', 'APPROVED') = 'APPROVED'
    and (
      (v_target_category = 'Abierta Varones' and st.data->>'category' in ('+40 Varones', '+50 Varones'))
      or
      (v_target_category = '+40 Varones' and st.data->>'category' = '+50 Varones')
    )
  order by sp.data->>'registeredAt' desc
  limit 1;

  if v_source_id is null then
    return jsonb_build_object('status', 'NOT_ELIGIBLE');
  end if;

  -- 7. Verificar que la cedula no este ya en la categoria destino (excepto REJECTED)
  if exists (
    select 1
    from public.players p
    join public.teams t on t.id = p.data->>'teamId'
    where public.normalize_cedula(p.data->>'cedula') = v_norm_cedula
      and t.data->>'category' = v_target_category
      and coalesce(p.data->>'approvalStatus', 'APPROVED') != 'REJECTED'
  ) then
    return jsonb_build_object('status', 'ALREADY_IN_CATEGORY');
  end if;

  -- 8. Dorsal en equipo destino (excluyendo REJECTED y validando que sea numerico)
  if exists (
    select 1
    from public.players p
    where p.data->>'teamId' = p_team_id
      and coalesce(p.data->>'approvalStatus', 'APPROVED') != 'REJECTED'
      and p.data->>'dorsal' ~ '^\d+$'
      and (p.data->>'dorsal')::int = p_dorsal
  ) then
    return jsonb_build_object('status', 'DORSAL_TAKEN');
  end if;

  -- 9. Insertar registro PENDING con reinforcementOf
  v_new_id := 'p-' || gen_random_uuid()::text;
  v_iso_now := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  v_new_player_data := jsonb_build_object(
    'id', v_new_id,
    'teamId', p_team_id,
    'name', v_source_name,
    'cedula', v_norm_cedula,
    'dorsal', p_dorsal,
    'position', coalesce(p_position, v_source_position),
    'affiliation', v_source_affiliation,
    'approvalStatus', 'PENDING',
    'registeredAt', v_iso_now,
    'reinforcementOf', v_source_id
  );

  insert into public.players (id, data)
  values (v_new_id, v_new_player_data);

  -- 10. Devolver exito sin cedula
  return jsonb_build_object(
    'status', 'OK',
    'player', jsonb_build_object(
      'id', v_new_id,
      'teamId', p_team_id,
      'name', v_source_name,
      'dorsal', p_dorsal,
      'position', coalesce(p_position, v_source_position),
      'affiliation', v_source_affiliation,
      'approvalStatus', 'PENDING',
      'registeredAt', v_iso_now,
      'reinforcementOf', v_source_id
    )
  );
end $$;

revoke all on function public.register_reinforcement(text, text, text, int, text) from public, anon, authenticated;
grant execute on function public.register_reinforcement(text, text, text, int, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 8) Indice de expresion por cedula normalizada
-- ---------------------------------------------------------------------
create index if not exists players_norm_cedula_idx on public.players ((public.normalize_cedula(data->>'cedula')));
