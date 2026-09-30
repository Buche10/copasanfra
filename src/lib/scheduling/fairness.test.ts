import { describe, it, expect } from 'vitest';
import {
  slotBand,
  fairnessCost,
  buildSlotHistory,
  addToHistory,
  fairnessReport,
  SlotHistory,
} from './fairness';
import {
  normalizeCedula,
  makePairKey,
  sharesPlayers,
  buildSharedPlayerPairs,
  getSharedPlayerPairDetails,
  findSharedPlayerConflicts,
} from './sharedPlayers';
import { createRng, shuffleWith } from './random';
import { rebalanceFutureDates } from './rebalance';
import { Match, Team, Player } from '@/types';

describe('random module', () => {
  it('genera secuencias reproducibles a partir de una misma semilla', () => {
    const rng1 = createRng(12345);
    const rng2 = createRng(12345);
    const values1 = [rng1(), rng1(), rng1()];
    const values2 = [rng2(), rng2(), rng2()];
    expect(values1).toEqual(values2);
  });

  it('mezcla un array sin mutar el original con shuffleWith', () => {
    const original = [1, 2, 3, 4, 5];
    const rng = createRng(42);
    const shuffled = shuffleWith(rng, original);
    expect(original).toEqual([1, 2, 3, 4, 5]);
    expect(shuffled.sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('sharedPlayers module', () => {
  it('normaliza cedula quitando puntos, guiones y espacios', () => {
    expect(normalizeCedula(' 180.429-1823 ')).toBe('1804291823');
    expect(normalizeCedula('')).toBe('');
    expect(normalizeCedula(undefined)).toBe('');
  });

  it('makePairKey genera la misma clave independientemente del orden', () => {
    expect(makePairKey('tA', 'tB')).toBe('tA|tB');
    expect(makePairKey('tB', 'tA')).toBe('tA|tB');
  });

  it('sharesPlayers detecta pares correctamente y rechaza equipo consigo mismo', () => {
    const pairs = new Set(['t1|t2']);
    expect(sharesPlayers(pairs, 't1', 't2')).toBe(true);
    expect(sharesPlayers(pairs, 't2', 't1')).toBe(true);
    expect(sharesPlayers(pairs, 't1', 't3')).toBe(false);
    expect(sharesPlayers(pairs, 't1', 't1')).toBe(false);
  });

  it('buildSharedPlayerPairs normaliza, ignora vacias y REJECTED, y no crea pares consigo mismo', () => {
    const players: Player[] = [
      {
        id: 'p1',
        teamId: 'team-A',
        name: 'Carlos',
        dorsal: 10,
        cedula: '180-123456.7',
        position: 'DEF',
        affiliation: 'Colegio de Abogados',
        registeredAt: '2026-09-01',
        approvalStatus: 'APPROVED',
      },
      {
        id: 'p2',
        teamId: 'team-B',
        name: 'Carlos',
        dorsal: 7,
        cedula: '1801234567',
        position: 'DEL',
        affiliation: 'Colegio de Abogados',
        registeredAt: '2026-09-01',
        approvalStatus: 'APPROVED',
      },
      {
        id: 'p3',
        teamId: 'team-C',
        name: 'Rechazado',
        dorsal: 1,
        cedula: '1801234567',
        position: 'POR',
        affiliation: 'Colegio de Abogados',
        registeredAt: '2026-09-01',
        approvalStatus: 'REJECTED',
      },
      {
        id: 'p4',
        teamId: 'team-A',
        name: 'Mismo Equipo',
        dorsal: 11,
        cedula: '9999999999',
        position: 'MED',
        affiliation: 'Colegio de Abogados',
        registeredAt: '2026-09-01',
        approvalStatus: 'APPROVED',
      },
      {
        id: 'p5',
        teamId: 'team-A',
        name: 'Mismo Equipo 2',
        dorsal: 12,
        cedula: '9999999999',
        position: 'MED',
        affiliation: 'Colegio de Abogados',
        registeredAt: '2026-09-01',
        approvalStatus: 'APPROVED',
      },
      {
        id: 'p6',
        teamId: 'team-D',
        name: 'Sin cedula',
        dorsal: 5,
        cedula: '',
        position: 'DEF',
        affiliation: 'Colegio de Abogados',
        registeredAt: '2026-09-01',
        approvalStatus: 'APPROVED',
      },
    ];

    const pairs = buildSharedPlayerPairs(players);
    expect(pairs.has('team-A|team-B')).toBe(true);
    expect(pairs.has('team-A|team-C')).toBe(false); // p3 rechazado
    expect(pairs.has('team-A|team-A')).toBe(false); // mismo equipo no genera par
    expect(pairs.size).toBe(1);
  });

  it('devuelve conjunto vacio si los jugadores no traen cedula (vista publica)', () => {
    const players: Player[] = [
      {
        id: 'p1',
        teamId: 'team-A',
        name: 'Carlos',
        dorsal: 10,
        position: 'DEF',
        affiliation: 'Colegio de Abogados',
        registeredAt: '2026-09-01',
        approvalStatus: 'APPROVED',
      } as unknown as Player,
    ];
    expect(buildSharedPlayerPairs(players).size).toBe(0);
  });

  it('getSharedPlayerPairDetails genera detalles sin exponer cedulas', () => {
    const teams: Team[] = [
      { id: 't1', name: 'Equipo Uno', shortName: 'E1', category: 'Abierta Varones', logo: 's', primaryColor: '#0', secondaryColor: '#1', delegate: 'D', phone: '1' },
      { id: 't2', name: 'Equipo Dos', shortName: 'E2', category: '+40 Varones', logo: 's', primaryColor: '#0', secondaryColor: '#1', delegate: 'D', phone: '1' },
    ];
    const players: Player[] = [
      { id: 'p1', teamId: 't1', name: 'Juan', dorsal: 1, cedula: '1234', position: 'DEL', affiliation: 'Colegio de Abogados', registeredAt: 'd', approvalStatus: 'APPROVED' },
      { id: 'p2', teamId: 't2', name: 'Juan', dorsal: 2, cedula: '1234', position: 'DEL', affiliation: 'Colegio de Abogados', registeredAt: 'd', approvalStatus: 'APPROVED' },
    ];

    const details = getSharedPlayerPairDetails(players, teams);
    expect(details.length).toBe(1);
    expect(details[0].teamAName).toBe('Equipo Dos'); // ordenado alfabeticamente
    expect(details[0].commonPlayerCount).toBe(1);
  });

  it('findSharedPlayerConflicts detecta simultaneos y consecutivos en fechas futuras', () => {
    const teams: Team[] = [
      { id: 't1', name: 'T1', shortName: 'T1', category: 'Abierta Varones', logo: 's', primaryColor: '#0', secondaryColor: '#1', delegate: 'D', phone: '1' },
      { id: 't2', name: 'T2', shortName: 'T2', category: '+40 Varones', logo: 's', primaryColor: '#0', secondaryColor: '#1', delegate: 'D', phone: '1' },
      { id: 't3', name: 'T3', shortName: 'T3', category: 'Abierta Varones', logo: 's', primaryColor: '#0', secondaryColor: '#1', delegate: 'D', phone: '1' },
      { id: 't4', name: 'T4', shortName: 'T4', category: '+40 Varones', logo: 's', primaryColor: '#0', secondaryColor: '#1', delegate: 'D', phone: '1' },
    ];
    const pairs = new Set(['t1|t2']);
    const matches: Match[] = [
      // Fecha pasada: no debe alertar
      {
        id: 'm1',
        category: 'Abierta Varones',
        round: 1,
        date: '2026-09-01',
        time: '08:00',
        stadium: 'Cancha 1',
        homeTeamId: 't1',
        awayTeamId: 't3',
        homeScore: 0,
        awayScore: 0,
        status: 'FINISHED',
        homeLineup: [],
        awayLineup: [],
        events: [],
        refereeSigned: true,
      },
      {
        id: 'm2',
        category: '+40 Varones',
        round: 1,
        date: '2026-09-01',
        time: '08:00',
        stadium: 'Cancha 2',
        homeTeamId: 't2',
        awayTeamId: 't4',
        homeScore: 0,
        awayScore: 0,
        status: 'FINISHED',
        homeLineup: [],
        awayLineup: [],
        events: [],
        refereeSigned: true,
      },
      // Fecha futura: simultaneo
      {
        id: 'm3',
        category: 'Abierta Varones',
        round: 2,
        date: '2026-10-10',
        time: '09:15',
        stadium: 'Cancha 1',
        homeTeamId: 't1',
        awayTeamId: 't3',
        homeScore: 0,
        awayScore: 0,
        status: 'SCHEDULED',
        homeLineup: [],
        awayLineup: [],
        events: [],
        refereeSigned: false,
      },
      {
        id: 'm4',
        category: '+40 Varones',
        round: 2,
        date: '2026-10-10',
        time: '09:15',
        stadium: 'Cancha 2',
        homeTeamId: 't2',
        awayTeamId: 't4',
        homeScore: 0,
        awayScore: 0,
        status: 'SCHEDULED',
        homeLineup: [],
        awayLineup: [],
        events: [],
        refereeSigned: false,
      },
      // Fecha futura: consecutivo (08:00 y 09:15)
      {
        id: 'm5',
        category: 'Abierta Varones',
        round: 3,
        date: '2026-10-17',
        time: '08:00',
        stadium: 'Cancha 1',
        homeTeamId: 't1',
        awayTeamId: 't3',
        homeScore: 0,
        awayScore: 0,
        status: 'SCHEDULED',
        homeLineup: [],
        awayLineup: [],
        events: [],
        refereeSigned: false,
      },
      {
        id: 'm6',
        category: '+40 Varones',
        round: 3,
        date: '2026-10-17',
        time: '09:15',
        stadium: 'Cancha 2',
        homeTeamId: 't2',
        awayTeamId: 't4',
        homeScore: 0,
        awayScore: 0,
        status: 'SCHEDULED',
        homeLineup: [],
        awayLineup: [],
        events: [],
        refereeSigned: false,
      },
    ];

    const conflicts = findSharedPlayerConflicts(matches, pairs, teams, '2026-09-30');
    expect(conflicts.length).toBe(2);
    expect(conflicts[0].type).toBe('SIMULTANEOUS');
    expect(conflicts[1].type).toBe('CONSECUTIVE');
  });
});

describe('fairness module', () => {
  it('slotBand divide los turnos en tres tercios exactos', () => {
    // Para slotCount = 8:
    // 0, 1, 2 -> 0 (temprano)
    // 3, 4, 5 -> 1 (medio)
    // 6, 7 -> 2 (tarde)
    expect(slotBand(0, 8)).toBe(0);
    expect(slotBand(1, 8)).toBe(0);
    expect(slotBand(2, 8)).toBe(0);
    expect(slotBand(3, 8)).toBe(1);
    expect(slotBand(4, 8)).toBe(1);
    expect(slotBand(5, 8)).toBe(1);
    expect(slotBand(6, 8)).toBe(2);
    expect(slotBand(7, 8)).toBe(2);
    expect(slotBand(0, 0)).toBe(0);
  });

  it('fairnessCost calcula partidos en la franja mas 0.5 por coincidencia exacta', () => {
    // teamA jugo 2 veces en slot 0 y 1 vez en slot 1 (ambos en tercio 0)
    const history: SlotHistory = new Map([
      ['teamA', [2, 1, 0, 0, 0, 0, 0, 0]],
    ]);

    // Para slot 0: franja tiene (2 + 1) = 3 partidos. Exacto en slot 0 = 2. Coste = 3 + 0.5 * 2 = 4.
    expect(fairnessCost(history, 'teamA', 0, 8)).toBe(4);
    // Para slot 1: franja tiene 3 partidos. Exacto en slot 1 = 1. Coste = 3 + 0.5 * 1 = 3.5.
    expect(fairnessCost(history, 'teamA', 1, 8)).toBe(3.5);
    // Para slot 4 (tercio 1): franja tiene 0 partidos. Exacto = 0. Coste = 0.
    expect(fairnessCost(history, 'teamA', 4, 8)).toBe(0);
    // Equipo sin historial
    expect(fairnessCost(history, 'teamB', 0, 8)).toBe(0);
  });

  it('buildSlotHistory y addToHistory sin mutar la entrada', () => {
    const matches: Match[] = [
      {
        id: 'm1',
        category: 'Abierta Varones',
        round: 1,
        date: '2026-09-05',
        time: '08:00', // slot 0
        stadium: 'Cancha 1',
        homeTeamId: 't1',
        awayTeamId: 't2',
        homeScore: 0,
        awayScore: 0,
        status: 'FINISHED',
        homeLineup: [],
        awayLineup: [],
        events: [],
        refereeSigned: true,
      },
    ];

    const h1 = buildSlotHistory(matches, 8);
    expect(h1.get('t1')?.[0]).toBe(1);
    expect(h1.get('t2')?.[0]).toBe(1);

    const h2 = addToHistory(h1, [{ homeTeamId: 't1', awayTeamId: 't3', slotIndex: 1 }], 8);
    // h1 no se muta
    expect(h1.get('t1')?.[1]).toBe(0);
    // h2 contiene el nuevo historial
    expect(h2.get('t1')?.[0]).toBe(1);
    expect(h2.get('t1')?.[1]).toBe(1);
    expect(h2.get('t3')?.[1]).toBe(1);
  });

  it('fairnessReport genera reporte con partidos, porcentajes y turno promedio', () => {
    const teams: Team[] = [
      { id: 't1', name: 'Equipo 1', shortName: 'E1', category: 'Abierta Varones', logo: 's', primaryColor: '#0', secondaryColor: '#1', delegate: 'D', phone: '1' },
      { id: 't2', name: 'Equipo 2', shortName: 'E2', category: 'Abierta Varones', logo: 's', primaryColor: '#0', secondaryColor: '#1', delegate: 'D', phone: '1' },
    ];
    const matches: Match[] = [
      // t1 juega a las 08:00 (slot 0)
      {
        id: 'm1',
        category: 'Abierta Varones',
        round: 1,
        date: '2026-09-05',
        time: '08:00',
        stadium: 'Cancha 1',
        homeTeamId: 't1',
        awayTeamId: 't2',
        homeScore: 0,
        awayScore: 0,
        status: 'FINISHED',
        homeLineup: [],
        awayLineup: [],
        events: [],
        refereeSigned: true,
      },
      // t1 juega a las 16:45 (slot 7)
      {
        id: 'm2',
        category: 'Abierta Varones',
        round: 2,
        date: '2026-09-12',
        time: '16:45',
        stadium: 'Cancha 1',
        homeTeamId: 't1',
        awayTeamId: 't2',
        homeScore: 0,
        awayScore: 0,
        status: 'SCHEDULED',
        homeLineup: [],
        awayLineup: [],
        events: [],
        refereeSigned: false,
      },
    ];

    const report = fairnessReport(matches, teams, 8);
    expect(report.length).toBe(2);
    const r1 = report.find((r) => r.teamId === 't1')!;
    expect(r1.matchesCount).toBe(2);
    expect(r1.earlyPct).toBe(50); // 1 de 2 a las 08:00
    expect(r1.latePct).toBe(50);  // 1 de 2 a las 16:45
    expect(r1.avgSlot).toBe(3.5); // (0 + 7) / 2
  });
});

describe('rebalanceFutureDates', () => {
  it('no cambia ninguna fecha pasada ni fechas con partidos que no esten SCHEDULED', () => {
    const teams: Team[] = [
      { id: 't1', name: 'Equipo 1', shortName: 'E1', category: 'Abierta Varones', logo: 's', primaryColor: '#0', secondaryColor: '#1', delegate: 'D', phone: '1' },
      { id: 't2', name: 'Equipo 2', shortName: 'E2', category: 'Abierta Varones', logo: 's', primaryColor: '#0', secondaryColor: '#1', delegate: 'D', phone: '1' },
      { id: 't3', name: 'Equipo 3', shortName: 'E3', category: 'Abierta Varones', logo: 's', primaryColor: '#0', secondaryColor: '#1', delegate: 'D', phone: '1' },
      { id: 't4', name: 'Equipo 4', shortName: 'E4', category: 'Abierta Varones', logo: 's', primaryColor: '#0', secondaryColor: '#1', delegate: 'D', phone: '1' },
    ];
    const matches: Match[] = [
      // Pasada (2026-09-05 <= 2026-09-30)
      {
        id: 'm1',
        category: 'Abierta Varones',
        round: 1,
        date: '2026-09-05',
        time: '08:00',
        stadium: 'Cancha 1',
        homeTeamId: 't1',
        awayTeamId: 't2',
        homeScore: 1,
        awayScore: 0,
        status: 'FINISHED',
        homeLineup: [],
        awayLineup: [],
        events: [],
        refereeSigned: true,
      },
      // Futura pero ya en curso
      {
        id: 'm2',
        category: 'Abierta Varones',
        round: 2,
        date: '2026-10-03',
        time: '08:00',
        stadium: 'Cancha 1',
        homeTeamId: 't1',
        awayTeamId: 't3',
        homeScore: 0,
        awayScore: 0,
        status: 'IN_PROGRESS',
        homeLineup: [],
        awayLineup: [],
        events: [],
        refereeSigned: false,
      },
      // Futura totalmente SCHEDULED
      {
        id: 'm3',
        category: 'Abierta Varones',
        round: 3,
        date: '2026-10-10',
        time: '14:15',
        stadium: 'Cancha 1',
        homeTeamId: 't1',
        awayTeamId: 't4',
        homeScore: 0,
        awayScore: 0,
        status: 'SCHEDULED',
        homeLineup: [],
        awayLineup: [],
        events: [],
        refereeSigned: false,
      },
      {
        id: 'm4',
        category: 'Abierta Varones',
        round: 3,
        date: '2026-10-10',
        time: '15:30',
        stadium: 'Cancha 2',
        homeTeamId: 't2',
        awayTeamId: 't3',
        homeScore: 0,
        awayScore: 0,
        status: 'SCHEDULED',
        homeLineup: [],
        awayLineup: [],
        events: [],
        refereeSigned: false,
      },
    ];

    const result = rebalanceFutureDates(matches, teams, [], [], '2026-09-30');
    // Las fechas 2026-09-05 y 2026-10-03 deben quedar exactamente iguales
    const resM1 = result.matches.find((m) => m.id === 'm1')!;
    const resM2 = result.matches.find((m) => m.id === 'm2')!;
    expect(resM1.time).toBe('08:00');
    expect(resM1.stadium).toBe('Cancha 1');
    expect(resM2.time).toBe('08:00');
    expect(resM2.stadium).toBe('Cancha 1');

    // La fecha 2026-10-10 es reequilibrada y llena desde el turno 0 (08:00)
    const resM3 = result.matches.find((m) => m.id === 'm3')!;
    const resM4 = result.matches.find((m) => m.id === 'm4')!;
    const resTimes = [resM3.time, resM4.time].sort();
    expect(resTimes[0]).toBe('08:00');
    expect(result.changed).toBe(2);
  });
});
