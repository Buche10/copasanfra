import { Match, Team, Player, Category, CANCHAS, MATCH_TIME_SLOTS } from '@/types';
import { scheduleMatchday, UnscheduledMatch } from './matchday';
import { buildSharedPlayerPairs } from './sharedPlayers';
import { buildSlotHistory, addToHistory, SlotHistory } from './fairness';
import { generateRandomFixture, isDoubleRoundRobin } from '../fixtureGenerator';
import { recomputePlayoffs } from '../playoffs';

export interface ArrangeInput {
  matches: Match[];
  teams: Team[];
  players: Player[];
  activeCategories: Category[];
  today: string;
  rng?: () => number;
}

export interface ArrangePlan {
  matches: Match[];
  baseMatches: Match[];
  startDate: string;
  categoriesToCreate: Category[];
  createdCategories: { category: Category; rounds: number; firstDate: string; matches: number; reason: string }[];
  removedStaleMatches: number;
  retimedMatches: number;
  clearedMatches: number;
  overCapacityDates: { date: string; matches: number; capacity: number }[];
  warnings: string[];
}

/**
 * Calcula el proximo sabado a partir de una fecha local (YYYY-MM-DD).
 * Si today es sabado y aun no tiene partidos jugados ni en juego, devuelve today.
 * En cualquier otro caso, devuelve el primer sabado estrictamente posterior.
 */
export function nextSaturday(today: string, matches?: Match[]): string {
  const [y, m, d] = today.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dayOfWeek = date.getDay();

  if (dayOfWeek === 6) {
    const hasPlayedToday = matches?.some(
      (match) =>
        match.date === today &&
        (match.status === 'FINISHED' || match.status === 'IN_PROGRESS')
    );
    if (!hasPlayedToday) {
      return today;
    }
  }

  const daysToAdd = ((6 - dayOfWeek + 7) % 7) || 7;
  const target = new Date(y, m - 1, d + daysToAdd);
  const ty = target.getFullYear();
  const tm = String(target.getMonth() + 1).padStart(2, '0');
  const td = String(target.getDate()).padStart(2, '0');
  return `${ty}-${tm}-${td}`;
}

function checkCalendarMismatch(cat: Category, catTeams: Team[], catMatches: Match[]): boolean {
  if (catMatches.length === 0) return false;

  const regularMatches = catMatches.filter((m) => !m.isPlayoff);
  const teamIds = new Set(catTeams.map((t) => t.id));

  for (const m of regularMatches) {
    if (!teamIds.has(m.homeTeamId) || !teamIds.has(m.awayTeamId)) return true;
  }

  const teamsInMatches = new Set<string>();
  for (const m of regularMatches) {
    teamsInMatches.add(m.homeTeamId);
    teamsInMatches.add(m.awayTeamId);
  }
  for (const t of catTeams) {
    if (!teamsInMatches.has(t.id)) return true;
  }

  const n = catTeams.length;
  const isDouble = isDoubleRoundRobin(cat);
  const expectedMatches = isDouble ? n * (n - 1) : (n * (n - 1)) / 2;
  if (regularMatches.length !== expectedMatches) return true;

  return false;
}

export function findCategoriesToCreate(
  activeCategories: Category[],
  teams: Team[],
  matches: Match[],
  nextSat: string
): { category: Category; reason: string }[] {
  const result: { category: Category; reason: string }[] = [];

  for (const cat of activeCategories) {
    const catTeams = teams.filter((t) => t.category === cat);
    if (catTeams.length < 2) continue;

    const catMatches = matches.filter((m) => m.category === cat);
    const hasPlayed = catMatches.some(
      (m) => m.status === 'FINISHED' || m.status === 'IN_PROGRESS'
    );
    const isMismatch = checkCalendarMismatch(cat, catTeams, catMatches);

    if (hasPlayed) continue;

    if (catMatches.length === 0) {
      result.push({ category: cat, reason: `sin partidos; se genera desde el ${nextSat}` });
      continue;
    }

    if (catMatches.some((m) => m.date < nextSat)) {
      result.push({ category: cat, reason: `partidos sin jugar en fechas pasadas; se regenera desde el ${nextSat}` });
      continue;
    }

    if (isMismatch) {
      result.push({ category: cat, reason: `el calendario no coincide con sus ${catTeams.length} equipos actuales; se regenera desde el ${nextSat}` });
      continue;
    }
  }

  return result;
}

interface GenerateCategoryResult {
  matches: Match[];
  rounds: number;
  firstDate: string;
}

