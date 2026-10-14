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
      createMatch('m1', '+50 Varones', '2026-10-03', 't1', 't2', { status: 'SCHEDULED', round: 1 }),
      createMatch('m2', '+50 Varones', '2026-10-10', 't2', 't1', { status: 'SCHEDULED', round: 2 }),
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

// Todos contra todos por el metodo del circulo: devuelve [jornada, local, visitante].
function roundRobin(ids: string[], double: boolean): [number, string, string][] {
  const list: (string | null)[] = ids.length % 2 === 0 ? [...ids] : [...ids, null];
  const n = list.length;
  const legs: [number, string, string][] = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = list[(r + i) % (n - 1)];
      const b = i === 0 ? list[n - 1] : list[(n - 1 - i + r) % (n - 1)];
      if (a && b) legs.push([r + 1, a, b]);
    }
  }
  if (!double) return legs;
  return [...legs, ...legs.map(([r, a, b]): [number, string, string] => [r + n - 1, b, a])];
}

function fixtureMatches(cat: Category, rows: [number, string, string][], startDate = '2026-10-03'): Match[] {
  return rows.map(([round, h, a], i) => {
    const d = new Date(`${startDate}T12:00:00`);
    d.setDate(d.getDate() + (round - 1) * 7);
    const date = d.toISOString().slice(0, 10);
    return createMatch(`f-${cat}-${i}`, cat, date, h, a, { round });
  });
}

