import { Category, Player, Team, maxPlayersForCategory } from '@/types';
import { normalizeCedula } from '@/lib/scheduling/sharedPlayers';

/**
 * Categorias destino permitidas para habilitacion de jugadores en otra categoria.
 * Un jugador mayor puede bajar de edad, nunca subir; Damas no se cruza.
 */
export const CROSS_CATEGORY_TARGETS: Readonly<Record<Category, readonly Category[]>> = Object.freeze({
  '+40 Varones': ['Abierta Varones'],
  '+50 Varones': ['+40 Varones', 'Abierta Varones'],
  'Abierta Varones': [],
  'Damas': [],
});

/**
 * Precalcula el conjunto de IDs de jugadores que tienen al menos una categoria
 * destino elegible para habilitacion en otra categoria.
 */
export function buildEligiblePlayerIds(players: Player[], teams: Team[]): Set<string> {
  const result = new Set<string>();
  for (const player of players) {
    const targets = getEligibleTargetCategories(player, players, teams);
    if (targets.length > 0) {
      result.add(player.id);
    }
  }
  return result;
}

/**
 * Valida si una cedula contiene exactamente 10 digitos tras normalizarla.
 */
export function isValidCedula(cedula?: string): boolean {
  if (!cedula) return false;
  const norm = normalizeCedula(cedula);
  return /^\d{10}$/.test(norm);
}

/**
 * Obtiene las categorias destino permitidas para la categoria del equipo actual
 * del jugador, excluyendo aquellas donde su cedula ya tiene un registro no REJECTED.
 * Si el jugador no tiene cedula valida, devuelve un arreglo vacio.
 */
export function getEligibleTargetCategories(
  player: Player,
  players: Player[],
  teams: Team[]
): Category[] {
  if (!isValidCedula(player.cedula)) return [];

  const currentTeam = teams.find((t) => t.id === player.teamId);
  if (!currentTeam) return [];

  const targets = CROSS_CATEGORY_TARGETS[currentTeam.category] || [];
  if (targets.length === 0) return [];

  const normCedula = normalizeCedula(player.cedula);
  const teamCatMap = new Map<string, Category>(teams.map((t) => [t.id, t.category]));
  const occupiedCategories = new Set<Category>();

  for (const p of players) {
    if (p.approvalStatus === 'REJECTED') continue;
    if (normalizeCedula(p.cedula) === normCedula) {
      const cat = teamCatMap.get(p.teamId);
      if (cat) occupiedCategories.add(cat);
    }
  }

  return targets.filter((cat) => !occupiedCategories.has(cat));
}

export type CrossCategoryError =
  | 'NO_CEDULA'
  | 'CATEGORY_NOT_ALLOWED'
  | 'ALREADY_IN_CATEGORY'
  | 'TEAM_FULL'
  | 'DORSAL_TAKEN'
  | 'TEAM_NOT_FOUND'
  | 'INVALID_DORSAL';

/**
 * Valida la habilitacion de un jugador en otra categoria.
 */
export function validateCrossCategory(
  input: { source: Player; targetTeamId: string; dorsal: number },
  players: Player[],
  teams: Team[]
): CrossCategoryError | null {
  if (!isValidCedula(input.source.cedula)) {
    return 'NO_CEDULA';
  }

  const targetTeam = teams.find((t) => t.id === input.targetTeamId);
  if (!targetTeam) {
    return 'TEAM_NOT_FOUND';
  }

  const sourceTeam = teams.find((t) => t.id === input.source.teamId);
  if (!sourceTeam) {
    return 'CATEGORY_NOT_ALLOWED';
  }

  const allowed = CROSS_CATEGORY_TARGETS[sourceTeam.category] || [];
  if (!allowed.includes(targetTeam.category)) {
    return 'CATEGORY_NOT_ALLOWED';
  }

  const normCedula = normalizeCedula(input.source.cedula);
  const teamCatMap = new Map<string, Category>(teams.map((t) => [t.id, t.category]));
  const alreadyInCat = players.some((p) => {
    if (p.approvalStatus === 'REJECTED') return false;
    if (normalizeCedula(p.cedula) !== normCedula) return false;
    return teamCatMap.get(p.teamId) === targetTeam.category;
  });
  if (alreadyInCat) {
    return 'ALREADY_IN_CATEGORY';
  }

  if (!Number.isInteger(input.dorsal) || input.dorsal < 1 || input.dorsal > 99) {
    return 'INVALID_DORSAL';
  }

  const maxLimit = maxPlayersForCategory(targetTeam.category);
  const teamPlayerCount = players.filter((p) => p.teamId === input.targetTeamId).length;
  if (teamPlayerCount >= maxLimit) {
    return 'TEAM_FULL';
  }

  const dorsalTaken = players.some(
    (p) => p.teamId === input.targetTeamId && p.dorsal === input.dorsal
  );
  if (dorsalTaken) {
    return 'DORSAL_TAKEN';
  }

  return null;
}

/**
 * Construye el nuevo registro de jugador habilitado en otra categoria.
 * Recibe now para ser determinista y testeable. No muta el registro de origen.
 */
export function buildCrossCategoryPlayer(
  source: Player,
  targetTeamId: string,
  dorsal: number,
  now: Date
): Player {
  return {
    id: `p-${crypto.randomUUID()}`,
    teamId: targetTeamId,
    name: source.name,
    cedula: source.cedula,
    dorsal,
    position: source.position,
    affiliation: source.affiliation,
    approvalStatus: 'APPROVED',
    registeredAt: now.toISOString(),
  };
}

/**
 * Mensajes de error en espanol para cada codigo de validacion.
 */
export function crossCategoryErrorMessage(err: CrossCategoryError): string {
  switch (err) {
    case 'NO_CEDULA':
      return 'El jugador debe tener una cédula válida de 10 dígitos.';
    case 'CATEGORY_NOT_ALLOWED':
      return 'La categoría de destino no está permitida para este jugador.';
    case 'ALREADY_IN_CATEGORY':
      return 'El jugador ya está registrado en un equipo de esa categoría.';
    case 'TEAM_FULL':
      return 'El equipo elegido ya alcanzó el máximo de jugadores permitidos.';
    case 'DORSAL_TAKEN':
      return 'Ese dorsal ya está en uso en el equipo elegido.';
    case 'TEAM_NOT_FOUND':
      return 'El equipo de destino no fue encontrado.';
    case 'INVALID_DORSAL':
      return 'El dorsal debe ser un número entero entre 1 y 99.';
  }
}

/**
 * Determina si otra ficha (no REJECTED, distinto excludePlayerId) con esa cedula
 * ya esta en un equipo de la misma categoria que teamId.
 */
export function findSameCategoryConflict(
  cedula: string,
  teamId: string,
  players: Player[],
  teams: Team[],
  excludePlayerId?: string
): boolean {
  const norm = normalizeCedula(cedula);
  if (!norm) return false;

  const targetTeam = teams.find((t) => t.id === teamId);
  if (!targetTeam) return false;

  const teamCatMap = new Map<string, Category>(teams.map((t) => [t.id, t.category]));

  return players.some((p) => {
    if (excludePlayerId && p.id === excludePlayerId) return false;
    if (p.approvalStatus === 'REJECTED') return false;
    if (normalizeCedula(p.cedula) !== norm) return false;
    return teamCatMap.get(p.teamId) === targetTeam.category;
  });
}
