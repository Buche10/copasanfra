-- =====================================================================
-- Copa Abogados - Diagnostico y regularizacion: Refuerzos existentes (Brief 25)
-- =====================================================================
-- Detecta los segundos carnets (refuerzos) creados antes de que existiera el
-- campo reinforcementOf, para que dejen de ocupar cupo en su equipo.
--
-- Seguridad: NO muestra numeros de cedula.
--
-- Solo se consideran cedulas validas (10 digitos) y se EXCLUYE la cedula de
-- relleno '1800000000' que usaban las altas manuales antiguas: si no, jugadores
-- distintos con esa cedula falsa se marcarian como refuerzos por error.
-- El registro de origen debe estar APROBADO.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PARTE 1: solo lectura. Revisa la lista antes de ejecutar la Parte 2.
-- La columna mismo_nombre debe ser true en todas las filas; si alguna es
-- false, revisa ese caso a mano antes de continuar.
-- ---------------------------------------------------------------------

with players_norm as (
  select
    p.id,
    p.data->>'name' as player_name,
    public.normalize_cedula(p.data->>'cedula') as norm_cedula,
    t.data->>'name' as team_name,
    t.data->>'category' as category,
    p.data->>'reinforcementOf' as reinforcement_of,
    coalesce(p.data->>'approvalStatus', 'APPROVED') as approval_status,
    p.data->>'registeredAt' as registered_at
  from public.players p
  join public.teams t on t.id = p.data->>'teamId'
  where coalesce(p.data->>'approvalStatus', 'APPROVED') <> 'REJECTED'
    and public.normalize_cedula(p.data->>'cedula') ~ '^\d{10}$'
    and public.normalize_cedula(p.data->>'cedula') <> '1800000000'
)
select
  target.id          as refuerzo_id,
  target.player_name as refuerzo_nombre,
  target.team_name   as equipo_destino,
  target.category    as categoria_destino,
  source.id          as origen_id,
  source.player_name as origen_nombre,
  source.team_name   as equipo_origen,
  source.category    as categoria_origen,
  lower(btrim(target.player_name)) = lower(btrim(source.player_name)) as mismo_nombre
from players_norm target
join players_norm source
  on source.norm_cedula = target.norm_cedula
 and source.id <> target.id
where coalesce(target.reinforcement_of, '') = ''
  and source.approval_status = 'APPROVED'
  and (
    (target.category = 'Abierta Varones' and source.category in ('+40 Varones', '+50 Varones'))
    or
    (target.category = '+40 Varones' and source.category = '+50 Varones')
  )
order by mismo_nombre, target.team_name, target.player_name;

-- ---------------------------------------------------------------------
-- PARTE 2: escritura. Marca como refuerzo los registros de la Parte 1.
-- Revisa la Parte 1 antes de quitar los comentarios y ejecutar.
-- Si un refuerzo tiene varios origenes posibles, se toma el mas antiguo
-- (registeredAt; sin fecha se considera el mas antiguo).
-- ---------------------------------------------------------------------

/*
with players_norm as (
  select
    p.id,
    public.normalize_cedula(p.data->>'cedula') as norm_cedula,
    t.data->>'category' as category,
    coalesce(p.data->>'approvalStatus', 'APPROVED') as approval_status,
    p.data->>'registeredAt' as registered_at
  from public.players p
  join public.teams t on t.id = p.data->>'teamId'
  where coalesce(p.data->>'approvalStatus', 'APPROVED') <> 'REJECTED'
    and public.normalize_cedula(p.data->>'cedula') ~ '^\d{10}$'
    and public.normalize_cedula(p.data->>'cedula') <> '1800000000'
),
candidates as (
  select distinct on (target.id)
    target.id as target_id,
    source.id as source_id
  from players_norm target
  join players_norm source
    on source.norm_cedula = target.norm_cedula
   and source.id <> target.id
  where source.approval_status = 'APPROVED'
    and (
      (target.category = 'Abierta Varones' and source.category in ('+40 Varones', '+50 Varones'))
      or
      (target.category = '+40 Varones' and source.category = '+50 Varones')
    )
  order by target.id, source.registered_at asc nulls first
)
update public.players p
set data = jsonb_set(p.data, '{reinforcementOf}', to_jsonb(c.source_id)),
    updated_at = now()
from candidates c
where p.id = c.target_id
  and coalesce(p.data->>'reinforcementOf', '') = '';
*/
