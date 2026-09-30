import { Category } from '@/types';
import { SlotHistory, fairnessCost } from './fairness';
import { sharesPlayers } from './sharedPlayers';
import { shuffleWith } from './random';

export interface UnscheduledMatch {
  category: Category;
  round: number;
  homeTeamId: string;
  awayTeamId: string;
  isPlayoff?: boolean;
  playoffStage?: 'CUARTOS' | 'SEMIS' | 'FINAL';
  bracketSlot?: 'C1' | 'C2' | 'C3' | 'C4' | 'S1' | 'S2' | 'F';
}

export interface MatchdayPlacement {
  match: UnscheduledMatch;
  slotIndex: number;
  canchaIndex: number;
}

export interface ScheduleMatchdayOptions {
  history?: SlotHistory;
  sharedPairs?: ReadonlySet<string>;
  rng?: () => number;
}

interface AttemptResult {
  matchSlot: number[];
  slotMatches: number[][];
  score: number;
}

interface MatchdayContext {
  n: number;
  slotCount: number;
  fieldsPerSlot: number;
  dayMatches: UnscheduledMatch[];
  multiClubs: string[];
  clubMatchIndices: Map<string, number[]>;
  linkedMatrix: Uint8Array;
  shareMatrix: Uint8Array;
  costTable: Float64Array;
  rng: () => number;
}

function computeMatrices(
  dayMatches: UnscheduledMatch[],
  clubOf: Map<string, string>,
  slotCount: number,
  history: SlotHistory,
  sharedPairs: ReadonlySet<string>
): { linkedMatrix: Uint8Array; shareMatrix: Uint8Array; costTable: Float64Array } {
  const n = dayMatches.length;
  const linkedMatrix = new Uint8Array(n * n);
  const shareMatrix = new Uint8Array(n * n);
  const costTable = new Float64Array(n * slotCount);

  for (let i = 0; i < n; i++) {
    const mi = dayMatches[i];
    for (let s = 0; s < slotCount; s++) {
      costTable[i * slotCount + s] =
        fairnessCost(history, mi.homeTeamId, s, slotCount) +
        fairnessCost(history, mi.awayTeamId, s, slotCount);
    }
    for (let j = 0; j < n; j++) {
      if (i === j) {
        linkedMatrix[i * n + j] = 1;
        continue;
      }
      const mj = dayMatches[j];
      const ti = [mi.homeTeamId, mi.awayTeamId];
      const tj = [mj.homeTeamId, mj.awayTeamId];
      const shares =
        sharesPlayers(sharedPairs, ti[0], tj[0]) ||
        sharesPlayers(sharedPairs, ti[0], tj[1]) ||
        sharesPlayers(sharedPairs, ti[1], tj[0]) ||
        sharesPlayers(sharedPairs, ti[1], tj[1]);
      if (shares) shareMatrix[i * n + j] = 1;

      const sameOwner =
        (clubOf.get(ti[0]) ?? ti[0]) === (clubOf.get(tj[0]) ?? tj[0]) ||
        (clubOf.get(ti[0]) ?? ti[0]) === (clubOf.get(tj[1]) ?? tj[1]) ||
        (clubOf.get(ti[1]) ?? ti[1]) === (clubOf.get(tj[0]) ?? tj[0]) ||
        (clubOf.get(ti[1]) ?? ti[1]) === (clubOf.get(tj[1]) ?? tj[1]);

      if (shares || sameOwner) linkedMatrix[i * n + j] = 1;
    }
  }
  return { linkedMatrix, shareMatrix, costTable };
}

function buildContext(
  dayMatches: UnscheduledMatch[],
  clubOf: Map<string, string>,
  slotCount: number,
  fieldsPerSlot: number,
  history: SlotHistory,
  sharedPairs: ReadonlySet<string>,
  rng: () => number
): MatchdayContext {
  const n = dayMatches.length;
  const { linkedMatrix, shareMatrix, costTable } = computeMatrices(
    dayMatches,
    clubOf,
    slotCount,
    history,
    sharedPairs
  );

  const clubMatchIndices = new Map<string, number[]>();
  dayMatches.forEach((m, idx) => {
    const c1 = clubOf.get(m.homeTeamId) ?? m.homeTeamId;
    const c2 = clubOf.get(m.awayTeamId) ?? m.awayTeamId;
    const s = new Set([c1, c2]);
    s.forEach((c) => {
      const list = clubMatchIndices.get(c) ?? [];
      list.push(idx);
      clubMatchIndices.set(c, list);
    });
  });

  const multiClubs = [...clubMatchIndices.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([c]) => c);

  return { n, slotCount, fieldsPerSlot, dayMatches, multiClubs, clubMatchIndices, linkedMatrix, shareMatrix, costTable, rng };
}

