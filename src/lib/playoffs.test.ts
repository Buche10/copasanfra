import { describe, it, expect } from 'vitest';
import { Category, Match, Team } from '@/types';
import { changedPlayoffMatches, recomputePlayoffs } from './playoffs';

function makeTeam(id: string, category: Category): Team {
  return {
    id,
    name: id,
    shortName: id,
    category,
    logo: 'shield',
    primaryColor: '#00A859',
    secondaryColor: '#0f172a',
    delegate: 'D',
    phone: '0999999999',
  };
}

function makeMatch(
  id: string,
  category: Category,
  round: number,
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number,
  awayScore: number,
  status: Match['status'] = 'FINISHED',
  extra: Partial<Match> = {}
): Match {
  return {
    id,
    category,
    round,
    date: '2026-11-28',
    time: '08:00',
    stadium: 'Cancha 1',
    homeTeamId,
    awayTeamId,
    homeScore,
    awayScore,
    status,
    homeLineup: [],
    awayLineup: [],
    events: [],
    refereeSigned: true,
    ...extra,
  };
}

function buildGroupCategoryData(groupsFinished: boolean) {
  const teams = Array.from({ length: 10 }, (_, i) => makeTeam(`t${i + 1}`, '+40 Varones'));
  const regular: Match[] = [];
  let idx = 1;
  for (let i = 0; i < 10; i++) {
    for (let j = i + 1; j < 10; j++) {
      regular.push(makeMatch(`r-${idx++}`, '+40 Varones', 1, `t${i + 1}`, `t${j + 1}`, 1, 0));
    }
  }
  // Grupo A: t1, t3, t5, t7, t9; Grupo B: t2, t4, t6, t8, t10
  // Si todos empatan 0-0 en grupos, el orden queda por regularPosition:
  // A: t1, t3, t5, t7, t9; B: t2, t4, t6, t8, t10
  const status: Match['status'] = groupsFinished ? 'FINISHED' : 'SCHEDULED';
  const groupMatches: Match[] = [
    makeMatch('ga1', '+40 Varones', 10, 't1', 't3', 0, 0, status, { isPlayoff: true, playoffStage: 'GRUPOS', groupName: 'A' }),
    makeMatch('ga2', '+40 Varones', 10, 't5', 't7', 0, 0, status, { isPlayoff: true, playoffStage: 'GRUPOS', groupName: 'A' }),
    makeMatch('ga3', '+40 Varones', 11, 't9', 't1', 0, 0, status, { isPlayoff: true, playoffStage: 'GRUPOS', groupName: 'A' }),
    makeMatch('gb1', '+40 Varones', 10, 't2', 't4', 0, 0, status, { isPlayoff: true, playoffStage: 'GRUPOS', groupName: 'B' }),
    makeMatch('gb2', '+40 Varones', 10, 't6', 't8', 0, 0, status, { isPlayoff: true, playoffStage: 'GRUPOS', groupName: 'B' }),
    makeMatch('gb3', '+40 Varones', 11, 't10', 't2', 0, 0, status, { isPlayoff: true, playoffStage: 'GRUPOS', groupName: 'B' }),
  ];

  const bracket: Match[] = [
    makeMatch('c1', '+40 Varones', 15, '', '', 0, 0, 'SCHEDULED', { isPlayoff: true, playoffStage: 'CUARTOS', bracketSlot: 'C1' }),
    makeMatch('c2', '+40 Varones', 15, '', '', 0, 0, 'SCHEDULED', { isPlayoff: true, playoffStage: 'CUARTOS', bracketSlot: 'C2' }),
    makeMatch('c3', '+40 Varones', 15, '', '', 0, 0, 'SCHEDULED', { isPlayoff: true, playoffStage: 'CUARTOS', bracketSlot: 'C3' }),
    makeMatch('c4', '+40 Varones', 15, '', '', 0, 0, 'SCHEDULED', { isPlayoff: true, playoffStage: 'CUARTOS', bracketSlot: 'C4' }),
    makeMatch('s1', '+40 Varones', 16, '', '', 0, 0, 'SCHEDULED', { isPlayoff: true, playoffStage: 'SEMIS', bracketSlot: 'S1' }),
    makeMatch('s2', '+40 Varones', 16, '', '', 0, 0, 'SCHEDULED', { isPlayoff: true, playoffStage: 'SEMIS', bracketSlot: 'S2' }),
    makeMatch('f1', '+40 Varones', 17, '', '', 0, 0, 'SCHEDULED', { isPlayoff: true, playoffStage: 'FINAL', bracketSlot: 'F' }),
  ];

  return { teams, matches: [...regular, ...groupMatches, ...bracket] };
}

