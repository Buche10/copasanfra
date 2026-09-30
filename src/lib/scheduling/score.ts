export interface ScoreContext {
  n: number;
  slotCount: number;
  fieldsPerSlot: number;
  multiClubs: string[];
  clubMatchIndices: Map<string, number[]>;
  linkedMatrix: Uint8Array;
  shareMatrix: Uint8Array;
  costTable: Float64Array;
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

  const canchasLlenas = computeCanchasLlenas(n, fieldsPerSlot, slotMatches);
  const soft = computeSoftPenalties(ctx, matchSlot);

  let equity = 0;
  for (let i = 0; i < n; i++) {
    const s = matchSlot[i];
    if (s !== -1) equity += costTable[i * slotCount + s];
  }

  return hard * 1_000_000 + canchasLlenas * 100_000 + soft * 1_000 + equity;
}
