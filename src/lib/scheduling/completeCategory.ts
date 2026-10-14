import { Match, Team, Category } from '@/types';
import { isDoubleRoundRobin } from '../fixtureGenerator';

// Completa el calendario de una categoría que YA empezó (tiene partidos jugados)
// cuando le faltan cruces de la fase regular, típicamente porque se inscribió un
// equipo nuevo a mitad de temporada. Lo jugado y lo de fechas pasadas no se toca:
// se juntan los partidos pendientes de fechas futuras con los cruces que faltan y
// se reparten en jornadas nuevas desde el próximo sábado, y los play off se
// corren para después de la última jornada.

export interface CategoryToComplete {
  category: Category;
  newTeams: Team[];
  missingMatches: number;
}

interface PendingPair {
  homeTeamId: string;
  awayTeamId: string;
  existing?: Match;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function isPlayedOrLive(m: Match): boolean {
  return m.status === 'FINISHED' || m.status === 'IN_PROGRESS';
}

function addWeeks(dateStr: string, weeks: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + weeks * 7)).toISOString().split('T')[0];
}

// Cruces que faltan para completar el todos contra todos (doble vuelta en
// +50/Damas). Devuelve null si el calendario tiene equipos ajenos o cruces de
// más: eso no se completa solo, se revisa a mano.
function findMissingPairs(cat: Category, catTeams: Team[], regular: Match[]): PendingPair[] | null {
  const teamIds = new Set(catTeams.map((t) => t.id));
  if (regular.some((m) => !teamIds.has(m.homeTeamId) || !teamIds.has(m.awayTeamId))) return null;

  const legs = isDoubleRoundRobin(cat) ? 2 : 1;
  const count = new Map<string, Match[]>();
  regular.forEach((m) => {
    const k = pairKey(m.homeTeamId, m.awayTeamId);
    count.set(k, [...(count.get(k) ?? []), m]);
  });

  const missing: PendingPair[] = [];
  for (let i = 0; i < catTeams.length; i++) {
    for (let j = i + 1; j < catTeams.length; j++) {
      const a = catTeams[i].id;
      const b = catTeams[j].id;
      const existing = count.get(pairKey(a, b)) ?? [];
      if (existing.length > legs) return null;
      // Alterna la localía: si ya hay un partido, el que falta va al revés.
      let home = existing[0]?.homeTeamId === a ? b : (i + j) % 2 === 0 ? a : b;
      for (let leg = existing.length; leg < legs; leg++) {
        missing.push({ homeTeamId: home, awayTeamId: home === a ? b : a });
        home = home === a ? b : a;
      }
    }
  }
  return missing;
}

export function findCategoriesToComplete(
  activeCategories: Category[],
  teams: Team[],
  matches: Match[]
): CategoryToComplete[] {
  const result: CategoryToComplete[] = [];
  for (const cat of activeCategories) {
    const catTeams = teams.filter((t) => t.category === cat);
    if (catTeams.length < 2) continue;
    const catMatches = matches.filter((m) => m.category === cat);
    if (!catMatches.some(isPlayedOrLive)) continue; // sin jugar: se regenera completa
    if (catMatches.some((m) => m.isPlayoff && isPlayedOrLive(m))) continue; // fase regular cerrada

    const regular = catMatches.filter((m) => !m.isPlayoff);
    const missing = findMissingPairs(cat, catTeams, regular);
    if (!missing || missing.length === 0) continue;

    const inMatches = new Set(regular.flatMap((m) => [m.homeTeamId, m.awayTeamId]));
    result.push({
      category: cat,
      newTeams: catTeams.filter((t) => !inMatches.has(t.id)),
      missingMatches: missing.length,
    });
  }
  return result;
}

