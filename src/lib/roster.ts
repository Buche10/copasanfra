import { Player, Team, maxPlayersForCategory } from '@/types';

/**
 * Determina si un registro de jugador corresponde a un refuerzo
 * (habilitado desde otra categoria mediante carnet adicional).
 */
export function isReinforcement(p: { reinforcementOf?: string | null }): boolean {
  return Boolean(p.reinforcementOf && p.reinforcementOf.trim() !== '');
}

/**
 * Cuenta los jugadores propios del equipo (excluyendo refuerzos),
 * que son los unicos que computan para el cupo maximo de la plantilla.
 */
export function rosterCount(players: Player[], teamId: string): number {
  return players.filter((p) => p.teamId === teamId && !isReinforcement(p)).length;
}

/**
 * Cuenta los jugadores habilitados en condicion de refuerzo en el equipo.
 */
export function reinforcementCount(players: Player[], teamId: string): number {
  return players.filter((p) => p.teamId === teamId && isReinforcement(p)).length;
}

/**
 * Indica si el cupo de jugadores propios del equipo esta completo.
 * Los refuerzos no ocupan cupo y pueden incorporarse aun con plantilla llena.
 */
export function isRosterFull(players: Player[], team: Team): boolean {
  return rosterCount(players, team.id) >= maxPlayersForCategory(team.category);
}

/**
 * Etiqueta informativa del estado del plantel para selectores e indicadores:
 * - Sin refuerzos: "18/20"
 * - Con 1 refuerzo: "20/20 + 1 refuerzo"
 * - Con N refuerzos: "20/20 + N refuerzos"
 */
export function rosterLabel(players: Player[], team: Team): string {
  const own = rosterCount(players, team.id);
  const max = maxPlayersForCategory(team.category);
  const r = reinforcementCount(players, team.id);

  if (r === 0) {
    return `${own}/${max}`;
  }
  if (r === 1) {
    return `${own}/${max} + 1 refuerzo`;
  }
  return `${own}/${max} + ${r} refuerzos`;
}
