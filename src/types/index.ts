export type Category = 'Abierta Varones' | '+40 Varones' | '+50 Varones' | 'Damas';

export const CATEGORIES: Category[] = [
  'Abierta Varones',
  '+40 Varones',
  '+50 Varones',
  'Damas',
];

// Estado por categoría:
//  - SUSPENDIDA: oculta del público, inscripción e informes (datos se conservan).
//  - PRÓXIMAMENTE: visible y con inscripción abierta, pero su calendario/tablas
//    muestran "Próximamente" (aún no juega).
//  - EN PAUSA: se muestran su calendario y resultados ya jugados, pero está
//    marcada como pausada (no se programan nuevas fechas) y sin inscripción.
//  - ACTIVA: normal.
// Defaults (se usan si no hay ajustes guardados en la base):
export const SUSPENDED_CATEGORIES: Category[] = [];
export const COMING_SOON_CATEGORIES: Category[] = ['+50 Varones'];

// Categorías activas = todas menos las suspendidas. Úsala en el generador.
export const ACTIVE_CATEGORIES: Category[] = CATEGORIES.filter(
  (c) => !SUSPENDED_CATEGORIES.includes(c)
);

export type CategoryStatus = 'ACTIVE' | 'COMING_SOON' | 'PAUSED' | 'SUSPENDED';

// Ajustes globales del torneo (persistidos y compartidos): estado de cada
// categoría y si la inscripción de jugadores está abierta.
export interface AppSettings {
  suspendedCategories: Category[];
  comingSoonCategories: Category[];
  pausedCategories: Category[];
  registrationsOpen: boolean;
  // Categorías con la inscripción CERRADA (aunque la inscripción global esté abierta).
  closedRegistrationCategories: Category[];
  // Habilitación pública de refuerzos +40/+50 en categorías menores
  reinforcementsOpen: boolean;
}

export type Role = 'PUBLIC' | 'REFEREE' | 'ADMIN';

export interface User {
  id: string;
  name: string;
  username: string;
  role: Role;
  refereeId?: string;
  avatar?: string;
  // Email used for Supabase Auth (sign-in). Matches the auth account email.
  email?: string;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  category: Category;
  logo: string; // Emoji / SVG string / URL
  primaryColor: string;
  secondaryColor: string;
  delegate: string;
  phone: string;
  // Club/owner identifier. Teams of the same owner across different categories
  // share this value so the scheduler keeps their matches in consecutive,
  // non-overlapping time slots. When absent, the team is its own club.
  clubId?: string;
}

export type PlayerPosition = 'POR' | 'DEF' | 'MED' | 'DEL';

export interface Player {
  id: string;
  teamId: string;
  name: string;
  cedula: string;
  dorsal: number;
  position: PlayerPosition;
  photo?: string;
  isCaptain?: boolean;
  affiliation?: 'Colegio de Abogados' | 'Foro de Abogados';
  verificationDoc?: string;
  registeredAt?: string;
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  // Suspensión MANUAL (fijada por el Admin): fechas/jornadas en las que el
  // jugador NO puede jugar. Complementa la sanción automática por tarjetas.
  suspendedRounds?: number[];
  // Si este jugador es un refuerzo de otra categoría, ID del registro de origen.
  reinforcementOf?: string;
  // Campo transitorio (solo lectura vista players_admin): indica si el jugador
  // tiene documento de respaldo, sin traer la imagen pesada. No se persiste.
  hasDoc?: boolean;
}

export type MatchStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'FINISHED' | 'SUSPENDED';

export type EventType = 'GOAL' | 'YELLOW_CARD' | 'RED_CARD' | 'SUBSTITUTION';

export type GoalType = 'REGULAR' | 'PENALTY' | 'OWN_GOAL';

export type CardReason = 
  | 'UNSPORTING'
  | 'DISSENT'
  | 'REPEATED_FOULS'
  | 'DELAY'
  | 'SERIOUS_FOUL'
  | 'VIOLENT_CONDUCT'
  | 'HANDBALL_PREVENTION'
  | 'OTHER';

export interface MatchEvent {
  id: string;
  matchId: string;
  minute: number;
  type: EventType;
  teamId: string;
  playerId: string;
  assistedByPlayerId?: string;
  goalType?: GoalType;
  cardReason?: CardReason;
  isDoubleYellow?: boolean;
  playerOutId?: string;
  playerInId?: string;
  notes?: string;
}

export interface LineupPlayer {
  playerId: string;
  isStarter: boolean;
  dorsal: number;
  isGoalkeeper?: boolean;
}

// Máximo de jugadores permitidos por equipo (nómina).
export const MAX_PLAYERS_PER_TEAM = 20;

export const MAX_PLAYERS_BY_CATEGORY: Readonly<Partial<Record<Category, number>>> = {
  '+50 Varones': 35,
};

export function maxPlayersForCategory(category: Category | undefined): number {
  if (!category) return MAX_PLAYERS_PER_TEAM;
  return MAX_PLAYERS_BY_CATEGORY[category] ?? MAX_PLAYERS_PER_TEAM;
}

export const CANCHAS = ['Cancha 1', 'Cancha 2'] as const;
export const STADIUMS = CANCHAS;
export const MATCH_TIME_SLOTS = ['08:00', '09:15', '10:30', '11:45', '13:00', '14:15', '15:30', '16:45'] as const;
export const MATCH_TIMES = MATCH_TIME_SLOTS;

