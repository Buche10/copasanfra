import { describe, it, expect } from 'vitest';
import { findFullSchedule } from './exactFill';
import { ScoreContext } from './score';
import { createRng } from './random';

interface CtxSpec {
  n: number;
  slotCount?: number;
  clubs?: Record<string, number[]>;
  shared?: [number, number][];
}

function makeCtx({ n, slotCount = 8, clubs = {}, shared = [] }: CtxSpec): ScoreContext {
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

  it('devuelve null si las reglas duras impiden llenar las canchas', () => {
    // Tres partidos del mismo dueno que comparten jugadores necesitan 5 turnos; el minimo con 3 partidos es 2.
    const ctx = makeCtx({ n: 3, clubs: { AKD: [0, 1, 2] }, shared: [[0, 1], [1, 2], [0, 2]] });
    expect(findFullSchedule(ctx, createRng(1))).toBeNull();
  });
});
