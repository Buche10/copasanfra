import { Team, Match, ACTIVE_CATEGORIES, Category, CANCHAS, MATCH_TIME_SLOTS, Player } from '@/types';
import { scheduleMatchday, UnscheduledMatch, MatchdayPlacement } from './scheduling/matchday';
import { buildSharedPlayerPairs, sharesPlayers } from './scheduling/sharedPlayers';
import { addToHistory, SlotHistory } from './scheduling/fairness';
import { rebalanceFutureDates } from './scheduling/rebalance';
import { shuffleWith } from './scheduling/random';

export { scheduleMatchday, rebalanceFutureDates };
export type { UnscheduledMatch, MatchdayPlacement };

/**
 * Fisher-Yates array shuffle helper
 */
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Fields and time slots come from the shared constants in @/types so the
// generator and the manual match editor never drift apart.
// Each match ~75 min (30 + 5 break + 30 + buffer). 8 slots x 2 fields = 16/day.
const STADIUMS: readonly string[] = CANCHAS;
const MATCH_TIMES: readonly string[] = MATCH_TIME_SLOTS;

// Primer sábado del campeonato. Todas las fechas se cuentan desde aquí.
export const SEASON_START = '2026-09-05';

// Devuelve las primeras `count` fechas (sábados) de la temporada como
// 'YYYY-MM-DD'. Lo usa el panel para marcar en qué sábados descansa cada
// categoría.
export function seasonSaturdays(count: number): string[] {
  const start = new Date(SEASON_START);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i * 7);
    return d.toISOString().split('T')[0];
  });
}

/**
 * Generates a full fixture for all 4 categories.
 * Damas and +50 Varones: Double round-robin (Ida y Vuelta) + Gran Final.
 * Abierta Varones and +40 Varones: Single round-robin (Ida) + Eliminación directa (Cuartos 1°v8°, 2°v7°, 3°v6°, 4°v5° -> Semis -> Final).
 *
 * `blockedByCategory`: por categoría, sábados ('YYYY-MM-DD') en que NO juega;
 * sus jornadas saltan esas fechas y corren al siguiente sábado disponible.
 */