describe('recomputePlayoffs con fase de grupos', () => {
  it('con los grupos incompletos, los cruces quedan vacios', () => {
    const { teams, matches } = buildGroupCategoryData(false);
    const out = recomputePlayoffs(matches, teams);
    for (const slot of ['C1', 'C2', 'C3', 'C4']) {
      const m = out.find((x) => x.bracketSlot === slot)!;
      expect(m.homeTeamId).toBe('');
      expect(m.awayTeamId).toBe('');
    }
  });

  it('con los grupos completos arma 1A-4B, 2A-3B, 3A-2B, 4A-1B y semis G(C1)-G(C3), G(C2)-G(C4)', () => {
    const { teams, matches } = buildGroupCategoryData(true);
    const out = recomputePlayoffs(matches, teams);

    // Grupo A: 1A=t1, 2A=t3, 3A=t5, 4A=t7
    // Grupo B: 1B=t2, 2B=t4, 3B=t6, 4B=t8
    expect(out.find((x) => x.bracketSlot === 'C1')).toMatchObject({ homeTeamId: 't1', awayTeamId: 't8' });
    expect(out.find((x) => x.bracketSlot === 'C2')).toMatchObject({ homeTeamId: 't3', awayTeamId: 't6' });
    expect(out.find((x) => x.bracketSlot === 'C3')).toMatchObject({ homeTeamId: 't5', awayTeamId: 't4' });
    expect(out.find((x) => x.bracketSlot === 'C4')).toMatchObject({ homeTeamId: 't7', awayTeamId: 't2' });

    // Ganadores de C1..C4 avanzan a S1 = G(C1) vs G(C3) y S2 = G(C2) vs G(C4)
    const withQuarterResults = out.map((m) => {
      if (m.bracketSlot === 'C1') return { ...m, homeScore: 2, awayScore: 0, status: 'FINISHED' as const };
      if (m.bracketSlot === 'C2') return { ...m, homeScore: 1, awayScore: 0, status: 'FINISHED' as const };
      if (m.bracketSlot === 'C3') return { ...m, homeScore: 0, awayScore: 1, status: 'FINISHED' as const };
      if (m.bracketSlot === 'C4') return { ...m, homeScore: 0, awayScore: 3, status: 'FINISHED' as const };
      return m;
    });

    const semisOut = recomputePlayoffs(withQuarterResults, teams);
    expect(semisOut.find((x) => x.bracketSlot === 'S1')).toMatchObject({ homeTeamId: 't1', awayTeamId: 't4' });
    expect(semisOut.find((x) => x.bracketSlot === 'S2')).toMatchObject({ homeTeamId: 't3', awayTeamId: 't2' });
  });

  it('una categoria sin grupos mantiene 1v8..4v5 y semis G(C1)-G(C4), G(C2)-G(C3), y no toca partidos FINISHED', () => {
    const teams = Array.from({ length: 8 }, (_, i) => makeTeam(`a${i + 1}`, 'Abierta Varones'));
    const regular: Match[] = [];
    let idx = 1;
    for (let i = 0; i < 8; i++) {
      for (let j = i + 1; j < 8; j++) {
        regular.push(makeMatch(`ar-${idx++}`, 'Abierta Varones', 1, `a${i + 1}`, `a${j + 1}`, 1, 0));
      }
    }
    const bracket: Match[] = [
      makeMatch('ac1', 'Abierta Varones', 10, 'a1', 'a8', 2, 0, 'FINISHED', { isPlayoff: true, playoffStage: 'CUARTOS', bracketSlot: 'C1' }),
      makeMatch('ac2', 'Abierta Varones', 10, 'a2', 'a7', 1, 0, 'FINISHED', { isPlayoff: true, playoffStage: 'CUARTOS', bracketSlot: 'C2' }),
      makeMatch('ac3', 'Abierta Varones', 10, 'a3', 'a6', 1, 0, 'FINISHED', { isPlayoff: true, playoffStage: 'CUARTOS', bracketSlot: 'C3' }),
      makeMatch('ac4', 'Abierta Varones', 10, 'a4', 'a5', 1, 0, 'FINISHED', { isPlayoff: true, playoffStage: 'CUARTOS', bracketSlot: 'C4' }),
      makeMatch('as1', 'Abierta Varones', 11, '', '', 0, 0, 'SCHEDULED', { isPlayoff: true, playoffStage: 'SEMIS', bracketSlot: 'S1' }),
      makeMatch('as2', 'Abierta Varones', 11, '', '', 0, 0, 'SCHEDULED', { isPlayoff: true, playoffStage: 'SEMIS', bracketSlot: 'S2' }),
    ];

    const out = recomputePlayoffs([...regular, ...bracket], teams);
    expect(out.find((x) => x.id === 'ac1')).toMatchObject({ homeTeamId: 'a1', awayTeamId: 'a8' });
    expect(out.find((x) => x.id === 'as1')).toMatchObject({ homeTeamId: 'a1', awayTeamId: 'a4' });
    expect(out.find((x) => x.id === 'as2')).toMatchObject({ homeTeamId: 'a2', awayTeamId: 'a3' });
  });

  it('resuelve empates con winnerTeamId, arma final directa en Damas/+50 y reporta changedPlayoffMatches', () => {
    const teams = [makeTeam('d1', 'Damas'), makeTeam('d2', 'Damas'), makeTeam('d3', 'Damas')];
    const reg = [
      makeMatch('dr1', 'Damas', 1, 'd1', 'd2', 2, 0),
      makeMatch('dr2', 'Damas', 2, 'd1', 'd3', 1, 0),
      makeMatch('dr3', 'Damas', 3, 'd2', 'd3', 1, 0),
    ];
    const finalMatch = makeMatch('df', 'Damas', 4, '', '', 0, 0, 'SCHEDULED', {
      isPlayoff: true,
      playoffStage: 'FINAL',
      bracketSlot: 'F',
    });
    const before = [...reg, finalMatch];
    const after = recomputePlayoffs(before, teams);
    expect(after.find((x) => x.id === 'df')).toMatchObject({ homeTeamId: 'd1', awayTeamId: 'd2' });
    expect(changedPlayoffMatches(before, after).map((x) => x.id)).toEqual(['df']);

    // Empate en semifinal con winnerTeamId
    const { teams: gTeams, matches: gMatches } = buildGroupCategoryData(true);
    const withTie = recomputePlayoffs(gMatches, gTeams).map((m) => {
      if (m.bracketSlot === 'C1') return { ...m, homeScore: 1, awayScore: 1, status: 'FINISHED' as const, winnerTeamId: 't8' };
      if (m.bracketSlot === 'C3') return { ...m, homeScore: 1, awayScore: 1, status: 'FINISHED' as const };
      return m;
    });
    const outTie = recomputePlayoffs(withTie, gTeams);
    expect(outTie.find((x) => x.bracketSlot === 'S1')).toMatchObject({ homeTeamId: 't8', awayTeamId: '' });
    // changedPlayoffMatches ignora partidos regulares
    expect(changedPlayoffMatches(before, after.map((m) => (m.id === 'dr1' ? { ...m, homeTeamId: 'x' } : m))).map((x) => x.id)).toEqual(['df']);
  });

  it('maneja categorias con menos equipos de los esperados en cuartos, grupos y final directa', () => {
    // 2 equipos en grupos completos -> C2..C4 quedan con '' en slots faltantes
    const gTeams = [makeTeam('g1', '+40 Varones'), makeTeam('g2', '+40 Varones')];
    const gMatches: Match[] = [
      makeMatch('gr1', '+40 Varones', 1, 'g1', 'g2', 1, 0),
      makeMatch('gg1', '+40 Varones', 2, 'g1', 'g2', 1, 0, 'FINISHED', { isPlayoff: true, playoffStage: 'GRUPOS', groupName: 'A' }),
      makeMatch('gc1', '+40 Varones', 3, '', '', 0, 0, 'SCHEDULED', { isPlayoff: true, playoffStage: 'CUARTOS', bracketSlot: 'C1' }),
      makeMatch('gc2', '+40 Varones', 3, '', '', 0, 0, 'SCHEDULED', { isPlayoff: true, playoffStage: 'CUARTOS', bracketSlot: 'C2' }),
      makeMatch('gc3', '+40 Varones', 3, '', '', 0, 0, 'SCHEDULED', { isPlayoff: true, playoffStage: 'CUARTOS', bracketSlot: 'C3' }),
      makeMatch('gc4', '+40 Varones', 3, '', '', 0, 0, 'SCHEDULED', { isPlayoff: true, playoffStage: 'CUARTOS', bracketSlot: 'C4' }),
    ];
    const gOut = recomputePlayoffs(gMatches, gTeams);
    expect(gOut.find((x) => x.id === 'gc1')).toMatchObject({ homeTeamId: 'g1', awayTeamId: '' });
    expect(gOut.find((x) => x.id === 'gc4')).toMatchObject({ homeTeamId: '', awayTeamId: '' });

    // 2 equipos en Abierta sin grupos -> C1..C4 usan '' para puestos faltantes
    const aTeams = [makeTeam('a1', 'Abierta Varones')];
    const aMatches: Match[] = [
      makeMatch('ar1', 'Abierta Varones', 1, 'a1', 'a1', 0, 0),
      makeMatch('ac1', 'Abierta Varones', 2, '', '', 0, 0, 'SCHEDULED', { isPlayoff: true, playoffStage: 'CUARTOS', bracketSlot: 'C1' }),
      makeMatch('ac4', 'Abierta Varones', 2, '', '', 0, 0, 'SCHEDULED', { isPlayoff: true, playoffStage: 'CUARTOS', bracketSlot: 'C4' }),
    ];
    const aOut = recomputePlayoffs(aMatches, aTeams);
    expect(aOut.find((x) => x.id === 'ac1')).toMatchObject({ homeTeamId: 'a1', awayTeamId: '' });

    // 0 equipos en Damas final -> usa '' para ambos
    const dOut = recomputePlayoffs(
      [makeMatch('df', 'Damas', 1, '', '', 0, 0, 'SCHEDULED', { isPlayoff: true, playoffStage: 'FINAL', bracketSlot: 'F' })],
      []
    );
    expect(dOut[0]).toMatchObject({ homeTeamId: '', awayTeamId: '' });
  });
});
