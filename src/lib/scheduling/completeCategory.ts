import { Match, Team, Category } from '@/types';
import { isDoubleRoundRobin } from '../fixtureGenerator';

// Rearma lo que falta de una categoría que YA empezó (tiene partidos jugados)
// cuando:
// - le faltan cruces de la fase regular (p. ej. un equipo inscrito a mitad de
//   temporada),
// - una fecha entera quedó sin jugar en el pasado (p. ej. por un feriado), o
// - hay partidos marcados "en vivo" en una fecha futura sin goles ni eventos
//   (se pulsó Iniciar por error).
// Lo jugado no se toca: se juntan los pendientes con los cruces que faltan, se
// reparten en jornadas desde el próximo sábado y los play off se corren para
// después de la última jornada.

export interface CategoryToComplete {
  category: Category;
  newTeams: Team[];
  missingMatches: number;
  postponedRounds: number[];
  falseLiveMatches: number;
}

interface PendingPair {
  homeTeamId: string;
  awayTeamId: string;
  existing?: Match;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// "En vivo" en una fecha que todavía no llega y sin nada cargado: se pulsó
// Iniciar por error, no se jugó.
function isFalseLive(m: Match, nextSat: string): boolean {
  return (
    m.status === 'IN_PROGRESS' &&
    m.date >= nextSat &&
    m.homeScore === 0 &&
    m.awayScore === 0 &&
    (m.events?.length ?? 0) === 0
  );
}

function isPlayedOrLive(m: Match, nextSat: string): boolean {
  return m.status === 'FINISHED' || (m.status === 'IN_PROGRESS' && !isFalseLive(m, nextSat));
}

// Jornadas de fechas pasadas en las que no se jugó ningún partido (la fecha
// entera se suspendió). Un partido suelto pendiente no cuenta: se deja para
// reprogramarlo a mano.
function findPostponedRounds(regular: Match[], nextSat: string): number[] {
  const byRound = new Map<number, Match[]>();
  regular.forEach((m) => byRound.set(m.round, [...(byRound.get(m.round) ?? []), m]));
  return [...byRound.entries()]
    .filter(([, ms]) => ms.every((m) => m.status === 'SCHEDULED' && m.date < nextSat))
    .map(([r]) => r)
    .sort((a, b) => a - b);
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
  matches: Match[],
  nextSat: string
): CategoryToComplete[] {
  const result: CategoryToComplete[] = [];
  for (const cat of activeCategories) {
    const catTeams = teams.filter((t) => t.category === cat);
    if (catTeams.length < 2) continue;
    const catMatches = matches.filter((m) => m.category === cat);
    if (!catMatches.some((m) => isPlayedOrLive(m, nextSat))) continue; // sin jugar: se regenera completa
    if (catMatches.some((m) => m.isPlayoff && isPlayedOrLive(m, nextSat))) continue; // fase regular cerrada

    const regular = catMatches.filter((m) => !m.isPlayoff);
    const missing = findMissingPairs(cat, catTeams, regular);
    if (!missing) continue;
    const postponedRounds = findPostponedRounds(regular, nextSat);
    const falseLiveMatches = catMatches.filter((m) => isFalseLive(m, nextSat)).length;
    if (missing.length === 0 && postponedRounds.length === 0 && falseLiveMatches === 0) continue;

    const inMatches = new Set(regular.flatMap((m) => [m.homeTeamId, m.awayTeamId]));
    result.push({
      category: cat,
      newTeams: catTeams.filter((t) => !inMatches.has(t.id)),
      missingMatches: missing.length,
      postponedRounds,
      falseLiveMatches,
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

  // Lo jugado o en juego queda como está, y también un pendiente suelto de una
  // fecha pasada. Una fecha pasada entera sin jugar y los "en vivo" por error se
  // reprograman.
  const postponed = new Set(findPostponedRounds(regular, nextSat));
  const isPending = (m: Match) =>
    isFalseLive(m, nextSat) || (m.status === 'SCHEDULED' && (m.date >= nextSat || postponed.has(m.round)));
  const fixed = regular.filter((m) => !isPending(m));
  const pending = regular
    .filter(isPending)
    .map((m) => (m.status === 'SCHEDULED' ? m : { ...m, status: 'SCHEDULED' as const }))
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

  // Sábados libres para la categoría desde nextSat (salta los que ya tienen un
  // partido fijo de ella).
  const busy = new Set(fixed.map((m) => m.date));
  const saturdays: string[] = [];
  const saturdayAt = (i: number) => {
    while (saturdays.length <= i) {
      let d = saturdays.length === 0 ? nextSat : addWeeks(saturdays[saturdays.length - 1], 1);
      while (busy.has(d)) d = addWeeks(d, 1);
      saturdays.push(d);
    }
    return saturdays[i];
  };

  const scheduled: Match[] = [];
  rounds.forEach((round, i) => {
    const date = saturdayAt(i);
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
    const moved = { ...m, round: lastRegularRound + k + 1, date: saturdayAt(rounds.length + k) };
    return isFalseLive(m, nextSat) ? { ...moved, status: 'SCHEDULED' as const } : moved;
  });

  return {
    matches: [...fixed, ...scheduled, ...movedPlayoffs],
    rounds: rounds.length,
    firstDate: nextSat,
    addedMatches: missing.length,
  };
}
