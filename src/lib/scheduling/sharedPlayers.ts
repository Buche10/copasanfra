import { Player, Team, Match, MATCH_TIMES } from '@/types';

/**
 * Normaliza una cedula eliminando espacios, puntos y guiones.
 */
export function normalizeCedula(cedula?: string): string {
  if (!cedula) return '';
  return cedula.trim().replace(/[-.\s]/g, '');
}

/**
 * Genera la clave ordenada "teamA|teamB" con teamA < teamB para representar el par.
 */
export function makePairKey(teamA: string, teamB: string): string {
  return teamA < teamB ? `${teamA}|${teamB}` : `${teamB}|${teamA}`;
}

/**
 * Indica si dos equipos distintos tienen al menos un jugador en comun.
 */
export function sharesPlayers(
  pairs: ReadonlySet<string>,
  teamA: string,
  teamB: string
): boolean {
  if (teamA === teamB) return false;
  return pairs.has(makePairKey(teamA, teamB));
}

/**
 * Construye el conjunto de pares de equipos que comparten al menos una cedula.
 * Ignora jugadores sin cedula, cedulas vacias y jugadores con estado REJECTED.
 * No genera pares de un equipo consigo mismo.
 */
export function buildSharedPlayerPairs(players: Player[]): ReadonlySet<string> {
  const cedulaToTeams = new Map<string, Set<string>>();

  for (const player of players) {
    if (player.approvalStatus === 'REJECTED') continue;
    const norm = normalizeCedula(player.cedula);
    if (!norm) continue;

    let teamsSet = cedulaToTeams.get(norm);
    if (!teamsSet) {
      teamsSet = new Set<string>();
      cedulaToTeams.set(norm, teamsSet);
    }
    teamsSet.add(player.teamId);
  }

  const pairs = new Set<string>();
  for (const teamsSet of cedulaToTeams.values()) {
    if (teamsSet.size < 2) continue;
    const teamList = Array.from(teamsSet);
    for (let i = 0; i < teamList.length; i++) {
      for (let j = i + 1; j < teamList.length; j++) {
        pairs.add(makePairKey(teamList[i], teamList[j]));
      }
    }
  }

  return pairs;
}

export interface SharedPlayerPairDetail {
  pairKey: string;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  commonPlayerCount: number;
}

interface PairCountEntry {
  teamA: string;
  teamB: string;
  count: number;
}

function buildPairCounts(players: Player[]): Map<string, PairCountEntry> {
  const cedulaToTeams = new Map<string, Set<string>>();
  for (const player of players) {
    if (player.approvalStatus === 'REJECTED') continue;
    const norm = normalizeCedula(player.cedula);
    if (!norm) continue;
    let set = cedulaToTeams.get(norm);
    if (!set) {
      set = new Set();
      cedulaToTeams.set(norm, set);
    }
    set.add(player.teamId);
  }

  const pairCounts = new Map<string, PairCountEntry>();
  for (const set of cedulaToTeams.values()) {
    if (set.size < 2) continue;
    const list = Array.from(set);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const teamA = list[i] < list[j] ? list[i] : list[j];
        const teamB = list[i] < list[j] ? list[j] : list[i];
        const key = `${teamA}|${teamB}`;
        const entry = pairCounts.get(key) ?? { teamA, teamB, count: 0 };
        entry.count += 1;
        pairCounts.set(key, entry);
      }
    }
  }
  return pairCounts;
}

/**
 * Obtiene los detalles de los pares de equipos que comparten jugadores para la interfaz,
 * sin exponer cedulas ni nombres de jugadores.
 */
export function getSharedPlayerPairDetails(
  players: Player[],
  teams: Team[]
): SharedPlayerPairDetail[] {
  const teamMap = new Map<string, string>();
  teams.forEach((t) => teamMap.set(t.id, t.name));

  const pairCounts = buildPairCounts(players);
  const result: SharedPlayerPairDetail[] = [];

  pairCounts.forEach((val, key) => {
    const rawNameA = teamMap.get(val.teamA) ?? val.teamA;
    const rawNameB = teamMap.get(val.teamB) ?? val.teamB;
    const isOrdered = rawNameA.localeCompare(rawNameB) <= 0;
    result.push({
      pairKey: key,
      teamAId: isOrdered ? val.teamA : val.teamB,
      teamBId: isOrdered ? val.teamB : val.teamA,
      teamAName: isOrdered ? rawNameA : rawNameB,
      teamBName: isOrdered ? rawNameB : rawNameA,
      commonPlayerCount: val.count,
    });
  });

  return result.sort((a, b) => a.teamAName.localeCompare(b.teamAName));
}

export interface SharedPlayerConflict {
  date: string;
  teamAName: string;
  teamBName: string;
  slotA: number;
  slotB: number;
  timeA: string;
  timeB: string;
  type: 'SIMULTANEOUS' | 'CONSECUTIVE';
}

function checkMatchesConflict(
  m1: Match,
  m2: Match,
  pairs: ReadonlySet<string>,
  teamMap: Map<string, string>
): SharedPlayerConflict | null {
  const s1 = (MATCH_TIMES as readonly string[]).indexOf(m1.time);
  const s2 = (MATCH_TIMES as readonly string[]).indexOf(m2.time);
  if (s1 === -1 || s2 === -1) return null;

  const diff = Math.abs(s1 - s2);
  if (diff > 1) return null;

  for (const t1 of [m1.homeTeamId, m1.awayTeamId]) {
    for (const t2 of [m2.homeTeamId, m2.awayTeamId]) {
      if (sharesPlayers(pairs, t1, t2)) {
        return {
          date: m1.date,
          teamAName: teamMap.get(t1) ?? t1,
          teamBName: teamMap.get(t2) ?? t2,
          slotA: s1,
          slotB: s2,
          timeA: m1.time,
          timeB: m2.time,
          type: diff === 0 ? 'SIMULTANEOUS' : 'CONSECUTIVE',
        };
      }
    }
  }
  return null;
}

/**
 * Busca conflictos de horario en fechas futuras donde dos equipos que comparten jugadores
 * juegan de forma simultanea o en turnos consecutivos.
 */
export function findSharedPlayerConflicts(
  matches: Match[],
  pairs: ReadonlySet<string>,
  teams: Team[],
  today: string
): SharedPlayerConflict[] {
  if (pairs.size === 0) return [];
  const teamMap = new Map<string, string>();
  teams.forEach((t) => teamMap.set(t.id, t.name));

  const futureMatches = matches.filter((m) => m.date > today && m.time);
  const byDate = new Map<string, Match[]>();
  futureMatches.forEach((m) => {
    const arr = byDate.get(m.date) ?? [];
    arr.push(m);
    byDate.set(m.date, arr);
  });

  const conflicts: SharedPlayerConflict[] = [];
  byDate.forEach((dayMatches) => {
    for (let i = 0; i < dayMatches.length; i++) {
      for (let j = i + 1; j < dayMatches.length; j++) {
        const conflict = checkMatchesConflict(dayMatches[i], dayMatches[j], pairs, teamMap);
        if (conflict) conflicts.push(conflict);
      }
    }
  });

  return conflicts;
}