function generateNewCategoryMatches(
  cat: Category,
  catTeams: Team[],
  players: Player[],
  nextSat: string,
  existingIds: Set<string>,
  rng?: () => number
): GenerateCategoryResult {
  const raw = generateRandomFixture(catTeams, undefined, players, { rng, startDate: nextSat });
  let rounds = 0;
  let firstDate = nextSat;

  const matches = raw.map((m, idx) => {
    rounds = Math.max(rounds, m.round);
    if (!firstDate || m.date < firstDate) firstDate = m.date;

    let id = m.id;
    if (existingIds.has(id)) {
      const slug = cat.toLowerCase().replace(/[^a-z0-9]/g, '');
      id = `m-${slug}-${idx + 100}-${Date.now().toString(36)}`;
    }
    existingIds.add(id);
    return { ...m, id };
  });

  return { matches, rounds, firstDate };
}

function clearInactiveFutureMatches(
  matches: Match[],
  activeSet: Set<Category>,
  nextSat: string
): { matches: Match[]; clearedCount: number } {
  let clearedCount = 0;
  const result = matches.map((m) => {
    if (!activeSet.has(m.category) && m.date >= nextSat && m.status === 'SCHEDULED') {
      if (m.time !== '' || m.stadium !== '') {
        clearedCount += 1;
        return { ...m, time: '', stadium: '' };
      }
    }
    return m;
  });
  return { matches: result, clearedCount };
}

interface ScheduleDayResult {
  dayMatches: Match[];
  retimed: number;
  newHistory: SlotHistory;
}

function scheduleActiveDayMatches(
  activeMs: Match[],
  clubOf: Map<string, string>,
  sharedPairs: ReadonlySet<string>,
  history: SlotHistory,
  rng?: () => number
): ScheduleDayResult {
  const unsched: UnscheduledMatch[] = activeMs.map((m) => ({
    category: m.category,
    round: m.round,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    isPlayoff: m.isPlayoff,
    playoffStage: m.playoffStage,
    bracketSlot: m.bracketSlot,
  }));

  const placements = scheduleMatchday(
    unsched,
    clubOf,
    MATCH_TIME_SLOTS.length,
    CANCHAS.length,
    { history, sharedPairs, rng }
  );

  const slotOf = new Map<UnscheduledMatch, { time: string; stadium: string }>();
  const infos: { homeTeamId: string; awayTeamId: string; slotIndex: number }[] = [];

  placements.forEach((p) => {
    slotOf.set(p.match, { time: MATCH_TIME_SLOTS[p.slotIndex], stadium: CANCHAS[p.canchaIndex] });
    infos.push({ homeTeamId: p.match.homeTeamId, awayTeamId: p.match.awayTeamId, slotIndex: p.slotIndex });
  });

  let retimed = 0;
  const dayMatches = activeMs.map((m, i) => {
    const pos = slotOf.get(unsched[i]);
    if (!pos) return m;
    if (m.time !== pos.time || m.stadium !== pos.stadium) retimed += 1;
    return { ...m, time: pos.time, stadium: pos.stadium };
  });

  const newHistory = addToHistory(history, infos, MATCH_TIME_SLOTS.length);
  return { dayMatches, retimed, newHistory };
}

function findWarnings(teams: Team[], matches: Match[], activeSet: Set<Category>): string[] {
  const playing = new Set<string>();
  matches.forEach((m) => {
    if (m.homeTeamId) playing.add(m.homeTeamId);
    if (m.awayTeamId) playing.add(m.awayTeamId);
  });

  const warnings: string[] = [];
  teams.forEach((t) => {
    if (activeSet.has(t.category) && !playing.has(t.id)) {
      warnings.push(`El equipo "${t.name}" (${t.category}) no tiene ningún partido programado.`);
    }
  });

  activeSet.forEach((cat) => {
    const catTeams = teams.filter((t) => t.category === cat);
    if (catTeams.length < 2) return;
    const catMatches = matches.filter((m) => m.category === cat);
    const hasPlayed = catMatches.some((m) => m.status === 'FINISHED' || m.status === 'IN_PROGRESS');
    if (hasPlayed && checkCalendarMismatch(cat, catTeams, catMatches)) {
      warnings.push(`${cat}: el calendario no coincide con sus equipos, pero ya tiene partidos jugados; revisalo a mano`);
    }
  });

  return warnings;
}

