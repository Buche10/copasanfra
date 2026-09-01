import {
  Team,
  Player,
  Match,
  User,
  TeamStanding,
  PlayerScorer,
  PlayerSanction,
  Category,
  GoalkeeperStat
} from '@/types';
import {
  INITIAL_TEAMS,
  INITIAL_PLAYERS,
  INITIAL_MATCHES,
  INITIAL_USERS
} from './mockData';
import { supabase, TABLES, isSupabaseConfigured } from './supabase';

// ----------------------------------------------------
// DATA ACCESS (Supabase)
// ----------------------------------------------------
// Each row is { id, data (jsonb) }, so the app's TypeScript shapes are
// preserved verbatim. Reads/writes are async.

interface Row<T> {
  id: string;
  data: T;
}

function assertConfigured(): void {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase no está configurado. Define NEXT_PUBLIC_SUPABASE_URL y ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local (local) y en Netlify (producción).'
    );
  }
}

async function selectAll<T>(table: string): Promise<T[]> {
  assertConfigured();
  const { data, error } = await supabase.from(table).select('id, data');
  if (error) throw new Error(`Error al leer "${table}": ${error.message}`);
  return (data ?? []).map((r) => (r as Row<T>).data);
}

async function upsertRows<T extends { id: string }>(table: string, items: T[]): Promise<void> {
  assertConfigured();
  if (items.length === 0) return;
  const rows = items.map((item) => ({ id: item.id, data: item, updated_at: new Date().toISOString() }));
  const { error } = await supabase.from(table).upsert(rows);
  if (error) throw new Error(`Error al guardar en "${table}": ${error.message}`);
}

// Plain INSERT (no ON CONFLICT). Needed for the public registration: under RLS
// an anon upsert would also require an UPDATE policy, which anon must not have.
// For brand-new rows (unique id) a plain insert is the correct operation.
async function insertRows<T extends { id: string }>(table: string, items: T[]): Promise<void> {
  assertConfigured();
  if (items.length === 0) return;
  const rows = items.map((item) => ({ id: item.id, data: item, updated_at: new Date().toISOString() }));
  const { error } = await supabase.from(table).insert(rows);
  if (error) throw new Error(`Error al guardar en "${table}": ${error.message}`);
}

async function deleteAllRows(table: string): Promise<void> {
  assertConfigured();
  const { error } = await supabase.from(table).delete().neq('id', '');
  if (error) throw new Error(`Error al limpiar "${table}": ${error.message}`);
}

// ---- Reads ----
export async function getTeams(): Promise<Team[]> {
  return selectAll<Team>(TABLES.TEAMS);
}

// Public read: players WITHOUT sensitive fields (cedula, verificationDoc).
export async function getPlayers(): Promise<Player[]> {
  return selectAll<Player>(TABLES.PLAYERS_PUBLIC);
}

// Authenticated read: full player records including sensitive fields. Used by
// admins/referees (e.g. to review documents during approval, QR check-in).
export async function getPlayersFull(): Promise<Player[]> {
  return selectAll<Player>(TABLES.PLAYERS);
}

export async function getMatches(): Promise<Match[]> {
  return selectAll<Match>(TABLES.MATCHES);
}

export async function getUsers(): Promise<User[]> {
  return selectAll<User>(TABLES.USERS);
}

// ---- Writes ----
export async function upsertTeam(team: Team): Promise<void> {
  return upsertRows(TABLES.TEAMS, [team]);
}

export async function upsertPlayer(player: Player): Promise<void> {
  return upsertRows(TABLES.PLAYERS, [player]);
}

// Crear un jugador NUEVO (inscripción pública o alta desde Admin). Usa insert
// (no upsert) para que la inscripción anónima funcione bajo RLS.
export async function insertPlayer(player: Player): Promise<void> {
  return insertRows(TABLES.PLAYERS, [player]);
}