export function generateRandomFixture(
  teams: Team[],
  blockedByCategory?: Partial<Record<Category, string[]>>,
  players?: Player[],
  options?: { rng?: () => number }
): Match[] {
  const generatedMatches: Match[] = [];
  let globalMatchCounter = 100;
  const startDate = new Date(SEASON_START); // First Saturday of Sept 2026

  // Store unscheduled matches grouped by round
  const roundMatchesMap: Record<number, UnscheduledMatch[]> = {};

  ACTIVE_CATEGORIES.forEach((cat) => {
    const rawCategoryTeams = teams.filter((t) => t.category === cat);
    const categoryTeams = options?.rng ? shuffleWith(options.rng, rawCategoryTeams) : shuffleArray(rawCategoryTeams);
    
    // Skip if less than 2 teams in category
    if (categoryTeams.length < 2) return;

    // Handle odd number of teams by adding a dummy 'BYE' team
    const teamList: (Team | null)[] = [...categoryTeams];
    if (teamList.length % 2 !== 0) {
      teamList.push(null);
    }

    const numTeams = teamList.length;
    const numRoundsIda = numTeams - 1;
    const matchesPerRound = numTeams / 2;

    const isDoubleRoundRobin = cat === 'Damas' || cat === '+50 Varones';
    const totalRegularRounds = isDoubleRoundRobin ? numRoundsIda * 2 : numRoundsIda;

    // 1. Generate Ida (Ronda 1 to numRoundsIda)
    for (let round = 0; round < numRoundsIda; round++) {
      const roundNumber = round + 1;
      if (!roundMatchesMap[roundNumber]) roundMatchesMap[roundNumber] = [];

      for (let matchIdx = 0; matchIdx < matchesPerRound; matchIdx++) {
        const homeIndex = (round + matchIdx) % (numTeams - 1);
        let awayIndex = (numTeams - 1 - matchIdx + round) % (numTeams - 1);

        if (matchIdx === 0) {
          awayIndex = numTeams - 1;
        }

        const homeTeam = teamList[homeIndex];
        const awayTeam = teamList[awayIndex];

        if (!homeTeam || !awayTeam) continue;

        const isAlternate = round % 2 === 1;
        roundMatchesMap[roundNumber].push({
          category: cat,
          round: roundNumber,
          homeTeamId: isAlternate ? awayTeam.id : homeTeam.id,
          awayTeamId: isAlternate ? homeTeam.id : awayTeam.id,
        });
      }
    }

    // 2. Generate Vuelta if double round-robin
    if (isDoubleRoundRobin) {
      for (let round = 0; round < numRoundsIda; round++) {
        const roundNumber = numRoundsIda + round + 1;
        if (!roundMatchesMap[roundNumber]) roundMatchesMap[roundNumber] = [];

        for (let matchIdx = 0; matchIdx < matchesPerRound; matchIdx++) {
          const homeIndex = (round + matchIdx) % (numTeams - 1);
          let awayIndex = (numTeams - 1 - matchIdx + round) % (numTeams - 1);

          if (matchIdx === 0) {
            awayIndex = numTeams - 1;
          }

          const homeTeam = teamList[homeIndex];
          const awayTeam = teamList[awayIndex];

          if (!homeTeam || !awayTeam) continue;

          // Swap home and away for Vuelta
          const isAlternate = round % 2 === 1;
          roundMatchesMap[roundNumber].push({
            category: cat,
            round: roundNumber,
            homeTeamId: isAlternate ? homeTeam.id : awayTeam.id,
            awayTeamId: isAlternate ? awayTeam.id : homeTeam.id,
          });
        }
      }

      // 3. Add Gran Final for Damas & +50 Varones
      const finalRoundNumber = totalRegularRounds + 1;
      if (!roundMatchesMap[finalRoundNumber]) roundMatchesMap[finalRoundNumber] = [];

      const top1 = categoryTeams[0];
      const top2 = categoryTeams[1];

      if (top1 && top2) {
        roundMatchesMap[finalRoundNumber].push({
          category: cat,
          round: finalRoundNumber,
          homeTeamId: top1.id,
          awayTeamId: top2.id,
          isPlayoff: true,
          playoffStage: 'FINAL',
          bracketSlot: 'F',
        });
      }
    } else {
      // 4. Generate Playoffs (Cuartos 1°v8°, 2°v7°, 3°v6°, 4°v5° -> Semis -> Final) for Abierta & +40
      const cuartosRound = totalRegularRounds + 1;
      const semisRound = totalRegularRounds + 2;
      const finalRound = totalRegularRounds + 3;

      if (!roundMatchesMap[cuartosRound]) roundMatchesMap[cuartosRound] = [];
      if (!roundMatchesMap[semisRound]) roundMatchesMap[semisRound] = [];
      if (!roundMatchesMap[finalRound]) roundMatchesMap[finalRound] = [];

      // Cuartos de Final (1° vs 8°, 2° vs 7°, 3° vs 6°, 4° vs 5°).
      // Los equipos aquí son provisionales (para agendar); las posiciones
      // reales se asignan luego con recomputePlayoffs según la tabla.
      if (categoryTeams.length >= 8) {
        const cuartosPairs: [number, number, 'C1' | 'C2' | 'C3' | 'C4'][] = [
          [0, 7, 'C1'],
          [1, 6, 'C2'],
          [2, 5, 'C3'],
          [3, 4, 'C4'],
        ];
        cuartosPairs.forEach(([h, a, slot]) => {
          roundMatchesMap[cuartosRound].push({
            category: cat,
            round: cuartosRound,
            homeTeamId: categoryTeams[h].id,
            awayTeamId: categoryTeams[a].id,
            isPlayoff: true,
            playoffStage: 'CUARTOS',
            bracketSlot: slot,
          });
        });
      } else {
        // Fallback for smaller category
        roundMatchesMap[cuartosRound].push({
          category: cat,
          round: cuartosRound,
          homeTeamId: categoryTeams[0].id,
          awayTeamId: categoryTeams[categoryTeams.length - 1].id,
          isPlayoff: true,
          playoffStage: 'CUARTOS',
          bracketSlot: 'C1',
        });
      }

      // Semifinales: S1 = ganador C1 vs ganador C4, S2 = ganador C2 vs C3.
      if (categoryTeams.length >= 4) {
        roundMatchesMap[semisRound].push({
          category: cat,
          round: semisRound,
          homeTeamId: categoryTeams[0].id,
          awayTeamId: categoryTeams[3].id,
          isPlayoff: true,
          playoffStage: 'SEMIS',
          bracketSlot: 'S1',
        });
        roundMatchesMap[semisRound].push({
          category: cat,
          round: semisRound,
          homeTeamId: categoryTeams[1].id,
          awayTeamId: categoryTeams[2].id,
          isPlayoff: true,
          playoffStage: 'SEMIS',
          bracketSlot: 'S2',
        });
      }

      // Gran Final
      if (categoryTeams.length >= 2) {
        roundMatchesMap[finalRound].push({
          category: cat,
          round: finalRound,
          homeTeamId: categoryTeams[0].id,
          awayTeamId: categoryTeams[1].id,
          isPlayoff: true,
          playoffStage: 'FINAL',
          bracketSlot: 'F',
        });
      }
    }
  });

  // Map each team to its owner/club (falls back to the team's own id).
  const clubOf = new Map<string, string>();
  teams.forEach((t) => clubOf.set(t.id, t.clubId || t.id));

  // N-ésimo sábado (base 0) desde el inicio de temporada.
  const saturdayOf = (index: number) => {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + index * 7);
    return d.toISOString().split('T')[0];
  };

  // Para cada categoría, asigna sus jornadas a los sábados PERMITIDOS, saltando
  // los que están bloqueados (descanso). Así una categoría puede descansar un
  // fin de semana sin mover a las demás.
  const catRoundDate: Record<string, Record<number, string>> = {};
  ACTIVE_CATEGORIES.forEach((cat) => {
    const blocked = new Set(blockedByCategory?.[cat] ?? []);
    const catRounds = Object.keys(roundMatchesMap)
      .map(Number)
      .filter((rn) => roundMatchesMap[rn].some((m) => m.category === cat))
      .sort((a, b) => a - b);
    catRoundDate[cat] = {};
    let cursor = 0;
    catRounds.forEach((rn) => {
      while (blocked.has(saturdayOf(cursor))) cursor++;
      catRoundDate[cat][rn] = saturdayOf(cursor);
      cursor++;
    });
  });

  // Agrupa todos los partidos por la fecha (sábado) que les tocó.
  const byDate: Record<string, UnscheduledMatch[]> = {};
  Object.keys(roundMatchesMap)
    .map(Number)
    .forEach((rn) => {
      roundMatchesMap[rn].forEach((m) => {
        const date = catRoundDate[m.category][m.round];
        (byDate[date] ??= []).push(m);
      });
    });

  // Programa cada sábado (todas las categorías de ese día) respetando las
  // restricciones de dueño y jugadores compartidos, acumulando equidad.
  const sharedPairs = buildSharedPlayerPairs(players ?? []);
  let history: SlotHistory = new Map();

  Object.keys(byDate)
    .sort()
    .forEach((dateString) => {
      const placements = scheduleMatchday(
        byDate[dateString],
        clubOf,
        MATCH_TIMES.length,
        STADIUMS.length,
        { history, sharedPairs, rng: options?.rng }
      );

      const placementInfos = placements.map((p) => ({
        homeTeamId: p.match.homeTeamId,
        awayTeamId: p.match.awayTeamId,
        slotIndex: p.slotIndex,
      }));
      history = addToHistory(history, placementInfos, MATCH_TIMES.length);

      // Order by slot then field so match ids are sequential across the day.
      placements.sort((a, b) => a.slotIndex - b.slotIndex || a.canchaIndex - b.canchaIndex);

      placements.forEach(({ match: m, slotIndex, canchaIndex }) => {
        globalMatchCounter++;

        const time = MATCH_TIMES[slotIndex];
        const stadium = STADIUMS[canchaIndex];

        generatedMatches.push({
          id: `m-${m.category.toLowerCase().replace(/[^a-z0-9]/g, '')}-${globalMatchCounter}`,
          category: m.category,
          round: m.round,
          date: dateString,
          time: time,
          stadium: stadium,
          homeTeamId: m.homeTeamId,
          awayTeamId: m.awayTeamId,
          homeScore: 0,
          awayScore: 0,
          status: 'SCHEDULED',
          homeLineup: [],
          awayLineup: [],
          events: [],
          refereeSigned: false,
          isPlayoff: m.isPlayoff,
          playoffStage: m.playoffStage,
          bracketSlot: m.bracketSlot,
        });
      });
    });

  return generatedMatches;
}