export type PaymentMethod = 'EFECTIVO' | 'TRANSFERENCIA';

export interface MatchFinancials {
  homeFeeMethod?: PaymentMethod; // $15 por equipo
  awayFeeMethod?: PaymentMethod; // $15 por equipo
  homeFinesMethod?: PaymentMethod; // $2 por amarilla, $4 por roja; doble amarilla = roja
  awayFinesMethod?: PaymentMethod; // $2 por amarilla, $4 por roja; doble amarilla = roja
  feePerTeam?: number; // Default $15
  yellowCardFine?: number; // Default $2
  redCardFine?: number; // Default $4
  refereePayment?: number; // Default $13
  notes?: string;
}

export interface Match {
  id: string;
  category: Category;
  round: number; // Jornada #
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  stadium: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  status: MatchStatus;
  refereeId?: string;
  refereeName?: string;
  homeLineup: LineupPlayer[];
  awayLineup: LineupPlayer[];
  homeGoalkeeperId?: string;
  awayGoalkeeperId?: string;
  events: MatchEvent[];
  refereeNotes?: string;
  refereeSigned?: boolean;
  signedAt?: string;
  signedBy?: string;
  financials?: MatchFinancials;
  // Play offs
  isPlayoff?: boolean;
  playoffStage?: 'CUARTOS' | 'SEMIS' | 'FINAL';
  // Posición en el cuadro: C1-C4 (cuartos), S1-S2 (semis), F (final).
  bracketSlot?: 'C1' | 'C2' | 'C3' | 'C4' | 'S1' | 'S2' | 'F';
  // Ganador definido a mano cuando el partido de play off termina empatado.
  winnerTeamId?: string;
  // Historial de correcciones de planilla realizadas por administradores o árbitros.
  corrections?: SheetCorrection[];
}

export interface SheetCorrection {
  at: string; // ISO
  by: string; // nombre de quien corrige
  role?: 'ADMIN' | 'REFEREE';
  reason: string; // 5 a 300 caracteres
}

// ---- Arbitraje (pago semanal por fecha) ----
// Cada equipo cancela un valor fijo de arbitraje por cada fecha (sábado) que
// juega. El delegado sube un respaldo (comprobante) que el Admin aprueba.
export const ARBITRAJE_FEE = 15;

export type ArbitrajeStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ArbitrajePayment {
  id: string;
  teamId: string;
  category: Category;
  round: number; // Fecha / jornada
  matchDate?: string; // YYYY-MM-DD del sábado de esa fecha
  amount: number; // Valor cancelado (ARBITRAJE_FEE)
  receiptUrl?: string; // Enlace público del respaldo en Supabase Storage
  status: ArbitrajeStatus;
  submittedAt: string; // ISO — cuándo se subió el respaldo
  reviewedAt?: string; // ISO — cuándo el Admin aprobó/rechazó
  reviewedBy?: string; // Nombre del Admin que revisó
}

// ---- Multas por tarjetas (pagos y abonos registrados por el Admin) ----
export interface CardFinePayment {
  id: string;
  teamId: string;
  category: Category;
  amount: number; // > 0, max 2 decimales
  method: PaymentMethod; // 'EFECTIVO' | 'TRANSFERENCIA'
  paidAt: string; // YYYY-MM-DD
  note?: string; // max 200 caracteres
  registeredBy: string; // nombre del admin
  createdAt: string; // ISO
}

export interface TeamStanding {
  teamId: string;
  teamName: string;
  shortName: string;
  logo: string;
  primaryColor: string;
  pj: number; // Partidos Jugados
  pg: number; // Ganados
  pe: number; // Empatados
  pp: number; // Perdidos
  gf: number; // Goles Favor
  gc: number; // Goles Contra
  dg: number; // Diferencia Gol
  yellowCards: number;
  redCards: number;
  fairPlayPoints: number; // Penalizaciones por tarjetas
  pts: number; // Puntos
}

export interface PlayerScorer {
  playerId: string;
  playerName: string;
  playerPhoto?: string;
  dorsal: number;
  position: PlayerPosition;
  teamId: string;
  teamName: string;
  teamLogo: string;
  goals: number;
  penalties: number;
  matchesPlayed: number;
}

export interface PlayerSanction {
  playerId: string;
  playerName: string;
  dorsal: number;
  teamId: string;
  teamName: string;
  teamLogo: string;
  yellowCards: number;
  redCards: number;
  isSuspended: boolean;
  // Suspensión SOLO por tarjetas (para el bloqueo general en la Planilla).
  cardSuspended: boolean;
  // Fechas de suspensión MANUAL (para bloquear solo esa fecha).
  suspendedRounds: number[];
  suspensionReason?: string;
  matchesRemaining: number;
  yellowsTowardNext?: number;
}

export interface GoalkeeperStat {
  playerId?: string;
  playerName: string;
  playerPhoto?: string;
  dorsal?: number;
  teamId: string;
  teamName: string;
  teamLogo: string;
  primaryColor: string;
  category: Category;
  goalsConceded: number;
  matchesPlayed: number;
  cleanSheets: number;
  ratio: number;
}
