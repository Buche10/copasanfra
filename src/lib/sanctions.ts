import { Category, Match, MATCH_TIME_SLOTS, Player, PlayerSanction, Team } from '@/types';

export const YELLOWS_FOR_SUSPENSION = 5;
export const DOUBLE_YELLOW_MATCHES = 1;
export const DIRECT_RED_MATCHES = 2;

/**
 * Clasifica las tarjetas de un jugador en un partido especifico.
 * - Doble amarilla (>= 2 amarillas o RED_CARD con isDoubleYellow): 1 partido.
 *   Las amarillas de ese partido no acumulan para las 5.
 * - Roja directa (RED_CARD sin isDoubleYellow): 2 partidos.
 *   Si en ese mismo partido vio exactamente 1 amarilla antes, esa amarilla si acumula.
 * - 1 amarilla sin expulsiones: 1 amarilla acumulable.
 */
export function classifyPlayerCards(
  match: Match,
  playerId: string
): { accumulableYellows: number; doubleYellow: boolean; directRed: boolean } {
  let yellows = 0;
  let hasDoubleYellowRed = false;
  let hasDirectRed = false;

  for (const ev of match.events || []) {
    if (ev.playerId !== playerId) continue;
    if (ev.type === 'YELLOW_CARD') {
      yellows += 1;
    } else if (ev.type === 'RED_CARD') {
      if (ev.isDoubleYellow) {
        hasDoubleYellowRed = true;
      } else {
        hasDirectRed = true;
      }
    }
  }

  const doubleYellow = yellows >= 2 || hasDoubleYellowRed;
  if (doubleYellow) {
    return {
      accumulableYellows: 0,
      doubleYellow: true,
      directRed: hasDirectRed,
    };
  }

  return {
    accumulableYellows: yellows === 1 ? 1 : 0,
    doubleYellow: false,
    directRed: hasDirectRed,
  };
}

function getSlotIndex(time?: string): number {
  if (!time) return 999;
  const idx = (MATCH_TIME_SLOTS as readonly string[]).indexOf(time);
  return idx === -1 ? 999 : idx;
}

/**
 * Filtra los partidos terminados (FINISHED) de un equipo (local o visitante)
 * y los ordena cronologicamente por fecha, turno de hora y jornada.
 * No muta el arreglo de entrada.
 */
export function orderTeamMatches(matches: Match[], teamId: string): Match[] {
  return matches
    .filter(
      (m) =>
        m.status === 'FINISHED' &&
        (m.homeTeamId === teamId || m.awayTeamId === teamId)
    )
    .slice()
    .sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;

      const timeCmp = getSlotIndex(a.time) - getSlotIndex(b.time);
      if (timeCmp !== 0) return timeCmp;

      return (a.round || 0) - (b.round || 0);
    });
}

export interface CardSuspensionState {
  pending: number;
  yellowCycle: number;
  reasons: string[];
}

interface PendingSanctionItem {
  label: string;
  remaining: number;
}

function formatSanctionReason(label: string, remaining: number): string {
  const matchWord = remaining === 1 ? 'partido' : 'partidos';
  return `${label} (${remaining} ${matchWord})`;
}

/**
 * Calcula el estado de suspension por tarjetas de un jugador a lo largo de sus partidos.
 * Recorre los partidos en orden:
 * 1. Primero descuenta 1 fecha pendiente si pending > 0 (ese partido se cumple).
 * 2. Luego suma las sanciones generadas en ese partido.
 */
export function computeCardSuspension(
  playerId: string,
  teamMatches: Match[]
): CardSuspensionState {
  let yellowCycle = 0;
  const queue: PendingSanctionItem[] = [];

  for (const match of teamMatches) {
    // 1. Primero descuenta 1 si hay suspensiones pendientes (partido cumplido)
    if (queue.length > 0) {
      queue[0].remaining -= 1;
      if (queue[0].remaining <= 0) {
        queue.shift();
      }
    }

    // 2. Luego procesa las tarjetas generadas en este partido
    const cards = classifyPlayerCards(match, playerId);

    yellowCycle += cards.accumulableYellows;
    if (yellowCycle >= YELLOWS_FOR_SUSPENSION) {
      const cycles = Math.floor(yellowCycle / YELLOWS_FOR_SUSPENSION);
      yellowCycle = yellowCycle % YELLOWS_FOR_SUSPENSION;
      for (let i = 0; i < cycles; i++) {
        queue.push({ label: '5 Amarillas', remaining: 1 });
      }
    }

    if (cards.directRed) {
      queue.push({ label: 'Roja Directa', remaining: DIRECT_RED_MATCHES });
    } else if (cards.doubleYellow) {
      queue.push({ label: 'Doble Amarilla', remaining: DOUBLE_YELLOW_MATCHES });
    }
  }

  const pending = queue.reduce((sum, item) => sum + item.remaining, 0);
  const reasons = queue.map((item) => formatSanctionReason(item.label, item.remaining));

  return {
    pending,
    yellowCycle,
    reasons,
  };
}

