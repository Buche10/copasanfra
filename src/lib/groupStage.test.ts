import { describe, it, expect } from 'vitest';
import { Category, Match, Team } from '@/types';
import {
  buildCreateGroupStageBatch,
  buildGroups,
  calculateGroupStandings,
  generateGroupStageMatches,
  getGroupMemberIds,
  groupStageComplete,
  hasGroupStage,
  restoreBracketBeforeGroups,
  shiftBracketAfterGroups,
} from './groupStage';

function makeTeam(id: string, name: string, clubId?: string, withdrawn = false): Team {
  return {
    id,
    name,
    shortName: name.slice(0, 6),
    category: '+40 Varones',
    logo: 'shield',
    primaryColor: '#00A859',
    secondaryColor: '#0f172a',
    delegate: 'Delegado',
    phone: '0999999999',
    clubId,
    withdrawn,
  };
}

function makeRegularMatch(
  id: string,
  round: number,
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number,
  awayScore: number,
  date = '2026-10-03',
  category: Category = '+40 Varones'
): Match {
  return {
    id,
    category,
    round,
    date,
    time: '08:00',
    stadium: 'Cancha 1',
    homeTeamId,
    awayTeamId,
    homeScore,
    awayScore,
    status: 'FINISHED',
    homeLineup: [],
    awayLineup: [],
    events: [],
    refereeSigned: true,
  };
}

// Orden real: 1 Fuerza Legal, 2 Futleg, 3 Club IDUS, 4 Leones Q, 5 Lawyers,
// 6 Vodka Jr., 7 Alianza Legal, 8 AKD, 9 Boman Legal, 10 Sporting Legal
const REAL_NAMES = [
  'Fuerza Legal',
  'Futleg (+40)',
  'Club IDUS (+40)',
  'Leones Q (+40)',
  'Lawyers (+40)',
  'Vodka Jr.',
  'Alianza Legal (+40)',
  'AKD (+40)',
  'Boman Legal (+40)',
  'Sporting Legal',
];

function buildTenTeamSetup(): { teams: Team[]; matches: Match[] } {
  const teams = REAL_NAMES.map((name, i) => makeTeam(`t${i + 1}`, name, `club-${i + 1}`));
  const matches: Match[] = [];
  let idx = 1;
  // Todos contra todos donde el equipo de menor indice siempre gana 1-0,
  // garantizando el orden exacto t1..t10 en calculateStandings.
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      matches.push(
        makeRegularMatch(`m-reg-${idx++}`, (idx % 9) + 1, teams[i].id, teams[j].id, 1, 0)
      );
    }
  }
  return { teams, matches };
}

