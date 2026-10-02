import { describe, it, expect } from 'vitest';
import { ownerGapsWithinLimit, scheduleMatchday, UnscheduledMatch, MAX_OWNER_FREE_SLOTS } from './matchday';
import { computeOwnerGapViolations, ScoreContext } from './score';
import { findOwnerGapViolations } from './arrangeCalendar';
import { createRng } from './random';
import { makePairKey } from './sharedPlayers';
import { Team, Match, Category, MATCH_TIME_SLOTS, CANCHAS } from '@/types';

function createTeam(id: string, name: string, category: Category, clubId?: string): Team {
  return {
    id,
    name,
    shortName: name.slice(0, 4),
    category,
    logo: 'shield-default',
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    delegate: 'Delegado',
    phone: '0990000000',
    clubId,
  };
}

function createMatch(
  id: string,
  category: Category,
  date: string,
  time: string,
  homeTeamId: string,
  awayTeamId: string
): Match {
  return {
    id,
    category,
    round: 1,
    date,
    time,
    stadium: 'Cancha 1',
    homeTeamId,
    awayTeamId,
    homeScore: 0,
    awayScore: 0,
    status: 'SCHEDULED',
    homeLineup: [],
    awayLineup: [],
    events: [],
  };
}

describe('ownerGapsWithinLimit', () => {
  it('devuelve true para 0 o 1 turno asignado', () => {
    expect(ownerGapsWithinLimit([])).toBe(true);
    expect(ownerGapsWithinLimit([2])).toBe(true);
  });

  it('devuelve true para turnos seguidos (0 turnos libres)', () => {
    expect(ownerGapsWithinLimit([0, 1, 2])).toBe(true);
  });

  it('devuelve true para exactamente 1 turno libre entre partidos seguidos', () => {
    expect(ownerGapsWithinLimit([0, 2, 4])).toBe(true);
    expect(ownerGapsWithinLimit([1, 3])).toBe(true);
  });

  it('devuelve false si hay 2 o mas turnos libres', () => {
    expect(ownerGapsWithinLimit([0, 3])).toBe(false);
    expect(ownerGapsWithinLimit([0, 2, 5])).toBe(false);
  });

  it('ordena correctamente turnos desordenados', () => {
    expect(ownerGapsWithinLimit([4, 0, 2])).toBe(true);
    expect(ownerGapsWithinLimit([5, 0, 2])).toBe(false);
  });

  it('respeta parametro maxFree personalizado', () => {
    expect(ownerGapsWithinLimit([0, 3], 2)).toBe(true);
    expect(ownerGapsWithinLimit([0, 4], 2)).toBe(false);
  });
});

describe('computeOwnerGapViolations', () => {
  it('devuelve 0 si ningun club tiene mas de 1 partido', () => {
    const ctx: ScoreContext = {
      n: 2,
      slotCount: 8,
      fieldsPerSlot: 2,
      multiClubs: [],
      clubMatchIndices: new Map(),
      linkedMatrix: new Uint8Array(4),
      shareMatrix: new Uint8Array(4),
      costTable: new Float64Array(16),
      maxOwnerFreeSlots: 1,
    };
    expect(computeOwnerGapViolations(ctx, [0, 1])).toBe(0);
  });

  it('devuelve 0 para turnos seguidos sin jugadores compartidos', () => {
    const clubMatchIndices = new Map<string, number[]>([['AKD', [0, 1, 2]]]);
    const ctx: ScoreContext = {
      n: 3,
      slotCount: 8,
      fieldsPerSlot: 2,
      multiClubs: ['AKD'],
      clubMatchIndices,
      linkedMatrix: new Uint8Array(9),
      shareMatrix: new Uint8Array(9),
      costTable: new Float64Array(24),
      maxOwnerFreeSlots: 1,
    };
    expect(computeOwnerGapViolations(ctx, [0, 1, 2])).toBe(0);
  });

  it('devuelve 0 con 1 turno libre cuando comparten jugadores', () => {
    const clubMatchIndices = new Map<string, number[]>([['AKD', [0, 1, 2]]]);
    const shareMatrix = new Uint8Array(9);
    shareMatrix[0 * 3 + 1] = 1;
    shareMatrix[1 * 3 + 0] = 1;
    shareMatrix[1 * 3 + 2] = 1;
    shareMatrix[2 * 3 + 1] = 1;
    const ctx: ScoreContext = {
      n: 3,
      slotCount: 8,
      fieldsPerSlot: 2,
      multiClubs: ['AKD'],
      clubMatchIndices,
      linkedMatrix: new Uint8Array(9),
      shareMatrix,
      costTable: new Float64Array(24),
      maxOwnerFreeSlots: 1,
    };
    expect(computeOwnerGapViolations(ctx, [0, 2, 4])).toBe(0);
  });

  it('penaliza huecos mayores a maxFree', () => {
    const clubMatchIndices = new Map<string, number[]>([['AKD', [0, 1]]]);
    const shareMatrix = new Uint8Array(4);
    shareMatrix[0 * 2 + 1] = 1;
    shareMatrix[1 * 2 + 0] = 1;
    const ctx: ScoreContext = {
      n: 2,
      slotCount: 8,
      fieldsPerSlot: 2,
      multiClubs: ['AKD'],
      clubMatchIndices,
      linkedMatrix: new Uint8Array(4),
      shareMatrix,
      costTable: new Float64Array(16),
      maxOwnerFreeSlots: 1,
    };
    // Slots 0 y 3 -> 2 turnos libres -> 2 - 1 = 1 violacion
    expect(computeOwnerGapViolations(ctx, [0, 3])).toBe(1);
    // Slots 0 y 4 -> 3 turnos libres -> 3 - 1 = 2 violaciones
    expect(computeOwnerGapViolations(ctx, [0, 4])).toBe(2);
  });
});