function processFutureDates(
  allDates: string[],
  byDate: Map<string, Match[]>,
  nextSat: string,
  activeSet: Set<Category>,
  clubOf: Map<string, string>,
  sharedPairs: ReadonlySet<string>,
  initialHistory: SlotHistory,
  rng?: () => number
) {
  let history = initialHistory;
  let retimedMatches = 0;
  const overCapacityDates: { date: string; matches: number; capacity: number }[] = [];
  const maxCapacity = MATCH_TIME_SLOTS.length * CANCHAS.length;
  const processedMatches: Match[] = [];

  for (const date of allDates) {
    const dayMatches = byDate.get(date) ?? [];
    const isUntouched = date < nextSat || dayMatches.some((m) => m.status !== 'SCHEDULED');

    if (isUntouched) {
      dayMatches.forEach((m) => processedMatches.push(m));
      continue;
    }

    const activeMs = dayMatches.filter((m) => activeSet.has(m.category));
    const inactiveMs = dayMatches.filter((m) => !activeSet.has(m.category));

    if (activeMs.length > maxCapacity) {
      overCapacityDates.push({ date, matches: activeMs.length, capacity: maxCapacity });
      dayMatches.forEach((m) => processedMatches.push(m));
      continue;
    }

    if (activeMs.length === 0) {
      dayMatches.forEach((m) => processedMatches.push(m));
      continue;
    }

    const res = scheduleActiveDayMatches(activeMs, clubOf, sharedPairs, history, rng);
    retimedMatches += res.retimed;
    history = res.newHistory;
    res.dayMatches.forEach((m) => processedMatches.push(m));
    inactiveMs.forEach((m) => processedMatches.push(m));
  }

  return { processedMatches, retimedMatches, overCapacityDates };
}

function replaceCreatedCategories(
  toCreate: { category: Category; reason: string }[],
  inputMatches: Match[],
  teams: Team[],
  players: Player[],
  nextSat: string,
  rng?: () => number
) {
  const staleToRemove = new Set(toCreate.map((c) => c.category));
  const removedStaleMatches = inputMatches.filter((m) => staleToRemove.has(m.category)).length;
  let currentMatches = inputMatches.filter((m) => !staleToRemove.has(m.category));

  const existingIds = new Set(currentMatches.map((m) => m.id));
  const createdCategories: ArrangePlan['createdCategories'] = [];

  for (const { category: cat, reason } of toCreate) {
    const catTeams = teams.filter((t) => t.category === cat);
    const gen = generateNewCategoryMatches(cat, catTeams, players, nextSat, existingIds, rng);
    createdCategories.push({
      category: cat,
      rounds: gen.rounds,
      firstDate: gen.firstDate,
      matches: gen.matches.length,
      reason,
    });
    currentMatches = [...currentMatches, ...gen.matches];
  }

  return { currentMatches, createdCategories, removedStaleMatches };
}

function prepareSchedulingContext(teams: Team[], players: Player[], matches: Match[], nextSat: string) {
  const clubOf = new Map<string, string>();
  teams.forEach((t) => clubOf.set(t.id, t.clubId || t.id));
  const sharedPairs = buildSharedPlayerPairs(players);
  const history = buildSlotHistory(matches.filter((m) => m.date < nextSat), MATCH_TIME_SLOTS.length);

  const byDate = new Map<string, Match[]>();
  matches.forEach((m) => {
    const arr = byDate.get(m.date) ?? [];
    arr.push(m);
    byDate.set(m.date, arr);
  });

  return { clubOf, sharedPairs, history, byDate };
}

/**
 * Planifica el acomodo general del calendario segun las categorias activas.
 */
export function planCalendarArrangement(input: ArrangeInput): ArrangePlan {
  const activeSet = new Set(input.activeCategories);
  const nextSat = nextSaturday(input.today, input.matches);
  const toCreate = findCategoriesToCreate(input.activeCategories, input.teams, input.matches, nextSat);

  const init = replaceCreatedCategories(toCreate, input.matches, input.teams, input.players, nextSat, input.rng);
  const clearedRes = clearInactiveFutureMatches(init.currentMatches, activeSet, nextSat);
  const matchesToSchedule = clearedRes.matches;

  const { clubOf, sharedPairs, history, byDate } = prepareSchedulingContext(
    input.teams,
    input.players,
    matchesToSchedule,
    nextSat
  );

  const futureRes = processFutureDates(
    [...byDate.keys()].sort(),
    byDate,
    nextSat,
    activeSet,
    clubOf,
    sharedPairs,
    history,
    input.rng
  );

  const finalMatches = recomputePlayoffs(futureRes.processedMatches, input.teams);
  const warnings = findWarnings(input.teams, finalMatches, activeSet);

  return {
    matches: finalMatches,
    baseMatches: input.matches,
    startDate: nextSat,
    categoriesToCreate: init.createdCategories.map((c) => c.category),
    createdCategories: init.createdCategories,
    removedStaleMatches: init.removedStaleMatches,
    retimedMatches: futureRes.retimedMatches,
    clearedMatches: clearedRes.clearedCount,
    overCapacityDates: futureRes.overCapacityDates,
    warnings,
  };
}
