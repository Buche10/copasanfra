import { describe, it, expect } from 'vitest';
import { findUnfilledCourtDays, planCalendarArrangement } from './arrangeCalendar';
import { Category, Match, Team, MATCH_TIME_SLOTS } from '@/types';

function createTeam(id: string, category: Category, clubId?: string): Team {
  return {
    id,
    name: `Equipo ${id}`,
    shortName: id.slice(0, 4),
    category,
    logo: 'shield-default',
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    delegate: 'Delegado',
    phone: '0990000000',
    clubId,
  };
}

function createMatch(id: string, date: string, time: string, options?: Partial<Match>): Match {
  return {
    id,
    category: 'Abierta Varones',
    round: 1,
    date,
    time,
    stadium: 'Cancha 1',
    homeTeamId: `${id}-h`,
    awayTeamId: `${id}-a`,
    homeScore: 0,
    awayScore: 0,
    status: 'SCHEDULED',
    homeLineup: [],
    awayLineup: [],
    events: [],
    ...options,
  };
}

function dayWithSlots(date: string, slots: number[]): Match[] {
  return slots.map((s, i) => createMatch(`${date}-${i}`, date, MATCH_TIME_SLOTS[s]));
}

describe('findUnfilledCourtDays', () => {
  it('no reporta una fecha de 14 partidos en 7 turnos llenos', () => {
    const matches = dayWithSlots('2026-10-24', [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
    expect(findUnfilledCourtDays(matches, 2)).toEqual([]);
  });

  it('no reporta un numero impar de partidos con el ultimo turno a medias', () => {
    const matches = dayWithSlots('2026-10-24', [0, 0, 1, 1, 2]);
    expect(findUnfilledCourtDays(matches, 2)).toEqual([]);
  });

  it('reporta 14 partidos repartidos en 8 turnos con canchas vacias', () => {
    const matches = dayWithSlots('2026-10-24', [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 7]);
    expect(findUnfilledCourtDays(matches, 2)).toEqual([
      { date: '2026-10-24', usedSlots: 8, minSlots: 7, emptyCells: 2, lastSlot: 7 },
    ]);
  });

  it('reporta un turno vacio en medio de la jornada y reconoce horas antiguas', () => {
    const matches = [
      createMatch('a', '2026-10-17', '08:00'),
      createMatch('b', '2026-10-17', '08:00'),
      createMatch('c', '2026-10-17', '10:30'),
      createMatch('d', '2026-10-17', '10:30'),
    ];
    expect(findUnfilledCourtDays(matches, 2)).toEqual([
      { date: '2026-10-17', usedSlots: 2, minSlots: 2, emptyCells: 2, lastSlot: 2 },
    ]);
  });

  it('ignora partidos sin hora y ordena por fecha', () => {
    const matches = [
      ...dayWithSlots('2026-10-31', [0, 2]),
      createMatch('sin-hora', '2026-10-24', ''),
      ...dayWithSlots('2026-10-24', [1]),
    ];
    expect(findUnfilledCourtDays(matches, 2).map((d) => d.date)).toEqual(['2026-10-24', '2026-10-31']);
  });
});

describe('planCalendarArrangement y aviso de canchas vacias', () => {
  it('avisa cuando el dueno obliga a usar mas turnos de los necesarios', () => {
    // Dos categorias completas de 2 equipos (un solo cruce cada una), ambas con AKD.
    const teams = [
      createTeam('akd-ab', 'Abierta Varones', 'club-akd'),
      createTeam('r-ab', 'Abierta Varones'),
      createTeam('akd-40', '+40 Varones', 'club-akd'),
      createTeam('r-40', '+40 Varones'),
    ];
    const matches = [
      createMatch('m1', '2026-10-03', '08:00', { homeTeamId: 'akd-ab', awayTeamId: 'r-ab' }),
      createMatch('m2', '2026-10-03', '08:00', {
        homeTeamId: 'akd-40',
        awayTeamId: 'r-40',
        category: '+40 Varones',
        stadium: 'Cancha 2',
      }),
    ];

    const plan = planCalendarArrangement({
      matches,
      teams,
      players: [],
      activeCategories: ['Abierta Varones', '+40 Varones'],
      today: '2026-09-30',
    });

    const oct3 = plan.matches.filter((m) => m.date === '2026-10-03');
    expect(oct3.map((m) => m.time).sort()).toEqual(['08:00', '09:10']);
    expect(plan.warnings).toContain(
      '2026-10-03: se usaron 2 turnos (mínimo 1) con 1 cancha vacía; el último partido empieza a las 09:10 en vez de las 08:00'
    );
  });
});