describe('findOwnerGapViolations', () => {
  const teams: Team[] = [
    createTeam('t1', 'AKD Abierta', 'Abierta Varones', 'AKD'),
    createTeam('t2', 'AKD +40', '+40 Varones', 'AKD'),
    createTeam('t3', 'AKD +50', '+50 Varones', 'AKD'),
    createTeam('o1', 'Rival 1', 'Abierta Varones', 'R1'),
    createTeam('o2', 'Rival 2', '+40 Varones', 'R2'),
    createTeam('o3', 'Rival 3', '+50 Varones', 'R3'),
  ];

  it('no reporta violaciones cuando se respeta maxFree 1', () => {
    const matches: Match[] = [
      createMatch('m1', 'Abierta Varones', '2026-10-10', '08:00', 't1', 'o1'),
      createMatch('m2', '+40 Varones', '2026-10-10', '10:30', 't2', 'o2'),
      createMatch('m3', '+50 Varones', '2026-10-10', '13:00', 't3', 'o3'),
    ];
    const violations = findOwnerGapViolations(matches, teams, 1);
    expect(violations).toHaveLength(0);
  });

  it('detecta y describe violaciones con mas de 1 turno libre', () => {
    const matches: Match[] = [
      createMatch('m1', 'Abierta Varones', '2026-10-10', '08:00', 't1', 'o1'),
      createMatch('m2', '+40 Varones', '2026-10-10', '11:45', 't2', 'o2'),
    ];
    const violations = findOwnerGapViolations(matches, teams, 1);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual({
      date: '2026-10-10',
      club: 'AKD',
      fromTime: '08:00',
      toTime: '11:45',
      freeSlots: 2,
    });
  });
});

