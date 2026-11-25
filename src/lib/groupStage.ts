import {
  CANCHAS,
  Category,
  MATCH_TIME_SLOTS,
  Match,
  Team,
  TeamStanding,
} from '@/types';
import { calculateStandings } from './store';
import { changedPlayoffMatches, recomputePlayoffs } from './playoffs';

export const GROUP_STAGE_CONFIG: Partial<
  Record<Category, { bonusByRegularPosition: number[] }>
> = {
  // Bonificación inicial en el grupo: 1.º de la fase regular 2 puntos, 2.º 1 punto, el resto 0.
  '+40 Varones': { bonusByRegularPosition: [2, 1] },
};

export interface GroupEntry {
  teamId: string;
  regularPosition: number;
  bonus: number;
}

export interface BackToBackWarning {
  date: string;
  clubId: string;
  times: [string, string];
}

export interface GenerateGroupStageInput {
  cat: Category;
  teams: Team[];
  matches: Match[];
  startDate: string;
}

export interface GenerateGroupStageResult {
  matches: Match[];
  unscheduled: Match[];
  backToBack: BackToBackWarning[];
}

export interface ShiftBracketInput {
  cat: Category;
  matches: Match[];
  teams: Team[];
  lastGroupDate: string;
}

interface CandidateSlot {
  slotIndex: number;
  time: string;
  stadium: string;
}

