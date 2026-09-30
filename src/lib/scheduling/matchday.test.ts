import { describe, it, expect } from 'vitest';
import { scheduleMatchday, UnscheduledMatch } from './matchday';
import { INITIAL_TEAMS } from '@/lib/mockData';
import { generateRandomFixture } from '@/lib/fixtureGenerator';
import { createRng } from './random';
import { fairnessReport } from './fairness';
import { Player, MATCH_TIME_SLOTS } from '@/types';

describe('scheduleMatchday', () => {
  it('maneja listas vacias de partidos', () => {
    const clubOf = new Map<string, string>();
    const res = scheduleMatchday([], clubOf, 8, 2);
    expect(res).toEqual([]);
  });

  it('ejecuta 16 partidos en menos de 200 ms (rendimiento)', () => {
    const clubOf = new Map<string, string>();
    for (let i = 1; i <= 32; i++) {
      clubOf.set(`team-${i}`, `club-${Math.floor((i - 1) / 4)}`);
    }

    const matches: UnscheduledMatch[] = [];
    for (let i = 1; i <= 16; i++) {
      matches.push({
        category: 'Abierta Varones',
        round: 1,
        homeTeamId: `team-${i * 2 - 1}`,
        awayTeamId: `team-${i * 2}`,
      });
    }

    const start = performance.now();
    const rng = createRng(42);
    const placements = scheduleMatchday(matches, clubOf, 8, 2, { rng });
    const elapsed = performance.now() - start;

    expect(placements.length).toBe(16);
    expect(elapsed).toBeLessThan(200);
  });

  it('equidad promediada en 20 temporadas cumple diferencia <= 1.0 y max temprano <= 35%', () => {
    const seasonsCount = 20;
    const allMatches = [];
    const rng = createRng(100);
    for (let s = 0; s < seasonsCount; s++) {
      allMatches.push(...generateRandomFixture(INITIAL_TEAMS, undefined, undefined, { rng }));
    }

    const report = fairnessReport(allMatches, INITIAL_TEAMS, 8);
    const byCat = new Map<string, typeof report>();
    report.forEach((r) => {
      const list = byCat.get(r.category) ?? [];
      list.push(r);
      byCat.set(r.category, list);
    });

    byCat.forEach((list) => {
      const avgSlots = list.map((r) => r.avgSlot);
      const min = Math.min(...avgSlots);
      const max = Math.max(...avgSlots);
      const diff = max - min;
      expect(diff).toBeLessThanOrEqual(1.0);
    });

    for (const r of report) {
      expect(r.earlyPct).toBeLessThanOrEqual(35);
    }
  }, 30000);

  it('cumple reglas de dueño, canchas y dia compacto en 300 fechas generadas', () => {
    const clubOf = new Map<string, string>();
    INITIAL_TEAMS.forEach((t) => clubOf.set(t.id, t.clubId || t.id));

    let totalMatchdays = 0;
    const rng = createRng(200);

    while (totalMatchdays < 300) {
      const matches = generateRandomFixture(INITIAL_TEAMS, undefined, undefined, { rng });
      const byDate = new Map<string, typeof matches>();
      matches.forEach((m) => {
        const list = byDate.get(m.date) ?? [];
        list.push(m);
        byDate.set(m.date, list);
      });

      for (const dayMatches of byDate.values()) {
        totalMatchdays++;
        if (totalMatchdays > 300) break;

        // 1) 0 dos partidos en la misma cancha y turno
        const slotCanchaUsed = new Set<string>();
        for (const m of dayMatches) {
          const key = `${m.time}|${m.stadium}`;
          expect(slotCanchaUsed.has(key)).toBe(false);
          slotCanchaUsed.add(key);
        }

        // 2) 0 choques de dueño (mismo dueño nunca a la misma hora)
        for (let i = 0; i < dayMatches.length; i++) {
          for (let j = i + 1; j < dayMatches.length; j++) {
            const m1 = dayMatches[i];
            const m2 = dayMatches[j];
            if (m1.time === m2.time) {
              const c1 = [clubOf.get(m1.homeTeamId)!, clubOf.get(m1.awayTeamId)!];
              const c2 = [clubOf.get(m2.homeTeamId)!, clubOf.get(m2.awayTeamId)!];
              const clash = c1.some((c) => c2.includes(c));
              expect(clash).toBe(false);
            }
          }
        }

        // 3) Dueños compactos (0 huecos salvo descanso obligatorio)
        const ownerMatches = new Map<string, number[]>();
        dayMatches.forEach((m) => {
          const s = MATCH_TIME_SLOTS.indexOf(m.time as (typeof MATCH_TIME_SLOTS)[number]);
          const c1 = clubOf.get(m.homeTeamId)!;
          const c2 = clubOf.get(m.awayTeamId)!;
          new Set([c1, c2]).forEach((c) => {
            const list = ownerMatches.get(c) ?? [];
            list.push(s);
            ownerMatches.set(c, list);
          });
        });

        ownerMatches.forEach((slots) => {
          if (slots.length >= 2) {
            slots.sort((a, b) => a - b);
            for (let i = 1; i < slots.length; i++) {
              const gap = slots[i] - slots[i - 1] - 1;
              expect(gap).toBe(0);
            }
          }
        });

        // 4) Dia compacto: turnos usados son 0..k sin huecos
        const usedSlots = Array.from(
          new Set(dayMatches.map((m) => MATCH_TIME_SLOTS.indexOf(m.time as (typeof MATCH_TIME_SLOTS)[number])))
        ).sort((a, b) => a - b);

        expect(usedSlots[0]).toBe(0);
        for (let i = 0; i < usedSlots.length; i++) {
          expect(usedSlots[i]).toBe(i);
        }
      }
    }
  }, 40000);

  it('respeta descanso de jugadores compartidos (0 simultaneos, 0 seguidos, >= 95% descanso exacto)', () => {
    // team-ab-1 (club-leonesq) y team-40-1 (club-leonesq): MISMO DUEÑO
    // team-ab-2 (club-futleg) y team-da-3 (club-sanfra): DISTINTO DUEÑO
    const mockPlayers: Player[] = [
      {
        id: 'p-shared-same-1',
        teamId: 'team-ab-1',
        name: 'Jugador Mismo Dueno',
        dorsal: 10,
        cedula: '1711111111',
        position: 'DEL',
        affiliation: 'Colegio de Abogados',
        approvalStatus: 'APPROVED',
      },
      {
        id: 'p-shared-same-2',
        teamId: 'team-40-1',
        name: 'Jugador Mismo Dueno',
        dorsal: 10,
        cedula: '1711111111',
        position: 'DEL',
        affiliation: 'Colegio de Abogados',
        approvalStatus: 'APPROVED',
      },
      {
        id: 'p-shared-diff-1',
        teamId: 'team-ab-2',
        name: 'Jugador Distinto Dueno',
        dorsal: 8,
        cedula: '1722222222',
        position: 'MED',
        affiliation: 'Colegio de Abogados',
        approvalStatus: 'APPROVED',
      },
      {
        id: 'p-shared-diff-2',
        teamId: 'team-da-3',
        name: 'Jugador Distinto Dueno',
        dorsal: 8,
        cedula: '1722222222',
        position: 'MED',
        affiliation: 'Colegio de Abogados',
        approvalStatus: 'APPROVED',
      },
    ];

    let totalCoincidences = 0;
    let exactRestCount = 0;
    let matchdaysTested = 0;
    const rng = createRng(300);

    while (matchdaysTested < 300) {
      const matches = generateRandomFixture(INITIAL_TEAMS, undefined, mockPlayers, { rng });
      const byDate = new Map<string, typeof matches>();
      matches.forEach((m) => {
        const list = byDate.get(m.date) ?? [];
        list.push(m);
        byDate.set(m.date, list);
      });

      for (const dayMatches of byDate.values()) {
        matchdaysTested++;
        if (matchdaysTested > 300) break;

        const findTeamSlot = (teamId: string): number | null => {
          const match = dayMatches.find((m) => m.homeTeamId === teamId || m.awayTeamId === teamId);
          return match ? MATCH_TIME_SLOTS.indexOf(match.time as (typeof MATCH_TIME_SLOTS)[number]) : null;
        };

        const pairsToCheck = [
          ['team-ab-1', 'team-40-1'],
          ['team-ab-2', 'team-da-3'],
        ];

        for (const [tA, tB] of pairsToCheck) {
          const sA = findTeamSlot(tA);
          const sB = findTeamSlot(tB);
          if (sA !== null && sB !== null) {
            totalCoincidences++;
            const diff = Math.abs(sA - sB);
            // NUNCA simultaneos
            expect(diff).not.toBe(0);
            // NUNCA seguidos (distancia >= 2)
            expect(diff).toBeGreaterThanOrEqual(2);

            if (diff === 2) {
              exactRestCount++;
            }
          }
        }
      }
    }

    expect(totalCoincidences).toBeGreaterThan(0);
    const exactRestPct = (exactRestCount / totalCoincidences) * 100;
    expect(exactRestPct).toBeGreaterThanOrEqual(95);
  }, 40000);
});