// Coloca `newMatches` en los turnos LIBRES alrededor de `fixedMatches` (que NO
// se mueven), respetando la regla de dueños y jugadores compartidos, llenando desde el turno 0.
function scheduleAround(
  newMatches: Match[],
  fixedMatches: Match[],
  clubOf: Map<string, string>,
  slotCount: number,
  fieldsPerSlot: number,
  sharedPairs: ReadonlySet<string> = new Set()
): { match: Match; slotIndex: number; canchaIndex: number }[] {
  const clubsOf = (m: Match) => [clubOf.get(m.homeTeamId) ?? m.homeTeamId, clubOf.get(m.awayTeamId) ?? m.awayTeamId];
  const used: boolean[][] = Array.from({ length: slotCount }, () => Array.from({ length: fieldsPerSlot }, () => false));
  const clubsInSlot: Set<string>[] = Array.from({ length: slotCount }, () => new Set<string>());
  const teamsInSlot: Set<string>[] = Array.from({ length: slotCount }, () => new Set<string>());

  // Sembrar los partidos fijos en su turno y cancha actuales.
  fixedMatches.forEach((fm) => {
    const s = MATCH_TIMES.indexOf(fm.time);
    if (s < 0) return;
    let c = STADIUMS.indexOf(fm.stadium);
    if (c < 0 || c >= fieldsPerSlot || used[s][c]) c = used[s].findIndex((u) => !u);
    if (c >= 0) used[s][c] = true;
    clubsOf(fm).forEach((x) => clubsInSlot[s].add(x));
    teamsInSlot[s].add(fm.homeTeamId);
    teamsInSlot[s].add(fm.awayTeamId);
  });

  const placements: { match: Match; slotIndex: number; canchaIndex: number }[] = [];
  const placeAt = (m: Match, s: number, c: number) => {
    used[s][c] = true;
    clubsOf(m).forEach((x) => clubsInSlot[s].add(x));
    teamsInSlot[s].add(m.homeTeamId);
    teamsInSlot[s].add(m.awayTeamId);
    placements.push({ match: m, slotIndex: s, canchaIndex: c });
  };

  const hasSharedClash = (m: Match, s: number): boolean => {
    const mTeams = [m.homeTeamId, m.awayTeamId];
    for (const t of mTeams) {
      for (const ex of teamsInSlot[s]) {
        if (sharesPlayers(sharedPairs, t, ex)) return true;
      }
    }
    for (const neighbor of [s - 1, s + 1]) {
      if (neighbor >= 0 && neighbor < slotCount) {
        for (const t of mTeams) {
          for (const ex of teamsInSlot[neighbor]) {
            if (sharesPlayers(sharedPairs, t, ex)) return true;
          }
        }
      }
    }
    return false;
  };

  // Ordenar por dueño para que los equipos del mismo dueño caigan en turnos seguidos.
  const ordered = [...newMatches].sort((a, b) => clubsOf(a)[0].localeCompare(clubsOf(b)[0]));
  ordered.forEach((m) => {
    let done = false;
    for (let s = 0; s < slotCount && !done; s++) {
      if (clubsOf(m).some((x) => clubsInSlot[s].has(x))) continue;
      if (hasSharedClash(m, s)) continue;
      const c = used[s].findIndex((u) => !u);
      if (c === -1) continue;
      placeAt(m, s, c);
      done = true;
    }
    if (!done) {
      for (let s = 0; s < slotCount && !done; s++) {
        if (hasSharedClash(m, s)) continue;
        const c = used[s].findIndex((u) => !u);
        if (c !== -1) { placeAt(m, s, c); done = true; }
      }
    }
    if (!done) {
      // Último recurso: primer turno con cancha libre.
      for (let s = 0; s < slotCount && !done; s++) {
        const c = used[s].findIndex((u) => !u);
        if (c !== -1) { placeAt(m, s, c); done = true; }
      }
    }
  });

  return placements;
}

