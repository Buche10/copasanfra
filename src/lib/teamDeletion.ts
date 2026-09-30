import { Match, Team, Player } from '@/types';

export interface TeamDeletionPlan {
  remainingMatches: Match[];
  removedMatches: Match[];
  playedRemoved: number;
  removedPlayers: Player[];
}

export function planTeamDeletion(
  team: Team,
  matches: Match[],
  players: Player[]
): TeamDeletionPlan {
  const removedMatches = matches.filter(
    (m) => m.homeTeamId === team.id || m.awayTeamId === team.id
  );
  const remainingMatches = matches.filter(
    (m) => m.homeTeamId !== team.id && m.awayTeamId !== team.id
  );
  const playedRemoved = removedMatches.filter(
    (m) => m.status === 'FINISHED' || m.status === 'IN_PROGRESS'
  ).length;
  const removedPlayers = players.filter((p) => p.teamId === team.id);

  return { remainingMatches, removedMatches, playedRemoved, removedPlayers };
}