interface DayPairing {
  groupName: 'A' | 'B';
  homeTeamId: string;
  awayTeamId: string;
  idx: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SEARCH_ITERATIONS = 50_000;

export function isValidSaturday(dateStr: string): boolean {
  if (!DATE_RE.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d &&
    dt.getUTCDay() === 6
  );
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function buildGroups(
  cat: Category,
  teams: Team[],
  matches: Match[]
): { A: GroupEntry[]; B: GroupEntry[] } {
  const catTeams = teams.filter((t) => t.category === cat && !t.withdrawn);
  if (catTeams.length === 0) return { A: [], B: [] };

  const regularMatches = matches.filter((m) => m.category === cat && !m.isPlayoff);
  const standings = calculateStandings(catTeams, regularMatches, cat);
  const bonuses = GROUP_STAGE_CONFIG[cat]?.bonusByRegularPosition ?? [];

  const A: GroupEntry[] = [];
  const B: GroupEntry[] = [];

  standings.forEach((st, idx) => {
    const regularPosition = idx + 1;
    const entry: GroupEntry = {
      teamId: st.teamId,
      regularPosition,
      bonus: bonuses[idx] ?? 0,
    };
    if (regularPosition % 2 === 1) A.push(entry);
    else B.push(entry);
  });

  return { A, B };
}

export function hasGroupStage(cat: Category, matches: Match[]): boolean {
  return matches.some((m) => m.category === cat && m.playoffStage === 'GRUPOS');
}

export function getGroupMemberIds(
  cat: Category,
  matches: Match[],
  groupName: 'A' | 'B'
): string[] {
  const seen = new Set<string>();
  matches.forEach((m) => {
    if (
      m.category === cat &&
      m.playoffStage === 'GRUPOS' &&
      m.groupName === groupName
    ) {
      if (m.homeTeamId) seen.add(m.homeTeamId);
      if (m.awayTeamId) seen.add(m.awayTeamId);
    }
  });
  return [...seen];
}

export function groupStageComplete(cat: Category, matches: Match[]): boolean {
  const groupMatches = matches.filter(
    (m) => m.category === cat && m.playoffStage === 'GRUPOS'
  );
  return groupMatches.length > 0 && groupMatches.every((m) => m.status === 'FINISHED');
}

export function calculateGroupStandings(
  cat: Category,
  teams: Team[],
  matches: Match[],
  groupName: 'A' | 'B'
): TeamStanding[] {
  const groups = buildGroups(cat, teams, matches);
  const entryById = new Map(
    [...groups.A, ...groups.B].map((e) => [e.teamId, e])
  );
  const fixedIds = hasGroupStage(cat, matches)
    ? getGroupMemberIds(cat, matches, groupName)
    : groups[groupName].map((e) => e.teamId);

  if (fixedIds.length === 0) return [];

  const memberSet = new Set(fixedIds);
  const groupTeams = teams.filter((t) => memberSet.has(t.id));
  const groupMatches = matches.filter(
    (m) =>
      m.category === cat &&
      m.playoffStage === 'GRUPOS' &&
      m.groupName === groupName
  );

  return calculateStandings(groupTeams, groupMatches, cat)
    .map((st) => {
      const entry = entryById.get(st.teamId);
      const bonus = entry?.bonus ?? 0;
      return {
        ...st,
        bonus,
        regularPosition: entry?.regularPosition,
        pts: st.pts + bonus,
      };
    })
    .sort(
      (a, b) =>
        b.pts - a.pts ||
        (a.regularPosition ?? Number.MAX_SAFE_INTEGER) -
          (b.regularPosition ?? Number.MAX_SAFE_INTEGER)
    );
}

function buildRoundRobinRounds(
  teamIds: string[]
): Array<Array<{ homeTeamId: string; awayTeamId: string }>> {
  const items: Array<string | null> = [...teamIds];
  if (items.length % 2 === 1) items.push(null);

  const n = items.length;
  const totalRounds = n - 1;
  const half = n / 2;
  const rounds: Array<Array<{ homeTeamId: string; awayTeamId: string }>> = [];
  let ring = [...items];

  for (let r = 0; r < totalRounds; r++) {
    const pairings: Array<{ homeTeamId: string; awayTeamId: string }> = [];
    for (let i = 0; i < half; i++) {
      const a = ring[i];
      const b = ring[n - 1 - i];
      if (!a || !b) continue;
      const swap = i === 0 ? r % 2 === 1 : (r + i) % 2 === 1;
      pairings.push(swap ? { homeTeamId: b, awayTeamId: a } : { homeTeamId: a, awayTeamId: b });
    }
    rounds.push(pairings);
    ring = [ring[0], ring[n - 1], ...ring.slice(1, n - 1)];
  }

  return rounds;
}

function buildClubLookup(teams: Team[]): Map<string, string> {
  return new Map(teams.map((t) => [t.id, t.clubId || t.id]));
}

function canUseSlot(
  date: string,
  time: string,
  stadium: string,
  homeTeamId: string,
  awayTeamId: string,
  occupiedMatches: Match[],
  clubOf: Map<string, string>
): boolean {
  const homeClub = clubOf.get(homeTeamId) ?? homeTeamId;
  const awayClub = clubOf.get(awayTeamId) ?? awayTeamId;

  for (const m of occupiedMatches) {
    if (m.date !== date) continue;
    if (m.time === time && m.stadium === stadium) return false;
    if (homeTeamId && (m.homeTeamId === homeTeamId || m.awayTeamId === homeTeamId)) return false;
    if (awayTeamId && (m.homeTeamId === awayTeamId || m.awayTeamId === awayTeamId)) return false;
    if (m.time === time) {
      const mHomeClub = m.homeTeamId ? clubOf.get(m.homeTeamId) ?? m.homeTeamId : '';
      const mAwayClub = m.awayTeamId ? clubOf.get(m.awayTeamId) ?? m.awayTeamId : '';
      if (mHomeClub === homeClub || mAwayClub === homeClub) return false;
      if (mHomeClub === awayClub || mAwayClub === awayClub) return false;
    }
  }
  return true;
}

function listFreeSlots(date: string, dayOccupied: Match[]): CandidateSlot[] {
  const used = new Set(dayOccupied.map((m) => `${m.time}|${m.stadium}`));
  const slots: CandidateSlot[] = [];
  MATCH_TIME_SLOTS.forEach((time, slotIndex) => {
    CANCHAS.forEach((stadium) => {
      if (!used.has(`${time}|${stadium}`)) {
        slots.push({ slotIndex, time, stadium });
      }
    });
  });
  return slots;
}

function buildClubSlotMap(
  dayOccupied: Match[],
  clubOf: Map<string, string>
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  const add = (club: string, idx: number) => {
    const arr = map.get(club) ?? [];
    arr.push(idx);
    map.set(club, arr);
  };
  for (const m of dayOccupied) {
    const idx = (MATCH_TIME_SLOTS as readonly string[]).indexOf(m.time);
    if (idx < 0) continue;
    if (m.homeTeamId) add(clubOf.get(m.homeTeamId) ?? m.homeTeamId, idx);
    if (m.awayTeamId) add(clubOf.get(m.awayTeamId) ?? m.awayTeamId, idx);
  }
  return map;
}

function scoreClubSchedule(
  baseSlots: Map<string, number[]>,
  pairs: DayPairing[],
  chosen: CandidateSlot[],
  clubOf: Map<string, string>
): { score: number; slotSum: number } {
  const clubSlots = new Map<string, number[]>();
  baseSlots.forEach((arr, k) => clubSlots.set(k, [...arr]));

  let slotSum = 0;
  for (let i = 0; i < pairs.length; i++) {
    const s = chosen[i].slotIndex;
    slotSum += s;
    const ch = clubOf.get(pairs[i].homeTeamId) ?? pairs[i].homeTeamId;
    const ca = clubOf.get(pairs[i].awayTeamId) ?? pairs[i].awayTeamId;
    clubSlots.set(ch, [...(clubSlots.get(ch) ?? []), s]);
    if (ca !== ch) clubSlots.set(ca, [...(clubSlots.get(ca) ?? []), s]);
  }

  let score = 0;
  clubSlots.forEach((arr) => {
    if (arr.length <= 1) return;
    arr.sort((a, b) => a - b);
    for (let k = 1; k < arr.length; k++) {
      const diff = arr[k] - arr[k - 1];
      if (diff === 1) score += 100;
      else if (diff > 2) score += diff - 2;
    }
  });
  return { score, slotSum };
}

function isBetterAssignment(
  cand: { score: number; slotSum: number; slots: CandidateSlot[] },
  best: { score: number; slotSum: number; slots: CandidateSlot[] } | null
): boolean {
  if (!best) return true;
  if (cand.score !== best.score) return cand.score < best.score;
  if (cand.slotSum !== best.slotSum) return cand.slotSum < best.slotSum;
  for (let i = 0; i < cand.slots.length; i++) {
    if (cand.slots[i].slotIndex !== best.slots[i].slotIndex) {
      return cand.slots[i].slotIndex < best.slots[i].slotIndex;
    }
  }
  return false;
}

function findBestDaySlots(
  pairs: DayPairing[],
  freeSlots: CandidateSlot[],
  dayOccupied: Match[],
  clubOf: Map<string, string>
): CandidateSlot[] | null {
  if (freeSlots.length < pairs.length) return null;
  const baseClubSlots = buildClubSlotMap(dayOccupied, clubOf);
  const usedTeams = new Set(dayOccupied.flatMap((m) => [m.homeTeamId, m.awayTeamId]).filter(Boolean));
  for (const p of pairs) {
    if (usedTeams.has(p.homeTeamId) || usedTeams.has(p.awayTeamId)) return null;
  }

  const usedSlotIdx = new Set<number>();
  const clubAtTime = new Map<string, Set<number>>();
  baseClubSlots.forEach((arr, c) => clubAtTime.set(c, new Set(arr)));

  const current: CandidateSlot[] = new Array(pairs.length);
  let best: { score: number; slotSum: number; slots: CandidateSlot[] } | null = null;
  let iterations = 0;

  const search = (depth: number) => {
    if (iterations >= MAX_SEARCH_ITERATIONS) return;
    if (depth === pairs.length) {
      iterations += 1;
      const { score, slotSum } = scoreClubSchedule(baseClubSlots, pairs, current, clubOf);
      if (isBetterAssignment({ score, slotSum, slots: current }, best)) {
        best = { score, slotSum, slots: [...current] };
      }
      return;
    }
    const ch = clubOf.get(pairs[depth].homeTeamId) ?? pairs[depth].homeTeamId;
    const ca = clubOf.get(pairs[depth].awayTeamId) ?? pairs[depth].awayTeamId;
    const chSet = clubAtTime.get(ch) ?? new Set<number>();
    const caSet = clubAtTime.get(ca) ?? new Set<number>();

    for (let i = 0; i < freeSlots.length; i++) {
      if (iterations >= MAX_SEARCH_ITERATIONS) break;
      if (usedSlotIdx.has(i)) continue;
      const slot = freeSlots[i];
      if (chSet.has(slot.slotIndex) || caSet.has(slot.slotIndex)) continue;

      usedSlotIdx.add(i);
      chSet.add(slot.slotIndex);
      caSet.add(slot.slotIndex);
      clubAtTime.set(ch, chSet);
      clubAtTime.set(ca, caSet);
      current[depth] = slot;
      search(depth + 1);
      chSet.delete(slot.slotIndex);
      if (ca !== ch) caSet.delete(slot.slotIndex);
      usedSlotIdx.delete(i);
    }
  };

  search(0);
  return best ? (best as { slots: CandidateSlot[] }).slots : null;
}

function collectDayBackToBack(
  date: string,
  dayOccupied: Match[],
  dayGroupMatches: Match[],
  clubOf: Map<string, string>
): BackToBackWarning[] {
  const byClub = new Map<string, Array<{ idx: number; isGroup: boolean }>>();
  const push = (m: Match, isGroup: boolean) => {
    const idx = (MATCH_TIME_SLOTS as readonly string[]).indexOf(m.time);
    if (idx < 0) return;
    const ch = clubOf.get(m.homeTeamId) ?? m.homeTeamId;
    const ca = clubOf.get(m.awayTeamId) ?? m.awayTeamId;
    if (ch) byClub.set(ch, [...(byClub.get(ch) ?? []), { idx, isGroup }]);
    if (ca && ca !== ch) byClub.set(ca, [...(byClub.get(ca) ?? []), { idx, isGroup }]);
  };
  dayOccupied.forEach((m) => push(m, false));
  dayGroupMatches.forEach((m) => push(m, true));

  const warnings: BackToBackWarning[] = [];
  byClub.forEach((entries, clubId) => {
    entries.sort((a, b) => a.idx - b.idx);
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].idx - entries[i - 1].idx === 1 && (entries[i].isGroup || entries[i - 1].isGroup)) {
        warnings.push({
          date,
          clubId,
          times: [MATCH_TIME_SLOTS[entries[i - 1].idx], MATCH_TIME_SLOTS[entries[i].idx]],
        });
      }
    }
  });
  return warnings;
}

