export interface ScoreContext {
  n: number;
  slotCount: number;
  fieldsPerSlot: number;
  multiClubs: string[];
  clubMatchIndices: Map<string, number[]>;
  linkedMatrix: Uint8Array;
  shareMatrix: Uint8Array;
  costTable: Float64Array;
  maxOwnerFreeSlots?: number;
}

export interface PlacedMatchSlot {
  idx: number;
  slot: number;
}

export function sortedPlacedSlots(
  indices: readonly number[],
  matchSlot: readonly number[]
): PlacedMatchSlot[] {
  const placed: PlacedMatchSlot[] = [];
  for (let i = 0; i < indices.length; i++) {
    const m = indices[i];
    const s = matchSlot[m];
    if (s !== -1) placed.push({ idx: m, slot: s });
  }
  if (placed.length <= 1) return placed;
  if (placed.length === 2) {
    if (placed[0].slot > placed[1].slot) {
      const temp = placed[0];
      placed[0] = placed[1];
      placed[1] = temp;
    }
    return placed;
  }
  return placed.sort((a, b) => a.slot - b.slot);
}

export function computeOwnerGapViolations(
  ctx: ScoreContext,
  matchSlot: readonly number[],
  maxFree = 1
): number {
  const { multiClubs, clubMatchIndices, n, shareMatrix } = ctx;
  if (multiClubs.length === 0) return 0;
  let violations = 0;

  for (let c = 0; c < multiClubs.length; c++) {
    const ms = clubMatchIndices.get(multiClubs[c]);
    if (!ms || ms.length <= 1) continue;

    const placed = sortedPlacedSlots(ms, matchSlot);
    for (let i = 1; i < placed.length; i++) {
      const gap = placed[i].slot - placed[i - 1].slot - 1;
      const shares = shareMatrix[placed[i - 1].idx * n + placed[i].idx] === 1;
      const allowedMax = shares ? maxFree : 0;
      if (gap > allowedMax) violations += gap - allowedMax;
    }
  }
  return violations;
}

export function computeCanchasLlenas(
  n: number,
  fieldsPerSlot: number,
  slotMatches: readonly (readonly number[])[]
): number {
  if (n === 0) return 0;

  let lastUsedSlot = -1;
  let turnosUsados = 0;
  for (let s = 0; s < slotMatches.length; s++) {
    if (slotMatches[s].length > 0) {
      turnosUsados += 1;
      lastUsedSlot = s;
    }
  }

  if (lastUsedSlot === -1) return 0;

  let celdasVaciasIntermedias = 0;
  for (let s = 0; s < lastUsedSlot; s++) {
    celdasVaciasIntermedias += Math.max(0, fieldsPerSlot - slotMatches[s].length);
  }

  const turnosMinimos = Math.ceil(n / fieldsPerSlot);
  const turnosExtra = Math.max(0, turnosUsados - turnosMinimos);

  return celdasVaciasIntermedias + turnosExtra;
}

export function computeSoftPenalties(ctx: ScoreContext, matchSlot: readonly number[]): number {
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
  for (let c = 0; c < multiClubs.length; c++) {
    const ms = clubMatchIndices.get(multiClubs[c]);
    if (!ms || ms.length <= 1) continue;

    const placed = sortedPlacedSlots(ms, matchSlot);
    for (let i = 1; i < placed.length; i++) {
      const rawGap = Math.max(0, placed[i].slot - placed[i - 1].slot - 1);
      const shares = shareMatrix[placed[i - 1].idx * n + placed[i].idx] === 1;
      ownerGaps += shares ? Math.max(0, rawGap - 1) : rawGap;
    }
  }

  return exactRestPenalty + ownerGaps;
}

export function computeScore(
  ctx: ScoreContext,
  matchSlot: readonly number[],
  slotMatches: readonly (readonly number[])[],
  baseHard = 0
): number {
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

  const maxFree = ctx.maxOwnerFreeSlots ?? 1;
  hard += computeOwnerGapViolations(ctx, matchSlot, maxFree);

  const canchasLlenas = computeCanchasLlenas(n, fieldsPerSlot, slotMatches);
  const soft = computeSoftPenalties(ctx, matchSlot);

  let equity = 0;
  for (let i = 0; i < n; i++) {
    const s = matchSlot[i];
    if (s !== -1) equity += costTable[i * slotCount + s];
  }

  return hard * 1_000_000 + canchasLlenas * 100_000 + soft * 1_000 + equity;
}