function computeSoftPenalties(ctx: MatchdayContext, matchSlot: number[]): number {
  const { n, multiClubs, clubMatchIndices, shareMatrix } = ctx;
  let exactRestPenalty = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (shareMatrix[i * n + j]) {
        const s1 = matchSlot[i];
        const s2 = matchSlot[j];
        if (s1 !== -1 && s2 !== -1 && s1 !== s2) {
          exactRestPenalty += Math.abs(Math.abs(s1 - s2) - 2);
        }
      }
    }
  }

  let ownerGaps = 0;
  for (const club of multiClubs) {
    const ms = (clubMatchIndices.get(club) ?? []).filter((idx) => matchSlot[idx] !== -1);
    const sorted = ms.map((idx) => ({ idx, s: matchSlot[idx] })).sort((a, b) => a.s - b.s);
    for (let i = 1; i < sorted.length; i++) {
      const rawGap = Math.max(0, sorted[i].s - sorted[i - 1].s - 1);
      const shares = shareMatrix[sorted[i - 1].idx * n + sorted[i].idx] === 1;
      ownerGaps += shares ? Math.max(0, rawGap - 1) : rawGap;
    }
  }
  return exactRestPenalty + ownerGaps;
}

function computeScore(ctx: MatchdayContext, matchSlot: number[], slotMatches: number[][], baseHard = 0): number {
  const { n, slotCount, fieldsPerSlot, linkedMatrix, shareMatrix, costTable } = ctx;
  let hard = baseHard;

  for (let s = 0; s < slotCount; s++) {
    const arr = slotMatches[s];
    if (arr.length > fieldsPerSlot) hard += arr.length - fieldsPerSlot;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (linkedMatrix[arr[i] * n + arr[j]]) hard += 1;
      }
    }
  }

  for (let s = 0; s < slotCount - 1; s++) {
    for (const m1 of slotMatches[s]) {
      for (const m2 of slotMatches[s + 1]) {
        if (shareMatrix[m1 * n + m2]) hard += 1;
      }
    }
  }

  const soft = computeSoftPenalties(ctx, matchSlot);

  let equity = 0;
  for (let i = 0; i < n; i++) {
    const s = matchSlot[i];
    if (s !== -1) equity += costTable[i * slotCount + s];
  }

  return hard * 1_000_000 + soft * 1_000 + equity;
}

function canPlace(ctx: MatchdayContext, slotMatches: number[][], mIdx: number, s: number): boolean {
  if (s < 0 || s >= ctx.slotCount) return false;
  if (slotMatches[s].length >= ctx.fieldsPerSlot) return false;
  const n = ctx.n;

  for (const ex of slotMatches[s]) {
    if (ctx.linkedMatrix[mIdx * n + ex]) return false;
  }
  if (s > 0) {
    for (const prev of slotMatches[s - 1]) {
      if (ctx.shareMatrix[mIdx * n + prev]) return false;
    }
  }
  if (s < ctx.slotCount - 1) {
    for (const next of slotMatches[s + 1]) {
      if (ctx.shareMatrix[mIdx * n + next]) return false;
    }
  }
  return true;
}

function placeAnywhere(ctx: MatchdayContext, matchSlot: number[], slotMatches: number[][], mIdx: number): number {
  let bestSlot = -1;
  let minCost = Infinity;

  const otherOwnerSlots: number[] = [];
  for (const [, list] of ctx.clubMatchIndices.entries()) {
    if (list.includes(mIdx)) {
      for (const otherIdx of list) {
        if (otherIdx !== mIdx && matchSlot[otherIdx] !== -1) {
          otherOwnerSlots.push(matchSlot[otherIdx]);
        }
      }
    }
  }

  for (let s = 0; s < ctx.slotCount; s++) {
    if (canPlace(ctx, slotMatches, mIdx, s)) {
      let gapPenalty = 0;
      for (const os of otherOwnerSlots) {
        const rawGap = Math.max(0, Math.abs(s - os) - 1);
        const shares = ctx.shareMatrix[mIdx * ctx.n + os] === 1;
        gapPenalty += shares ? Math.max(0, rawGap - 1) : rawGap;
      }
      const cost = ctx.costTable[mIdx * ctx.slotCount + s] + gapPenalty * 1000;
      if (cost < minCost) {
        minCost = cost;
        bestSlot = s;
      }
    }
  }

  let hardAdded = 0;
  if (bestSlot === -1) {
    bestSlot = 0;
    for (let s = 1; s < ctx.slotCount; s++) {
      if (slotMatches[s].length < slotMatches[bestSlot].length) bestSlot = s;
    }
    hardAdded = 1;
  }

  slotMatches[bestSlot].push(mIdx);
  matchSlot[mIdx] = bestSlot;
  return hardAdded;
}