// Eliminar un jugador de la base (p. ej. al rechazar una inscripción).
export async function deletePlayer(id: string): Promise<void> {
  assertConfigured();
  const { error } = await supabase.from(TABLES.PLAYERS).delete().eq('id', id);
  if (error) throw new Error(`Error al eliminar el jugador: ${error.message}`);
}

export async function upsertMatch(match: Match): Promise<void> {
  return upsertRows(TABLES.MATCHES, [match]);
}

// Replaces the entire fixture (used when regenerating the schedule).
export async function replaceMatches(matches: Match[]): Promise<void> {
  await deleteAllRows(TABLES.MATCHES);
  await upsertRows(TABLES.MATCHES, matches);
}

// Loads the demo dataset. Admin-only action (requires an authenticated
// session because writes are restricted by RLS).
export async function resetAllDataToDefault(): Promise<void> {
  await deleteAllRows(TABLES.TEAMS);
  await deleteAllRows(TABLES.PLAYERS);
  await deleteAllRows(TABLES.MATCHES);
  await deleteAllRows(TABLES.USERS);

  await upsertRows(TABLES.TEAMS, INITIAL_TEAMS);
  await upsertRows(TABLES.PLAYERS, INITIAL_PLAYERS);
  await upsertRows(TABLES.MATCHES, INITIAL_MATCHES);
  await upsertRows(TABLES.USERS, INITIAL_USERS);
}

// ----------------------------------------------------
// BACKUP / RESTORE (Export & Import full dataset as JSON)
// ----------------------------------------------------

const BACKUP_VERSION = 5;

export interface BackupData {
  version: number;
  exportedAt: string;
  teams: Team[];
  players: Player[];
  matches: Match[];
  users: User[];
}

export async function exportAllData(): Promise<BackupData> {
  const [teams, players, matches, users] = await Promise.all([
    getTeams(),
    getPlayersFull(),
    getMatches(),
    getUsers(),
  ]);
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    teams,
    players,
    matches,
    users,
  };
}

/**
 * Restore a full dataset from a parsed JSON object, replacing current data.
 * Returns an error message on invalid input, or null on success.
 */
export async function importAllData(raw: unknown): Promise<string | null> {
  if (typeof raw !== 'object' || raw === null) {
    return 'El archivo no tiene un formato válido.';
  }

  const data = raw as Partial<BackupData>;

  if (!Array.isArray(data.teams) || !Array.isArray(data.players) || !Array.isArray(data.matches)) {
    return 'Faltan datos obligatorios (equipos, jugadores o partidos).';
  }

  await deleteAllRows(TABLES.TEAMS);
  await deleteAllRows(TABLES.PLAYERS);
  await deleteAllRows(TABLES.MATCHES);
  await upsertRows(TABLES.TEAMS, data.teams);
  await upsertRows(TABLES.PLAYERS, data.players);
  await upsertRows(TABLES.MATCHES, data.matches);

  if (Array.isArray(data.users)) {
    await deleteAllRows(TABLES.USERS);
    await upsertRows(TABLES.USERS, data.users);
  }

  return null;
}

// ----------------------------------------------------
// STATISTICAL CALCULATIONS
// ----------------------------------------------------

