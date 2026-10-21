import { describe, it, expect } from 'vitest';
import { scheduleMatchday, UnscheduledMatch, MatchdayPlacement, MAX_OWNER_FREE_SLOTS } from './matchday';
import { createRng } from './random';
import { makePairKey } from './sharedPlayers';
import { Category, CANCHAS, MATCH_TIME_SLOTS } from '@/types';

// Fechas reales del torneo (Brief 28). Los equipos sin entrada en CLUB_OF son su propio dueno.
const CLUB_OF: Record<string, string> = {
  'team-40-1': 'club-leonesq', 'team-40-2': 'club-futleg', 'team-40-3': 'club-akd',
  'team-40-4': 'club-alianza', 'team-40-5': 'club-boman', 'team-40-6': 'club-idus',
  'team-40-7': 'club-lawyers', 'team-50-1': 'club-akd', 'team-ab-1': 'club-leonesq',
  'team-ab-11': 'club-lawyers', 'team-ab-12': 'club-sanfra', 'team-ab-2': 'club-futleg',
  'team-ab-4': 'club-akd', 'team-ab-7': 'club-alianza', 'team-ab-8': 'club-boman',
  'team-ab-9': 'club-idus', 'legal-ab': 'club-legal', 'legal-40': 'club-legal',
};

type DayRow = [Category, string, string];

const DAYS: Record<string, DayRow[]> = {
  '2026-10-24': [
    ['Abierta Varones', 'team-ab-3', 'team-ab-2'], ['Abierta Varones', 'legal-ab', 'team-ab-12'],
    ['+40 Varones', 'team-ab-13', 'team-40-1'], ['Abierta Varones', 'team-ab-5', 'lexpro'],
    ['+50 Varones', 'p50-a', 'p50-b'], ['Abierta Varones', 'team-40-9', 'team-ab-4'],
    ['Abierta Varones', 'team-ab-11', 'team-ab-10'], ['+40 Varones', 'team-40-8', 'team-40-2'],
    ['+40 Varones', 'team-40-5', 'legal-40'], ['Abierta Varones', 'team-ab-7', 'team-ab-9'],
    ['Abierta Varones', 'team-ab-1', 'team-ab-8'], ['+50 Varones', 'team-50-2', 'p50-c'],
    ['+40 Varones', 'team-40-3', 'team-40-6'], ['+40 Varones', 'team-40-4', 'team-40-7'],
  ],
  '2026-10-31': [
    ['Abierta Varones', 'team-40-9', 'team-ab-5'], ['Abierta Varones', 'lexpro', 'legal-ab'],
    ['+40 Varones', 'team-40-3', 'team-40-4'], ['+40 Varones', 'legal-40', 'team-40-1'],
    ['+50 Varones', 'p50-b', 'team-50-1'], ['Abierta Varones', 'team-ab-8', 'team-ab-3'],
    ['Abierta Varones', 'team-ab-4', 'team-ab-1'], ['Abierta Varones', 'team-ab-12', 'team-ab-7'],
    ['Abierta Varones', 'team-ab-2', 'team-ab-11'], ['Abierta Varones', 'team-ab-9', 'team-ab-10'],
    ['+40 Varones', 'team-40-6', 'team-40-8'], ['+50 Varones', 'team-50-2', 'p50-a'],
    ['+40 Varones', 'team-40-2', 'team-40-5'], ['+40 Varones', 'team-40-7', 'team-ab-13'],
  ],
  '2026-11-07': [
    ['+40 Varones', 'team-40-1', 'team-40-2'], ['+40 Varones', 'team-ab-13', 'team-40-3'],
    ['+40 Varones', 'legal-40', 'team-40-7'], ['+50 Varones', 'team-50-1', 'p50-c'],
    ['+50 Varones', 'p50-b', 'p50-a'], ['Abierta Varones', 'legal-ab', 'team-ab-5'],
    ['+40 Varones', 'team-40-5', 'team-40-8'], ['Abierta Varones', 'team-ab-3', 'team-ab-4'],
    ['Abierta Varones', 'team-ab-7', 'lexpro'], ['Abierta Varones', 'team-ab-11', 'team-ab-8'],
    ['Abierta Varones', 'team-ab-9', 'team-ab-2'], ['Abierta Varones', 'team-ab-10', 'team-ab-12'],
    ['Abierta Varones', 'team-40-9', 'team-ab-1'], ['+40 Varones', 'team-40-4', 'team-40-6'],
  ],
  '2026-11-14': [
    ['Abierta Varones', 'team-40-9', 'legal-ab'], ['Abierta Varones', 'team-ab-1', 'team-ab-3'],
    ['Abierta Varones', 'team-ab-5', 'team-ab-7'], ['Abierta Varones', 'team-ab-4', 'team-ab-11'],
    ['Abierta Varones', 'team-ab-12', 'team-ab-2'], ['+40 Varones', 'team-40-4', 'team-40-1'],
    ['+40 Varones', 'team-40-2', 'team-40-7'], ['+50 Varones', 'p50-a', 'team-50-2'],
    ['+50 Varones', 'team-50-1', 'p50-b'], ['Abierta Varones', 'lexpro', 'team-ab-10'],
    ['Abierta Varones', 'team-ab-8', 'team-ab-9'], ['+40 Varones', 'team-40-3', 'team-40-6'],
    ['+40 Varones', 'legal-40', 'team-40-5'],
  ],
};

