import { Category } from '@/types';
import { SlotHistory, fairnessCost } from './fairness';
import { sharesPlayers } from './sharedPlayers';
import { shuffleWith } from './random';
import { computeScore, ScoreContext } from './score';
import { compactSchedule, scoreWithoutCompact } from './compact';

export const MAX_OWNER_FREE_SLOTS = 1;

export function ownerGapsWithinLimit(slots: readonly number[], maxFree = MAX_OWNER_FREE_SLOTS): boolean {
  if (slots.length <= 1) return true;
  const sorted = [...slots].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    const freeSlots = sorted[i] - sorted[i - 1] - 1;
    if (freeSlots > maxFree) return false;
  }
  return true;
}

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

interface MatchdayContext extends ScoreContext {
  dayMatches: UnscheduledMatch[];
  rng: () => number;
}

function fillCostRow(
  costTable: Float64Array,
  i: number,
  mi: UnscheduledMatch,
  slotCount: number,
  history: SlotHistory
): void {
  const hCounts = history.get(mi.homeTeamId);
  const aCounts = history.get(mi.awayTeamId);
  const hEarly = (hCounts?.[0] ?? 0) + (hCounts?.[1] ?? 0);
  const hTotal = hCounts ? hCounts.reduce((a, b) => a + b, 0) : 0;
  const aEarly = (aCounts?.[0] ?? 0) + (aCounts?.[1] ?? 0);
  const aTotal = aCounts ? aCounts.reduce((a, b) => a + b, 0) : 0;

  for (let s = 0; s < slotCount; s++) {
    let earlyPenalty = 0;
    if (s <= 1) {
      if (hTotal > 0 && hEarly / hTotal >= 0.28) earlyPenalty += 2;
      if (aTotal > 0 && aEarly / aTotal >= 0.28) earlyPenalty += 2;
    }
    costTable[i * slotCount + s] =
      fairnessCost(history, mi.homeTeamId, s, slotCount) +
      fairnessCost(history, mi.awayTeamId, s, slotCount) +
      earlyPenalty;
  }
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
    fillCostRow(costTable, i, mi, slotCount, history);
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

  return {
    n,
    slotCount,
    fieldsPerSlot,
    dayMatches,
    multiClubs,
    clubMatchIndices,
    linkedMatrix,
    shareMatrix,
    costTable,
    maxOwnerFreeSlots: MAX_OWNER_FREE_SLOTS,
    rng,
  };
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

function computePlacementGapCost(
  ctx: MatchdayContext,
  mIdx: number,
  s: number,
  placedMatches: { otherIdx: number; slot: number }[]
): number {
  if (placedMatches.length === 0) return 0;
  const items = [...placedMatches, { otherIdx: mIdx, slot: s }].sort((a, b) => a.slot - b.slot);
  let cost = 0;
  for (let i = 1; i < items.length; i++) {
    const rawGap = Math.max(0, items[i].slot - items[i - 1].slot - 1);
    const shares = ctx.shareMatrix[items[i - 1].otherIdx * ctx.n + items[i].otherIdx] === 1;
    const softGap = shares ? Math.max(0, rawGap - 1) : rawGap;
    cost += softGap * 1000;
    const allowedMax = shares ? MAX_OWNER_FREE_SLOTS : 0;
    if (rawGap > allowedMax) {
      cost += (rawGap - allowedMax) * 1_000_000;
    }
  }
  return cost;
}

function collectPlacedRelatedMatches(
  ctx: MatchdayContext,
  matchSlot: readonly number[],
  mIdx: number
): { ownerMatches: { otherIdx: number; slot: number }[]; sharedMatches: { otherIdx: number; slot: number }[] } {
  const ownerMatches: { otherIdx: number; slot: number }[] = [];
  for (const [, list] of ctx.clubMatchIndices.entries()) {
    if (list.includes(mIdx)) {
      for (const otherIdx of list) {
        if (otherIdx !== mIdx && matchSlot[otherIdx] !== -1) {
          ownerMatches.push({ otherIdx, slot: matchSlot[otherIdx] });
        }
      }
    }
  }

  const sharedMatches: { otherIdx: number; slot: number }[] = [];
  for (let otherIdx = 0; otherIdx < ctx.n; otherIdx++) {
    if (otherIdx !== mIdx && ctx.shareMatrix[mIdx * ctx.n + otherIdx] && matchSlot[otherIdx] !== -1) {
      sharedMatches.push({ otherIdx, slot: matchSlot[otherIdx] });
    }
  }
  return { ownerMatches, sharedMatches };
}

function hasUnplacedExactRestSlot(ctx: MatchdayContext, slotMatches: number[][], s: number): boolean {
  const sBefore = s - 2;
  const sAfter = s + 2;
  const canBefore = sBefore >= 0 && slotMatches[sBefore].length < ctx.fieldsPerSlot;
  const canAfter = sAfter < ctx.slotCount && slotMatches[sAfter].length < ctx.fieldsPerSlot;
  return canBefore || canAfter;
}

function placeAnywhere(ctx: MatchdayContext, matchSlot: number[], slotMatches: number[][], mIdx: number): number {
  let bestSlot = -1;
  let minCost = Infinity;
  const { ownerMatches, sharedMatches } = collectPlacedRelatedMatches(ctx, matchSlot, mIdx);

  let hasUnplacedShared = false;
  for (let other = 0; other < ctx.n; other++) {
    if (other !== mIdx && ctx.shareMatrix[mIdx * ctx.n + other] && matchSlot[other] === -1) {
      hasUnplacedShared = true;
      break;
    }
  }

  for (let s = 0; s < ctx.slotCount; s++) {
    if (canPlace(ctx, slotMatches, mIdx, s)) {
      const gapPenalty = computePlacementGapCost(ctx, mIdx, s, ownerMatches);
      let sharedRestCost = 0;
      for (let si = 0; si < sharedMatches.length; si++) {
        sharedRestCost += Math.abs(Math.abs(s - sharedMatches[si].slot) - 2) * 1000;
      }
      if (hasUnplacedShared && !hasUnplacedExactRestSlot(ctx, slotMatches, s)) {
        sharedRestCost += 1000;
      }
      const cost = ctx.costTable[mIdx * ctx.slotCount + s] + gapPenalty + sharedRestCost;
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

function cannotBridgeGaps(
  decidedSlots: readonly number[],
  candidateSlots: readonly number[],
  usedSlots: ReadonlySet<number>,
  remainingCount: number,
  maxFree: number
): boolean {
  if (decidedSlots.length <= 1) return false;
  let totalNeeded = 0;
  for (let i = 1; i < decidedSlots.length; i++) {
    const gap = decidedSlots[i] - decidedSlots[i - 1] - 1;
    if (gap > maxFree) {
      const minNeeded = Math.floor(gap / (maxFree + 1));
      let availableBetween = 0;
      for (let c = 0; c < candidateSlots.length; c++) {
        const s = candidateSlots[c];
        if (!usedSlots.has(s) && s > decidedSlots[i - 1] && s < decidedSlots[i]) {
          availableBetween++;
        }
      }
      if (availableBetween < minNeeded) return true;
      totalNeeded += minNeeded;
      if (totalNeeded > remainingCount) return true;
    }
  }
  return false;
}

function searchWindowSlots(
  ctx: MatchdayContext,
  slotMatches: number[][],
  unplaced: number[],
  candidateSlots: number[],
  usedSlots: Set<number>,
  plan: number[],
  idx: number,
  placed: { idx: number; slot: number }[],
  placedSlots: number[]
): boolean {
  if (idx >= unplaced.length) {
    const allSlots = [...placedSlots, ...plan];
    return ownerGapsWithinLimit(allSlots, MAX_OWNER_FREE_SLOTS);
  }
  const target = unplaced[idx];
  for (const s of candidateSlots) {
    if (usedSlots.has(s) || !canPlace(ctx, slotMatches, target, s)) continue;

    let valid = true;
    for (let p = 0; p < idx; p++) {
      if (ctx.shareMatrix[target * ctx.n + unplaced[p]] && Math.abs(s - plan[p]) < 2) {
        valid = false;
        break;
      }
    }
    if (valid) {
      for (const pm of placed) {
        if (ctx.shareMatrix[target * ctx.n + pm.idx] && Math.abs(s - pm.slot) < 2) {
          valid = false;
          break;
        }
      }
    }
    if (!valid) continue;

    usedSlots.add(s);
    plan[idx] = s;

    const remainingCount = unplaced.length - 1 - idx;
    const currentDecided = [...placedSlots, ...plan.slice(0, idx + 1)].sort((a, b) => a - b);
    if (!cannotBridgeGaps(currentDecided, candidateSlots, usedSlots, remainingCount, MAX_OWNER_FREE_SLOTS)) {
      if (searchWindowSlots(ctx, slotMatches, unplaced, candidateSlots, usedSlots, plan, idx + 1, placed, placedSlots)) {
        return true;
      }
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
  placed: { idx: number; slot: number }[],
  minSpan: number,
  maxSpan: number
): { idx: number; slot: number }[] | null {
  let bestPlan: { idx: number; slot: number }[] | null = null;
  let bestCost = Infinity;

  const placedSlots = placed.map((p) => p.slot);
  const actualMinSpan = Math.max(
    minSpan,
    placedSlots.length > 0 ? Math.max(...placedSlots) - Math.min(...placedSlots) + 1 : minSpan
  );
  const effectiveMaxSpan = Math.min(ctx.slotCount, Math.max(actualMinSpan, maxSpan));

  for (let w = actualMinSpan; w <= effectiveMaxSpan; w++) {
    for (let start = 0; start + w <= ctx.slotCount; start++) {
      const end = start + w - 1;
      if (!placedSlots.every((s) => s >= start && s <= end)) continue;

      const candidateSlots = Array.from({ length: w }, (_, i) => start + i)
        .filter((s) => !placedSlots.includes(s));

      const plan: number[] = new Array(unplaced.length).fill(-1);
      const usedSlots = new Set<number>();

      if (searchWindowSlots(ctx, slotMatches, unplaced, candidateSlots, usedSlots, plan, 0, placed, placedSlots)) {
        let cost = 0;
        for (let i = 0; i < unplaced.length; i++) {
          cost += ctx.costTable[unplaced[i] * ctx.slotCount + plan[i]];
        }
        let gapBefore = 0;
        for (let s = 0; s < start; s++) {
          if (slotMatches[s].length === 0) gapBefore += 1;
        }

        let restPenalty = 0;
        for (let i = 0; i < unplaced.length; i++) {
          const m = unplaced[i];
          const s = plan[i];
          for (let j = i + 1; j < unplaced.length; j++) {
            if (ctx.shareMatrix[m * ctx.n + unplaced[j]]) {
              restPenalty += Math.abs(Math.abs(s - plan[j]) - 2) * 1000;
            }
          }
          for (let ex = 0; ex < ctx.n; ex++) {
            if (ctx.shareMatrix[m * ctx.n + ex]) {
              const exSlot = matchSlot[ex];
              if (exSlot !== -1) {
                restPenalty += Math.abs(Math.abs(s - exSlot) - 2) * 1000;
              }
            }
          }
        }

        const totalWindowCost = gapBefore + cost + restPenalty;
        if (totalWindowCost < bestCost) {
          bestCost = totalWindowCost;
          bestPlan = unplaced.map((idx, i) => ({ idx, slot: plan[i] }));
          if (bestCost === 0) return bestPlan;
        }
      }
    }
    if (bestPlan) break;
  }
  return bestPlan;
}

function hasInternalClubShares(ctx: MatchdayContext, cms: readonly number[]): boolean {
  for (let i = 0; i < cms.length; i++) {
    for (let j = i + 1; j < cms.length; j++) {
      if (ctx.shareMatrix[cms[i] * ctx.n + cms[j]]) return true;
    }
  }
  return false;
}

function placeRemainingMatches(ctx: MatchdayContext, matchSlot: number[], slotMatches: number[][]): void {
  const remainingIndices: number[] = [];
  for (let i = 0; i < ctx.n; i++) {
    if (matchSlot[i] === -1) remainingIndices.push(i);
  }
  const orderedRemaining = shuffleWith(ctx.rng, remainingIndices);
  orderedRemaining.sort((a, b) => {
    let aShares = 0;
    let bShares = 0;
    for (let j = 0; j < ctx.n; j++) {
      if (ctx.shareMatrix[a * ctx.n + j]) aShares++;
      if (ctx.shareMatrix[b * ctx.n + j]) bShares++;
    }
    return bShares - aShares;
  });
  for (const i of orderedRemaining) {
    placeAnywhere(ctx, matchSlot, slotMatches, i);
  }
}

function attemptOrder(ctx: MatchdayContext, clubOrder: string[]): AttemptResult {
  const slotMatches: number[][] = Array.from({ length: ctx.slotCount }, () => []);
  const matchSlot: number[] = new Array(ctx.n).fill(-1);

  for (const club of clubOrder) {
    const cms = ctx.clubMatchIndices.get(club) ?? [];
    const unplaced = cms.filter((idx) => matchSlot[idx] === -1);
    if (unplaced.length === 0) continue;

    const placed = cms
      .filter((idx) => matchSlot[idx] !== -1)
      .map((idx) => ({ idx, slot: matchSlot[idx] }));

    const hasInternalShares = hasInternalClubShares(ctx, cms);
    const k = cms.length;
    const minSpan = k;
    const maxSpan = hasInternalShares
      ? Math.min(ctx.slotCount, k + (k - 1) * MAX_OWNER_FREE_SLOTS)
      : k;
    const plan = findWindowPlan(ctx, matchSlot, slotMatches, unplaced, placed, minSpan, maxSpan);

    if (plan) {
      plan.forEach(({ idx, slot }) => {
        slotMatches[slot].push(idx);
        matchSlot[idx] = slot;
      });
    } else {
      unplaced.forEach((idx) => {
        placeAnywhere(ctx, matchSlot, slotMatches, idx);
      });
    }
  }

  placeRemainingMatches(ctx, matchSlot, slotMatches);

  return compactSchedule(ctx, { matchSlot, slotMatches, score: 0 });
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

      const testScore = scoreWithoutCompact(ctx, matchSlot, slotMatches);
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

      const testScore = scoreWithoutCompact(ctx, matchSlot, slotMatches);
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
  let currentScore = scoreWithoutCompact(ctx, matchSlot, slotMatches);
  let improved = true;
  let guard = 0;
  let plateauSteps = 0;

  while (improved && guard++ < 300) {
    improved = false;
    const moveRes = trySingleMoveStep(ctx, slotMatches, matchSlot, currentScore);
    if (moveRes.improved) {
      if (moveRes.score < currentScore) {
        plateauSteps = 0;
      } else {
        plateauSteps++;
      }
      currentScore = moveRes.score;
      improved = plateauSteps < 15;
      continue;
    }
    const swapRes = trySwapStep(ctx, slotMatches, matchSlot, currentScore);
    if (swapRes.improved) {
      if (swapRes.score < currentScore) {
        plateauSteps = 0;
      } else {
        plateauSteps++;
      }
      currentScore = swapRes.score;
      improved = plateauSteps < 15;
    }
  }

  return { matchSlot, slotMatches, score: computeScore(ctx, matchSlot, slotMatches) };
}

function searchBestSchedule(
  ctx: MatchdayContext,
  baseOrder: string[],
  rng: () => number
): AttemptResult {
  let best = repairSchedule(ctx, attemptOrder(ctx, baseOrder));
  let unimprovedCount = 0;

  for (let k = 0; k < 60; k++) {
    if (best.score === 0) break;
    const raw = attemptOrder(ctx, shuffleWith(rng, ctx.multiClubs));
    const hasViolations = best.score >= 1_000_000 || (best.score % 100_000) >= 1000;
    if (raw.score < best.score || hasViolations) {
      const candidate = repairSchedule(ctx, raw);
      if (candidate.score < best.score) {
        best = candidate;
        unimprovedCount = 0;
      } else {
        unimprovedCount++;
      }
    } else {
      unimprovedCount++;
    }
    if (best.score < 1_000_000 && unimprovedCount >= 15) {
      break;
    }
  }
  return best;
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

  const best = searchBestSchedule(ctx, baseOrder, rng);
  const repaired = repairSchedule(ctx, best);
  const compacted = compactSchedule(ctx, repaired);

  const out: MatchdayPlacement[] = [];
  compacted.slotMatches.forEach((arr, s) => {
    arr.forEach((mIdx, c) => {
      out.push({ match: dayMatches[mIdx], slotIndex: s, canchaIndex: c });
    });
  });

  return out;
}
