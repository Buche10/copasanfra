import { describe, it, expect } from 'vitest';
import { planTeamDeletion } from './teamDeletion';
import { Match, Team, Player } from '@/types';

describe('planTeamDeletion', () => {
  it('correctly calculates the team deletion plan without mutating inputs', () => {
    const team = { id: 't1', name: 'Team 1', category: 'Abierta Varones' } as Team;
    const matches = [
      { id: 'm1', homeTeamId: 't1', awayTeamId: 't2', date: '2023', category: 'Abierta Varones', status: 'FINISHED' },
      { id: 'm2', homeTeamId: 't3', awayTeamId: 't1', date: '2023', category: 'Abierta Varones', status: 'IN_PROGRESS' },
      { id: 'm3', homeTeamId: 't2', awayTeamId: 't3', date: '2023', category: 'Abierta Varones', status: 'SCHEDULED' },
      { id: 'm4', homeTeamId: 't1', awayTeamId: 't4', date: '2023', category: 'Abierta Varones', status: 'SCHEDULED' },
    ] as Match[];
    const players = [
      { id: 'p1', teamId: 't1', name: 'Player 1', cedula: '1', dorsal: 1, position: 'DEL' },
      { id: 'p2', teamId: 't2', name: 'Player 2', cedula: '2', dorsal: 2, position: 'DEF' },
      { id: 'p3', teamId: 't1', name: 'Player 3', cedula: '3', dorsal: 3, position: 'MED' },
    ] as Player[];

    const inputMatchesCopy = [...matches];
    const inputPlayersCopy = [...players];

    const plan = planTeamDeletion(team, matches, players);

    expect(plan.remainingMatches).toHaveLength(1);
    expect(plan.remainingMatches[0].id).toBe('m3');

    expect(plan.removedMatches).toHaveLength(3);
    expect(plan.removedMatches.map((m) => m.id).sort()).toEqual(['m1', 'm2', 'm4']);

    expect(plan.playedRemoved).toBe(2); // m1 (FINISHED) and m2 (IN_PROGRESS)

    expect(plan.removedPlayers).toHaveLength(2);
    expect(plan.removedPlayers.map((p) => p.id).sort()).toEqual(['p1', 'p3']);

    // Ensure no mutation
    expect(matches).toEqual(inputMatchesCopy);
    expect(players).toEqual(inputPlayersCopy);
  });
});
