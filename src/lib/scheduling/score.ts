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
  // Partidos que deben ir en los primeros turnos (categoria +50 a las 08:00).
  firstSlotMatches?: readonly number[];
}

/**
 * Turnos permitidos para los partidos de primer turno: los justos para que quepan
 * todos (con 2 partidos y 2 canchas, solo el turno 0).
 */
export function firstSlotLimit(ctx: ScoreContext): number {
  const count = ctx.firstSlotMatches?.length ?? 0;
  return Math.ceil(count / ctx.fieldsPerSlot);
}

/**
 * Cuenta los partidos de primer turno colocados fuera de los turnos permitidos.
 */
export function computeFirstSlotViolations(ctx: ScoreContext, matchSlot: readonly number[]): number {
  const matches = ctx.firstSlotMatches ?? [];
  const limit = firstSlotLimit(ctx);
  return matches.filter((m) => matchSlot[m] >= limit).length;
}

/**
 * Pesos del score, de mayor a menor prioridad. Cada nivel supera con holgura la suma
 * maxima realista del siguiente, asi que una sola falta de un nivel pesa mas que todas
 * las del nivel inferior.
 * - HARD: canchas desbordadas, mismo dueno o jugadores compartidos a la vez, +50 fuera
 *   de las 08:00.
 * - CANCHAS: canchas vacias o turnos de mas (terminar lo antes posible).
 * - OWNER_GAP: cada turno libre por encima de 1 entre partidos del mismo dueno (su
 *   siguiente partido a maximo una hora).
 * - REST: jugadores compartidos en turnos seguidos (sin la hora de descanso).
 * - SOFT: descanso exacto de un turno y dueno sin huecos.
 */
export const SCORE_WEIGHTS = {
  HARD: 1e11,
  CANCHAS: 1e9,
  OWNER_GAP: 1e7,
  REST: 1e5,
  SOFT: 1e3,
} as const;

/**
 * Reglas obligatorias: canchas desbordadas, partidos vinculados (mismo dueno o jugadores
 * compartidos) en el mismo turno y partidos de primer turno fuera de su turno.
 */
export function computeHardViolations(
  ctx: ScoreContext,
  matchSlot: readonly number[],
  slotMatches: readonly (readonly number[])[]
): number {
  const { n, slotCount, fieldsPerSlot, linkedMatrix } = ctx;
  let hard = computeFirstSlotViolations(ctx, matchSlot);
  for (let s = 0; s < slotCount; s++) {
    const arr = slotMatches[s];
    if (arr.length > fieldsPerSlot) hard += arr.length - fieldsPerSlot;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (linkedMatrix[arr[i] * n + arr[j]]) hard += 1;
      }
    }
  }
  return hard;
}

/**
 * Pares de partidos con jugadores compartidos en turnos seguidos (sin descanso).
 */
export function computeConsecutiveSharedPairs(
  ctx: ScoreContext,
  slotMatches: readonly (readonly number[])[]
): number {
  const { n, slotCount, shareMatrix } = ctx;
  let pairs = 0;
  for (let s = 0; s < slotCount - 1; s++) {
    for (const m1 of slotMatches[s]) {
      for (const m2 of slotMatches[s + 1]) {
        if (shareMatrix[m1 * n + m2]) pairs += 1;
      }
    }
  }
  return pairs;
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

/**
 * Cuenta los turnos libres que exceden maxFree entre partidos seguidos del mismo dueno
 * en el dia. Aplica a todos los pares del dueno, compartan o no jugadores.
 */
export function computeOwnerGapViolations(
  ctx: ScoreContext,
  matchSlot: readonly number[],
  maxFree = 1
): number {
  const { multiClubs, clubMatchIndices } = ctx;
  if (multiClubs.length === 0) return 0;
  let violations = 0;

  for (let c = 0; c < multiClubs.length; c++) {
    const ms = clubMatchIndices.get(multiClubs[c]);
    if (!ms || ms.length <= 1) continue;

    const placed = sortedPlacedSlots(ms, matchSlot);
    for (let i = 1; i < placed.length; i++) {
      const gap = placed[i].slot - placed[i - 1].slot - 1;
      if (gap > maxFree) violations += gap - maxFree;
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
  const { n, slotCount, fieldsPerSlot, costTable } = ctx;
  const hard = baseHard + computeHardViolations(ctx, matchSlot, slotMatches);
  const canchasLlenas = computeCanchasLlenas(n, fieldsPerSlot, slotMatches);
  const consecutiveShared = computeConsecutiveSharedPairs(ctx, slotMatches);
  const ownerGaps = computeOwnerGapViolations(ctx, matchSlot, ctx.maxOwnerFreeSlots ?? 1);
  const soft = computeSoftPenalties(ctx, matchSlot);

  let equity = 0;
  for (let i = 0; i < n; i++) {
    const s = matchSlot[i];
    if (s !== -1) equity += costTable[i * slotCount + s];
  }

  return (
    hard * SCORE_WEIGHTS.HARD +
    canchasLlenas * SCORE_WEIGHTS.CANCHAS +
    consecutiveShared * SCORE_WEIGHTS.REST +
    ownerGaps * SCORE_WEIGHTS.OWNER_GAP +
    soft * SCORE_WEIGHTS.SOFT +
    equity
  );
}