export function calculateStandings(teams: Team[], matches: Match[], category?: Category | 'ALL'): TeamStanding[] {
  const filteredTeams = !category || category === 'ALL' ? teams : teams.filter(t => t.category === category);
  const filteredMatches = !category || category === 'ALL' ? matches : matches.filter(m => m.category === category);

  const standingsMap: Record<string, TeamStanding> = {};

  filteredTeams.forEach((t) => {
    standingsMap[t.id] = {
      teamId: t.id,
      teamName: t.name,
      shortName: t.shortName,
      logo: t.logo,
      primaryColor: t.primaryColor,
      pj: 0,
      pg: 0,
      pe: 0,
      pp: 0,
      gf: 0,
      gc: 0,
      dg: 0,
      yellowCards: 0,
      redCards: 0,
      fairPlayPoints: 0,
      pts: 0,
    };
  });

  filteredMatches.forEach((m) => {
    // Count finished matches for team points
    if (m.status === 'FINISHED') {
      const home = standingsMap[m.homeTeamId];
      const away = standingsMap[m.awayTeamId];

      if (home && away) {
        home.pj += 1;
        away.pj += 1;

        home.gf += m.homeScore;
        home.gc += m.awayScore;
        away.gf += m.awayScore;
        away.gc += m.homeScore;

        if (m.homeScore > m.awayScore) {
          home.pg += 1;
          home.pts += 3;
          away.pp += 1;
        } else if (m.awayScore > m.homeScore) {
          away.pg += 1;
          away.pts += 3;
          home.pp += 1;
        } else {
          home.pe += 1;
          home.pts += 1;
          away.pe += 1;
          away.pts += 1;
        }
      }
    }

    // Count cards across finished and live matches
    if (m.status === 'FINISHED' || m.status === 'IN_PROGRESS') {
      m.events.forEach((ev) => {
        const team = standingsMap[ev.teamId];
        if (team) {
          if (ev.type === 'YELLOW_CARD') team.yellowCards += 1;
          if (ev.type === 'RED_CARD') team.redCards += 1;
        }
      });
    }
  });

  // Calculate GD & Fair play points
  Object.values(standingsMap).forEach((st) => {
    st.dg = st.gf - st.gc;
    st.fairPlayPoints = st.yellowCards * 1 + st.redCards * 3;
  });

  // Tiebreaker order: Pts -> Enfrentamiento directo (mini-liga entre empatados)
  // -> Diferencia de goles -> Goles a favor -> Fair Play.
  // Para cambiar el orden, reordená los criterios en overallCompare / el sort del grupo.
  const allStandings = Object.values(standingsMap);

  // Head-to-head mini-league among a set of tied teams (only matches between them)
  const computeHeadToHead = (groupIds: Set<string>) => {
    const h2h: Record<string, { pts: number; dg: number; gf: number }> = {};
    groupIds.forEach((id) => {
      h2h[id] = { pts: 0, dg: 0, gf: 0 };
    });

    filteredMatches.forEach((m) => {
      if (m.status !== 'FINISHED') return;
      if (!groupIds.has(m.homeTeamId) || !groupIds.has(m.awayTeamId)) return;

      h2h[m.homeTeamId].gf += m.homeScore;
      h2h[m.homeTeamId].dg += m.homeScore - m.awayScore;
      h2h[m.awayTeamId].gf += m.awayScore;
      h2h[m.awayTeamId].dg += m.awayScore - m.homeScore;

      if (m.homeScore > m.awayScore) {
        h2h[m.homeTeamId].pts += 3;
      } else if (m.awayScore > m.homeScore) {
        h2h[m.awayTeamId].pts += 3;
      } else {
        h2h[m.homeTeamId].pts += 1;
        h2h[m.awayTeamId].pts += 1;
      }
    });

    return h2h;
  };

  const overallCompare = (a: TeamStanding, b: TeamStanding) => {
    if (b.dg !== a.dg) return b.dg - a.dg;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.fairPlayPoints - b.fairPlayPoints;
  };

  // 1. Primary sort by points
  allStandings.sort((a, b) => b.pts - a.pts);

  // 2. Break ties within equal-points groups by head-to-head, then overall criteria
  const sorted: TeamStanding[] = [];
  let i = 0;
  while (i < allStandings.length) {
    let j = i;
    while (j < allStandings.length && allStandings[j].pts === allStandings[i].pts) j++;

    const group = allStandings.slice(i, j);
    if (group.length > 1) {
      const groupIds = new Set(group.map((s) => s.teamId));
      const h2h = computeHeadToHead(groupIds);
      group.sort((a, b) => {
        const ha = h2h[a.teamId];
        const hb = h2h[b.teamId];
        if (hb.pts !== ha.pts) return hb.pts - ha.pts;
        if (hb.dg !== ha.dg) return hb.dg - ha.dg;
        if (hb.gf !== ha.gf) return hb.gf - ha.gf;
        return overallCompare(a, b);
      });
    }

    sorted.push(...group);
    i = j;
  }

  return sorted;
}

