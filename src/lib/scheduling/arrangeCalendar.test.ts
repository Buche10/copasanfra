import { describe, it, expect } from 'vitest';
import {
  nextSaturday,
  findCategoriesToCreate,
  planCalendarArrangement,
  ArrangeInput,
} from './arrangeCalendar';
import { canChangeCategory } from '../registration';
import { Team, Player, Match, Category } from '@/types';

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
  homeTeamId: string,
  awayTeamId: string,
  options?: Partial<Match>
): Match {
  return {
    id,
    category,
    round: 1,
    date,
    time: '08:00',
    stadium: 'Cancha 1',
    homeTeamId,
    awayTeamId,
    homeScore: 0,
    awayScore: 0,
    status: 'SCHEDULED',
    homeLineup: [],
    awayLineup: [],
    events: [],
    ...options,
  };
}

describe('nextSaturday', () => {
  it('calcula el sabado siguiente cuando hoy es miercoles', () => {
    expect(nextSaturday('2026-09-30', [])).toBe('2026-10-03');
  });

  it('calcula el sabado siguiente cuando hoy es lunes o viernes', () => {
    expect(nextSaturday('2026-09-28', [])).toBe('2026-10-03');
    expect(nextSaturday('2026-10-02', [])).toBe('2026-10-03');
  });

  it('devuelve el sabado de hoy si no hay partidos jugados ese dia', () => {
    expect(nextSaturday('2026-10-03', [])).toBe('2026-10-03');
    const futureMatches = [
      createMatch('m1', 'Abierta Varones', '2026-10-03', 't1', 't2', { status: 'SCHEDULED' }),
    ];
    expect(nextSaturday('2026-10-03', futureMatches)).toBe('2026-10-03');
  });

  it('devuelve el siguiente sabado si hoy es sabado y ya hay partidos jugados ese dia', () => {
    const playedMatches = [
      createMatch('m1', 'Abierta Varones', '2026-10-03', 't1', 't2', { status: 'FINISHED' }),
    ];
    expect(nextSaturday('2026-10-03', playedMatches)).toBe('2026-10-10');
  });

  it('calcula el siguiente sabado cuando hoy es domingo', () => {
    expect(nextSaturday('2026-10-04', [])).toBe('2026-10-10');
  });
});

describe('canChangeCategory', () => {
  const match = createMatch('m1', 'Abierta Varones', '2026-10-03', 't1', 't2');

  it('devuelve false cuando el equipo tiene partidos como local o visitante', () => {
    expect(canChangeCategory('t1', [match])).toBe(false);
    expect(canChangeCategory('t2', [match])).toBe(false);
  });

  it('devuelve true cuando el equipo no tiene partidos en el calendario', () => {
    expect(canChangeCategory('t3', [match])).toBe(true);
    expect(canChangeCategory('t1', [])).toBe(true);
  });
});

describe('findCategoriesToCreate', () => {
  const teams = [
    createTeam('t1', 'Equipo 1', '+50 Varones'),
    createTeam('t2', 'Equipo 2', '+50 Varones'),
  ];
  const nextSat = '2026-10-03';

  it('crea categoria activa sin partidos', () => {
    expect(findCategoriesToCreate(['+50 Varones'], teams, [], nextSat)).toEqual([
      { category: '+50 Varones', reason: 'sin partidos; se genera desde el 2026-10-03' }
    ]);
  });

  it('regenera categoria con pendientes en fechas pasadas y sin jugados', () => {
    const pastPending = [
      createMatch('m1', '+50 Varones', '2026-09-05', 't1', 't2', { status: 'SCHEDULED' }),
    ];
    expect(findCategoriesToCreate(['+50 Varones'], teams, pastPending, nextSat)).toEqual([
      { category: '+50 Varones', reason: 'partidos sin jugar en fechas pasadas; se regenera desde el 2026-10-03' }
    ]);
  });

  it('NO regenera categoria con todos sus pendientes a partir del proximo sabado', () => {
    const futurePending = [
      createMatch('m1', '+50 Varones', '2026-10-03', 't1', 't2', { status: 'SCHEDULED' }),
      createMatch('m2', '+50 Varones', '2026-10-10', 't1', 't2', { status: 'SCHEDULED' }),
    ];
    expect(findCategoriesToCreate(['+50 Varones'], teams, futurePending, nextSat)).toEqual([]);
  });

  it('nunca regenera categoria con algun partido jugado', () => {
    const withPlayed = [
      createMatch('m1', '+50 Varones', '2026-09-05', 't1', 't2', { status: 'FINISHED' }),
      createMatch('m2', '+50 Varones', '2026-09-12', 't1', 't2', { status: 'SCHEDULED' }),
    ];
    expect(findCategoriesToCreate(['+50 Varones'], teams, withPlayed, nextSat)).toEqual([]);
  });
});

