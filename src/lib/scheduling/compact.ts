import {
  ScoreContext,
  computeScore,
  computeCanchasLlenas,
  computeOwnerGapViolations,
} from './score';

export interface CompactResult {
  matchSlot: number[];
  slotMatches: number[][];
  score: number;
}

export function scoreWithoutCompact(
  ctx: ScoreContext,
  matchSlot: number[],
  slotMatches: number[][]
): number {
  const full = computeScore(ctx, matchSlot, slotMatches);
  return full - computeCanchasLlenas(ctx.n, ctx.fieldsPerSlot, slotMatches) * 100_000;
}

export function shiftToStart(
  slotCount: number,
  slotMatches: number[][],
  matchSlot: number[]
): void {
  const firstUsed = slotMatches.findIndex((arr) => arr.length > 0);
  if (firstUsed > 0) {
    const shifted: number[][] = Array.from({ length: slotCount }, () => []);
    matchSlot.fill(-1);
    for (let s = firstUsed; s < slotCount; s++) {
      const targetSlot = s - firstUsed;
      shifted[targetSlot] = slotMatches[s];
      slotMatches[s].forEach((mIdx) => (matchSlot[mIdx] = targetSlot));
    }
    for (let s = 0; s < slotCount; s++) {
      slotMatches[s] = shifted[s];
    }
  }
}

export function canMoveMatch(
  ctx: ScoreContext,
  slotMatches: number[][],
  mIdx: number,
  s: number,
  nextS: number
): boolean {
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
  ctx: ScoreContext,
  slotMatches: number[][],
  matchSlot: number[],
  emptySlot: number,
  lastUsed: number
): boolean {
  const maxFree = ctx.maxOwnerFreeSlots ?? 1;
  for (let nextS = emptySlot + 1; nextS <= lastUsed; nextS++) {
    if (slotMatches[nextS].length <= 1 && nextS < lastUsed) continue;
    for (let i = 0; i < slotMatches[nextS].length; i++) {
      const mIdx = slotMatches[nextS][i];
      if (canMoveMatch(ctx, slotMatches, mIdx, emptySlot, nextS)) {
        const prevViolations = computeOwnerGapViolations(ctx, matchSlot, maxFree);
        slotMatches[nextS].splice(i, 1);
        slotMatches[emptySlot].push(mIdx);
        matchSlot[mIdx] = emptySlot;
        const newViolations = computeOwnerGapViolations(ctx, matchSlot, maxFree);
        if (newViolations > prevViolations) {
          slotMatches[emptySlot].pop();
          slotMatches[nextS].splice(i, 0, mIdx);
          matchSlot[mIdx] = nextS;
          continue;
        }
        return true;
      }
    }
  }
  return false;
}

function tryPullToEarlierSlots(
  ctx: ScoreContext,
  slotMatches: number[][],
  matchSlot: number[]
): boolean {
  let anyMoved = false;
  let lastUsed = ctx.slotCount - 1 - [...slotMatches].reverse().findIndex((arr) => arr.length > 0);

  for (let s = 0; s < lastUsed; s++) {
    while (slotMatches[s].length < ctx.fieldsPerSlot && lastUsed > s) {
      let bestIdx = -1;
      let bestBase = Infinity;
      const currentBase = scoreWithoutCompact(ctx, matchSlot, slotMatches);

      for (let i = 0; i < slotMatches[lastUsed].length; i++) {
        const mIdx = slotMatches[lastUsed][i];
        if (!canMoveMatch(ctx, slotMatches, mIdx, s, lastUsed)) continue;

        slotMatches[lastUsed].splice(i, 1);
        slotMatches[s].push(mIdx);
        matchSlot[mIdx] = s;

        const testBase = scoreWithoutCompact(ctx, matchSlot, slotMatches);
        if (testBase <= currentBase && testBase < bestBase) {
          bestBase = testBase;
          bestIdx = i;
        }

        slotMatches[s].pop();
        slotMatches[lastUsed].splice(i, 0, mIdx);
        matchSlot[mIdx] = lastUsed;
      }

      if (bestIdx === -1) break;

      const mIdx = slotMatches[lastUsed].splice(bestIdx, 1)[0];
      slotMatches[s].push(mIdx);
      matchSlot[mIdx] = s;
      anyMoved = true;
      lastUsed = ctx.slotCount - 1 - [...slotMatches].reverse().findIndex((arr) => arr.length > 0);
    }
  }
  return anyMoved;
}

export function compactSchedule(ctx: ScoreContext, res: CompactResult): CompactResult {
  const slotMatches = res.slotMatches.map((arr) => [...arr]);
  const matchSlot = [...res.matchSlot];

  shiftToStart(ctx.slotCount, slotMatches, matchSlot);

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

  tryPullToEarlierSlots(ctx, slotMatches, matchSlot);

  return { matchSlot, slotMatches, score: computeScore(ctx, matchSlot, slotMatches) };
}
