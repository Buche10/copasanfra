import { describe, it, expect } from 'vitest';
import { restingTeamIds } from './resting';
import { Match } from '@/types';

const match = (round: number, homeTeamId: string, awayTeamId: string): Match => ({
  id: `${round}-${homeTeamId}-${awayTeamId}`,
  category: '+50 Varones',
  round,
  date: '2026-09-05',
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
});

describe('restingTeamIds', () => {
  // 5 equipos, una vuelta: cada jornada descansa uno distinto.
  const fiveTeams = [
    match(1, 'b', 'c'), match(1, 'd', 'e'),
    match(2, 'a', 'c'), match(2, 'b', 'e'),
    match(3, 'a', 'e'), match(3, 'b', 'd'),
    match(4, 'a', 'b'), match(4, 'c', 'e'),
    match(5, 'a', 'd'), match(5, 'c', 'd'),
  ];

  it('marca al que descansa en un todos contra todos impar, tambien en la jornada 1', () => {
    expect(restingTeamIds(fiveTeams, 1)).toEqual(['a']);
    expect(restingTeamIds(fiveTeams, 3)).toEqual(['c']);
  });

  it('no marca descansando a un equipo nuevo en las jornadas jugadas antes de inscribirse', () => {
    const lateJoin = [
      match(1, 'a', 'b'), match(1, 'c', 'd'),
      match(2, 'a', 'c'), match(2, 'b', 'd'),
      match(3, 'a', 'd'), match(3, 'b', 'c'),
      match(4, 'nuevo', 'a'),
      match(5, 'b', 'nuevo'),
    ];
    expect(restingTeamIds(lateJoin, 1)).toEqual([]);
    expect(restingTeamIds(lateJoin, 3)).toEqual([]);
    expect(restingTeamIds(lateJoin, 4).sort()).toEqual(['b', 'c', 'd']);
    expect(restingTeamIds(lateJoin, 5).sort()).toEqual(['a', 'c', 'd']);
  });
});