function findFirstFreeSlot(
  date: string,
  homeTeamId: string,
  awayTeamId: string,
  occupiedMatches: Match[],
  clubOf: Map<string, string>
): { time: string; stadium: string } | null {
  for (const time of MATCH_TIME_SLOTS) {
    for (const stadium of CANCHAS) {
      if (canUseSlot(date, time, stadium, homeTeamId, awayTeamId, occupiedMatches, clubOf)) {
        return { time, stadium };
      }
    }
  }
  return null;
}

function uniqueMatchId(base: string, existingIds: Set<string>): string {
  let id = base;
  let suffix = 2;
  while (existingIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  existingIds.add(id);
  return id;
}

function makeGroupMatch(
  id: string,
  cat: Category,
  round: number,
  date: string,
  p: DayPairing,
  slot: { time: string; stadium: string } | null
): Match {
  return {
    id,
    category: cat,
    round,
    date,
    time: slot?.time ?? '',
    stadium: slot?.stadium ?? '',
    homeTeamId: p.homeTeamId,
    awayTeamId: p.awayTeamId,
    homeScore: 0,
    awayScore: 0,
    status: 'SCHEDULED',
    events: [],
    homeLineup: [],
    awayLineup: [],
    refereeSigned: false,
    isPlayoff: true,
    playoffStage: 'GRUPOS',
    groupName: p.groupName,
  };
}

export function generateGroupStageMatches({
  cat,
  teams,
  matches,
  startDate,
}: GenerateGroupStageInput): GenerateGroupStageResult {
  if (!isValidSaturday(startDate)) {
    throw new Error('La fecha de inicio debe tener formato YYYY-MM-DD y corresponder a un sábado.');
  }

  const groups = buildGroups(cat, teams, matches);
  const roundsA = buildRoundRobinRounds(groups.A.map((e) => e.teamId));
  const roundsB = buildRoundRobinRounds(groups.B.map((e) => e.teamId));
  const totalRounds = Math.max(roundsA.length, roundsB.length);
  const lastRegularRound = matches
    .filter((m) => m.category === cat && !m.isPlayoff)
    .reduce((max, m) => Math.max(max, m.round), 0);

  const clubOf = buildClubLookup(teams);
  const existingIds = new Set(matches.map((m) => m.id));
  const slug = cat.toLowerCase().replace(/[^a-z0-9]/g, '');
  const isMovableBracket = (m: Match) =>
    m.category === cat && !!m.isPlayoff && m.playoffStage !== 'GRUPOS';
  const occupied = matches.filter((m) => !isMovableBracket(m));

  const generated: Match[] = [];
  const unscheduled: Match[] = [];
  const backToBack: BackToBackWarning[] = [];

  for (let r = 0; r < totalRounds; r++) {
    const fecha = r + 1;
    const date = addDays(startDate, r * 7);
    const round = lastRegularRound + fecha;
    const pairs: DayPairing[] = [];
    (roundsA[r] ?? []).forEach((p, i) => pairs.push({ groupName: 'A', ...p, idx: i + 1 }));
    (roundsB[r] ?? []).forEach((p, i) => pairs.push({ groupName: 'B', ...p, idx: i + 1 }));

    const dayOccupied = occupied.filter((m) => m.date === date);
    const optimal = findBestDaySlots(pairs, listFreeSlots(date, dayOccupied), dayOccupied, clubOf);
    const dayGroupMatches: Match[] = [];

    pairs.forEach((p, i) => {
      const id = uniqueMatchId(`m-${slug}-g${p.groupName}${fecha}-${p.idx}`, existingIds);
      const slot = optimal
        ? optimal[i]
        : findFirstFreeSlot(date, p.homeTeamId, p.awayTeamId, occupied, clubOf);
      const match = makeGroupMatch(id, cat, round, date, p, slot);
      generated.push(match);
      if (slot) {
        occupied.push(match);
        dayGroupMatches.push(match);
      } else {
        unscheduled.push(match);
      }
    });

    backToBack.push(...collectDayBackToBack(date, dayOccupied, dayGroupMatches, clubOf));
  }

  return { matches: generated, unscheduled, backToBack };
}

export function shiftBracketAfterGroups({
  cat,
  matches,
  teams,
  lastGroupDate,
}: ShiftBracketInput): Match[] {
  const clubOf = buildClubLookup(teams);
  const bracketMatches = matches.filter(
    (m) => m.category === cat && m.isPlayoff && m.playoffStage !== 'GRUPOS'
  );
  const stageOffsetDays: Record<string, number> = { CUARTOS: 7, SEMIS: 14, FINAL: 21 };

  const movableIds = new Set(
    bracketMatches
      .filter((m) => m.status !== 'FINISHED' && m.status !== 'IN_PROGRESS')
      .map((m) => m.id)
  );
  const occupied = matches.filter((m) => !movableIds.has(m.id));

  return bracketMatches.map((m) => {
    if (!movableIds.has(m.id)) return { ...m };
    const newDate = addDays(lastGroupDate, stageOffsetDays[m.playoffStage ?? ''] ?? 7);
    const keepOriginal =
      !!m.time &&
      !!m.stadium &&
      canUseSlot(newDate, m.time, m.stadium, m.homeTeamId, m.awayTeamId, occupied, clubOf);
    const slot = keepOriginal
      ? { time: m.time, stadium: m.stadium }
      : findFirstFreeSlot(newDate, m.homeTeamId, m.awayTeamId, occupied, clubOf);

    const updated: Match = {
      ...m,
      date: newDate,
      time: slot?.time ?? '',
      stadium: slot?.stadium ?? '',
      preGroupSchedule: m.preGroupSchedule ?? { date: m.date, time: m.time, stadium: m.stadium },
    };
    if (slot) occupied.push(updated);
    return updated;
  });
}

export function restoreBracketBeforeGroups(cat: Category, matches: Match[]): Match[] {
  return matches
    .filter((m) => m.category === cat && m.isPlayoff && m.playoffStage !== 'GRUPOS')
    .map((m) => {
      if (!m.preGroupSchedule || m.status === 'FINISHED' || m.status === 'IN_PROGRESS') {
        return { ...m };
      }
      const { date, time, stadium } = m.preGroupSchedule;
      const copy: Match = { ...m, date, time, stadium };
      delete copy.preGroupSchedule;
      return copy;
    });
}

export function buildCreateGroupStageBatch(
  matches: Match[],
  teams: Team[],
  generatedMatches: Match[],
  shiftedBracket: Match[]
): { upserts: Match[]; nextMatches: Match[] } {
  const shiftedMap = new Map(shiftedBracket.map((m) => [m.id, m]));
  const nextRaw = [
    ...matches.map((m) => shiftedMap.get(m.id) ?? m),
    ...generatedMatches,
  ];
  const reconciled = recomputePlayoffs(nextRaw, teams);
  const changed = changedPlayoffMatches(nextRaw, reconciled);
  const upsertIds = new Set(
    [...generatedMatches, ...shiftedBracket, ...changed].map((m) => m.id)
  );
  return {
    upserts: reconciled.filter((m) => upsertIds.has(m.id)),
    nextMatches: reconciled,
  };
}