export function calculateScorers(players: Player[], teams: Team[], matches: Match[], category?: Category | 'ALL'): PlayerScorer[] {
  const filteredTeams = !category || category === 'ALL' ? teams : teams.filter(t => t.category === category);
  const teamIds = new Set(filteredTeams.map(t => t.id));
  const filteredPlayers = !category || category === 'ALL' ? players : players.filter(p => teamIds.has(p.teamId));
  const filteredMatches = !category || category === 'ALL' ? matches : matches.filter(m => m.category === category);

  const teamMap = new Map(filteredTeams.map((t) => [t.id, t]));
  const playerMap = new Map(filteredPlayers.map((p) => [p.id, p]));

  const scorerStats: Record<string, { goals: number; penalties: number; matchesSet: Set<string> }> = {};

  filteredMatches.forEach((m) => {
    if (m.status === 'FINISHED' || m.status === 'IN_PROGRESS') {
      m.events.forEach((ev) => {
        if (ev.type === 'GOAL' && ev.goalType !== 'OWN_GOAL') {
          if (!scorerStats[ev.playerId]) {
            scorerStats[ev.playerId] = { goals: 0, penalties: 0, matchesSet: new Set() };
          }
          scorerStats[ev.playerId].goals += 1;
          if (ev.goalType === 'PENALTY') {
            scorerStats[ev.playerId].penalties += 1;
          }
          scorerStats[ev.playerId].matchesSet.add(m.id);
        }
      });

      // Track lineups for matches played
      [...m.homeLineup, ...m.awayLineup].forEach((lp) => {
        if (!scorerStats[lp.playerId]) {
          scorerStats[lp.playerId] = { goals: 0, penalties: 0, matchesSet: new Set() };
        }
        scorerStats[lp.playerId].matchesSet.add(m.id);
      });
    }
  });

  const scorersList: PlayerScorer[] = [];

  Object.entries(scorerStats).forEach(([playerId, stat]) => {
    if (stat.goals > 0) {
      const player = playerMap.get(playerId);
      if (player) {
        const team = teamMap.get(player.teamId);
        scorersList.push({
          playerId: player.id,
          playerName: player.name,
          playerPhoto: player.photo,
          dorsal: player.dorsal,
          position: player.position,
          teamId: player.teamId,
          teamName: team?.name || 'Equipo',
          teamLogo: team?.logo || '⚽',
          goals: stat.goals,
          penalties: stat.penalties,
          matchesPlayed: stat.matchesSet.size,
        });
      }
    }
  });

  return scorersList.sort((a, b) => {
    if (b.goals !== a.goals) return b.goals - a.goals;
    if (a.penalties !== b.penalties) return a.penalties - b.penalties;
    return a.matchesPlayed - b.matchesPlayed;
  });
}