const SEEDS = 50;

function toUnscheduled(rows: readonly DayRow[]): UnscheduledMatch[] {
  return rows.map(([category, homeTeamId, awayTeamId]) => ({ category, round: 1, homeTeamId, awayTeamId }));
}

function buildClubMap(rows: readonly DayRow[]): Map<string, string> {
  const map = new Map<string, string>();
  rows.forEach(([, h, a]) => {
    map.set(h, CLUB_OF[h] ?? h);
    map.set(a, CLUB_OF[a] ?? a);
  });
  return map;
}

function slotsByOwner(placements: readonly MatchdayPlacement[], clubOf: Map<string, string>): Map<string, number[]> {
  const out = new Map<string, number[]>();
  placements.forEach((p) => {
    const owners = new Set([clubOf.get(p.match.homeTeamId)!, clubOf.get(p.match.awayTeamId)!]);
    owners.forEach((o) => out.set(o, [...(out.get(o) ?? []), p.slotIndex]));
  });
  return out;
}

function courtsAreFull(placements: readonly MatchdayPlacement[]): boolean {
  const n = placements.length;
  const minSlots = Math.ceil(n / CANCHAS.length);
  const perSlot = new Array(MATCH_TIME_SLOTS.length).fill(0);
  placements.forEach((p) => (perSlot[p.slotIndex] += 1));
  for (let s = 0; s < MATCH_TIME_SLOTS.length; s++) {
    const expected = s < minSlots - 1 ? CANCHAS.length : s === minSlots - 1 ? n - (minSlots - 1) * CANCHAS.length : 0;
    if (perSlot[s] !== expected) return false;
  }
  return true;
}

function expectOwnerRules(placements: readonly MatchdayPlacement[], clubOf: Map<string, string>): void {
  slotsByOwner(placements, clubOf).forEach((slots) => {
    const sorted = [...slots].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      const free = sorted[i] - sorted[i - 1] - 1;
      expect(free).toBeGreaterThanOrEqual(0);
      expect(free).toBeLessThanOrEqual(MAX_OWNER_FREE_SLOTS);
    }
  });
}

describe('scheduleMatchday con fechas reales del torneo', () => {
  Object.entries(DAYS).forEach(([date, rows]) => {
    it(`${date}: canchas llenas en el minimo de turnos y dueno con maximo 1 turno libre`, () => {
      const clubOf = buildClubMap(rows);
      for (let seed = 1; seed <= SEEDS; seed++) {
        const placements = scheduleMatchday(toUnscheduled(rows), clubOf, MATCH_TIME_SLOTS.length, CANCHAS.length, {
          rng: createRng(seed),
        });
        expect(placements).toHaveLength(rows.length);
        expect(courtsAreFull(placements)).toBe(true);
        expectOwnerRules(placements, clubOf);
      }
    }, 30000);
  });

  it('2026-10-24 con jugadores compartidos en AKD y Fuerza Legal', () => {
    const rows = DAYS['2026-10-24'];
    const clubOf = buildClubMap(rows);
    // AKD +50 no juega esa fecha: los pares compartidos son AKD Abierta/+40 y Fuerza Legal Abierta/+40.
    const sharedPairs = new Set([makePairKey('team-ab-4', 'team-40-3'), makePairKey('legal-ab', 'legal-40')]);
    let fullDays = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const placements = scheduleMatchday(toUnscheduled(rows), clubOf, MATCH_TIME_SLOTS.length, CANCHAS.length, {
        rng: createRng(seed),
        sharedPairs,
      });
      expectOwnerRules(placements, clubOf);
      const slotOfTeam = new Map<string, number>();
      placements.forEach((p) => {
        slotOfTeam.set(p.match.homeTeamId, p.slotIndex);
        slotOfTeam.set(p.match.awayTeamId, p.slotIndex);
      });
      sharedPairs.forEach((key) => {
        const [a, b] = key.split('|');
        const diff = Math.abs(slotOfTeam.get(a)! - slotOfTeam.get(b)!);
        expect(diff).toBeGreaterThanOrEqual(2);
      });
      if (courtsAreFull(placements)) fullDays += 1;
    }
    expect(fullDays / SEEDS).toBeGreaterThanOrEqual(0.9);
  }, 30000);
});
