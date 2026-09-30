import { Match, Team, Category, MATCH_TIMES } from '@/types';

export type SlotHistory = ReadonlyMap<string, readonly number[]>;

export interface TeamFairnessReport {
  teamId: string;
  teamName: string;
  category: Category;
  matchesCount: number;
  earlyPct: number;
  latePct: number;
  avgSlot: number;
}

/**
 * Determina el tercio del dia correspondiente al turno:
 * 0: temprano, 1: medio, 2: tarde.
 */
export function slotBand(slot: number, slotCount: number): 0 | 1 | 2 {
  if (slotCount <= 0) return 0;
  const third = slotCount / 3;
  if (slot < third) return 0;
  if (slot < 2 * third) return 1;
  return 2;
}

/**
 * Calcula el coste de equidad de ubicar un equipo en un turno:
 * Cuantas veces ya jugo en la misma franja (tercio) que slot,
 * mas la mitad de las veces que jugo exactamente en ese turno.
 */
export function fairnessCost(
  history: SlotHistory,
  teamId: string,
  slot: number,
  slotCount: number
): number {
  const counts = history.get(teamId);
  if (!counts || counts.length === 0) return 0;

  const targetBand = slotBand(slot, slotCount);
  let bandCount = 0;
  for (let s = 0; s < slotCount; s++) {
    if (slotBand(s, slotCount) === targetBand) {
      bandCount += counts[s] ?? 0;
    }
  }

  const exactCount = counts[slot] ?? 0;
  return bandCount + 0.5 * exactCount;
}

/**
 * Construye el historial de turnos jugados por equipo a partir de los partidos con horario asignado.
 * Ignora partidos de playoffs y partidos sin equipos definidos.
 */
export function buildSlotHistory(
  matches: Match[],
  slotCount: number
): SlotHistory {
  const history = new Map<string, number[]>();

  const recordTeamSlot = (teamId: string, slot: number) => {
    if (!teamId) return;
    let arr = history.get(teamId);
    if (!arr) {
      arr = new Array(slotCount).fill(0);
      history.set(teamId, arr);
    }
    if (slot >= 0 && slot < slotCount) {
      arr[slot] += 1;
    }
  };

  for (const m of matches) {
    if (m.isPlayoff) continue;
    if (!m.homeTeamId || !m.awayTeamId) continue;
    const slot = (MATCH_TIMES as readonly string[]).indexOf(m.time);
    if (slot < 0 || slot >= slotCount) continue;

    recordTeamSlot(m.homeTeamId, slot);
    recordTeamSlot(m.awayTeamId, slot);
  }

  return history;
}

export interface MatchPlacementInfo {
  homeTeamId: string;
  awayTeamId: string;
  slotIndex: number;
}

/**
 * Agrega asignaciones de partidos al historial existente devolviendo un nuevo mapa inmutable.
 */
export function addToHistory(
  history: SlotHistory,
  placements: readonly MatchPlacementInfo[],
  slotCount: number
): SlotHistory {
  const nextHistory = new Map<string, number[]>();

  history.forEach((counts, teamId) => {
    nextHistory.set(teamId, [...counts]);
  });

  const getOrCreate = (teamId: string): number[] => {
    let arr = nextHistory.get(teamId);
    if (!arr) {
      arr = new Array(slotCount).fill(0);
      nextHistory.set(teamId, arr);
    }
    return arr;
  };

  for (const p of placements) {
    if (p.slotIndex >= 0 && p.slotIndex < slotCount) {
      if (p.homeTeamId) {
        getOrCreate(p.homeTeamId)[p.slotIndex] += 1;
      }
      if (p.awayTeamId) {
        getOrCreate(p.awayTeamId)[p.slotIndex] += 1;
      }
    }
  }

  return nextHistory;
}

/**
 * Genera el informe de equidad de horarios por equipo sobre el calendario provisto.
 * % temprano corresponde a los dos primeros turnos (08:00 y 09:15).
 * % tarde corresponde al ultimo tercio del dia.
 */
interface TeamSlotStats {
  total: number;
  early: number;
  late: number;
  slotSum: number;
}

function collectTeamSlotStats(
  matches: Match[],
  teams: Team[],
  slotCount: number
): Map<string, TeamSlotStats> {
  const stats = new Map<string, TeamSlotStats>();
  for (const t of teams) {
    stats.set(t.id, { total: 0, early: 0, late: 0, slotSum: 0 });
  }

  for (const m of matches) {
    if (m.isPlayoff || !m.homeTeamId || !m.awayTeamId) continue;
    const slot = (MATCH_TIMES as readonly string[]).indexOf(m.time);
    if (slot < 0 || slot >= slotCount) continue;

    const isEarly = slot <= 1;
    const isLate = slotBand(slot, slotCount) === 2;

    for (const teamId of [m.homeTeamId, m.awayTeamId]) {
      const entry = stats.get(teamId);
      if (entry) {
        entry.total += 1;
        if (isEarly) entry.early += 1;
        if (isLate) entry.late += 1;
        entry.slotSum += slot;
      }
    }
  }
  return stats;
}

/**
 * Genera el informe de equidad de horarios por equipo sobre el calendario provisto.
 * % temprano corresponde a los dos primeros turnos (08:00 y 09:15).
 * % tarde corresponde al ultimo tercio del dia.
 */
export function fairnessReport(
  matches: Match[],
  teams: Team[],
  slotCount: number
): TeamFairnessReport[] {
  const teamStats = collectTeamSlotStats(matches, teams, slotCount);
  const reports: TeamFairnessReport[] = [];

  for (const t of teams) {
    const stats = teamStats.get(t.id) ?? { total: 0, early: 0, late: 0, slotSum: 0 };
    const matchesCount = stats.total;
    const earlyPct = matchesCount > 0 ? (stats.early / matchesCount) * 100 : 0;
    const latePct = matchesCount > 0 ? (stats.late / matchesCount) * 100 : 0;
    const avgSlot = matchesCount > 0 ? stats.slotSum / matchesCount : 0;

    reports.push({
      teamId: t.id,
      teamName: t.name,
      category: t.category,
      matchesCount,
      earlyPct,
      latePct,
      avgSlot,
    });
  }

  return reports.sort((a, b) => a.avgSlot - b.avgSlot);
}
