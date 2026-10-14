import { Match } from '@/types';

/**
 * Equipos que descansan en una jornada de la fase regular: los de la categoría
 * que no juegan esa jornada.
 *
 * Un equipo inscrito a mitad de temporada no "descansó" en las jornadas que se
 * jugaron antes de su llegada. En un todos contra todos normal un equipo
 * descansa a lo sumo una vez antes de su primer partido, así que si le faltan
 * dos o más jornadas antes de su debut se toma como inscrito tarde y no se lo
 * marca como descansando en ellas.
 */
export function restingTeamIds(regularMatches: Match[], round: number): string[] {
  const rounds = new Set<number>();
  const firstRound = new Map<string, number>();
  regularMatches.forEach((m) => {
    rounds.add(m.round);
    [m.homeTeamId, m.awayTeamId].forEach((id) => {
      if (id && (firstRound.get(id) ?? Infinity) > m.round) firstRound.set(id, m.round);
    });
  });

  const playing = new Set<string>();
  regularMatches
    .filter((m) => m.round === round)
    .forEach((m) => {
      if (m.homeTeamId) playing.add(m.homeTeamId);
      if (m.awayTeamId) playing.add(m.awayTeamId);
    });

  return [...firstRound.entries()]
    .filter(([id, first]) => {
      if (playing.has(id)) return false;
      if (round > first) return true;
      const roundsBeforeDebut = [...rounds].filter((r) => r < first).length;
      return roundsBeforeDebut < 2;
    })
    .map(([id]) => id);
}
