import { Team, Match, ACTIVE_CATEGORIES, Category, CANCHAS, MATCH_TIME_SLOTS } from '@/types';

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

interface UnscheduledMatch {
  category: Category;
  round: number;
  homeTeamId: string;
  awayTeamId: string;
  isPlayoff?: boolean;
  playoffStage?: 'CUARTOS' | 'SEMIS' | 'FINAL';
  bracketSlot?: 'C1' | 'C2' | 'C3' | 'C4' | 'S1' | 'S2' | 'F';
}

interface Placement {
  match: UnscheduledMatch;
  slotIndex: number;
  canchaIndex: number;
}

/**
 * Assigns the matches of a single matchday to time slots and fields respecting
 * owner constraints:
 *   - HARD: two teams of the same owner (club) never play at the same time.
 *   - SOFT: an owner's teams play in consecutive slots (e.g. 08:00 then 09:15).
 *
 * A single processing order can't keep every owner's matches together when
 * owners face opponents of different "sizes", so we run a greedy placement
 * (that prefers slots adjacent to an owner's already-used slots) over many
 * randomized orderings and keep the arrangement with the fewest violations.
 * The hard constraint is always honored; the soft one is minimized.
 */
function scheduleMatchday(
  dayMatches: UnscheduledMatch[],
  clubOf: Map<string, string>,
  slotCount: number,
  fieldsPerSlot: number
): Placement[] {
  const clubsOfMatch = (m: UnscheduledMatch): string[] => [
    clubOf.get(m.homeTeamId) ?? m.homeTeamId,
    clubOf.get(m.awayTeamId) ?? m.awayTeamId,
  ];

  const clubMatchCount = new Map<string, number>();
  dayMatches.forEach((m) => {
    clubsOfMatch(m).forEach((c) => clubMatchCount.set(c, (clubMatchCount.get(c) ?? 0) + 1));
  });

  // Multi-team owners (the only ones with a contiguity constraint), and, for a
  // given club, the matches it plays this day.
  const multiClubs = [...clubMatchCount.entries()].filter(([, n]) => n >= 2).map(([c]) => c);
  const matchesOfClub = (club: string) => dayMatches.filter((m) => clubsOfMatch(m).includes(club));

  // Assign each match to a distinct slot from `slots` (backtracking), honoring
  // the field/owner rules via `canPlace`. Returns the mapping or null.
  const assignToSlots = (
    matches: UnscheduledMatch[],
    slots: number[],
    canPlace: (m: UnscheduledMatch, s: number) => boolean
  ): Map<UnscheduledMatch, number> | null => {
    const result = new Map<UnscheduledMatch, number>();
    const used = new Set<number>();
    const bt = (i: number): boolean => {
      if (i >= matches.length) return true;
      for (const s of slots) {
        if (used.has(s) || !canPlace(matches[i], s)) continue;
        used.add(s);
        result.set(matches[i], s);
        if (bt(i + 1)) return true;
        used.delete(s);
        result.delete(matches[i]);
      }
      return false;
    };
    return bt(0) ? result : null;
  };

  // One full placement given an order in which to process the multi-team clubs.
  const attempt = (clubOrder: string[]): { placements: Placement[]; score: number } => {
    const slotMatches: UnscheduledMatch[][] = Array.from({ length: slotCount }, () => []);
    const slotClubs: Set<string>[] = Array.from({ length: slotCount }, () => new Set());
    const matchSlot = new Map<UnscheduledMatch, number>();
    let hardViolations = 0;

    const canPlace = (m: UnscheduledMatch, s: number) =>
      slotMatches[s].length < fieldsPerSlot && !clubsOfMatch(m).some((c) => slotClubs[s].has(c));
    const commit = (m: UnscheduledMatch, s: number) => {
      slotMatches[s].push(m);
      clubsOfMatch(m).forEach((c) => slotClubs[s].add(c));
      matchSlot.set(m, s);
    };
    const placeAnywhere = (m: UnscheduledMatch) => {
      let s = -1;
      for (let i = 0; i < slotCount; i++) if (canPlace(m, i)) { s = i; break; }
      if (s === -1) {
        // never drop a match: force the least-full slot (soft/hard violation).
        s = slotMatches.reduce((best, arr, i) => (arr.length < slotMatches[best].length ? i : best), 0);
        hardViolations += 1;
      }
      commit(m, s);
    };

    // Place each multi-team owner's matches inside one contiguous window.
    for (const club of clubOrder) {
      const cms = matchesOfClub(club);
      const k = cms.length;
      const placed = cms.filter((m) => matchSlot.has(m));
      const unplaced = cms.filter((m) => !matchSlot.has(m));
      const placedSlots = placed.map((m) => matchSlot.get(m)!);

      let done = false;
      for (let start = 0; start + k <= slotCount && !done; start++) {
        const end = start + k - 1;
        if (!placedSlots.every((s) => s >= start && s <= end)) continue;
        const freeWindow: number[] = [];
        for (let s = start; s <= end; s++) if (!placedSlots.includes(s)) freeWindow.push(s);
        const assign = assignToSlots(unplaced, freeWindow, canPlace);
        if (assign) {
          assign.forEach((s, m) => commit(m, s));
          done = true;
        }
      }
      if (!done) unplaced.forEach(placeAnywhere); // no clean window: best-effort
    }

    // Remaining matches (single-owner) fill the rest.
    for (const m of dayMatches) if (!matchSlot.has(m)) placeAnywhere(m);

    const placements: Placement[] = [];
    slotMatches.forEach((arr, s) => arr.forEach((m, cancha) => placements.push({ match: m, slotIndex: s, canchaIndex: cancha })));

    // Score: hard clashes weigh heavily; soft = gaps in each owner's block.
    let score = hardViolations * 1000;
    for (const club of multiClubs) {
      const sorted = matchesOfClub(club).map((m) => matchSlot.get(m)!).sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) score += Math.max(0, sorted[i] - sorted[i - 1] - 1);
    }
    return { placements, score };
  };

  // Local repair: swap two matches' slots whenever it reduces the total gap
  // score without creating an owner clash. Closes the occasional 1-slot gap
  // the constructive pass leaves behind. Never introduces a simultaneous clash.
  const repair = (placements: Placement[]): Placement[] => {
    const bySlot: UnscheduledMatch[][] = Array.from({ length: slotCount }, () => []);
    const matchSlot = new Map<UnscheduledMatch, number>();
    placements.forEach((p) => {
      bySlot[p.slotIndex].push(p.match);
      matchSlot.set(p.match, p.slotIndex);
    });

    const clubsInSlotExcept = (s: number, skip: UnscheduledMatch) => {
      const set = new Set<string>();
      bySlot[s].forEach((m) => { if (m !== skip) clubsOfMatch(m).forEach((c) => set.add(c)); });
      return set;
    };
    const gapScore = () => {
      let sc = 0;
      for (const club of multiClubs) {
        const sorted = matchesOfClub(club).map((m) => matchSlot.get(m)!).sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) sc += Math.max(0, sorted[i] - sorted[i - 1] - 1);
      }
      return sc;
    };

    let improved = true;
    let guard = 0;
    while (improved && guard++ < 500 && gapScore() > 0) {
      improved = false;
      const all = [...matchSlot.keys()];
      for (let i = 0; i < all.length && !improved; i++) {
        for (let j = i + 1; j < all.length && !improved; j++) {
          const m1 = all[i];
          const m2 = all[j];
          const s1 = matchSlot.get(m1)!;
          const s2 = matchSlot.get(m2)!;
          if (s1 === s2) continue;
          // Swap must not put an owner twice in the same slot.
          if (clubsOfMatch(m2).some((c) => clubsInSlotExcept(s1, m1).has(c))) continue;
          if (clubsOfMatch(m1).some((c) => clubsInSlotExcept(s2, m2).has(c))) continue;

          const before = gapScore();
          matchSlot.set(m1, s2);
          matchSlot.set(m2, s1);
          if (gapScore() < before) {
            bySlot[s1] = bySlot[s1].map((m) => (m === m1 ? m2 : m));
            bySlot[s2] = bySlot[s2].map((m) => (m === m2 ? m1 : m));
            improved = true;
          } else {
            matchSlot.set(m1, s1); // revert
            matchSlot.set(m2, s2);
          }
        }
      }
    }

    const out: Placement[] = [];
    bySlot.forEach((arr, s) => arr.forEach((m, cancha) => out.push({ match: m, slotIndex: s, canchaIndex: cancha })));
    return out;
  };

  // Seed: biggest owners first; then randomized restarts to escape dead ends.
  const baseOrder = [...multiClubs].sort((a, b) => (clubMatchCount.get(b)! - clubMatchCount.get(a)!));
  let best = attempt(baseOrder);
  for (let k = 0; k < 400 && best.score > 0; k++) {
    const candidate = attempt(shuffleArray(multiClubs));
    if (candidate.score < best.score) best = candidate;
  }

  return repair(best.placements);
}

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
  blockedByCategory?: Partial<Record<Category, string[]>>
): Match[] {
  const generatedMatches: Match[] = [];
  let globalMatchCounter = 100;
  const startDate = new Date(SEASON_START); // First Saturday of Sept 2026

  // Store unscheduled matches grouped by round
  const roundMatchesMap: Record<number, UnscheduledMatch[]> = {};

  ACTIVE_CATEGORIES.forEach((cat) => {
    const categoryTeams = shuffleArray(teams.filter((t) => t.category === cat));
    
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
  // restricciones de dueño.
  Object.keys(byDate)
    .sort()
    .forEach((dateString) => {
      const placements = scheduleMatchday(
        byDate[dateString],
        clubOf,
        MATCH_TIMES.length,
        STADIUMS.length
      );

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
// se mueven), respetando la regla de dueños y llenando desde el turno 0.
function scheduleAround(
  newMatches: Match[],
  fixedMatches: Match[],
  clubOf: Map<string, string>,
  slotCount: number,
  fieldsPerSlot: number
): { match: Match; slotIndex: number; canchaIndex: number }[] {
  const clubsOf = (m: Match) => [clubOf.get(m.homeTeamId) ?? m.homeTeamId, clubOf.get(m.awayTeamId) ?? m.awayTeamId];
  const used: boolean[][] = Array.from({ length: slotCount }, () => Array.from({ length: fieldsPerSlot }, () => false));
  const clubsInSlot: Set<string>[] = Array.from({ length: slotCount }, () => new Set<string>());

  // Sembrar los partidos fijos (Damas / +50) en su turno y cancha actuales.
  fixedMatches.forEach((fm) => {
    const s = MATCH_TIMES.indexOf(fm.time);
    if (s < 0) return;
    let c = STADIUMS.indexOf(fm.stadium);
    if (c < 0 || c >= fieldsPerSlot || used[s][c]) c = used[s].findIndex((u) => !u);
    if (c >= 0) used[s][c] = true;
    clubsOf(fm).forEach((x) => clubsInSlot[s].add(x));
  });

  const placements: { match: Match; slotIndex: number; canchaIndex: number }[] = [];
  const placeAt = (m: Match, s: number, c: number) => {
    used[s][c] = true;
    clubsOf(m).forEach((x) => clubsInSlot[s].add(x));
    placements.push({ match: m, slotIndex: s, canchaIndex: c });
  };

  // Ordenar por dueño para que los equipos del mismo dueño caigan en turnos seguidos.
  const ordered = [...newMatches].sort((a, b) => clubsOf(a)[0].localeCompare(clubsOf(b)[0]));
  ordered.forEach((m) => {
    let done = false;
    for (let s = 0; s < slotCount && !done; s++) {
      if (clubsOf(m).some((x) => clubsInSlot[s].has(x))) continue;
      const c = used[s].findIndex((u) => !u);
      if (c === -1) continue;
      placeAt(m, s, c);
      done = true;
    }
    if (!done) {
      // Último recurso: primer turno con cancha libre (ignora regla de dueño).
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
  categoriesToRegen: Category[]
): Match[] {
  const catSet = new Set(categoriesToRegen);
  const kept = allMatches.filter((m) => !catSet.has(m.category));
  const regenTeams = teams.filter((t) => catSet.has(t.category));

  // Reusar el generador con SOLO los equipos de esas categorías: las demás
  // quedan sin equipos y no producen partidos. Tomamos sus enfrentamientos,
  // jornadas y fechas; las horas/canchas las reasignamos alrededor de lo fijo.
  const draft = generateRandomFixture(regenTeams);

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
    const placements = scheduleAround(dayNew, fixed, clubOf, MATCH_TIMES.length, STADIUMS.length);
    placements.forEach(({ match, slotIndex, canchaIndex }) => {
      result.push({ ...match, time: MATCH_TIMES[slotIndex], stadium: STADIUMS[canchaIndex] });
    });
  });

  return result;
}

/**
 * Reacomoda SOLO los horarios y canchas del calendario existente para quitar
 * huecos (turnos vacíos), SIN cambiar los enfrentamientos. Agrupa por fecha y
 * vuelve a colocar los partidos VISIBLES de cada día llenando desde el primer
 * turno, respetando la regla de dueños (nunca dos del mismo dueño a la vez).
 *
 * `hiddenCategories`: categorías ocultas (suspendidas / próximamente). Sus
 * partidos NO cuentan para el llenado (así no dejan un turno visible vacío) y
 * se estacionan al final del día. Devuelve copia con `time`/`stadium` nuevos.
 */
export function repackSchedule(
  matches: Match[],
  teams: Team[],
  hiddenCategories: Category[] = []
): Match[] {
  const clubOf = new Map<string, string>();
  teams.forEach((t) => clubOf.set(t.id, t.clubId || t.id));
  const hidden = new Set(hiddenCategories);

  const byDate = new Map<string, Match[]>();
  matches.forEach((m) => {
    const arr = byDate.get(m.date) ?? [];
    arr.push(m);
    byDate.set(m.date, arr);
  });

  const result: Match[] = [];
  byDate.forEach((dayMatches) => {
    const visible = dayMatches.filter((m) => !hidden.has(m.category));
    const hiddenMs = dayMatches.filter((m) => hidden.has(m.category));

    // Programar densamente SOLO los visibles (llenan desde el turno 0).
    const unsched: UnscheduledMatch[] = visible.map((m) => ({
      category: m.category,
      round: m.round,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      isPlayoff: m.isPlayoff,
      playoffStage: m.playoffStage,
      bracketSlot: m.bracketSlot,
    }));

    let maxSlot = -1;
    if (unsched.length > 0) {
      const placements = scheduleMatchday(unsched, clubOf, MATCH_TIMES.length, STADIUMS.length);
      const slotOf = new Map<UnscheduledMatch, { slot: number; time: string; stadium: string }>();
      placements.forEach((p) => {
        maxSlot = Math.max(maxSlot, p.slotIndex);
        slotOf.set(p.match, { slot: p.slotIndex, time: MATCH_TIMES[p.slotIndex], stadium: STADIUMS[p.canchaIndex] });
      });
      visible.forEach((m, i) => {
        const pos = slotOf.get(unsched[i]);
        result.push(pos ? { ...m, time: pos.time, stadium: pos.stadium } : m);
      });
    }

    // Partidos ocultos (p. ej. +50 en "próximamente"): estacionarlos en turnos
    // posteriores para que no colisionen con los visibles ni dejen huecos.
    hiddenMs.forEach((m, i) => {
      const slot = Math.min(maxSlot + 1 + Math.floor(i / STADIUMS.length), MATCH_TIMES.length - 1);
      const cancha = i % STADIUMS.length;
      result.push({ ...m, time: MATCH_TIMES[slot], stadium: STADIUMS[cancha] });
    });
  });

  return result;
}
