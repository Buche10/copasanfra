import { Match, Team, Category } from '@/types';

// Partido contra un equipo retirado del torneo: no se juega. El rival descansa y,
// para que se le den los puntos (W.O.), debe acreditar el valor de la programación.
export interface WalkoverRest {
  matchId: string;
  category: Category;
  restingTeamName: string;
  withdrawnTeamName: string;
}

export function walkoverRestNotice(w: WalkoverRest): string {
  return (
    `${w.restingTeamName} (${w.category}) descansa: su rival ${w.withdrawnTeamName} se retiró del torneo. ` +
    'Para que se le asignen los puntos debe acreditar el valor de la programación.'
  );
}

/**
 * Equipos que descansan por jugar contra un equipo retirado. Solo partidos
 * pendientes: si el W.O. ya se registró, los puntos ya están asignados.
 */
export function findWalkoverRests(matches: Match[], teams: Team[]): WalkoverRest[] {
  const byId = new Map(teams.map((t) => [t.id, t]));
  return matches.flatMap((m) => {
    if (m.status !== 'SCHEDULED') return [];
    const home = byId.get(m.homeTeamId);
    const away = byId.get(m.awayTeamId);
    if (!home || !away || home.withdrawn === away.withdrawn) return [];
    const [resting, withdrawn] = home.withdrawn ? [away, home] : [home, away];
    return [{ matchId: m.id, category: m.category, restingTeamName: resting.name, withdrawnTeamName: withdrawn.name }];
  });
}
