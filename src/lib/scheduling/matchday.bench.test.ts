import { describe, it, expect } from 'vitest';
import { scheduleMatchday, UnscheduledMatch } from './matchday';
import { INITIAL_TEAMS } from '@/lib/mockData';
import { generateRandomFixture } from '@/lib/fixtureGenerator';
import { createRng } from './random';
import { buildSharedPlayerPairs } from './sharedPlayers';
import { Player, MATCH_TIME_SLOTS, CANCHAS } from '@/types';

describe('matchday benchmark', () => {
  it('mide el tiempo de ejecucion en 50 fechas con y sin sharedPairs', () => {
    const clubOf = new Map<string, string>();
    INITIAL_TEAMS.forEach((t) => clubOf.set(t.id, t.clubId || t.id));

    const mockPlayers: Player[] = [
      {
        id: 'p-1',
        teamId: 'team-ab-1',
        name: 'Jugador 1',
        dorsal: 10,
        cedula: '1711111111',
        position: 'DEL',
        affiliation: 'Colegio de Abogados',
        approvalStatus: 'APPROVED',
      },
      {
        id: 'p-2',
        teamId: 'team-40-1',
        name: 'Jugador 1',
        dorsal: 10,
        cedula: '1711111111',
        position: 'DEL',
        affiliation: 'Colegio de Abogados',
        approvalStatus: 'APPROVED',
      },
    ];
    const sharedPairs = buildSharedPlayerPairs(mockPlayers);

    const allDayMatches: UnscheduledMatch[][] = [];
    let fixSeed = 7;
    while (allDayMatches.length < 50) {
      const fixRng = createRng(fixSeed++);
      const matches = generateRandomFixture(INITIAL_TEAMS, undefined, undefined, { rng: fixRng });
      const byDate = new Map<string, UnscheduledMatch[]>();
      for (const m of matches) {
        const list = byDate.get(m.date) ?? [];
        list.push({
          category: m.category,
          round: m.round,
          homeTeamId: m.homeTeamId,
          awayTeamId: m.awayTeamId,
        });
        byDate.set(m.date, list);
      }
      for (const day of byDate.values()) {
        allDayMatches.push(day);
        if (allDayMatches.length >= 50) break;
      }
    }

    // 1) Sin sharedPairs
    const schedRngNoShared = createRng(7);
    const startNoShared = performance.now();
    for (const dayMatches of allDayMatches) {
      scheduleMatchday(dayMatches, clubOf, MATCH_TIME_SLOTS.length, CANCHAS.length, {
        rng: schedRngNoShared,
      });
    }
    const durationNoShared = performance.now() - startNoShared;
    const avgNoShared = durationNoShared / allDayMatches.length;

    // 2) Con sharedPairs
    const schedRngShared = createRng(7);
    const startShared = performance.now();
    for (const dayMatches of allDayMatches) {
      scheduleMatchday(dayMatches, clubOf, MATCH_TIME_SLOTS.length, CANCHAS.length, {
        sharedPairs,
        rng: schedRngShared,
      });
    }
    const durationShared = performance.now() - startShared;
    const avgShared = durationShared / allDayMatches.length;

    console.log(`[BENCHMARK] Sin sharedPairs: total ${durationNoShared.toFixed(1)} ms, media ${avgNoShared.toFixed(2)} ms/fecha`);
    console.log(`[BENCHMARK] Con sharedPairs: total ${durationShared.toFixed(1)} ms, media ${avgShared.toFixed(2)} ms/fecha`);

    expect(avgNoShared).toBeLessThanOrEqual(150);
    expect(avgShared).toBeLessThanOrEqual(150);
  }, 60000);
});