/**
 * Rehace el calendario SOLO de `categoriesToRegen`, dejando intactas las demás
 * (mismas fechas/horas/canchas). Genera enfrentamientos nuevos (todos contra
 * todos + play offs) para esas categorías y los acomoda en los turnos libres
 * alrededor de los partidos de las categorías que no se tocan.
 */
export function regenerateCategories(
  allMatches: Match[],
  teams: Team[],
  categoriesToRegen: Category[],
  players?: Player[]
): Match[] {
  const sharedPairs = buildSharedPlayerPairs(players ?? []);
  const catSet = new Set(categoriesToRegen);
  const kept = allMatches.filter((m) => !catSet.has(m.category));
  const regenTeams = teams.filter((t) => catSet.has(t.category));

  // Reusar el generador con SOLO los equipos de esas categorías: las demás
  // quedan sin equipos y no producen partidos. Tomamos sus enfrentamientos,
  // jornadas y fechas; las horas/canchas las reasignamos alrededor de lo fijo.
  const draft = generateRandomFixture(regenTeams, undefined, players);

  const clubOf = new Map<string, string>();
  teams.forEach((t) => clubOf.set(t.id, t.clubId || t.id));

  const groupByDate = (arr: Match[]) => {
    const map = new Map<string, Match[]>();
    arr.forEach((m) => {
      const a = map.get(m.date) ?? [];
      a.push(m);
      map.set(m.date, a);
    });
    return map;
  };
  const keptByDate = groupByDate(kept);

  const result: Match[] = [...kept];
  groupByDate(draft).forEach((dayNew, date) => {
    const fixed = keptByDate.get(date) ?? [];
    const placements = scheduleAround(dayNew, fixed, clubOf, MATCH_TIMES.length, STADIUMS.length, sharedPairs);
    placements.forEach(({ match, slotIndex, canchaIndex }) => {
      result.push({ ...match, time: MATCH_TIMES[slotIndex], stadium: STADIUMS[canchaIndex] });
    });
  });

  return result;
}