function searchWindowSlots(
  ctx: MatchdayContext,
  slotMatches: number[][],
  unplaced: number[],
  candidateSlots: number[],
  usedSlots: Set<number>,
  plan: number[],
  idx: number
): boolean {
  if (idx >= unplaced.length) return true;
  const target = unplaced[idx];
  for (const s of candidateSlots) {
    if (usedSlots.has(s) || !canPlace(ctx, slotMatches, target, s)) continue;
    usedSlots.add(s);
    plan[idx] = s;
    let valid = true;
    for (let p = 0; p < idx; p++) {
      if (ctx.shareMatrix[target * ctx.n + unplaced[p]] && Math.abs(s - plan[p]) < 2) {
        valid = false;
        break;
      }
    }
    if (valid && searchWindowSlots(ctx, slotMatches, unplaced, candidateSlots, usedSlots, plan, idx + 1)) {
      return true;
    }
    usedSlots.delete(s);
    plan[idx] = -1;
  }
  return false;
}

function findWindowPlan(
  ctx: MatchdayContext,
  matchSlot: number[],
  slotMatches: number[][],
  unplaced: number[],
  placedSlots: number[],
  minSpan: number
): { idx: number; slot: number }[] | null {
  let bestPlan: { idx: number; slot: number }[] | null = null;
  let bestCost = Infinity;

  for (let w = minSpan; w <= Math.min(ctx.slotCount, minSpan + 2); w++) {
    for (let start = 0; start + w <= ctx.slotCount; start++) {
      const end = start + w - 1;
      if (!placedSlots.every((s) => s >= start && s <= end)) continue;

      const candidateSlots = Array.from({ length: w }, (_, i) => start + i)
        .filter((s) => !placedSlots.includes(s));

      const plan: number[] = new Array(unplaced.length).fill(-1);
      const usedSlots = new Set<number>();

      if (searchWindowSlots(ctx, slotMatches, unplaced, candidateSlots, usedSlots, plan, 0)) {
        let cost = 0;
        for (let i = 0; i < unplaced.length; i++) {
          cost += ctx.costTable[unplaced[i] * ctx.slotCount + plan[i]];
        }
        let gapBefore = 0;
        for (let s = 0; s < start; s++) {
          if (slotMatches[s].length === 0) gapBefore += 1;
        }
        const totalWindowCost = gapBefore + cost;
        if (totalWindowCost < bestCost) {
          bestCost = totalWindowCost;
          bestPlan = unplaced.map((idx, i) => ({ idx, slot: plan[i] }));
        }
      }
    }
    if (bestPlan) break;
  }
  return bestPlan;
}

function attemptOrder(ctx: MatchdayContext, clubOrder: string[]): AttemptResult {
  const slotMatches: number[][] = Array.from({ length: ctx.slotCount }, () => []);
  const matchSlot: number[] = new Array(ctx.n).fill(-1);
  let hardViolations = 0;

  for (const club of clubOrder) {
    const cms = ctx.clubMatchIndices.get(club) ?? [];
    const unplaced = cms.filter((idx) => matchSlot[idx] === -1);
    if (unplaced.length === 0) continue;

    const placed = cms.filter((idx) => matchSlot[idx] !== -1);
    const placedSlots = placed.map((idx) => matchSlot[idx]);

    let mandatoryRests = 0;
    for (let i = 0; i < cms.length; i++) {
      for (let j = i + 1; j < cms.length; j++) {
        if (ctx.shareMatrix[cms[i] * ctx.n + cms[j]]) mandatoryRests += 1;
      }
    }

    const minSpan = cms.length + mandatoryRests;
    const plan = findWindowPlan(ctx, matchSlot, slotMatches, unplaced, placedSlots, minSpan);

    if (plan) {
      plan.forEach(({ idx, slot }) => {
        slotMatches[slot].push(idx);
        matchSlot[idx] = slot;
      });
    } else {
      unplaced.forEach((idx) => {
        hardViolations += placeAnywhere(ctx, matchSlot, slotMatches, idx);
      });
    }
  }

  for (let i = 0; i < ctx.n; i++) {
    if (matchSlot[i] === -1) {
      hardViolations += placeAnywhere(ctx, matchSlot, slotMatches, i);
    }
  }

  const score = computeScore(ctx, matchSlot, slotMatches, hardViolations);
  return { matchSlot, slotMatches, score };
}

