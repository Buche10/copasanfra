import { Category, Player, PlayerPosition, Team, maxPlayersForCategory } from '@/types';
import { CROSS_CATEGORY_TARGETS, isValidCedula } from '@/lib/crossCategory';

export type ReinforcementStatus =
  | 'OK'
  | 'INVALID'
  | 'CLOSED'
  | 'NOT_ELIGIBLE'
  | 'ALREADY_IN_CATEGORY'
  | 'TEAM_FULL'
  | 'DORSAL_TAKEN'
  | 'NO_PIN'
  | 'BAD_PIN'
  | 'LOCKED';

/**
 * Devuelve las categorias destino permitidas para refuerzos.
 * Corresponde a la union de categorias destino de CROSS_CATEGORY_TARGETS
 * (Abierta Varones y +40 Varones).
 */
export function reinforcementTargetCategories(): Category[] {
  const targets = new Set<Category>();
  for (const cat of Object.keys(CROSS_CATEGORY_TARGETS) as Category[]) {
    for (const target of CROSS_CATEGORY_TARGETS[cat]) {
      targets.add(target);
    }
  }
  return Array.from(targets);
}

export interface ReinforcementInput {
  pin: string;
  cedula: string;
  teamId: string;
  dorsal: number;
  position?: PlayerPosition;
}

/**
 * Valida la entrada en el navegador antes de invocar la funcion en la base.
 * Devuelve null si la validacion previa es exitosa.
 */
export function validateReinforcementInput(
  input: ReinforcementInput,
  teams: Team[],
  players: Player[]
): ReinforcementStatus | null {
  if (!input.pin || !/^\d{6}$/.test(input.pin)) {
    return 'INVALID';
  }

  if (!isValidCedula(input.cedula)) {
    return 'INVALID';
  }

  if (!Number.isInteger(input.dorsal) || input.dorsal < 1 || input.dorsal > 99) {
    return 'INVALID';
  }

  const validPositions: PlayerPosition[] = ['POR', 'DEF', 'MED', 'DEL'];
  if (input.position && !validPositions.includes(input.position)) {
    return 'INVALID';
  }

  const targetTeam = teams.find((t) => t.id === input.teamId);
  if (!targetTeam) {
    return 'INVALID';
  }

  const allowedTargets = reinforcementTargetCategories();
  if (!allowedTargets.includes(targetTeam.category)) {
    return 'INVALID';
  }

  const dorsalTaken = players.some(
    (p) => p.teamId === input.teamId && p.dorsal === input.dorsal && p.approvalStatus !== 'REJECTED'
  );
  if (dorsalTaken) {
    return 'DORSAL_TAKEN';
  }

  const teamPlayerCount = players.filter((p) => p.teamId === input.teamId).length;
  if (teamPlayerCount >= maxPlayersForCategory(targetTeam.category)) {
    return 'TEAM_FULL';
  }

  return null;
}

/**
 * Retorna el mensaje explicativo para el usuario correspondiente a cada estado.
 */
export function reinforcementMessage(status: ReinforcementStatus): string {
  switch (status) {
    case 'BAD_PIN':
      return 'El código del equipo no es correcto.';
    case 'LOCKED':
      return 'Demasiados intentos fallidos. Espera unos minutos o solicita un nuevo código a la organización.';
    case 'NO_PIN':
      return 'Tu equipo aún no tiene código de habilitación. Solicítalo a la organización.';
    case 'NOT_ELIGIBLE':
      return 'No encontramos un jugador aprobado de +40 o +50 con esa cédula que pueda jugar en esta categoría.';
    case 'ALREADY_IN_CATEGORY':
      return 'Este jugador ya está registrado en un equipo de esta categoría.';
    case 'CLOSED':
      return 'La habilitación de refuerzos está cerrada por la organización.';
    case 'TEAM_FULL':
      return 'El equipo elegido ya alcanzó el máximo de jugadores permitidos.';
    case 'DORSAL_TAKEN':
      return 'El dorsal seleccionado ya está en uso en este equipo.';
    case 'INVALID':
      return 'Los datos ingresados no son válidos. Revisa la cédula y el dorsal.';
    case 'OK':
      return 'Refuerzo habilitado exitosamente.';
    default:
      return 'Ocurrió un error inesperado al procesar el refuerzo.';
  }
}