export function calculateSanctions(players: Player[], teams: Team[], matches: Match[], category?: Category | 'ALL'): PlayerSanction[] {
  const filteredTeams = !category || category === 'ALL' ? teams : teams.filter(t => t.category === category);
  const teamIds = new Set(filteredTeams.map(t => t.id));
  const filteredPlayers = !category || category === 'ALL' ? players : players.filter(p => teamIds.has(p.teamId));
  const filteredMatches = !category || category === 'ALL' ? matches : matches.filter(m => m.category === category);

  const teamMap = new Map(filteredTeams.map((t) => [t.id, t]));

  const playerStats: Record<
    string,
    {
      yellowCards: number;
      doubleYellows: number;
      directReds: number;
      lastRedReason?: string;
    }
  > = {};

  filteredMatches.forEach((m) => {
    if (m.status === 'FINISHED' || m.status === 'IN_PROGRESS') {
      const matchPlayerYellows: Record<string, number> = {};

      m.events.forEach((ev) => {
        if (!playerStats[ev.playerId]) {
          playerStats[ev.playerId] = {
            yellowCards: 0,
            doubleYellows: 0,
            directReds: 0,
          };
        }

        if (ev.type === 'YELLOW_CARD') {
          playerStats[ev.playerId].yellowCards += 1;
          matchPlayerYellows[ev.playerId] = (matchPlayerYellows[ev.playerId] || 0) + 1;

          if (matchPlayerYellows[ev.playerId] === 2) {
            playerStats[ev.playerId].doubleYellows += 1;
          }
        }

        if (ev.type === 'RED_CARD') {
          if (!ev.isDoubleYellow) {
            playerStats[ev.playerId].directReds += 1;
            playerStats[ev.playerId].lastRedReason = ev.cardReason || 'Falta grave';
          }
        }
      });
    }
  });

  const sanctions: PlayerSanction[] = [];

  filteredPlayers.forEach((p) => {
    const stat = playerStats[p.id] || { yellowCards: 0, doubleYellows: 0, directReds: 0 };
    const team = teamMap.get(p.teamId);

    const yellowAccumulationMatches = Math.floor(stat.yellowCards / 5);
    const doubleYellowMatches = stat.doubleYellows * 1;
    const directRedMatches = stat.directReds * 2;

    const totalMatchesRemaining = yellowAccumulationMatches + doubleYellowMatches + directRedMatches;
    const isSuspended = totalMatchesRemaining > 0;

    const reasons: string[] = [];
    if (directRedMatches > 0) {
      reasons.push(`Roja Directa (${directRedMatches} partido${directRedMatches > 1 ? 's' : ''})`);
    }
    if (doubleYellowMatches > 0) {
      reasons.push(`Doble Amarilla (${doubleYellowMatches} partido)`);
    }
    if (yellowAccumulationMatches > 0) {
      reasons.push(`5 Amarillas (${yellowAccumulationMatches} partido)`);
    }

    const reasonStr = reasons.length > 0 ? reasons.join(' • ') : '';
    const totalRedCards = stat.directReds + stat.doubleYellows;

    if (stat.yellowCards > 0 || totalRedCards > 0 || isSuspended) {
      sanctions.push({
        playerId: p.id,
        playerName: p.name,
        dorsal: p.dorsal,
        teamId: p.teamId,
        teamName: team?.name || 'Equipo',
        teamLogo: team?.logo || '⚽',
        yellowCards: stat.yellowCards,
        redCards: totalRedCards,
        isSuspended,
        suspensionReason: reasonStr,
        matchesRemaining: totalMatchesRemaining,
      });
    }
  });

  return sanctions.sort((a, b) => {
    if (a.isSuspended !== b.isSuspended) return a.isSuspended ? -1 : 1;
    if (b.matchesRemaining !== a.matchesRemaining) return b.matchesRemaining - a.matchesRemaining;
    if (b.redCards !== a.redCards) return b.redCards - a.redCards;
    return b.yellowCards - a.yellowCards;
  });
}