describe('planCalendarArrangement - Simulacion del torneo', () => {
  const activeCategories: Category[] = ['Abierta Varones', '+40 Varones', '+50 Varones'];

  function buildRealTournamentScenario() {
    const teams: Team[] = [
      ...Array.from({ length: 14 }, (_, i) => createTeam(`ab-${i + 1}`, `Abierta ${i + 1}`, 'Abierta Varones')),
      ...Array.from({ length: 10 }, (_, i) => createTeam(`c40-${i + 1}`, `+40 ${i + 1}`, '+40 Varones')),
      ...Array.from({ length: 5 }, (_, i) => createTeam(`c50-${i + 1}`, `+50 ${i + 1}`, '+50 Varones')),
      ...Array.from({ length: 4 }, (_, i) => createTeam(`dam-${i + 1}`, `Damas ${i + 1}`, 'Damas')),
    ];

    const players: Player[] = [
      {
        id: 'p1',
        teamId: 'c40-1',
        name: 'Jugador Doble',
        cedula: '1800000001',
        dorsal: 10,
        position: 'MED',
        affiliation: 'Colegio de Abogados',
      },
      {
        id: 'p2',
        teamId: 'c50-1',
        name: 'Jugador Doble',
        cedula: '1800000001',
        dorsal: 10,
        position: 'MED',
        affiliation: 'Colegio de Abogados',
      },
    ];

    const playedDates = ['2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26'];
    const matches: Match[] = [];

    playedDates.forEach((date, dateIdx) => {
      matches.push(
        createMatch(`ab-played-${dateIdx}`, 'Abierta Varones', date, 'ab-1', 'ab-2', {
          status: 'FINISHED',
          homeScore: 2,
          awayScore: 1,
          time: '08:00',
          stadium: 'Cancha 1',
        }),
        createMatch(`c40-played-${dateIdx}`, '+40 Varones', date, 'c40-1', 'c40-2', {
          status: 'FINISHED',
          homeScore: 0,
          awayScore: 0,
          time: '09:15',
          stadium: 'Cancha 1',
        }),
        createMatch(`dam-played-${dateIdx}`, 'Damas', date, 'dam-1', 'dam-2', {
          status: 'FINISHED',
          homeScore: 1,
          awayScore: 3,
          time: '10:30',
          stadium: 'Cancha 1',
        })
      );
    });

    matches.push(
      createMatch('c50-old-past', '+50 Varones', '2026-09-05', 'c50-1', 'c50-2', { status: 'SCHEDULED' }),
      createMatch('c50-old-fut', '+50 Varones', '2026-10-03', 'c50-3', 'c50-4', { status: 'SCHEDULED' })
    );

    matches.push(
      createMatch('ab-fut-1', 'Abierta Varones', '2026-10-03', 'ab-3', 'ab-4', { status: 'SCHEDULED' }),
      createMatch('c40-fut-1', '+40 Varones', '2026-10-03', 'c40-1', 'c40-3', { status: 'SCHEDULED' }),
      createMatch('dam-fut-1', 'Damas', '2026-10-03', 'dam-3', 'dam-4', {
        status: 'SCHEDULED',
        time: '08:00',
        stadium: 'Cancha 2',
      })
    );

    return { teams, players, matches };
  }

  it('devuelve baseMatches igual a la entrada', () => {
    const { teams, players, matches } = buildRealTournamentScenario();
    const plan = planCalendarArrangement({
      matches,
      teams,
      players,
      activeCategories,
      today: '2026-09-30',
    });

    expect(plan.baseMatches).toBe(matches);
  });

  it('reemplaza la categoria no jugada, preserva fechas jugadas y blanquea inactivas', () => {
    const { teams, players, matches } = buildRealTournamentScenario();
    const input: ArrangeInput = {
      matches,
      teams,
      players,
      activeCategories,
      today: '2026-09-30',
    };

    const plan = planCalendarArrangement(input);

    expect(plan.categoriesToCreate).toContain('+50 Varones');
    expect(plan.removedStaleMatches).toBe(2);
    expect(plan.startDate).toBe('2026-10-03');

    const playedOld = matches.filter((m) => m.date < '2026-10-03' && m.status === 'FINISHED');
    for (const oldM of playedOld) {
      const kept = plan.matches.find((m) => m.id === oldM.id);
      expect(kept).toBeDefined();
      expect(kept?.status).toBe('FINISHED');
      expect(kept?.time).toBe(oldM.time);
      expect(kept?.stadium).toBe(oldM.stadium);
      expect(kept?.homeScore).toBe(oldM.homeScore);
    }

    const c50Matches = plan.matches.filter((m) => m.category === '+50 Varones');
    expect(c50Matches.length).toBeGreaterThan(0);
    const minC50Date = c50Matches.reduce((min, m) => (m.date < min ? m.date : min), '9999-99-99');
    expect(minC50Date).toBe('2026-10-03');

    const damasFuture = plan.matches.filter((m) => m.category === 'Damas' && m.date >= '2026-10-03');
    for (const damM of damasFuture) {
      expect(damM.time).toBe('');
      expect(damM.stadium).toBe('');
    }
  });

  it('aplicar dos veces seguidas no cambia los enfrentamientos de la categoria creada', () => {
    const { teams, players, matches } = buildRealTournamentScenario();
    const plan1 = planCalendarArrangement({
      matches,
      teams,
      players,
      activeCategories,
      today: '2026-09-30',
    });

    const plan2 = planCalendarArrangement({
      matches: plan1.matches,
      teams,
      players,
      activeCategories,
      today: '2026-09-30',
    });

    expect(plan2.categoriesToCreate).not.toContain('+50 Varones');
    expect(plan2.removedStaleMatches).toBe(0);

    const c50Plan1 = plan1.matches
      .filter((m) => m.category === '+50 Varones')
      .map((m) => `${m.date}-${m.homeTeamId}-${m.awayTeamId}`)
      .sort();
    const c50Plan2 = plan2.matches
      .filter((m) => m.category === '+50 Varones')
      .map((m) => `${m.date}-${m.homeTeamId}-${m.awayTeamId}`)
      .sort();

    expect(c50Plan2).toEqual(c50Plan1);
  });

  it('asigna turnos sin solapamiento para jugadores compartidos en la misma fecha', () => {
    const { teams, players, matches } = buildRealTournamentScenario();
    const plan = planCalendarArrangement({
      matches,
      teams,
      players,
      activeCategories,
      today: '2026-09-30',
    });

    const oct3Active = plan.matches.filter(
      (m) => m.date === '2026-10-03' && activeCategories.includes(m.category) && m.time
    );

    const mC40 = oct3Active.find((m) => m.homeTeamId === 'c40-1' || m.awayTeamId === 'c40-1');
    const mC50 = oct3Active.find((m) => m.homeTeamId === 'c50-1' || m.awayTeamId === 'c50-1');

    if (mC40 && mC50) {
      expect(mC40.time).not.toBe(mC50.time);
    }
  });

  it('detecta y reporta fechas con mas de 16 partidos activos sin modificarlas', () => {
    const { teams, players } = buildRealTournamentScenario();
    const playedPastMatch = createMatch('m-past', 'Abierta Varones', '2026-09-05', 'ab-1', 'ab-2', {
      status: 'FINISHED',
      homeScore: 1,
      awayScore: 0,
    });
    const overCapacityMatches: Match[] = [
      playedPastMatch,
      ...Array.from({ length: 17 }, (_, i) =>
        createMatch(`m-over-${i}`, 'Abierta Varones', '2026-10-03', 'ab-1', 'ab-2', {
          time: '12:00',
          stadium: 'Cancha 1',
        })
      ),
    ];

    const plan = planCalendarArrangement({
      matches: overCapacityMatches,
      teams,
      players,
      activeCategories: ['Abierta Varones'],
      today: '2026-09-30',
    });

    const overDates = plan.overCapacityDates.map((d) => d.date);
    expect(overDates).toContain('2026-10-03');
    const oct3Matches = plan.matches.filter((m) => m.date === '2026-10-03');
    expect(oct3Matches.every((m) => m.time === '12:00')).toBe(true);
  });

  it('emite advertencias cuando equipos en categorias activas no tienen partidos', () => {
    const teams = [
      createTeam('t-orphan', 'Equipo Solitario', 'Abierta Varones'),
      createTeam('t2', 'Equipo 2', 'Abierta Varones'),
      createTeam('t3', 'Equipo 3', 'Abierta Varones'),
    ];
    const matches = [
      createMatch('m-played', 'Abierta Varones', '2026-09-05', 't2', 't3', { status: 'FINISHED' }),
      createMatch('m-future', 'Abierta Varones', '2026-10-03', 't2', 't3', { status: 'SCHEDULED' }),
    ];

    const plan = planCalendarArrangement({
      matches,
      teams,
      players: [],
      activeCategories: ['Abierta Varones'],
      today: '2026-09-30',
    });

    expect(plan.warnings.some((w) => w.includes('Equipo Solitario'))).toBe(true);
  });
});