describe('findCategoriesToCreate - estructura de jornadas (Brief 14)', () => {
  const nextSat = '2026-10-03';
  const ids50 = ['akd50', 'ami', 'iura', 'cefna'];
  const teams50 = ids50.map((id) => createTeam(id, id.toUpperCase(), '+50 Varones'));

  // Caso real de produccion: calendario de 5 equipos (doble vuelta, 10 jornadas)
  // al que se le quitaron los partidos del equipo retirado. Quedan 12 partidos
  // (lo mismo que 4 equipos a doble vuelta) pero repartidos en 10 jornadas.
  const realCase = fixtureMatches(
    '+50 Varones',
    roundRobin([...ids50, 'retirado'], true).filter(([, h, a]) => h !== 'retirado' && a !== 'retirado')
  );

  it('el caso real tiene 12 partidos en 10 jornadas (precondicion del test)', () => {
    expect(realCase.length).toBe(12);
    expect(new Set(realCase.map((m) => m.round)).size).toBe(10);
  });

  it('detecta el caso real y lo regenera con un motivo claro', () => {
    const res = findCategoriesToCreate(['+50 Varones'], teams50, realCase, nextSat);
    expect(res).toHaveLength(1);
    expect(res[0].category).toBe('+50 Varones');
    expect(res[0].reason).toContain('10 jornadas');
    expect(res[0].reason).toContain('6 jornadas de 2 partidos');
    expect(res[0].reason).toContain('se regenera desde el 2026-10-03');
  });

  it('NO regenera un calendario correcto de 4 equipos a doble vuelta', () => {
    const ok = fixtureMatches('+50 Varones', roundRobin(ids50, true));
    expect(findCategoriesToCreate(['+50 Varones'], teams50, ok, nextSat)).toEqual([]);
  });

  it('NO regenera un calendario correcto de 5 equipos a doble vuelta', () => {
    const ids = [...ids50, 'quinto'];
    const teams = ids.map((id) => createTeam(id, id, '+50 Varones'));
    const ok = fixtureMatches('+50 Varones', roundRobin(ids, true));
    expect(new Set(ok.map((m) => m.round)).size).toBe(10);
    expect(findCategoriesToCreate(['+50 Varones'], teams, ok, nextSat)).toEqual([]);
  });

  it('NO regenera una categoria de una vuelta con numero impar de equipos', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const teams = ids.map((id) => createTeam(id, id, '+40 Varones'));
    const ok = fixtureMatches('+40 Varones', roundRobin(ids, false));
    expect(findCategoriesToCreate(['+40 Varones'], teams, ok, nextSat)).toEqual([]);
  });

  it('detecta un equipo que juega dos veces en la misma jornada', () => {
    const ok = fixtureMatches('+50 Varones', roundRobin(ids50, true));
    // Los dos primeros partidos son de la jornada 1 y no comparten equipos:
    // se hace que el local del primero juegue tambien el segundo.
    expect(ok[0].round).toBe(1);
    expect(ok[1].round).toBe(1);
    const broken = ok.map((m, i) => (i === 1 ? { ...m, homeTeamId: ok[0].homeTeamId } : m));
    const res = findCategoriesToCreate(['+50 Varones'], teams50, broken, nextSat);
    expect(res).toHaveLength(1);
    expect(res[0].reason).toContain('dos veces en la misma jornada');
  });

  it('con un partido jugado no regenera y avisa si sobran partidos', () => {
    const played = realCase.map((m, i) => (i === 0 ? { ...m, date: '2026-09-26', status: 'FINISHED' as const } : m));
    expect(findCategoriesToCreate(['+50 Varones'], teams50, played, nextSat)).toEqual([]);
    played.push(createMatch('extra', '+50 Varones', '2026-12-05', 'akd50', 'ami', { round: 11 }));
    const plan = planCalendarArrangement({
      matches: played,
      teams: teams50,
      players: [],
      activeCategories: ['+50 Varones'],
      today: '2026-09-30',
    });
    expect(plan.warnings.some((w) => w.startsWith('+50 Varones:') && w.includes('revísalo a mano'))).toBe(true);
  });

  it('planCalendarArrangement regenera el caso real en 6 jornadas de 2 partidos desde el proximo sabado', () => {
    const plan = planCalendarArrangement({
      matches: realCase,
      teams: teams50,
      players: [],
      activeCategories: ['+50 Varones'],
      today: '2026-09-30',
    });
    const regular = plan.matches.filter((m) => m.category === '+50 Varones' && !m.isPlayoff);
    const byRound = new Map<number, Match[]>();
    regular.forEach((m) => byRound.set(m.round, [...(byRound.get(m.round) ?? []), m]));

    expect(plan.createdCategories.map((c) => c.category)).toEqual(['+50 Varones']);
    expect(regular).toHaveLength(12);
    expect(byRound.size).toBe(6);
    byRound.forEach((ms) => {
      expect(ms).toHaveLength(2);
      const ids = ms.flatMap((m) => [m.homeTeamId, m.awayTeamId]);
      expect(new Set(ids).size).toBe(4);
    });
    expect(regular.map((m) => m.date).sort()[0]).toBe('2026-10-03');
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

describe('planCalendarArrangement - equipo nuevo en categoria ya empezada', () => {
  const ids50 = ['akd50', 'ami', 'iura', 'cefna'];
  const teams50 = [...ids50, 'admin'].map((id) => createTeam(id, id.toUpperCase(), '+50 Varones'));
  // 4 equipos a doble vuelta desde el 2026-09-12: jornadas 1-6 + final (jornada 7).
  const base = fixtureMatches('+50 Varones', roundRobin(ids50, true), '2026-09-12');
  // Jugadas las 5 primeras jornadas (hasta el 2026-10-10); la 6 sigue pendiente. Hoy es 2026-10-14.
  const played = base.map((m) =>
    m.round <= 5 ? { ...m, status: 'FINISHED' as const, homeScore: 1, awayScore: 0 } : m
  );
  const final = createMatch('final', '+50 Varones', '2026-10-24', 'akd50', 'ami', {
    round: 7,
    isPlayoff: true,
    playoffStage: 'FINAL',
    bracketSlot: 'F',
  });
  const matches = [...played, final];
  const input: ArrangeInput = {
    matches,
    teams: teams50,
    players: [],
    activeCategories: ['+50 Varones'],
    today: '2026-10-14',
  };

  it('programa los 8 partidos del equipo nuevo sin tocar lo jugado', () => {
    const plan = planCalendarArrangement(input);
    const out = plan.matches.filter((m) => m.category === '+50 Varones');
    const regular = out.filter((m) => !m.isPlayoff);

    expect(regular).toHaveLength(20);
    const adminMatches = regular.filter((m) => m.homeTeamId === 'admin' || m.awayTeamId === 'admin');
    expect(adminMatches).toHaveLength(8);
    // Juega dos veces (ida y vuelta, una de local) contra cada rival.
    ids50.forEach((id) => {
      const vs = adminMatches.filter((m) => m.homeTeamId === id || m.awayTeamId === id);
      expect(vs).toHaveLength(2);
      expect(vs.filter((m) => m.homeTeamId === 'admin')).toHaveLength(1);
    });

    // Lo jugado queda igual.
    played
      .filter((m) => m.status === 'FINISHED')
      .forEach((m) => expect(out.find((o) => o.id === m.id)).toEqual(m));

    // Todo lo pendiente va desde el proximo sabado, con hora y cancha, y nadie juega dos veces el mismo dia.
    const pending = regular.filter((m) => m.status === 'SCHEDULED');
    pending.forEach((m) => {
      expect(m.date >= '2026-10-17').toBe(true);
      expect(m.time).not.toBe('');
      expect(m.stadium).not.toBe('');
    });
    const byDate = new Map<string, string[]>();
    pending.forEach((m) => byDate.set(m.date, [...(byDate.get(m.date) ?? []), m.homeTeamId, m.awayTeamId]));
    byDate.forEach((ids) => expect(new Set(ids).size).toBe(ids.length));

    // La final queda despues de la ultima jornada regular.
    const lastRegular = pending.reduce((d, m) => (m.date > d ? m.date : d), '');
    const outFinal = out.find((m) => m.id === 'final')!;
    expect(outFinal.date > lastRegular).toBe(true);

    expect(plan.createdCategories.map((c) => c.category)).toEqual(['+50 Varones']);
    expect(plan.createdCategories[0].reason).toContain('ADMIN');
    expect(plan.warnings).toEqual([]);
  });

  it('una vez aplicado, no vuelve a cambiar nada', () => {
    const first = planCalendarArrangement(input);
    const second = planCalendarArrangement({ ...input, matches: first.matches });
    expect(second.createdCategories).toEqual([]);
    expect(second.warnings).toEqual([]);
  });

  it('con toda la fase regular jugada, el equipo nuevo juega un partido por sabado', () => {
    const allPlayed = base.map((m) => ({ ...m, status: 'FINISHED' as const, homeScore: 1, awayScore: 0 }));
    const plan = planCalendarArrangement({ ...input, matches: [...allPlayed, final] });
    const added = plan.matches.filter((m) => !m.isPlayoff && m.status === 'SCHEDULED');
    expect(added).toHaveLength(8);
    expect(new Set(added.map((m) => m.date)).size).toBe(8);
    expect(added.every((m) => m.homeTeamId === 'admin' || m.awayTeamId === 'admin')).toBe(true);
  });
});

describe('planCalendarArrangement - fecha suspendida por feriado y "en vivo" por error', () => {
  const ids50 = ['iura', 'ami', 'akd', 'cefna'];
  const teams50 = [...ids50, 'admin'].map((id) => createTeam(id, id.toUpperCase(), '+50 Varones'));
  // Caso real: jornada 1 jugada el 2026-10-03; la 2 (2026-10-10) no se jugo por
  // feriado; los dos partidos de la jornada 5 (2026-10-31) quedaron "en vivo" 0-0.
  const base = fixtureMatches('+50 Varones', roundRobin(ids50, true), '2026-10-03').map((m) => {
    if (m.round === 1) return { ...m, status: 'FINISHED' as const, homeScore: 2, awayScore: 1 };
    if (m.round === 5) return { ...m, status: 'IN_PROGRESS' as const };
    return m;
  });
  const final = createMatch('final', '+50 Varones', '2026-11-14', 'iura', 'ami', {
    round: 7,
    isPlayoff: true,
    playoffStage: 'FINAL',
    bracketSlot: 'F',
  });
  const input: ArrangeInput = {
    matches: [...base, final],
    teams: teams50,
    players: [],
    activeCategories: ['+50 Varones'],
    today: '2026-10-14',
  };

  it('reprograma la fecha suspendida desde el proximo sabado con el equipo nuevo jugando', () => {
    const plan = planCalendarArrangement(input);
    const regular = plan.matches.filter((m) => !m.isPlayoff);
    expect(regular).toHaveLength(20);

    // La jornada 1 jugada queda igual.
    base.filter((m) => m.round === 1).forEach((m) => expect(plan.matches.find((o) => o.id === m.id)).toEqual(m));

    // Nada queda pendiente en el pasado ni "en vivo".
    const pending = regular.filter((m) => m.status !== 'FINISHED');
    expect(pending).toHaveLength(18);
    pending.forEach((m) => {
      expect(m.status).toBe('SCHEDULED');
      expect(m.date >= '2026-10-17').toBe(true);
    });

    // Jornada 2 el 2026-10-17, con el equipo nuevo y un partido de la fecha suspendida.
    const j2 = regular.filter((m) => m.round === 2);
    expect(j2).toHaveLength(2);
    j2.forEach((m) => expect(m.date).toBe('2026-10-17'));
    expect(j2.some((m) => m.homeTeamId === 'admin' || m.awayTeamId === 'admin')).toBe(true);
    const suspended = base.filter((m) => m.round === 2).map((m) => m.id);
    expect(j2.some((m) => suspended.includes(m.id))).toBe(true);

    // Jornadas consecutivas 2..10, una por sabado, dos partidos y nadie repite.
    const rounds = [...new Set(regular.map((m) => m.round))].sort((a, b) => a - b);
    expect(rounds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    rounds.slice(1).forEach((r) => {
      const ms = regular.filter((m) => m.round === r);
      expect(new Set(ms.map((m) => m.date)).size).toBe(1);
      expect(ms).toHaveLength(2);
      const ids = ms.flatMap((m) => [m.homeTeamId, m.awayTeamId]);
      expect(new Set(ids).size).toBe(ids.length);
    });
    expect(new Set(pending.map((m) => m.date)).size).toBe(9);

    const outFinal = plan.matches.find((m) => m.id === 'final')!;
    expect(outFinal.date).toBe('2026-12-19');
    expect(plan.warnings).toEqual([]);
    expect(plan.createdCategories[0].reason).toContain('no se jugó la jornada 2');
  });

  it('una vez aplicado, no vuelve a cambiar nada', () => {
    const first = planCalendarArrangement(input);
    const second = planCalendarArrangement({ ...input, matches: first.matches });
    expect(second.createdCategories).toEqual([]);
  });

  it('un partido "en vivo" con goles cargados no se toca', () => {
    const withGoal = input.matches.map((m) => (m.round === 5 && !m.isPlayoff ? { ...m, homeScore: 1 } : m));
    const plan = planCalendarArrangement({ ...input, matches: withGoal });
    withGoal
      .filter((m) => m.round === 5 && !m.isPlayoff)
      .forEach((m) => {
        const out = plan.matches.find((o) => o.id === m.id)!;
        expect(out.status).toBe('IN_PROGRESS');
        expect(out.date).toBe('2026-10-31');
      });
  });
});