// Reparte los cruces en jornadas: cada equipo juega a lo sumo una vez por
// jornada y se prioriza a los equipos con más partidos pendientes, para usar el
// menor número de sábados posible. Evita repetir el mismo cruce en jornadas
// seguidas cuando hay alternativa.
function packIntoRounds(pairs: PendingPair[], teamCount: number): PendingPair[][] {
  const maxPerRound = Math.floor(teamCount / 2);
  let remaining = [...pairs];
  const rounds: PendingPair[][] = [];
  let lastRoundPairs = new Set<string>();

  while (remaining.length > 0) {
    const load = new Map<string, number>();
    remaining.forEach((p) => {
      load.set(p.homeTeamId, (load.get(p.homeTeamId) ?? 0) + 1);
      load.set(p.awayTeamId, (load.get(p.awayTeamId) ?? 0) + 1);
    });
    const weight = (p: PendingPair) =>
      Math.max(load.get(p.homeTeamId)!, load.get(p.awayTeamId)!) * 1000 +
      (load.get(p.homeTeamId)! + load.get(p.awayTeamId)!);

    const order = remaining
      .map((p, idx) => ({ p, idx }))
      .sort((x, y) => {
        const rx = lastRoundPairs.has(pairKey(x.p.homeTeamId, x.p.awayTeamId)) ? 1 : 0;
        const ry = lastRoundPairs.has(pairKey(y.p.homeTeamId, y.p.awayTeamId)) ? 1 : 0;
        return rx - ry || weight(y.p) - weight(x.p) || x.idx - y.idx;
      });

    const used = new Set<string>();
    const round: PendingPair[] = [];
    const taken = new Set<number>();
    for (const { p, idx } of order) {
      if (round.length >= maxPerRound) break;
      if (used.has(p.homeTeamId) || used.has(p.awayTeamId)) continue;
      used.add(p.homeTeamId);
      used.add(p.awayTeamId);
      round.push(p);
      taken.add(idx);
    }
    rounds.push(round);
    lastRoundPairs = new Set(round.map((p) => pairKey(p.homeTeamId, p.awayTeamId)));
    remaining = remaining.filter((_, idx) => !taken.has(idx));
  }
  return rounds;
}

export interface CompleteCategoryResult {
  matches: Match[]; // todos los partidos de la categoría, ya completados
  rounds: number;
  firstDate: string;
  addedMatches: number;
}

export function completeCategoryMatches(
  cat: Category,
  catTeams: Team[],
  catMatches: Match[],
  nextSat: string,
  existingIds: Set<string>
): CompleteCategoryResult {
  const regular = catMatches.filter((m) => !m.isPlayoff);
  const playoffs = catMatches.filter((m) => m.isPlayoff);
  const missing = findMissingPairs(cat, catTeams, regular) ?? [];

  // Lo jugado, en juego o de fechas pasadas queda como está.
  const isFixed = (m: Match) => m.status !== 'SCHEDULED' || m.date < nextSat;
  const fixed = regular.filter(isFixed);
  const pending = regular
    .filter((m) => !isFixed(m))
    .sort((a, b) => a.round - b.round || a.date.localeCompare(b.date));

  const pairs: PendingPair[] = [
    ...pending.map((m) => ({ homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, existing: m })),
    ...missing,
  ];
  const rounds = packIntoRounds(pairs, catTeams.length);
  const firstRound = fixed.reduce((max, m) => Math.max(max, m.round), 0) + 1;

  const slug = cat.toLowerCase().replace(/[^a-z0-9]/g, '');
  const stamp = Date.now().toString(36);
  let counter = 0;
  const newId = () => {
    let id: string;
    do {
      counter += 1;
      id = `m-${slug}-x${counter}-${stamp}`;
    } while (existingIds.has(id));
    existingIds.add(id);
    return id;
  };

  const scheduled: Match[] = [];
  rounds.forEach((round, i) => {
    const date = addWeeks(nextSat, i);
    round.forEach((p) => {
      const base: Match = p.existing ?? {
        id: newId(),
        category: cat,
        round: 0,
        date,
        time: '',
        stadium: '',
        homeTeamId: p.homeTeamId,
        awayTeamId: p.awayTeamId,
        homeScore: 0,
        awayScore: 0,
        status: 'SCHEDULED',
        homeLineup: [],
        awayLineup: [],
        events: [],
        refereeSigned: false,
      };
      scheduled.push({ ...base, round: firstRound + i, date });
    });
  });

  // Play off: misma secuencia de rondas, a partir del sábado siguiente a la
  // última jornada regular.
  const playoffRounds = [...new Set(playoffs.map((m) => m.round))].sort((a, b) => a - b);
  const lastRegularRound = firstRound + rounds.length - 1;
  const movedPlayoffs = playoffs.map((m) => {
    const k = playoffRounds.indexOf(m.round);
    return { ...m, round: lastRegularRound + k + 1, date: addWeeks(nextSat, rounds.length + k) };
  });

  return {
    matches: [...fixed, ...scheduled, ...movedPlayoffs],
    rounds: rounds.length,
    firstDate: nextSat,
    addedMatches: missing.length,
  };
}
