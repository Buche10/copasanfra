import { describe, it, expect } from 'vitest';
import {
  YELLOWS_FOR_SUSPENSION,
  DOUBLE_YELLOW_MATCHES,
  DIRECT_RED_MATCHES,
  classifyPlayerCards,
  orderTeamMatches,
  computeCardSuspension,
  calculateSanctions,
  formatPendingSanction,
  countDoubleYellowYellows,
} from './sanctions';
import { Match, MatchEvent, Player, Team } from '@/types';

describe('sanctions', () => {
  const teamA: Team = {
    id: 'team-a',
    name: 'Equipo A',
    shortName: 'EQA',
    category: 'Abierta Varones',
    logo: 'shield',
    primaryColor: '#00A859',
    secondaryColor: '#FFFFFF',
    delegate: 'Delegado A',
    phone: '0999999991',
  };

  const teamB: Team = {
    id: 'team-b',
    name: 'Equipo B',
    shortName: 'EQB',
    category: 'Abierta Varones',
    logo: 'shield',
    primaryColor: '#00A859',
    secondaryColor: '#FFFFFF',
    delegate: 'Delegado B',
    phone: '0999999992',
  };

  const teamC: Team = {
    id: 'team-c',
    name: 'Equipo C',
    shortName: 'EQC',
    category: 'Abierta Varones',
    logo: 'shield',
    primaryColor: '#00A859',
    secondaryColor: '#FFFFFF',
    delegate: 'Delegado C',
    phone: '0999999993',
  };

  const player1: Player = {
    id: 'p-1',
    teamId: 'team-a',
    name: 'Juan Perez',
    cedula: '1801234567',
    dorsal: 10,
    position: 'DEL',
    affiliation: 'Colegio de Abogados',
    approvalStatus: 'APPROVED',
  };

  function createMatch(
    id: string,
    round: number,
    date: string,
    time: string,
    homeTeamId: string,
    awayTeamId: string,
    status: Match['status'],
    events: MatchEvent[] = []
  ): Match {
    return {
      id,
      category: 'Abierta Varones',
      round,
      date,
      time,
      stadium: 'Cancha 1',
      homeTeamId,
      awayTeamId,
      homeScore: 0,
      awayScore: 0,
      status,
      homeLineup: [],
      awayLineup: [],
      events,
    };
  }

  function yellowEvent(matchId: string, playerId: string, minute = 10): MatchEvent {
    return {
      id: `ev-${crypto.randomUUID()}`,
      matchId,
      minute,
      type: 'YELLOW_CARD',
      teamId: 'team-a',
      playerId,
    };
  }

  function redEvent(
    matchId: string,
    playerId: string,
    isDoubleYellow = false,
    minute = 80
  ): MatchEvent {
    return {
      id: `ev-${crypto.randomUUID()}`,
      matchId,
      minute,
      type: 'RED_CARD',
      teamId: 'team-a',
      playerId,
      isDoubleYellow,
    };
  }

  describe('Constantes', () => {
    it('define los valores oficiales de las reglas disciplinarias', () => {
      expect(YELLOWS_FOR_SUSPENSION).toBe(5);
      expect(DOUBLE_YELLOW_MATCHES).toBe(1);
      expect(DIRECT_RED_MATCHES).toBe(2);
    });
  });

  describe('classifyPlayerCards', () => {
    it('clasifica 1 amarilla sin tarjeta roja como 1 amarilla acumulable', () => {
      const match = createMatch('m-1', 1, '2026-10-03', '08:00', 'team-a', 'team-b', 'FINISHED', [
        yellowEvent('m-1', 'p-1'),
      ]);
      const res = classifyPlayerCards(match, 'p-1');
      expect(res).toEqual({
        accumulableYellows: 1,
        doubleYellow: false,
        directRed: false,
      });
    });

    it('clasifica 2 amarillas en el mismo partido como doble amarilla (no acumulan)', () => {
      const match = createMatch('m-1', 1, '2026-10-03', '08:00', 'team-a', 'team-b', 'FINISHED', [
        yellowEvent('m-1', 'p-1', 15),
        yellowEvent('m-1', 'p-1', 70),
      ]);
      const res = classifyPlayerCards(match, 'p-1');
      expect(res).toEqual({
        accumulableYellows: 0,
        doubleYellow: true,
        directRed: false,
      });
    });

    it('clasifica RED_CARD con isDoubleYellow como doble amarilla y no acumula amarilla previa', () => {
      const match = createMatch('m-1', 1, '2026-10-03', '08:00', 'team-a', 'team-b', 'FINISHED', [
        yellowEvent('m-1', 'p-1', 20),
        redEvent('m-1', 'p-1', true, 60),
      ]);
      const res = classifyPlayerCards(match, 'p-1');
      expect(res).toEqual({
        accumulableYellows: 0,
        doubleYellow: true,
        directRed: false,
      });
    });

    it('clasifica roja directa sin amarilla previa', () => {
      const match = createMatch('m-1', 1, '2026-10-03', '08:00', 'team-a', 'team-b', 'FINISHED', [
        redEvent('m-1', 'p-1', false, 30),
      ]);
      const res = classifyPlayerCards(match, 'p-1');
      expect(res).toEqual({
        accumulableYellows: 0,
        doubleYellow: false,
        directRed: true,
      });
    });

    it('clasifica roja directa con exactamente 1 amarilla previa: la amarilla si acumula', () => {
      const match = createMatch('m-1', 1, '2026-10-03', '08:00', 'team-a', 'team-b', 'FINISHED', [
        yellowEvent('m-1', 'p-1', 10),
        redEvent('m-1', 'p-1', false, 85),
      ]);
      const res = classifyPlayerCards(match, 'p-1');
      expect(res).toEqual({
        accumulableYellows: 1,
        doubleYellow: false,
        directRed: true,
      });
    });
  });

  describe('orderTeamMatches', () => {
    it('filtra solo partidos FINISHED del equipo y los ordena cronologicamente', () => {
      const matches: Match[] = [
        createMatch('m-3', 3, '2026-10-17', '10:30', 'team-a', 'team-b', 'FINISHED'),
        createMatch('m-1', 1, '2026-10-03', '09:15', 'team-b', 'team-a', 'FINISHED'),
        createMatch('m-prog', 4, '2026-10-24', '08:00', 'team-a', 'team-b', 'SCHEDULED'),
        createMatch('m-inp', 5, '2026-10-24', '09:15', 'team-a', 'team-b', 'IN_PROGRESS'),
        createMatch('m-2', 2, '2026-10-10', '08:00', 'team-a', 'team-c', 'FINISHED'),
        createMatch('m-other', 1, '2026-10-03', '08:00', 'team-b', 'team-c', 'FINISHED'),
      ];

      const ordered = orderTeamMatches(matches, 'team-a');
      expect(ordered.map((m) => m.id)).toEqual(['m-1', 'm-2', 'm-3']);
    });

    it('ordena partidos de la misma fecha por slot de hora y luego round', () => {
      const matches: Match[] = [
        createMatch('m-b', 1, '2026-10-03', '10:30', 'team-a', 'team-b', 'FINISHED'),
        createMatch('m-a', 1, '2026-10-03', '08:00', 'team-a', 'team-c', 'FINISHED'),
        createMatch('m-c', 2, '2026-10-03', '', 'team-a', 'team-b', 'FINISHED'),
      ];
      const ordered = orderTeamMatches(matches, 'team-a');
      expect(ordered.map((m) => m.id)).toEqual(['m-a', 'm-b', 'm-c']);
    });
  });

  describe('computeCardSuspension y decisiones de negocio', () => {
    it('4 amarillas en 4 partidos: no suspendido, yellowsTowardNext = 4', () => {
      const matches = [
        createMatch('m-1', 1, '2026-10-03', '08:00', 'team-a', 'team-b', 'FINISHED', [
          yellowEvent('m-1', 'p-1'),
        ]),
        createMatch('m-2', 2, '2026-10-10', '08:00', 'team-a', 'team-b', 'FINISHED', [
          yellowEvent('m-2', 'p-1'),
        ]),
        createMatch('m-3', 3, '2026-10-17', '08:00', 'team-a', 'team-b', 'FINISHED', [
          yellowEvent('m-3', 'p-1'),
        ]),
        createMatch('m-4', 4, '2026-10-24', '08:00', 'team-a', 'team-b', 'FINISHED', [
          yellowEvent('m-4', 'p-1'),
        ]),
      ];

      const res = computeCardSuspension('p-1', matches);
      expect(res.pending).toBe(0);
      expect(res.yellowCycle).toBe(4);
      expect(res.reasons).toEqual([]);
    });

    it('5.ª amarilla en el partido 5: suspendido 1 partido. Tras el partido 6 terminado: ya no suspendido y yellowsTowardNext = 0', () => {
      const matches5 = [
        createMatch('m-1', 1, '2026-10-03', '08:00', 'team-a', 'team-b', 'FINISHED', [
          yellowEvent('m-1', 'p-1'),
        ]),
        createMatch('m-2', 2, '2026-10-10', '08:00', 'team-a', 'team-b', 'FINISHED', [
          yellowEvent('m-2', 'p-1'),
        ]),
        createMatch('m-3', 3, '2026-10-17', '08:00', 'team-a', 'team-b', 'FINISHED', [
          yellowEvent('m-3', 'p-1'),
        ]),
        createMatch('m-4', 4, '2026-10-24', '08:00', 'team-a', 'team-b', 'FINISHED', [
          yellowEvent('m-4', 'p-1'),
        ]),
        createMatch('m-5', 5, '2026-10-31', '08:00', 'team-a', 'team-b', 'FINISHED', [
          yellowEvent('m-5', 'p-1'),
        ]),
      ];

      const resAfter5 = computeCardSuspension('p-1', matches5);
      expect(resAfter5.pending).toBe(1);
      expect(resAfter5.yellowCycle).toBe(0);
      expect(resAfter5.reasons).toEqual([
        '5 amarillas acumuladas (la quinta en la fecha 5 contra rival): 1 fecha por cumplir',
      ]);

      // Se juega el partido 6 (el jugador cumple su sancion)
      const matches6 = [
        ...matches5,
        createMatch('m-6', 6, '2026-11-07', '08:00', 'team-a', 'team-b', 'FINISHED', []),
      ];

      const resAfter6 = computeCardSuspension('p-1', matches6);
      expect(resAfter6.pending).toBe(0);
      expect(resAfter6.yellowCycle).toBe(0);
      expect(resAfter6.reasons).toEqual([]);
    });

    it('10 amarillas repartidas: dos suspensiones de 1 partido, cada una cumplida con el partido siguiente', () => {
      const matches: Match[] = [];
      // Fechas 1 a 5 con amarilla -> sancion en fecha 5
      for (let i = 1; i <= 5; i++) {
        matches.push(
          createMatch(`m-${i}`, i, `2026-10-${i.toString().padStart(2, '0')}`, '08:00', 'team-a', 'team-b', 'FINISHED', [
            yellowEvent(`m-${i}`, 'p-1'),
          ])
        );
      }
      expect(computeCardSuspension('p-1', matches).pending).toBe(1);

      // Fecha 6: se cumple la sancion
      matches.push(
        createMatch('m-6', 6, '2026-10-06', '08:00', 'team-a', 'team-b', 'FINISHED', [])
      );
      expect(computeCardSuspension('p-1', matches).pending).toBe(0);

      // Fechas 7 a 11 con amarilla -> segunda sancion en fecha 11
      for (let i = 7; i <= 11; i++) {
        matches.push(
          createMatch(`m-${i}`, i, `2026-10-${i.toString().padStart(2, '0')}`, '08:00', 'team-a', 'team-b', 'FINISHED', [
            yellowEvent(`m-${i}`, 'p-1'),
          ])
        );
      }
      expect(computeCardSuspension('p-1', matches).pending).toBe(1);
      expect(computeCardSuspension('p-1', matches).yellowCycle).toBe(0);

      // Fecha 12: se cumple la segunda sancion
      matches.push(
        createMatch('m-12', 12, '2026-10-12', '08:00', 'team-a', 'team-b', 'FINISHED', [])
      );
      expect(computeCardSuspension('p-1', matches).pending).toBe(0);
      expect(computeCardSuspension('p-1', matches).yellowCycle).toBe(0);
    });

    it('Doble amarilla (2 eventos YELLOW_CARD en el mismo partido): 1 partido; esas 2 no suman al acumulado (4 amarillas previas + doble amarilla -> ciclo sigue en 4)', () => {
      const matches = [
        createMatch('m-1', 1, '2026-10-01', '08:00', 'team-a', 'team-b', 'FINISHED', [yellowEvent('m-1', 'p-1')]),
        createMatch('m-2', 2, '2026-10-02', '08:00', 'team-a', 'team-b', 'FINISHED', [yellowEvent('m-2', 'p-1')]),
        createMatch('m-3', 3, '2026-10-03', '08:00', 'team-a', 'team-b', 'FINISHED', [yellowEvent('m-3', 'p-1')]),
        createMatch('m-4', 4, '2026-10-04', '08:00', 'team-a', 'team-b', 'FINISHED', [yellowEvent('m-4', 'p-1')]),
        // Partido 5: doble amarilla por 2 eventos YELLOW_CARD
        createMatch('m-5', 5, '2026-10-05', '08:00', 'team-a', 'team-b', 'FINISHED', [
          yellowEvent('m-5', 'p-1', 30),
          yellowEvent('m-5', 'p-1', 75),
        ]),
      ];

      const res = computeCardSuspension('p-1', matches);
      expect(res.pending).toBe(1);
      expect(res.yellowCycle).toBe(4);
      expect(res.reasons).toEqual(['Doble amarilla en la fecha 5 contra rival: 1 fecha por cumplir']);
    });

    it('RED_CARD con isDoubleYellow: true y 1 amarilla en el mismo partido: 1 partido, la amarilla no suma', () => {
      const matches = [
        createMatch('m-1', 1, '2026-10-01', '08:00', 'team-a', 'team-b', 'FINISHED', [yellowEvent('m-1', 'p-1')]),
        createMatch('m-2', 2, '2026-10-02', '08:00', 'team-a', 'team-b', 'FINISHED', [
          yellowEvent('m-2', 'p-1', 20),
          redEvent('m-2', 'p-1', true, 60),
        ]),
      ];

      const res = computeCardSuspension('p-1', matches);
      expect(res.pending).toBe(1);
      expect(res.yellowCycle).toBe(1); // Solo la amarilla del partido 1 suma
      expect(res.reasons).toEqual(['Doble amarilla en la fecha 2 contra rival: 1 fecha por cumplir']);
    });

    it('Roja directa: 2 partidos; tras 1 partido terminado queda 1; tras 2 queda 0', () => {
      const match1 = createMatch('m-1', 1, '2026-10-01', '08:00', 'team-a', 'team-b', 'FINISHED', [
        redEvent('m-1', 'p-1', false),
      ]);
      const res1 = computeCardSuspension('p-1', [match1]);
      expect(res1.pending).toBe(2);
      expect(res1.reasons).toEqual(['Roja directa en la fecha 1 contra rival: 2 fechas por cumplir']);

      // Tras 1 partido terminado
      const match2 = createMatch('m-2', 2, '2026-10-08', '08:00', 'team-a', 'team-c', 'FINISHED', []);
      const res2 = computeCardSuspension('p-1', [match1, match2]);
      expect(res2.pending).toBe(1);
      expect(res2.reasons).toEqual(['Roja directa en la fecha 1 contra rival: 1 fecha por cumplir']);

      // Tras 2 partidos terminados
      const match3 = createMatch('m-3', 3, '2026-10-15', '08:00', 'team-a', 'team-b', 'FINISHED', []);
      const res3 = computeCardSuspension('p-1', [match1, match2, match3]);
      expect(res3.pending).toBe(0);
      expect(res3.reasons).toEqual([]);
    });

    it('Amarilla y roja directa en el mismo partido: 2 partidos y la amarilla suma 1 al ciclo', () => {
      const match = createMatch('m-1', 1, '2026-10-01', '08:00', 'team-a', 'team-b', 'FINISHED', [
        yellowEvent('m-1', 'p-1', 25),
        redEvent('m-1', 'p-1', false, 80),
      ]);
      const res = computeCardSuspension('p-1', [match]);
      expect(res.pending).toBe(2);
      expect(res.yellowCycle).toBe(1);
      expect(res.reasons).toEqual(['Roja directa en la fecha 1 contra rival: 2 fechas por cumplir']);
    });

    it('Doble amarilla y roja directa en el mismo partido: 2 partidos (manda la roja) y las amarillas no suman al ciclo', () => {
      const match = createMatch('m-1', 1, '2026-10-01', '08:00', 'team-a', 'team-b', 'FINISHED', [
        yellowEvent('m-1', 'p-1', 10),
        yellowEvent('m-1', 'p-1', 40),
        redEvent('m-1', 'p-1', false, 80),
      ]);
      const res = computeCardSuspension('p-1', [match]);
      expect(res.pending).toBe(2);
      expect(res.yellowCycle).toBe(0);
      expect(res.reasons).toEqual(['Roja directa en la fecha 1 contra rival: 2 fechas por cumplir']);
    });

    it('RED_CARD con isDoubleYellow mas RED_CARD directa en el mismo partido: 2 partidos y se cumple tras 2 partidos', () => {
      const match1 = createMatch('m-1', 1, '2026-10-01', '08:00', 'team-a', 'team-b', 'FINISHED', [
        redEvent('m-1', 'p-1', true, 30),
        redEvent('m-1', 'p-1', false, 75),
      ]);
      const res1 = computeCardSuspension('p-1', [match1]);
      expect(res1.pending).toBe(2);
      expect(res1.reasons).toEqual(['Roja directa en la fecha 1 contra rival: 2 fechas por cumplir']);

      // 1er partido cumplido
      const match2 = createMatch('m-2', 2, '2026-10-08', '08:00', 'team-a', 'team-c', 'FINISHED', []);
      const res2 = computeCardSuspension('p-1', [match1, match2]);
      expect(res2.pending).toBe(1);
      expect(res2.reasons).toEqual(['Roja directa en la fecha 1 contra rival: 1 fecha por cumplir']);

      // 2do partido cumplido
      const match3 = createMatch('m-3', 3, '2026-10-15', '08:00', 'team-a', 'team-b', 'FINISHED', []);
      const res3 = computeCardSuspension('p-1', [match1, match2, match3]);
      expect(res3.pending).toBe(0);
      expect(res3.reasons).toEqual([]);
    });
  });

  describe('calculateSanctions integracion', () => {
    it('Sancion en el ultimo partido jugado y siguiente partido SCHEDULED: sigue suspendido', () => {
      const matches: Match[] = [
        createMatch('m-1', 1, '2026-10-01', '08:00', 'team-a', 'team-b', 'FINISHED', [
          redEvent('m-1', 'p-1', false),
        ]),
        createMatch('m-2', 2, '2026-10-08', '08:00', 'team-a', 'team-c', 'SCHEDULED', []),
      ];

      const sanctions = calculateSanctions([player1], [teamA, teamB, teamC], matches);
      const pSanction = sanctions.find((s) => s.playerId === 'p-1');
      expect(pSanction).toBeDefined();
      expect(pSanction?.isSuspended).toBe(true);
      expect(pSanction?.cardSuspended).toBe(true);
      expect(pSanction?.matchesRemaining).toBe(2);
    });

    it('Eventos en un partido IN_PROGRESS: no generan sancion', () => {
      const matches: Match[] = [
        createMatch('m-1', 1, '2026-10-01', '08:00', 'team-a', 'team-b', 'IN_PROGRESS', [
          redEvent('m-1', 'p-1', false),
        ]),
      ];

      const sanctions = calculateSanctions([player1], [teamA, teamB], matches);
      const pSanction = sanctions.find((s) => s.playerId === 'p-1');
      // En IN_PROGRESS las tarjetas cuentan para el acumulado total del torneo,
      // pero NO suspenden hasta que el partido finalice.
      expect(pSanction?.redCards).toBe(1);
      expect(pSanction?.isSuspended).toBe(false);
      expect(pSanction?.cardSuspended).toBe(false);
      expect(pSanction?.matchesRemaining).toBe(0);
    });

    it('Orden: partidos pasados en desorden en el array; el resultado es el mismo que en orden', () => {
      const match1 = createMatch('m-1', 1, '2026-10-01', '08:00', 'team-a', 'team-b', 'FINISHED', [
        redEvent('m-1', 'p-1', false),
      ]);
      const match2 = createMatch('m-2', 2, '2026-10-08', '08:00', 'team-a', 'team-c', 'FINISHED', []);

      const sanctionsOrdered = calculateSanctions([player1], [teamA, teamB, teamC], [match1, match2]);
      const sanctionsDisordered = calculateSanctions([player1], [teamA, teamB, teamC], [match2, match1]);

      expect(sanctionsOrdered).toEqual(sanctionsDisordered);
      expect(sanctionsOrdered[0].matchesRemaining).toBe(1);
    });

    it('El partido terminado de otro equipo no cumple la sancion', () => {
      const matchTeamA = createMatch('m-1', 1, '2026-10-01', '08:00', 'team-a', 'team-b', 'FINISHED', [
        redEvent('m-1', 'p-1', false),
      ]);
      const matchOther = createMatch('m-2', 2, '2026-10-08', '08:00', 'team-b', 'team-c', 'FINISHED', []);

      const sanctions = calculateSanctions([player1], [teamA, teamB, teamC], [matchTeamA, matchOther]);
      const pSanction = sanctions.find((s) => s.playerId === 'p-1');
      expect(pSanction?.matchesRemaining).toBe(2);
    });

    it('Suspension manual suspendedRounds: [6] sin tarjetas: isSuspended true, cardSuspended false, matchesRemaining 1', () => {
      const playerManual: Player = {
        ...player1,
        id: 'p-man',
        suspendedRounds: [6],
      };

      const sanctions = calculateSanctions([playerManual], [teamA, teamB], []);
      const pSanction = sanctions.find((s) => s.playerId === 'p-man');
      expect(pSanction).toBeDefined();
      expect(pSanction?.isSuspended).toBe(true);
      expect(pSanction?.cardSuspended).toBe(false);
      expect(pSanction?.matchesRemaining).toBe(1);
      expect(pSanction?.suspensionReason).toBe('Suspensión (fecha 6)');
    });

    it('Entradas no mutadas (comparar con copia profunda)', () => {
      const matches: Match[] = [
        createMatch('m-1', 1, '2026-10-01', '08:00', 'team-a', 'team-b', 'FINISHED', [
          yellowEvent('m-1', 'p-1'),
        ]),
      ];
      const players = [player1];
      const teams = [teamA, teamB];

      const matchesCopy = JSON.parse(JSON.stringify(matches));
      const playersCopy = JSON.parse(JSON.stringify(players));
      const teamsCopy = JSON.parse(JSON.stringify(teams));

      calculateSanctions(players, teams, matches);

      expect(matches).toEqual(matchesCopy);
      expect(players).toEqual(playersCopy);
      expect(teams).toEqual(teamsCopy);
    });

    it('filtra por categoria cuando se especifica', () => {
      const team40: Team = {
        ...teamB,
        id: 'team-40',
        category: '+40 Varones',
      };
      const player40: Player = {
        ...player1,
        id: 'p-40',
        teamId: 'team-40',
      };
      const match40 = createMatch('m-40', 1, '2026-10-01', '08:00', 'team-40', 'team-40', 'FINISHED', [
        yellowEvent('m-40', 'p-40'),
      ]);
      match40.category = '+40 Varones';

      const sAbierta = calculateSanctions([player1, player40], [teamA, team40], [match40], 'Abierta Varones');
      expect(sAbierta.find((s) => s.playerId === 'p-40')).toBeUndefined();

      const s40 = calculateSanctions([player1, player40], [teamA, team40], [match40], '+40 Varones');
      expect(s40.find((s) => s.playerId === 'p-40')).toBeDefined();
    });

    it('procesa doble amarilla directa en calculateSanctions acumulando rojas totales', () => {
      const match = createMatch('m-dy', 1, '2026-10-01', '08:00', 'team-a', 'team-b', 'FINISHED', [
        yellowEvent('m-dy', 'p-1', 10),
        yellowEvent('m-dy', 'p-1', 50),
      ]);
      const res = calculateSanctions([player1], [teamA, teamB], [match]);
      expect(res[0].redCards).toBe(1);
      expect(res[0].isSuspended).toBe(true);
      expect(res[0].cardSuspended).toBe(true);
    });

    it('ordena por estado de suspension, partidos restantes, rojas y amarillas', () => {
      const pSuspended2: Player = { ...player1, id: 'p-s2', name: 'S2' };
      const pSuspended1: Player = { ...player1, id: 'p-s1', name: 'S1' };
      const pFreeRed: Player = { ...player1, id: 'p-fr', name: 'FR' };
      const pFreeYellow: Player = { ...player1, id: 'p-fy', name: 'FY' };

      // m1: pFreeRed recibe roja, que se cumple con m2 y m3
      const m1 = createMatch('m-1', 1, '2026-10-01', '08:00', 'team-a', 'team-b', 'FINISHED', [
        redEvent('m-1', 'p-fr', false),
      ]);
      const m2 = createMatch('m-2', 2, '2026-10-02', '08:00', 'team-a', 'team-b', 'FINISHED', []);
      const m3 = createMatch('m-3', 3, '2026-10-03', '08:00', 'team-a', 'team-b', 'FINISHED', [
        yellowEvent('m-3', 'p-fy', 10),
      ]);
      // m4: pSuspended2 (roja directa = 2 partidos restantes) y pSuspended1 (doble amarilla = 1 partido restante)
      const m4 = createMatch('m-4', 4, '2026-10-04', '08:00', 'team-a', 'team-b', 'FINISHED', [
        redEvent('m-4', 'p-s2', false),
        redEvent('m-4', 'p-s1', true),
      ]);

      const res = calculateSanctions([pFreeYellow, pFreeRed, pSuspended1, pSuspended2], [teamA, teamB], [m1, m2, m3, m4]);
      const ids = res.map((s) => s.playerId);
      expect(ids[0]).toBe('p-s2');
      expect(ids[1]).toBe('p-s1');
      expect(ids[2]).toBe('p-fr');
      expect(ids[3]).toBe('p-fy');
    });

    it('incluye expulsions y pendingDetails con nombres de rivales correctos', () => {
      const match1 = createMatch('m-1', 4, '2026-10-01', '08:00', 'team-a', 'team-b', 'FINISHED', [
        yellowEvent('m-1', 'p-1', 10),
        yellowEvent('m-1', 'p-1', 50),
      ]);
      const res = calculateSanctions([player1], [teamA, teamB], [match1]);
      expect(res[0].expulsions).toBe(1);
      expect(res[0].redCards).toBe(1);
      expect(res[0].pendingDetails).toBeDefined();
      expect(res[0].pendingDetails?.length).toBe(1);
      expect(res[0].pendingDetails?.[0]).toEqual({
        kind: 'DOUBLE_YELLOW',
        round: 4,
        date: '2026-10-01',
        opponentTeamId: 'team-b',
        opponentName: 'Equipo B',
        remaining: 1,
      });
      expect(res[0].suspensionReason).toBe(
        'Doble amarilla en la fecha 4 contra Equipo B: 1 fecha por cumplir'
      );
    });

    it('formatPendingSanction formatea correctamente cada tipo de sancion', () => {
      expect(
        formatPendingSanction({
          kind: 'DOUBLE_YELLOW',
          round: 4,
          opponentName: 'Leones Q',
          remaining: 1,
        })
      ).toBe('Doble amarilla en la fecha 4 contra Leones Q: 1 fecha por cumplir');

      expect(
        formatPendingSanction({
          kind: 'DIRECT_RED',
          round: 2,
          opponentName: 'Aguilas',
          remaining: 2,
        })
      ).toBe('Roja directa en la fecha 2 contra Aguilas: 2 fechas por cumplir');

      expect(
        formatPendingSanction({
          kind: 'YELLOW_ACCUMULATION',
          round: 5,
          opponentName: 'Buhos',
          remaining: 1,
        })
      ).toBe(
        '5 amarillas acumuladas (la quinta en la fecha 5 contra Buhos): 1 fecha por cumplir'
      );
    });

    it('countDoubleYellowYellows cuenta amarillas de partidos con doble amarilla', () => {
      const m1 = createMatch('m-1', 1, '2026-10-01', '08:00', 'team-a', 'team-b', 'FINISHED', [
        yellowEvent('m-1', 'p-1', 10),
      ]);
      const m2 = createMatch('m-2', 2, '2026-10-02', '08:00', 'team-a', 'team-b', 'FINISHED', [
        yellowEvent('m-2', 'p-1', 20),
        yellowEvent('m-2', 'p-1', 70),
      ]);
      const m3 = createMatch('m-3', 3, '2026-10-03', '08:00', 'team-a', 'team-b', 'FINISHED', [
        yellowEvent('m-3', 'p-1', 15),
        redEvent('m-3', 'p-1', true, 60),
      ]);
      const mUnfinished = createMatch('m-4', 4, '2026-10-04', '08:00', 'team-a', 'team-b', 'SCHEDULED', [
        yellowEvent('m-4', 'p-1', 10),
        yellowEvent('m-4', 'p-1', 50),
      ]);

      expect(countDoubleYellowYellows('p-1', [m1])).toBe(0);
      expect(countDoubleYellowYellows('p-1', [m1, m2])).toBe(2);
      expect(countDoubleYellowYellows('p-1', [m1, m2, m3])).toBe(4);
      expect(countDoubleYellowYellows('p-1', [m1, m2, m3, mUnfinished])).toBe(4);
    });
  });
});