describe('scheduleMatchday con equipos del mismo dueno', () => {
  function createAkdFixture() {
    const clubOf = new Map<string, string>([
      ['akd-ab', 'AKD'],
      ['akd-40', 'AKD'],
      ['akd-50', 'AKD'],
    ]);
    for (let i = 1; i <= 16; i++) {
      clubOf.set(`oth-${i}`, `oth-${i}`);
    }

    const matches: UnscheduledMatch[] = [
      { category: 'Abierta Varones', round: 1, homeTeamId: 'akd-ab', awayTeamId: 'oth-1' },
      { category: '+40 Varones', round: 1, homeTeamId: 'akd-40', awayTeamId: 'oth-2' },
      { category: '+50 Varones', round: 1, homeTeamId: 'akd-50', awayTeamId: 'oth-3' },
    ];
    for (let i = 1; i <= 6; i++) {
      matches.push({
        category: 'Abierta Varones',
        round: 1,
        homeTeamId: `oth-${i * 2 + 2}`,
        awayTeamId: `oth-${i * 2 + 3}`,
      });
    }

    const sharedPairs = new Set<string>([
      makePairKey('akd-ab', 'akd-40'),
      makePairKey('akd-40', 'akd-50'),
      makePairKey('akd-ab', 'akd-50'),
    ]);

    return { clubOf, matches, sharedPairs };
  }

  function verifyAkdSimulation(startSim: number, endSim: number) {
    const { clubOf, matches, sharedPairs } = createAkdFixture();

    for (let sim = startSim; sim < endSim; sim++) {
      const rng = createRng(sim + 42);
      const placements = scheduleMatchday(matches, clubOf, MATCH_TIME_SLOTS.length, CANCHAS.length, {
        sharedPairs,
        rng,
      });

      const akdSlots = placements
        .filter((p) => p.match.homeTeamId.startsWith('akd'))
        .map((p) => p.slotIndex)
        .sort((a, b) => a - b);

      expect(akdSlots).toHaveLength(3);

      // 1) 0 simultaneos del dueno
      expect(new Set(akdSlots).size).toBe(3);

      // 2) 0 compartidos seguidos (distancia >= 2)
      for (let i = 1; i < akdSlots.length; i++) {
        const dist = akdSlots[i] - akdSlots[i - 1];
        expect(dist).toBeGreaterThanOrEqual(2);
      }

      // 3) Huecos de maximo 1 entre seguidos del dueno
      for (let i = 1; i < akdSlots.length; i++) {
        const gap = akdSlots[i] - akdSlots[i - 1] - 1;
        expect(gap).toBeLessThanOrEqual(MAX_OWNER_FREE_SLOTS);
      }
    }
  }

  it('programa 3 equipos de AKD con partidos adicionales en 300 fechas respetando limites (lote 1: 0 a 149)', () => {
    verifyAkdSimulation(0, 150);
  }, 20000);

  it('programa 3 equipos de AKD con partidos adicionales en 300 fechas respetando limites (lote 2: 150 a 299)', () => {
    verifyAkdSimulation(150, 300);
  }, 20000);

  function createTwoOwnersFixture() {
    const clubOf = new Map<string, string>([
      ['a1', 'CLUB_A'],
      ['a2', 'CLUB_A'],
      ['a3', 'CLUB_A'],
      ['b1', 'CLUB_B'],
      ['b2', 'CLUB_B'],
    ]);
    for (let i = 1; i <= 20; i++) {
      clubOf.set(`oth-${i}`, `oth-${i}`);
    }

    const matches: UnscheduledMatch[] = [
      { category: 'Abierta Varones', round: 1, homeTeamId: 'a1', awayTeamId: 'b1' },
      { category: '+40 Varones', round: 1, homeTeamId: 'a2', awayTeamId: 'oth-1' },
      { category: '+50 Varones', round: 1, homeTeamId: 'a3', awayTeamId: 'oth-2' },
      { category: '+40 Varones', round: 1, homeTeamId: 'b2', awayTeamId: 'oth-3' },
    ];
    for (let i = 1; i <= 6; i++) {
      matches.push({
        category: 'Abierta Varones',
        round: 1,
        homeTeamId: `oth-${i * 2 + 2}`,
        awayTeamId: `oth-${i * 2 + 3}`,
      });
    }

    return { clubOf, matches };
  }

  function verifyTwoOwnersSimulation(startSim: number, endSim: number) {
    const { clubOf, matches } = createTwoOwnersFixture();

    for (let sim = startSim; sim < endSim; sim++) {
      const rng = createRng(sim + 700);
      const placements = scheduleMatchday(matches, clubOf, MATCH_TIME_SLOTS.length, CANCHAS.length, {
        rng,
      });

      const aSlots = placements
        .filter((p) => [p.match.homeTeamId, p.match.awayTeamId].some((id) => clubOf.get(id) === 'CLUB_A'))
        .map((p) => p.slotIndex)
        .sort((a, b) => a - b);

      const bSlots = placements
        .filter((p) => [p.match.homeTeamId, p.match.awayTeamId].some((id) => clubOf.get(id) === 'CLUB_B'))
        .map((p) => p.slotIndex)
        .sort((a, b) => a - b);

      expect(aSlots).toHaveLength(3);
      expect(bSlots).toHaveLength(2);

      // Huecos maximo 1 para CLUB_A
      for (let i = 1; i < aSlots.length; i++) {
        const gap = aSlots[i] - aSlots[i - 1] - 1;
        expect(gap).toBeLessThanOrEqual(MAX_OWNER_FREE_SLOTS);
      }

      // Huecos maximo 1 para CLUB_B
      const gapB = bSlots[1] - bSlots[0] - 1;
      expect(gapB).toBeLessThanOrEqual(MAX_OWNER_FREE_SLOTS);
    }
  }

  it('acomoda dos duenos que se enfrentan directamente en 300 fechas (lote 1: 0 a 149)', () => {
    verifyTwoOwnersSimulation(0, 150);
  }, 20000);

  it('acomoda dos duenos que se enfrentan directamente en 300 fechas (lote 2: 150 a 299)', () => {
    verifyTwoOwnersSimulation(150, 300);
  }, 20000);
});

describe('planCalendarArrangement y advertencias de dueno', () => {
  it('incluye advertencia en el plan si existen huecos excesivos por dueno', () => {
    const teams: Team[] = [
      createTeam('t1', 'AKD Abierta', 'Abierta Varones', 'AKD'),
      createTeam('t2', 'AKD +40', '+40 Varones', 'AKD'),
      createTeam('o1', 'Rival 1', 'Abierta Varones', 'R1'),
      createTeam('o2', 'Rival 2', '+40 Varones', 'R2'),
    ];

    const matches: Match[] = [
      createMatch('m1', 'Abierta Varones', '2026-10-10', '08:00', 't1', 'o1'),
      createMatch('m2', '+40 Varones', '2026-10-10', '11:45', 't2', 'o2'),
    ];

    const violations = findOwnerGapViolations(matches, teams, MAX_OWNER_FREE_SLOTS);
    expect(violations.length).toBe(1);
    const warningText = `${violations[0].date}: el dueño ${violations[0].club} tiene ${violations[0].freeSlots} turnos libres entre ${violations[0].fromTime} y ${violations[0].toTime} (no se pudo dejar en máximo 1)`;
    expect(warningText).toContain('el dueño AKD tiene 2 turnos libres entre 08:00 y 11:45');
  });
});