function shiftToStart(ctx: MatchdayContext, slotMatches: number[][], matchSlot: number[]): void {
  const firstUsed = slotMatches.findIndex((arr) => arr.length > 0);
  if (firstUsed > 0) {
    const shifted: number[][] = Array.from({ length: ctx.slotCount }, () => []);
    matchSlot.fill(-1);
    for (let s = firstUsed; s < ctx.slotCount; s++) {
      const targetSlot = s - firstUsed;
      shifted[targetSlot] = slotMatches[s];
      slotMatches[s].forEach((mIdx) => (matchSlot[mIdx] = targetSlot));
    }
    for (let s = 0; s < ctx.slotCount; s++) {
      slotMatches[s] = shifted[s];
    }
  }
}

function canMoveMatch(ctx: MatchdayContext, slotMatches: number[][], mIdx: number, s: number, nextS: number): boolean {
  if (slotMatches[s].length >= ctx.fieldsPerSlot) return false;
  const n = ctx.n;
  for (const ex of slotMatches[s]) {
    if (ctx.linkedMatrix[mIdx * n + ex]) return false;
  }
  if (s > 0) {
    for (const prev of slotMatches[s - 1]) {
      if (ctx.shareMatrix[mIdx * n + prev]) return false;
    }
  }
  if (s + 1 < ctx.slotCount && s + 1 !== nextS) {
    for (const nxt of slotMatches[s + 1]) {
      if (ctx.shareMatrix[mIdx * n + nxt]) return false;
    }
  }
  return true;
}

function tryPullMatchIntoEmptySlot(
  ctx: MatchdayContext,
  slotMatches: number[][],
  matchSlot: number[],
  emptySlot: number,
  lastUsed: number
): boolean {
  for (let nextS = emptySlot + 1; nextS <= lastUsed; nextS++) {
    if (slotMatches[nextS].length <= 1 && nextS < lastUsed) continue;
    for (let i = 0; i < slotMatches[nextS].length; i++) {
      const mIdx = slotMatches[nextS][i];
      if (canMoveMatch(ctx, slotMatches, mIdx, emptySlot, nextS)) {
        slotMatches[nextS].splice(i, 1);
        slotMatches[emptySlot].push(mIdx);
        matchSlot[mIdx] = emptySlot;
        return true;
      }
    }
  }
  return false;
}

function compactSchedule(ctx: MatchdayContext, res: AttemptResult): AttemptResult {
  const slotMatches = res.slotMatches.map((arr) => [...arr]);
  const matchSlot = [...res.matchSlot];

  shiftToStart(ctx, slotMatches, matchSlot);

  let lastUsed = ctx.slotCount - 1 - [...slotMatches].reverse().findIndex((arr) => arr.length > 0);
  let emptySlot = slotMatches.findIndex((arr, idx) => idx < lastUsed && arr.length === 0);

  while (emptySlot !== -1 && emptySlot < lastUsed) {
    let canShift = true;
    if (emptySlot > 0) {
      for (const m1 of slotMatches[emptySlot - 1]) {
        for (const m2 of slotMatches[emptySlot + 1]) {
          if (ctx.shareMatrix[m1 * ctx.n + m2]) {
            canShift = false;
            break;
          }
        }
        if (!canShift) break;
      }
    }
    if (canShift) {
      for (let sl = emptySlot; sl < lastUsed; sl++) {
        slotMatches[sl] = slotMatches[sl + 1];
        slotMatches[sl].forEach((mIdx) => (matchSlot[mIdx] = sl));
      }
      slotMatches[lastUsed] = [];
      lastUsed--;
    } else {
      const moved = tryPullMatchIntoEmptySlot(ctx, slotMatches, matchSlot, emptySlot, lastUsed);
      if (!moved) break;
    }
    emptySlot = slotMatches.findIndex((arr, idx) => idx < lastUsed && arr.length === 0);
  }

  return { matchSlot, slotMatches, score: computeScore(ctx, matchSlot, slotMatches) };
}

function trySingleMoveStep(
  ctx: MatchdayContext,
  slotMatches: number[][],
  matchSlot: number[],
  currentScore: number
): { score: number; improved: boolean } {
  for (let i = 0; i < ctx.n; i++) {
    const s1 = matchSlot[i];
    for (let s2 = 0; s2 < ctx.slotCount; s2++) {
      if (s1 === s2 || slotMatches[s2].length >= ctx.fieldsPerSlot) continue;

      slotMatches[s1] = slotMatches[s1].filter((m) => m !== i);
      slotMatches[s2].push(i);
      matchSlot[i] = s2;

      const testScore = computeScore(ctx, matchSlot, slotMatches);
      const acceptTie = testScore === currentScore && testScore < 1_000_000 && ctx.rng() < 0.15;
      if (testScore < currentScore || acceptTie) {
        return { score: testScore, improved: true };
      }
      slotMatches[s2].pop();
      slotMatches[s1].push(i);
      matchSlot[i] = s1;
    }
  }
  return { score: currentScore, improved: false };
}

