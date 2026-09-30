import { Match } from '@/types';

export interface MatchDiff {
  upserts: Match[];
  deleteIds: string[];
}

function normalizeValue(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) return val.map(normalizeValue);
  if (typeof val === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(val as Record<string, unknown>).sort()) {
      sorted[k] = normalizeValue((val as Record<string, unknown>)[k]);
    }
    return sorted;
  }
  return val;
}

export function matchesAreEqual(a: Match, b: Match): boolean {
  return JSON.stringify(normalizeValue(a)) === JSON.stringify(normalizeValue(b));
}

/**
 * Compara dos colecciones de partidos y calcula diferencias deterministas.
 * No muta los arreglos de entrada.
 */
export function diffMatches(before: readonly Match[], after: readonly Match[]): MatchDiff {
  const beforeMap = new Map<string, Match>();
  for (const m of before) {
    beforeMap.set(m.id, m);
  }

  const afterMap = new Map<string, Match>();
  const upserts: Match[] = [];

  for (const m of after) {
    afterMap.set(m.id, m);
    const prev = beforeMap.get(m.id);
    if (!prev || !matchesAreEqual(prev, m)) {
      upserts.push(m);
    }
  }

  const deleteIds: string[] = [];
  for (const m of before) {
    if (!afterMap.has(m.id)) {
      deleteIds.push(m.id);
    }
  }

  return { upserts, deleteIds };
}