describe('groupStage', () => {
  it('buildGroups divide 10 equipos reales en impares (A) y pares (B); solo el 1.º (2) y el 2.º (1) tienen bonificacion', () => {
    const { teams, matches } = buildTenTeamSetup();
    const groups = buildGroups('+40 Varones', teams, matches);

    expect(groups.A.map((e) => e.teamId)).toEqual(['t1', 't3', 't5', 't7', 't9']);
    expect(groups.B.map((e) => e.teamId)).toEqual(['t2', 't4', 't6', 't8', 't10']);
    expect(groups.A.map((e) => e.bonus)).toEqual([2, 0, 0, 0, 0]);
    expect(groups.B.map((e) => e.bonus)).toEqual([1, 0, 0, 0, 0]);
  });

  it('buildGroups excluye equipos retirados', () => {
    const { teams, matches } = buildTenTeamSetup();
    teams[4] = { ...teams[4], withdrawn: true }; // t5 retirado
    const groups = buildGroups('+40 Varones', teams, matches);
    const allIds = [...groups.A, ...groups.B].map((e) => e.teamId);
    expect(allIds).not.toContain('t5');
    expect(allIds).toHaveLength(9);
  });

  it('calculateGroupStandings suma la bonificacion y desempata por posicion regular sobre DG y H2H', () => {
    const { teams, matches } = buildTenTeamSetup();
    const snapshot = JSON.stringify({ teams, matches });

    // Triple empate en 4 pts en Grupo A:
    // t1 (reg 1, bonif 2): pierde 0-3 con t3 y empata con t5 y t7 -> 2 + 2 = 4, DG -3.
    // t3 (reg 3, bonif 0): gana a t1 y empata con t9 -> 4, DG +3, gano el H2H a t1.
    // t5 (reg 5, bonif 0): empata con t1 y gana 5-0 a t9 -> 4, DG +5.
    // Debe ordenar por posicion regular: t1, t3, t5.
    const groupMatches: Match[] = [
      { ...makeRegularMatch('g1', 10, 't3', 't1', 3, 0), isPlayoff: true, playoffStage: 'GRUPOS', groupName: 'A' },
      { ...makeRegularMatch('g2', 11, 't1', 't5', 0, 0), isPlayoff: true, playoffStage: 'GRUPOS', groupName: 'A' },
      { ...makeRegularMatch('g3', 12, 't1', 't7', 0, 0), isPlayoff: true, playoffStage: 'GRUPOS', groupName: 'A' },
      { ...makeRegularMatch('g4', 13, 't5', 't9', 5, 0), isPlayoff: true, playoffStage: 'GRUPOS', groupName: 'A' },
      { ...makeRegularMatch('g5', 14, 't3', 't9', 0, 0), isPlayoff: true, playoffStage: 'GRUPOS', groupName: 'A' },
      { ...makeRegularMatch('g6', 10, 't4', 't6', 0, 0), isPlayoff: true, playoffStage: 'GRUPOS', groupName: 'B' },
      { ...makeRegularMatch('g7', 11, 't2', 't8', 0, 0), isPlayoff: true, playoffStage: 'GRUPOS', groupName: 'B' },
    ];

    const allMatches = [...matches, ...groupMatches];
    const tableA = calculateGroupStandings('+40 Varones', teams, allMatches, 'A');

    expect(tableA.slice(0, 3).map((s) => s.teamId)).toEqual(['t1', 't3', 't5']);
    expect(tableA[0].pts).toBe(4);
    expect(tableA[0].bonus).toBe(2);
    expect(tableA[1].pts).toBe(4);
    expect(tableA[1].bonus).toBe(0);
    expect(tableA[2].pts).toBe(4);
    expect(tableA[2].bonus).toBe(0);

    // Grupo B: el 2.º de la fase regular (t2) tiene 1 punto de bonificacion y el resto 0.
    // t2 empata (1) + bonif (1) = 2; t4 y t6 empatan entre si (1 cada uno); t8 empata (1).
    const tableB = calculateGroupStandings('+40 Varones', teams, allMatches, 'B');
    expect(tableB[0]).toMatchObject({ teamId: 't2', bonus: 1, pts: 2 });
    expect(tableB.slice(1).map((s) => s.bonus)).toEqual([0, 0, 0]);
    expect(tableB.slice(1).map((s) => s.teamId)).toEqual(['t4', 't6', 't8']);

    // No muta entrada
    expect(JSON.stringify({ teams, matches })).toBe(snapshot);
  });

  it('generateGroupStageMatches genera 20 partidos, 5 fechas, sin choques de turno/equipo/dueno ni mutacion', () => {
    const { teams, matches } = buildTenTeamSetup();
    // Dos equipos con el mismo clubId en grupos distintos (t1 y t2)
    teams[0] = { ...teams[0], clubId: 'dueno-compartido' };
    teams[1] = { ...teams[1], clubId: 'dueno-compartido' };
    const snapshot = JSON.stringify({ teams, matches });

    const res = generateGroupStageMatches({
      cat: '+40 Varones',
      teams,
      matches,
      startDate: '2026-11-28',
    });

    expect(res.unscheduled).toHaveLength(0);
    expect(res.matches).toHaveLength(20);

    const rounds = Array.from(new Set(res.matches.map((m) => m.round))).sort((a, b) => a - b);
    expect(rounds).toEqual([10, 11, 12, 13, 14]);

    // IDs unicos
    expect(new Set(res.matches.map((m) => m.id)).size).toBe(20);

    // 4 partidos por fecha (2 por grupo), nadie repite en la fecha, sin choques de turno/cancha ni clubId
    const clubOf = new Map(teams.map((t) => [t.id, t.clubId || t.id]));
    for (const r of rounds) {
      const rm = res.matches.filter((m) => m.round === r);
      expect(rm).toHaveLength(4);
      expect(rm.filter((m) => m.groupName === 'A')).toHaveLength(2);
      expect(rm.filter((m) => m.groupName === 'B')).toHaveLength(2);

      const playing = rm.flatMap((m) => [m.homeTeamId, m.awayTeamId]);
      expect(new Set(playing).size).toBe(8);

      const slots = rm.map((m) => `${m.time}|${m.stadium}`);
      expect(new Set(slots).size).toBe(4);

      const timeClubs = new Map<string, Set<string>>();
      for (const m of rm) {
        const set = timeClubs.get(m.time) ?? new Set<string>();
        const ch = clubOf.get(m.homeTeamId)!;
        const ca = clubOf.get(m.awayTeamId)!;
        expect(set.has(ch)).toBe(false);
        expect(set.has(ca)).toBe(false);
        set.add(ch);
        set.add(ca);
        timeClubs.set(m.time, set);
      }
    }

    // Cada par dentro de cada grupo juega exactamente 1 vez
    const pairKeysA = new Set(
      res.matches
        .filter((m) => m.groupName === 'A')
        .map((m) => [m.homeTeamId, m.awayTeamId].sort().join('-'))
    );
    const pairKeysB = new Set(
      res.matches
        .filter((m) => m.groupName === 'B')
        .map((m) => [m.homeTeamId, m.awayTeamId].sort().join('-'))
    );
    expect(pairKeysA.size).toBe(10);
    expect(pairKeysB.size).toBe(10);

    // No muta entrada
    expect(JSON.stringify({ teams, matches })).toBe(snapshot);
  });

  it('generateGroupStageMatches valida fecha sabado y detecta partidos sin turno libre', () => {
    const { teams, matches } = buildTenTeamSetup();
    expect(() =>
      generateGroupStageMatches({
        cat: '+40 Varones',
        teams,
        matches,
        startDate: '2026-11-29', // domingo
      })
    ).toThrow();

    // Llenar todos los turnos del 2026-11-28 con otra categoria
    const blockers: Match[] = [];
    const times = ['08:00', '09:05', '10:10', '11:15', '12:20', '13:25', '14:30', '15:35', '16:40'];
    let bIdx = 1;
    for (const time of times) {
      for (const stadium of ['Cancha 1', 'Cancha 2']) {
        blockers.push({
          ...makeRegularMatch(`blk-${bIdx++}`, 1, `x${bIdx}a`, `x${bIdx}b`, 0, 0, '2026-11-28', 'Abierta Varones'),
          status: 'SCHEDULED',
          time,
          stadium,
        });
      }
    }

    const res = generateGroupStageMatches({
      cat: '+40 Varones',
      teams,
      matches: [...matches, ...blockers],
      startDate: '2026-11-28',
    });
    expect(res.unscheduled).toHaveLength(4);
    expect(res.unscheduled.every((m) => m.time === '')).toBe(true);
  });

  it('shiftBracketAfterGroups mueve cuartos/semis/final, respeta partidos jugados y permite deshacer', () => {
    const { teams, matches } = buildTenTeamSetup();
    const bracket: Match[] = [
      {
        ...makeRegularMatch('c1', 10, '', '', 0, 0, '2026-11-28'),
        status: 'SCHEDULED',
        time: '10:10',
        stadium: 'Cancha 1',
        isPlayoff: true,
        playoffStage: 'CUARTOS',
        bracketSlot: 'C1',
      },
      {
        ...makeRegularMatch('s1', 11, '', '', 0, 0, '2026-12-05'),
        status: 'SCHEDULED',
        time: '12:20',
        stadium: 'Cancha 1',
        isPlayoff: true,
        playoffStage: 'SEMIS',
        bracketSlot: 'S1',
      },
      {
        ...makeRegularMatch('f1', 12, '', '', 1, 0, '2026-12-12'),
        status: 'FINISHED',
        time: '09:05',
        stadium: 'Cancha 2',
        isPlayoff: true,
        playoffStage: 'FINAL',
        bracketSlot: 'F',
      },
    ];

    const shifted = shiftBracketAfterGroups({
      cat: '+40 Varones',
      matches: [...matches, ...bracket],
      teams,
      lastGroupDate: '2026-12-26',
    });

    expect(shifted.find((m) => m.id === 'c1')?.date).toBe('2027-01-02');
    expect(shifted.find((m) => m.id === 's1')?.date).toBe('2027-01-09');
    expect(shifted.find((m) => m.id === 'f1')?.date).toBe('2026-12-12'); // FINISHED no se mueve
    expect(shifted.find((m) => m.id === 'c1')?.preGroupSchedule).toEqual({
      date: '2026-11-28',
      time: '10:10',
      stadium: 'Cancha 1',
    });

    const restored = restoreBracketBeforeGroups('+40 Varones', [...matches, ...shifted]);
    expect(restored.find((m) => m.id === 'c1')?.date).toBe('2026-11-28');
    expect(restored.find((m) => m.id === 'c1')?.preGroupSchedule).toBeUndefined();
  });

  it('hasGroupStage y groupStageComplete detectan estado de la fase de grupos', () => {
    const { matches } = buildTenTeamSetup();
    expect(hasGroupStage('+40 Varones', matches)).toBe(false);
    expect(groupStageComplete('+40 Varones', matches)).toBe(false);

    const gMatch: Match = {
      ...makeRegularMatch('g1', 10, 't1', 't3', 0, 0),
      status: 'SCHEDULED',
      isPlayoff: true,
      playoffStage: 'GRUPOS',
      groupName: 'A',
    };
    expect(hasGroupStage('+40 Varones', [...matches, gMatch])).toBe(true);
    expect(groupStageComplete('+40 Varones', [...matches, gMatch])).toBe(false);
    expect(groupStageComplete('+40 Varones', [...matches, { ...gMatch, status: 'FINISHED' }])).toBe(true);
  });

  it('escenario real del 2026-11-28 queda sin partidos seguidos del mismo dueno', () => {
    const clubMap: Record<string, string> = {
      'Fuerza Legal': 'club-legal',
      'Futleg (+40)': 'club-futleg',
      'Club IDUS (+40)': 'club-idus',
      'Leones Q (+40)': 'club-leonesq',
      'Lawyers (+40)': 'club-lawyers',
      'Vodka Jr.': 'club-vodka',
      'Alianza Legal (+40)': 'club-alianza',
      'AKD (+40)': 'club-akd',
      'Boman Legal (+40)': 'club-boman',
      'Sporting Legal': 'club-sporting',
    };
    const teams = REAL_NAMES.map((name, i) => makeTeam(`t${i + 1}`, name, clubMap[name]));
    const regMatches: Match[] = [];
    let idx = 1;
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        regMatches.push(makeRegularMatch(`mr-${idx++}`, (idx % 9) + 1, teams[i].id, teams[j].id, 1, 0));
      }
    }

    const extTeam = (id: string, name: string, category: Category, clubId?: string): Team => ({
      ...makeTeam(id, name, clubId),
      category,
    });
    const extraTeams: Team[] = [
      extTeam('e-cat', 'Amigos del C.A.T.', '+50 Varones'),
      extTeam('e-iura', 'IURA', '+50 Varones'),
      extTeam('e-adm', 'Administradores', '+50 Varones'),
      extTeam('e-akd50', 'AKD (+50)', '+50 Varones', 'club-akd'),
      extTeam('e-sanfra-ab', 'Sanfra Legal', 'Abierta Varones', 'club-sanfra'),
      extTeam('e-futleg-ab', 'Futleg', 'Abierta Varones', 'club-futleg'),
      extTeam('e-boman-ab', 'Boman Legal', 'Abierta Varones', 'club-boman'),
      extTeam('e-idus-ab', 'Club IDUS', 'Abierta Varones', 'club-idus'),
      extTeam('e-akd-ab', 'AKD', 'Abierta Varones', 'club-akd'),
      extTeam('e-law-ab', 'Lawyers', 'Abierta Varones', 'club-lawyers'),
      extTeam('e-cham', 'Chamucos', 'Abierta Varones'),
      extTeam('e-flegal-ab', 'Fuerza Legal', 'Abierta Varones', 'club-legal'),
      extTeam('e-leq-ab', 'Leones Q', 'Abierta Varones', 'club-leonesq'),
      extTeam('e-abog', 'Abogadasos', 'Abierta Varones'),
      extTeam('e-lsport', 'Legal Sport', 'Abierta Varones'),
      extTeam('e-lex', 'Lex Pro FC', 'Abierta Varones'),
      extTeam('e-sanfra-d', 'Sanfra', 'Damas', 'club-sanfra'),
      extTeam('e-elite', 'Elite Legal', 'Damas'),
      extTeam('e-bef', 'Bef', 'Damas'),
      extTeam('e-damasj', 'Damas de la Justicia', 'Damas'),
    ];

    const sat = '2026-11-28';
    const slot = (id: string, cat: Category, time: string, stadium: string, h: string, a: string): Match => ({
      ...makeRegularMatch(id, 1, h, a, 0, 0, sat, cat),
      status: 'SCHEDULED',
      time,
      stadium,
    });
    const otherMatches: Match[] = [
      slot('o1', '+50 Varones', '08:00', 'Cancha 1', 'e-cat', 'e-iura'),
      slot('o2', '+50 Varones', '08:00', 'Cancha 2', 'e-adm', 'e-akd50'),
      slot('o3', 'Abierta Varones', '09:05', 'Cancha 1', 'e-sanfra-ab', 'e-futleg-ab'),
      slot('o4', 'Abierta Varones', '09:05', 'Cancha 2', 'e-boman-ab', 'e-idus-ab'),
      slot('o5', 'Abierta Varones', '12:20', 'Cancha 1', 'e-akd-ab', 'e-law-ab'),
      slot('o6', 'Abierta Varones', '12:20', 'Cancha 2', 'e-cham', 'e-flegal-ab'),
      slot('o7', 'Abierta Varones', '13:25', 'Cancha 1', 'e-leq-ab', 'e-abog'),
      slot('o8', 'Abierta Varones', '13:25', 'Cancha 2', 'e-lsport', 'e-lex'),
      slot('o9', 'Damas', '14:30', 'Cancha 1', 'e-sanfra-d', 'e-elite'),
      slot('o10', 'Damas', '14:30', 'Cancha 2', 'e-bef', 'e-damasj'),
      slot('o11', 'Abierta Varones', '15:35', 'Cancha 1', 'e-abog', 'e-futleg-ab'),
    ];

    const res = generateGroupStageMatches({
      cat: '+40 Varones',
      teams: [...teams, ...extraTeams],
      matches: [...regMatches, ...otherMatches],
      startDate: sat,
    });

    expect(res.unscheduled).toHaveLength(0);
    expect(res.backToBack.filter((b) => b.date === sat)).toEqual([]);
  });

  it('reporta en backToBack cuando un partido seguido del mismo dueno es inevitable', () => {
    const { teams, matches } = buildTenTeamSetup();
    // t3 (Grupo A) y t4 (Grupo B) juegan en la fecha 1; con solo 08:00 y 09:05 libres,
    // no pueden jugar a la misma hora y quedan inevitablemente en 08:00 y 09:05 seguidos.
    teams[2] = { ...teams[2], clubId: 'club-inevitable' };
    teams[3] = { ...teams[3], clubId: 'club-inevitable' };
    const ext: Team = { ...makeTeam('ext-1', 'Ext 1', 'other-a'), category: 'Abierta Varones' };
    const ext2: Team = { ...makeTeam('ext-2', 'Ext 2', 'other-club'), category: 'Abierta Varones' };

    // Dejar libres SOLO 08:00 y 09:05 en 2026-11-28 ocupando todos los demas turnos,
    // y poner a club-inevitable a las 10:10 para forzar 09:05 y 10:10 seguidos.
    const sat = '2026-11-28';
    const times = ['10:10', '11:15', '12:20', '13:25', '14:30', '15:35', '16:40'];
    const blockers: Match[] = [];
    let bIdx = 1;
    for (const time of times) {
      for (const stadium of ['Cancha 1', 'Cancha 2']) {
        const isClubTarget = time === '10:10' && stadium === 'Cancha 1';
        blockers.push({
          ...makeRegularMatch(
            `blk2-${bIdx++}`,
            1,
            isClubTarget ? 'ext-1' : `x${bIdx}a`,
            isClubTarget ? 'ext-2' : `x${bIdx}b`,
            0,
            0,
            sat,
            'Abierta Varones'
          ),
          status: 'SCHEDULED',
          time,
          stadium,
        });
      }
    }

    const res = generateGroupStageMatches({
      cat: '+40 Varones',
      teams: [...teams, ext, ext2],
      matches: [...matches, ...blockers],
      startDate: sat,
    });

    expect(res.backToBack.some((b) => b.date === sat && b.clubId === 'club-inevitable')).toBe(true);
  });

  it('mantiene fijos los integrantes de cada grupo aunque cambie un resultado regular', () => {
    const { teams, matches } = buildTenTeamSetup();
    const res = generateGroupStageMatches({
      cat: '+40 Varones',
      teams,
      matches,
      startDate: '2026-11-28',
    });

    const initialA = getGroupMemberIds('+40 Varones', res.matches, 'A');
    // Invertimos un partido regular para cambiar posiciones entre t1 (Grupo A) y t2 (Grupo B)
    const alteredRegular = matches.map((m) =>
      m.homeTeamId === 't1' && m.awayTeamId === 't2' ? { ...m, homeScore: 0, awayScore: 10 } : m
    );
    const allMatches = [...alteredRegular, ...res.matches];
    const tableA = calculateGroupStandings('+40 Varones', teams, allMatches, 'A');
    expect(tableA.map((s) => s.teamId).sort()).toEqual([...initialA].sort());
  });

  it('buildCreateGroupStageBatch arma el lote completo para un solo applyMatchChanges', () => {
    const { teams, matches } = buildTenTeamSetup();
    const bracket: Match[] = [
      {
        ...makeRegularMatch('c1', 15, '', '', 0, 0, '2026-11-28'),
        status: 'SCHEDULED',
        time: '10:10',
        stadium: 'Cancha 1',
        isPlayoff: true,
        playoffStage: 'CUARTOS',
        bracketSlot: 'C1',
      },
    ];
    const all = [...matches, ...bracket];
    const gen = generateGroupStageMatches({
      cat: '+40 Varones',
      teams,
      matches: all,
      startDate: '2026-11-28',
    });
    const shifted = shiftBracketAfterGroups({
      cat: '+40 Varones',
      matches: all,
      teams,
      lastGroupDate: '2026-12-26',
    });

    const batch = buildCreateGroupStageBatch(all, teams, gen.matches, shifted);
    expect(batch.upserts).toHaveLength(21); // 20 de grupos + 1 de cuartos movido
    expect(batch.nextMatches.some((m) => m.id === 'c1' && m.date === '2027-01-02')).toBe(true);
  });
});