function trySwapStep(
  ctx: MatchdayContext,
  slotMatches: number[][],
  matchSlot: number[],
  currentScore: number
): { score: number; improved: boolean } {
  for (let i = 0; i < ctx.n; i++) {
    for (let j = i + 1; j < ctx.n; j++) {
      const s1 = matchSlot[i];
      const s2 = matchSlot[j];
      if (s1 === s2) continue;

      slotMatches[s1] = slotMatches[s1].map((m) => (m === i ? j : m));
      slotMatches[s2] = slotMatches[s2].map((m) => (m === j ? i : m));
      matchSlot[i] = s2;
      matchSlot[j] = s1;

      const testScore = computeScore(ctx, matchSlot, slotMatches);
      const acceptTie = testScore === currentScore && testScore < 1_000_000 && ctx.rng() < 0.15;
      if (testScore < currentScore || acceptTie) {
        return { score: testScore, improved: true };
      }
      slotMatches[s1] = slotMatches[s1].map((m) => (m === j ? i : m));
      slotMatches[s2] = slotMatches[s2].map((m) => (m === i ? j : m));
      matchSlot[i] = s1;
      matchSlot[j] = s2;
    }
  }
  return { score: currentScore, improved: false };
}

function repairSchedule(ctx: MatchdayContext, res: AttemptResult): AttemptResult {
  const slotMatches = res.slotMatches.map((arr) => [...arr]);
  const matchSlot = [...res.matchSlot];
  let currentScore = res.score;
  let improved = true;
  let guard = 0;

  while (improved && guard++ < 300) {
    improved = false;
    const moveRes = trySingleMoveStep(ctx, slotMatches, matchSlot, currentScore);
    if (moveRes.improved) {
      currentScore = moveRes.score;
      improved = true;
      continue;
    }
    const swapRes = trySwapStep(ctx, slotMatches, matchSlot, currentScore);
    if (swapRes.improved) {
      currentScore = swapRes.score;
      improved = true;
    }
  }

  return { matchSlot, slotMatches, score: currentScore };
}

/**
 * Asigna los partidos de una sola fecha a turnos y canchas respetando:
 *   - DURA 1: equipos vinculados nunca juegan a la vez.
 *   - DURA 2: equipos con jugadores compartidos nunca en turnos consecutivos.
 *   - BLANDA A: descanso exacto de un turno libre entre jugadores compartidos.
 *   - BLANDA B: equipos del mismo dueño compactos.
 *   - EQUIDAD: distribuye turnos segun el historial acumulado.
 */
export function scheduleMatchday(
  dayMatches: UnscheduledMatch[],
  clubOf: Map<string, string>,
  slotCount: number,
  fieldsPerSlot: number,
  options?: ScheduleMatchdayOptions
): MatchdayPlacement[] {
  if (dayMatches.length === 0) return [];

  const history = options?.history ?? new Map();
  const sharedPairs = options?.sharedPairs ?? new Set();
  const rng = options?.rng ?? Math.random;

  const ctx = buildContext(dayMatches, clubOf, slotCount, fieldsPerSlot, history, sharedPairs, rng);

  const baseOrder = [...ctx.multiClubs].sort(
    (a, b) => (ctx.clubMatchIndices.get(b)?.length ?? 0) - (ctx.clubMatchIndices.get(a)?.length ?? 0)
  );

  let best = repairSchedule(ctx, attemptOrder(ctx, baseOrder));

  for (let k = 0; k < 300; k++) {
    const raw = attemptOrder(ctx, shuffleWith(rng, ctx.multiClubs));
    if (raw.score < best.score || best.score >= 1000) {
      const candidate = repairSchedule(ctx, raw);
      if (candidate.score < best.score) {
        best = candidate;
      }
    }
  }

  // 1) Reparacion final
  const repaired = repairSchedule(ctx, best);

  // 2) Ultimo paso de compactar: cerrar huecos y empezar en turno 0
  const compacted = compactSchedule(ctx, repaired);

  const out: MatchdayPlacement[] = [];
  compacted.slotMatches.forEach((arr, s) => {
    arr.forEach((mIdx, c) => {
      out.push({ match: dayMatches[mIdx], slotIndex: s, canchaIndex: c });
    });
  });

  return out;
}
