import { describe, it, expect } from 'vitest';
import { findFullSchedule } from './exactFill';
import { ScoreContext, SCORE_WEIGHTS, computeScore } from './score';
import { createRng } from './random';

interface CtxSpec {
  n: number;
  slotCount?: number;
  clubs?: Record<string, number[]>;
  shared?: [number, number][];
  firstSlot?: number[];
}

function makeCtx({ n, slotCount = 8, clubs = {}, shared = [], firstSlot = [] }: CtxSpec): ScoreContext {
  const linkedMatrix = new Uint8Array(n * n);
  const shareMatrix = new Uint8Array(n * n);
  const link = (a: number, b: number) => {
    linkedMatrix[a * n + b] = 1;
    linkedMatrix[b * n + a] = 1;
  };
  for (let i = 0; i < n; i++) linkedMatrix[i * n + i] = 1;
  Object.values(clubs).forEach((ms) => ms.forEach((a) => ms.forEach((b) => a !== b && link(a, b))));
  shared.forEach(([a, b]) => {
    shareMatrix[a * n + b] = 1;
    shareMatrix[b * n + a] = 1;
    link(a, b);
  });
  return {
    n,
    slotCount,
    fieldsPerSlot: 2,
    multiClubs: Object.keys(clubs),
    clubMatchIndices: new Map(Object.entries(clubs)),
    linkedMatrix,
    shareMatrix,
    costTable: new Float64Array(n * slotCount),
    maxOwnerFreeSlots: 1,
    firstSlotMatches: firstSlot,
  };
}

function slotsOf(matchSlot: number[], ms: number[]): number[] {
  return ms.map((m) => matchSlot[m]).sort((a, b) => a - b);
}

describe('findFullSchedule', () => {
  it('devuelve null sin partidos o si no caben en los turnos', () => {
    expect(findFullSchedule(makeCtx({ n: 0 }), createRng(1))).toBeNull();
    expect(findFullSchedule(makeCtx({ n: 5, slotCount: 2 }), createRng(1))).toBeNull();
  });

  it('llena las canchas en el minimo de turnos con partidos independientes', () => {
    const res = findFullSchedule(makeCtx({ n: 7 }), createRng(1));
    expect(res).not.toBeNull();
    const perSlot = res!.slotMatches.map((arr) => arr.length);
    expect(perSlot).toEqual([2, 2, 2, 1, 0, 0, 0, 0]);
  });

  it('respeta dueno sin simultaneos, maximo 1 turno libre y compartidos no seguidos', () => {
    const ctx = makeCtx({ n: 10, clubs: { AKD: [0, 1, 2], LEX: [3, 4] }, shared: [[0, 1], [1, 2], [0, 2]] });
    for (let seed = 1; seed <= 20; seed++) {
      const res = findFullSchedule(ctx, createRng(seed));
      expect(res).not.toBeNull();
      const akd = slotsOf(res!.matchSlot, [0, 1, 2]);
      expect(akd[1] - akd[0]).toBe(2);
      expect(akd[2] - akd[1]).toBe(2);
      const lex = slotsOf(res!.matchSlot, [3, 4]);
      expect(lex[1] - lex[0]).toBeGreaterThanOrEqual(1);
      expect(lex[1] - lex[0]).toBeLessThanOrEqual(2);
      expect(res!.slotMatches.slice(0, 5).every((arr) => arr.length === 2)).toBe(true);
    }
  });

  it('coloca los partidos de primer turno (+50) a las 08:00', () => {
    const ctx = makeCtx({ n: 8, slotCount: 7, firstSlot: [5, 6] });
    for (let seed = 1; seed <= 10; seed++) {
      const res = findFullSchedule(ctx, createRng(seed));
      expect(res!.matchSlot[5]).toBe(0);
      expect(res!.matchSlot[6]).toBe(0);
    }
  });

  it('prefiere dar descanso a los compartidos antes que juntar al dueno', () => {
    // AKD: partidos 0, 1 y 2. El 0 comparte jugadores con el 3 (otro dueno) y el 1 con el 4.
    const ctx = makeCtx({ n: 6, slotCount: 3, clubs: { AKD: [0, 1, 2] }, shared: [[0, 3], [1, 4]] });
    const res = findFullSchedule(ctx, createRng(1));
    expect(res).not.toBeNull();
    expect(Math.abs(res!.matchSlot[0] - res!.matchSlot[3])).not.toBe(1);
    expect(Math.abs(res!.matchSlot[1] - res!.matchSlot[4])).not.toBe(1);
  });

  it('devuelve null si las reglas duras impiden llenar las canchas', () => {
    // Tres partidos del mismo dueno que comparten jugadores necesitan 5 turnos; el minimo con 3 partidos es 2.
    const ctx = makeCtx({ n: 3, clubs: { AKD: [0, 1, 2] }, shared: [[0, 1], [1, 2], [0, 2]] });
    expect(findFullSchedule(ctx, createRng(1))).toBeNull();
  });
});

describe('niveles del score', () => {
  it('una falta obligatoria pesa mas que todo lo demas y el descanso mas que el dueno', () => {
    expect(SCORE_WEIGHTS.HARD).toBeGreaterThan(SCORE_WEIGHTS.CANCHAS * 50);
    expect(SCORE_WEIGHTS.CANCHAS).toBeGreaterThan(SCORE_WEIGHTS.REST * 50);
    expect(SCORE_WEIGHTS.REST).toBeGreaterThan(SCORE_WEIGHTS.OWNER_GAP * 50);
    expect(SCORE_WEIGHTS.OWNER_GAP).toBeGreaterThan(SCORE_WEIGHTS.SOFT * 50);
  });

  it('cuenta +50 fuera de las 08:00 como falta obligatoria', () => {
    const ctx = makeCtx({ n: 2, slotCount: 3, firstSlot: [0] });
    const ok = computeScore(ctx, [0, 1], [[0], [1], []]);
    const bad = computeScore(ctx, [1, 0], [[1], [0], []]);
    expect(bad - ok).toBeGreaterThanOrEqual(SCORE_WEIGHTS.HARD);
  });
});
