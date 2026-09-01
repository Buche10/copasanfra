import { Match, Team, Category } from '@/types';
import { calculateStandings } from './store';

/**
 * Ganador de un partido de play off:
 * - Si no está FINISHED o le faltan equipos → '' (por definir).
 * - Por marcador si no hay empate.
 * - Si hay empate → el ganador definido a mano (winnerTeamId), o '' si no se ha
 *   definido todavía.
 */
function winnerOf(m: Match | undefined): string {
  if (!m || m.status !== 'FINISHED' || !m.homeTeamId || !m.awayTeamId) return '';
  if (m.homeScore > m.awayScore) return m.homeTeamId;
  if (m.awayScore > m.homeScore) return m.awayTeamId;
  return m.winnerTeamId || '';
}

/**
 * Recalcula los equipos de los partidos de play off a partir de la tabla de la
 * fase regular y de los resultados de las rondas previas del cuadro.
 * Devuelve un NUEVO arreglo de partidos (no muta el original).
 *
 * - Abierta / +40: Cuartos (1v8,2v7,3v6,4v5) → Semis (GC1vGC4, GC2vGC3) → Final.
 * - +50 / Damas: Final = 1º vs 2º de la fase regular.
 *
 * Un partido de play off ya FINISHED no cambia de equipos (queda como se jugó).
 */
export function recomputePlayoffs(matches: Match[], teams: Team[]): Match[] {
  const byId = new Map(matches.map((m) => [m.id, { ...m }]));
  const categories = Array.from(new Set(matches.map((m) => m.category))) as Category[];

  categories.forEach((cat) => {
    const regularMatches = matches.filter((m) => m.category === cat && !m.isPlayoff);
    const catTeams = teams.filter((t) => t.category === cat);
    const stdIds = calculateStandings(catTeams, regularMatches, cat).map((s) => s.teamId);

    const slotMatch = (slot: string): Match | undefined =>
      [...byId.values()].find((m) => m.category === cat && m.isPlayoff && m.bracketSlot === slot);

    const setTeams = (slot: string, home: string, away: string) => {
      const m = slotMatch(slot);
      if (!m || m.status === 'FINISHED') return; // no tocar un partido ya jugado
      m.homeTeamId = home;
      m.awayTeamId = away;
    };

    const hasCuartos = !!slotMatch('C1');
    const hasFinal = !!slotMatch('F');

    if (hasCuartos) {
      // Cuartos con las posiciones de la tabla
      setTeams('C1', stdIds[0] || '', stdIds[7] || '');
      setTeams('C2', stdIds[1] || '', stdIds[6] || '');
      setTeams('C3', stdIds[2] || '', stdIds[5] || '');
      setTeams('C4', stdIds[3] || '', stdIds[4] || '');
      // Semis con los ganadores de cuartos
      setTeams('S1', winnerOf(slotMatch('C1')), winnerOf(slotMatch('C4')));
      setTeams('S2', winnerOf(slotMatch('C2')), winnerOf(slotMatch('C3')));
      // Final con los ganadores de semis
      setTeams('F', winnerOf(slotMatch('S1')), winnerOf(slotMatch('S2')));
    } else if (hasFinal) {
      // +50 / Damas: final entre los 2 primeros
      setTeams('F', stdIds[0] || '', stdIds[1] || '');
    }
  });

  return matches.map((m) => byId.get(m.id)!);
}

/** Partidos de play off cuyos equipos cambiaron entre `before` y `after`. */
export function changedPlayoffMatches(before: Match[], after: Match[]): Match[] {
  const beforeById = new Map(before.map((m) => [m.id, m]));
  return after.filter((a) => {
    if (!a.isPlayoff) return false;
    const b = beforeById.get(a.id);
    return !!b && (b.homeTeamId !== a.homeTeamId || b.awayTeamId !== a.awayTeamId);
  });
}