export function calculateGoalkeepers(
  players: Player[],
  teams: Team[],
  matches: Match[],
  category?: Category | 'ALL'
): GoalkeeperStat[] {
  const filteredTeams = !category || category === 'ALL' ? teams : teams.filter((t) => t.category === category);
  const teamIds = new Set(filteredTeams.map((t) => t.id));
  const filteredMatches = !category || category === 'ALL' ? matches : matches.filter((m) => m.category === category);
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  // Map key: player.id OR team-gk-{team.id}
  const gkStatsMap: Record<
    string,
    {
      playerId?: string;
      teamId: string;
      goalsConceded: number;
      matchesPlayed: number;
      cleanSheets: number;
    }
  > = {};

  // Initialize entries for teams
  filteredTeams.forEach((team) => {
    const mainGk = players.find((p) => p.teamId === team.id && p.position === 'POR');
    const key = mainGk ? mainGk.id : `team-gk-${team.id}`;
    gkStatsMap[key] = {
      playerId: mainGk?.id,
      teamId: team.id,
      goalsConceded: 0,
      matchesPlayed: 0,
      cleanSheets: 0,
    };
  });

  filteredMatches.forEach((m) => {
    if (m.status === 'FINISHED') {
      // Home Goalkeeper
      const homeGkId = m.homeGoalkeeperId 
        || m.homeLineup.find((l) => l.isGoalkeeper)?.playerId
        || players.find((p) => p.teamId === m.homeTeamId && p.position === 'POR')?.id;

      const homeKey = homeGkId || `team-gk-${m.homeTeamId}`;

      if (!gkStatsMap[homeKey]) {
        gkStatsMap[homeKey] = {
          playerId: homeGkId,
          teamId: m.homeTeamId,
          goalsConceded: 0,
          matchesPlayed: 0,
          cleanSheets: 0,
        };
      }
      gkStatsMap[homeKey].matchesPlayed += 1;
      gkStatsMap[homeKey].goalsConceded += m.awayScore;
      if (m.awayScore === 0) gkStatsMap[homeKey].cleanSheets += 1;

      // Away Goalkeeper
      const awayGkId = m.awayGoalkeeperId 
        || m.awayLineup.find((l) => l.isGoalkeeper)?.playerId
        || players.find((p) => p.teamId === m.awayTeamId && p.position === 'POR')?.id;

      const awayKey = awayGkId || `team-gk-${m.awayTeamId}`;

      if (!gkStatsMap[awayKey]) {
        gkStatsMap[awayKey] = {
          playerId: awayGkId,
          teamId: m.awayTeamId,
          goalsConceded: 0,
          matchesPlayed: 0,
          cleanSheets: 0,
        };
      }
      gkStatsMap[awayKey].matchesPlayed += 1;
      gkStatsMap[awayKey].goalsConceded += m.homeScore;
      if (m.homeScore === 0) gkStatsMap[awayKey].cleanSheets += 1;
    }
  });

  const goalkeeperList: GoalkeeperStat[] = [];

  Object.values(gkStatsMap).forEach((stat) => {
    const team = teamMap.get(stat.teamId);
    if (!team) return;
    if (!teamIds.has(team.id)) return;

    const player = stat.playerId ? playerMap.get(stat.playerId) : undefined;
    const ratio = stat.matchesPlayed > 0 ? stat.goalsConceded / stat.matchesPlayed : 0;

    goalkeeperList.push({
      playerId: player?.id,
      playerName: player ? player.name : `Arquero de ${team.shortName}`,
      playerPhoto: player?.photo,
      dorsal: player?.dorsal || 1,
      teamId: team.id,
      teamName: team.name,
      teamLogo: team.logo,
      primaryColor: team.primaryColor,
      category: team.category,
      goalsConceded: stat.goalsConceded,
      matchesPlayed: stat.matchesPlayed,
      cleanSheets: stat.cleanSheets,
      ratio: Number(ratio.toFixed(2)),
    });
  });

  return goalkeeperList.sort((a, b) => {
    if (a.matchesPlayed === 0 && b.matchesPlayed === 0) return a.teamName.localeCompare(b.teamName);
    if (a.matchesPlayed === 0) return 1;
    if (b.matchesPlayed === 0) return -1;

    if (a.ratio !== b.ratio) return a.ratio - b.ratio;
    if (b.cleanSheets !== a.cleanSheets) return b.cleanSheets - a.cleanSheets;
    return a.goalsConceded - b.goalsConceded;
  });
}