interface TotalPlayerStats {
  yellowCards: number;
  doubleYellows: number;
  directReds: number;
}

function aggregateTournamentCards(matches: Match[]): Map<string, TotalPlayerStats> {
  const map = new Map<string, TotalPlayerStats>();

  for (const m of matches) {
    if (m.status !== 'FINISHED' && m.status !== 'IN_PROGRESS') continue;
    const matchYellowCounts: Record<string, number> = {};

    for (const ev of m.events || []) {
      let stat = map.get(ev.playerId);
      if (!stat) {
        stat = { yellowCards: 0, doubleYellows: 0, directReds: 0 };
        map.set(ev.playerId, stat);
      }

      if (ev.type === 'YELLOW_CARD') {
        stat.yellowCards += 1;
        matchYellowCounts[ev.playerId] = (matchYellowCounts[ev.playerId] || 0) + 1;
        if (matchYellowCounts[ev.playerId] === 2) {
          stat.doubleYellows += 1;
        }
      } else if (ev.type === 'RED_CARD') {
        if (!ev.isDoubleYellow) {
          stat.directReds += 1;
        }
      }
    }
  }

  return map;
}

function buildTeamFinishedMatchesMap(matches: Match[], teams: Team[]): Map<string, Match[]> {
  const rawMap = new Map<string, Match[]>();
  for (const t of teams) {
    rawMap.set(t.id, []);
  }

  for (const m of matches) {
    if (m.status !== 'FINISHED') continue;
    const homeList = rawMap.get(m.homeTeamId);
    if (homeList) homeList.push(m);
    const awayList = rawMap.get(m.awayTeamId);
    if (awayList) awayList.push(m);
  }

  const orderedMap = new Map<string, Match[]>();
  rawMap.forEach((teamMatches, teamId) => {
    orderedMap.set(teamId, orderTeamMatches(teamMatches, teamId));
  });

  return orderedMap;
}

/**
 * Calcula las sanciones de todos los jugadores para la tabla de sanciones, planilla y escaner.
 * Precalcula los partidos por equipo con un Map para rendimiento O(partidos + jugadores).
 */
export function calculateSanctions(
  players: Player[],
  teams: Team[],
  matches: Match[],
  category?: Category | 'ALL'
): PlayerSanction[] {
  const filteredTeams =
    !category || category === 'ALL' ? teams : teams.filter((t) => t.category === category);
  const teamIds = new Set(filteredTeams.map((t) => t.id));
  const filteredPlayers =
    !category || category === 'ALL' ? players : players.filter((p) => teamIds.has(p.teamId));
  const filteredMatches =
    !category || category === 'ALL' ? matches : matches.filter((m) => m.category === category);

  const teamMap = new Map(filteredTeams.map((t) => [t.id, t]));
  const cardTotalsMap = aggregateTournamentCards(filteredMatches);
  const teamMatchesMap = buildTeamFinishedMatchesMap(filteredMatches, filteredTeams);

  const sanctions: PlayerSanction[] = [];

  for (const p of filteredPlayers) {
    const stats = cardTotalsMap.get(p.id) || { yellowCards: 0, doubleYellows: 0, directReds: 0 };
    const team = teamMap.get(p.teamId);
    const teamMatches = teamMatchesMap.get(p.teamId) || [];

    const cardState = computeCardSuspension(p.id, teamMatches);
    const manualRounds = (p.suspendedRounds || []).slice().sort((a, b) => a - b);

    const cardSuspended = cardState.pending > 0;
    const totalMatchesRemaining = cardState.pending + manualRounds.length;
    const isSuspended = totalMatchesRemaining > 0;

    const reasons = [...cardState.reasons];
    if (manualRounds.length > 0) {
      reasons.push(`Suspensión (fecha ${manualRounds.join(', ')})`);
    }

    const totalRedCards = stats.directReds + stats.doubleYellows;

    if (stats.yellowCards > 0 || totalRedCards > 0 || isSuspended) {
      sanctions.push({
        playerId: p.id,
        playerName: p.name,
        dorsal: p.dorsal,
        teamId: p.teamId,
        teamName: team?.name || 'Equipo',
        teamLogo: team?.logo || 'shield',
        yellowCards: stats.yellowCards,
        redCards: totalRedCards,
        isSuspended,
        cardSuspended,
        suspendedRounds: manualRounds,
        suspensionReason: reasons.length > 0 ? reasons.join(' • ') : '',
        matchesRemaining: totalMatchesRemaining,
        yellowsTowardNext: cardState.yellowCycle,
      });
    }
  }

  return sanctions.sort((a, b) => {
    if (a.isSuspended !== b.isSuspended) return a.isSuspended ? -1 : 1;
    if (b.matchesRemaining !== a.matchesRemaining) return b.matchesRemaining - a.matchesRemaining;
    if (b.redCards !== a.redCards) return b.redCards - a.redCards;
    return b.yellowCards - a.yellowCards;
  });
}