/**
 * Mueve un equipo de una categoría a otra SIN mover los partidos ya programados:
 *  - Quita los partidos del equipo en la categoría de ORIGEN (su ex-rival de esa
 *    fecha simplemente descansa).
 *  - En la categoría DESTINO, hace que el equipo juegue, en cada jornada, contra
 *    el equipo que DESCANSABA esa fecha (llena el bye). El partido nuevo se
 *    coloca en un turno libre de ese día, sin tocar los demás.
 * Sirve para categorías destino con nº impar (que tenían un descanso por fecha).
 */
export function moveTeamCategory(
  allMatches: Match[],
  teams: Team[],
  teamId: string,
  oldCat: Category,
  newCat: Category,
  players?: Player[]
): Match[] {
  const clubOf = new Map<string, string>();
  teams.forEach((t) => clubOf.set(t.id, t.clubId || t.id));
  const sharedPairs = buildSharedPlayerPairs(players ?? []);

  // 1) Quitar los partidos del equipo en ambas categorías (origen y cualquier
  //    residual en destino), para partir de un estado limpio para ese equipo.
  const base = allMatches.filter(
    (m) =>
      !(
        (m.category === oldCat || m.category === newCat) &&
        (m.homeTeamId === teamId || m.awayTeamId === teamId)
      )
  );

  // 2) Construir, por jornada de la categoría destino, un partido del equipo
  //    contra el que descansaba esa fecha.
  const newCatRegular = base.filter((m) => m.category === newCat && !m.isPlayoff);
  const teamIdsNewCat = new Set(teams.filter((t) => t.category === newCat).map((t) => t.id));
  const rounds = [...new Set(newCatRegular.map((m) => m.round))].sort((a, b) => a - b);

  const additions: Match[] = [];
  let counter = 900;
  rounds.forEach((round) => {
    const roundMatches = newCatRegular.filter((m) => m.round === round);
    const date = roundMatches[0]?.date;
    if (!date) return;
    const playing = new Set<string>();
    roundMatches.forEach((m) => {
      playing.add(m.homeTeamId);
      playing.add(m.awayTeamId);
    });
    if (playing.has(teamId)) return; // ya juega esa jornada
    const resting = [...teamIdsNewCat].filter((id) => id !== teamId && !playing.has(id));
    if (resting.length === 0) return; // sin descanso que llenar (categoría par)
    additions.push({
      id: `m-move-${counter++}`,
      category: newCat,
      round,
      date,
      time: '',
      stadium: '',
      homeTeamId: teamId,
      awayTeamId: resting[0],
      homeScore: 0,
      awayScore: 0,
      status: 'SCHEDULED',
      homeLineup: [],
      awayLineup: [],
      events: [],
      refereeSigned: false,
    });
  });

  // 3) Colocar cada partido nuevo en un turno LIBRE de su día (sin mover el resto).
  const result: Match[] = [...base];
  const byDate = new Map<string, Match[]>();
  additions.forEach((m) => {
    const a = byDate.get(m.date) ?? [];
    a.push(m);
    byDate.set(m.date, a);
  });
  byDate.forEach((dayNew, date) => {
    const fixed = base.filter((m) => m.date === date);
    const placements = scheduleAround(dayNew, fixed, clubOf, MATCH_TIMES.length, STADIUMS.length, sharedPairs);
    placements.forEach(({ match, slotIndex, canchaIndex }) =>
      result.push({ ...match, time: MATCH_TIMES[slotIndex], stadium: STADIUMS[canchaIndex] })
    );
  });

  return result;
}

/**
 * Reacomoda SOLO los horarios y canchas del calendario existente para quitar
 * huecos (turnos vacíos), SIN cambiar los enfrentamientos.
 *
 * Solo modifica fechas estrictamente futuras sin partidos jugados/iniciados,
 * respetando el historial acumulado y las reglas de jugadores compartidos.
 */
export function repackSchedule(
  matches: Match[],
  teams: Team[],
  hiddenCategories: Category[] = [],
  players?: Player[]
): Match[] {
  return rebalanceFutureDates(matches, teams, players ?? [], hiddenCategories).matches;
}
