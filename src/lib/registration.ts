import { Team, Category, Match } from '@/types';

export const REGISTRATION_CLOSED_MESSAGE = 'La inscripción para esta categoría está cerrada.';

/**
 * Error especifico lanzado cuando la inscripcion en un equipo o categoria esta cerrada.
 */
export class RegistrationClosedError extends Error {
  constructor(message: string = REGISTRATION_CLOSED_MESSAGE) {
    super(message);
    this.name = 'RegistrationClosedError';
  }
}

/**
 * Determina si se permite la inscripcion publica en un equipo dado.
 * Requiere que las inscripciones esten abiertas globalmente, que el equipo exista
 * y que su categoria este habilitada dentro de la lista de categorias activas.
 */
export function canRegisterInTeam(
  team: Team | undefined,
  categories: Category[],
  registrationsOpen: boolean
): boolean {
  if (!registrationsOpen) {
    return false;
  }
  if (!team) {
    return false;
  }
  return categories.includes(team.category);
}

/**
 * Determina si un equipo puede cambiar de categoria.
 * No se permite si el equipo ya tiene partidos en el calendario (jugados o pendientes).
 */
export function canChangeCategory(teamId: string, matches: Match[]): boolean {
  return !matches.some((m) => m.homeTeamId === teamId || m.awayTeamId === teamId);
}

/**
 * Detecta si un error devuelto por la base de datos corresponde a una
 * violacion de politica RLS exclusivamente en la tabla players (no en player_docs).
 */
export function isRlsRegistrationError(error: unknown): boolean {
  if (error instanceof RegistrationClosedError) {
    return true;
  }
  const msg = error instanceof Error ? error.message : String(error ?? '');
  const lower = msg.toLowerCase();
  const hasRls = lower.includes('42501') || lower.includes('row-level security');
  const mentionsPlayerDocs = lower.includes('player_docs');
  const mentionsPlayers = lower.includes('players');
  return hasRls && mentionsPlayers && !mentionsPlayerDocs;
}
