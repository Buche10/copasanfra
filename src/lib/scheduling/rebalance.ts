import { Match, Team, Category, Player, MATCH_TIMES, STADIUMS } from '@/types';
import { localDateString } from '@/lib/finesReport';
import { buildSharedPlayerPairs } from './sharedPlayers';
import { buildSlotHistory, addToHistory, SlotHistory } from './fairness';
import { scheduleMatchday, UnscheduledMatch } from './matchday';

export interface RebalanceResult {
  matches: Match[];
  changed: number;
  perDate: { date: string; changed: number }[];
}

/**
 * Reequilibra los horarios de las fechas estrictamente futuras (date > today)
 * en las que todos los partidos siguen en estado SCHEDULED.
 * Las fechas anteriores o con partidos ya iniciados/finalizados quedan intactas.
 */
function recordDayHistory(dayMatches: Match[], history: SlotHistory): SlotHistory {
  const validPlacements = dayMatches
    .filter((m) => !m.isPlayoff && m.homeTeamId && m.awayTeamId && m.time)
    .map((m) => ({
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      slotIndex: (MATCH_TIMES as readonly string[]).indexOf(m.time),
    }))
    .filter((p) => p.slotIndex >= 0);

  return addToHistory(history, validPlacements, MATCH_TIMES.length);
}

function toUnscheduled(matches: Match[]): UnscheduledMatch[] {
  return matches.map((m) => ({
    category: m.category,
    round: m.round,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    isPlayoff: m.isPlayoff,
    playoffStage: m.playoffStage,
    bracketSlot: m.bracketSlot,
  }));
}

function scheduleVisibleMatches(
  visible: Match[],
  clubOf: Map<string, string>,
  sharedPairs: ReadonlySet<string>,
  history: SlotHistory
): { dayResult: Match[]; changed: number; maxSlot: number; newHistory: SlotHistory } {
  if (visible.length === 0) {
    return { dayResult: [], changed: 0, maxSlot: -1, newHistory: history };
  }

  const unsched = toUnscheduled(visible);
  const placements = scheduleMatchday(
    unsched,
    clubOf,
    MATCH_TIMES.length,
    STADIUMS.length,
    { history, sharedPairs }
  );

  const slotOf = new Map<UnscheduledMatch, { time: string; stadium: string }>();
  const placementInfos: { homeTeamId: string; awayTeamId: string; slotIndex: number }[] = [];
  let maxSlot = -1;

  placements.forEach((p) => {
    maxSlot = Math.max(maxSlot, p.slotIndex);
    slotOf.set(p.match, { time: MATCH_TIMES[p.slotIndex], stadium: STADIUMS[p.canchaIndex] });
    placementInfos.push({
      homeTeamId: p.match.homeTeamId,
      awayTeamId: p.match.awayTeamId,
      slotIndex: p.slotIndex,
    });
  });

  let changed = 0;
  const dayResult: Match[] = visible.map((m, i) => {
    const pos = slotOf.get(unsched[i]);
    if (!pos) return m;
    if (m.time !== pos.time || m.stadium !== pos.stadium) changed += 1;
    return { ...m, time: pos.time, stadium: pos.stadium };
  });

  const newHistory = addToHistory(history, placementInfos, MATCH_TIMES.length);
  return { dayResult, changed, maxSlot, newHistory };
}

function appendHiddenMatches(
  hiddenMatches: Match[],
  maxSlot: number
): { matches: Match[]; changed: number } {
  let changed = 0;
  const matches = hiddenMatches.map((m, i) => {
    const slot = Math.min(maxSlot + 1 + Math.floor(i / STADIUMS.length), MATCH_TIMES.length - 1);
    const cancha = i % STADIUMS.length;
    const newTime = MATCH_TIMES[slot];
    const newStadium = STADIUMS[cancha];
    if (m.time !== newTime || m.stadium !== newStadium) changed += 1;
    return { ...m, time: newTime, stadium: newStadium };
  });
  return { matches, changed };
}

function rebalanceDate(
  dayMatches: Match[],
  hidden: Set<Category>,
  clubOf: Map<string, string>,
  sharedPairs: ReadonlySet<string>,
  history: SlotHistory
): { dayResult: Match[]; dateChanged: number; newHistory: SlotHistory } {
  const visible = dayMatches.filter((m) => !hidden.has(m.category));
  const hiddenMs = dayMatches.filter((m) => hidden.has(m.category));

  const sched = scheduleVisibleMatches(visible, clubOf, sharedPairs, history);
  const hiddenRes = appendHiddenMatches(hiddenMs, sched.maxSlot);

  return {
    dayResult: [...sched.dayResult, ...hiddenRes.matches],
    dateChanged: sched.changed + hiddenRes.changed,
    newHistory: sched.newHistory,
  };
}

/**
 * Re-equilibra los turnos de juego de las fechas estrictamente futuras (date > today)
 * en las que todos los partidos siguen en estado SCHEDULED.
 * Las fechas anteriores o con partidos ya iniciados/finalizados quedan intactas.
 */
export function rebalanceFutureDates(
  matches: Match[],
  teams: Team[],
  players: Player[] = [],
  hiddenCategories: Category[] = [],
  today: string = localDateString()
): RebalanceResult {
  const clubOf = new Map<string, string>();
  teams.forEach((t) => clubOf.set(t.id, t.clubId || t.id));

  const sharedPairs = buildSharedPlayerPairs(players);
  const hidden = new Set(hiddenCategories);

  const byDate = new Map<string, Match[]>();
  matches.forEach((m) => {
    const arr = byDate.get(m.date) ?? [];
    arr.push(m);
    byDate.set(m.date, arr);
  });

  const sortedDates = [...byDate.keys()].sort();
  let history: SlotHistory = buildSlotHistory([], MATCH_TIMES.length);
  const nextMatches: Match[] = [];
  let totalChanged = 0;
  const perDate: { date: string; changed: number }[] = [];

  for (const date of sortedDates) {
    const dayMatches = byDate.get(date)!;
    if (date <= today || dayMatches.some((m) => m.status !== 'SCHEDULED')) {
      dayMatches.forEach((m) => nextMatches.push(m));
      history = recordDayHistory(dayMatches, history);
    } else {
      const res = rebalanceDate(dayMatches, hidden, clubOf, sharedPairs, history);
      history = res.newHistory;
      totalChanged += res.dateChanged;
      perDate.push({ date, changed: res.dateChanged });
      res.dayResult.forEach((m) => nextMatches.push(m));
    }
  }

  matches.forEach((m) => {
    if (!sortedDates.includes(m.date)) nextMatches.push(m);
  });

  return { matches: nextMatches, changed: totalChanged, perDate };
}
