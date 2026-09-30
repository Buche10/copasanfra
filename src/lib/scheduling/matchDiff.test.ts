import { describe, it, expect, vi, beforeEach } from 'vitest';
import { diffMatches, matchesAreEqual } from './matchDiff';
import { applyMatchChanges } from '../store';
import { supabase } from '../supabase';
import { Match, MatchEvent } from '@/types';

vi.mock('../supabase', () => {
  return {
    isSupabaseConfigured: true,
    TABLES: {
      MATCHES: 'matches',
    },
    supabase: {
      from: vi.fn(),
    },
  };
});

function createSampleMatch(id: string, options?: Partial<Match>): Match {
  return {
    id,
    category: 'Abierta Varones',
    round: 1,
    date: '2026-10-03',
    time: '08:00',
    stadium: 'Cancha 1',
    homeTeamId: 't1',
    awayTeamId: 't2',
    homeScore: 0,
    awayScore: 0,
    status: 'SCHEDULED',
    homeLineup: [],
    awayLineup: [],
    events: [],
    ...options,
  };
}

describe('diffMatches', () => {
  it('devuelve listas vacias cuando no hay cambios', () => {
    const m1 = createSampleMatch('m1');
    const m2 = createSampleMatch('m2');
    const before = [m1, m2];
    const after = [createSampleMatch('m1'), createSampleMatch('m2')];

    const result = diffMatches(before, after);
    expect(result.upserts).toEqual([]);
    expect(result.deleteIds).toEqual([]);
  });

  it('detecta partido nuevo en la lista after', () => {
    const m1 = createSampleMatch('m1');
    const mNew = createSampleMatch('m-new', { time: '09:15' });

    const result = diffMatches([m1], [m1, mNew]);
    expect(result.upserts).toEqual([mNew]);
    expect(result.deleteIds).toEqual([]);
  });

  it('detecta cambios en hora, resultado y eventos', () => {
    const original = createSampleMatch('m1');

    const modTime = createSampleMatch('m1', { time: '10:30' });
    expect(diffMatches([original], [modTime]).upserts).toEqual([modTime]);

    const modScore = createSampleMatch('m1', { homeScore: 3, awayScore: 1, status: 'FINISHED' });
    expect(diffMatches([original], [modScore]).upserts).toEqual([modScore]);

    const newEvent: MatchEvent = {
      id: 'ev-1',
      matchId: 'm1',
      minute: 25,
      type: 'YELLOW_CARD',
      teamId: 't1',
      playerId: 'p1',
    };
    const modEvents = createSampleMatch('m1', { events: [newEvent] });
    expect(diffMatches([original], [modEvents]).upserts).toEqual([modEvents]);
  });

  it('detecta partidos eliminados', () => {
    const m1 = createSampleMatch('m1');
    const m2 = createSampleMatch('m2');
    const m3 = createSampleMatch('m3');

    const result = diffMatches([m1, m2, m3], [m1, m3]);
    expect(result.upserts).toEqual([]);
    expect(result.deleteIds).toEqual(['m2']);
  });

  it('no muta las colecciones de entrada', () => {
    const before = Object.freeze([createSampleMatch('m1')]);
    const after = Object.freeze([createSampleMatch('m1', { time: '11:45' }), createSampleMatch('m2')]);

    const result = diffMatches(before, after);
    expect(before.length).toBe(1);
    expect(after.length).toBe(2);
    expect(result.upserts.length).toBe(2);
  });
});

describe('matchesAreEqual', () => {
  it('reconoce objetos equivalentes independientemente del orden de claves', () => {
    const m1 = createSampleMatch('m1');
    const m2 = { ...m1 };
    expect(matchesAreEqual(m1, m2)).toBe(true);
  });
});

describe('applyMatchChanges con mock de Supabase', () => {
  let callSequence: string[] = [];
  let upsertBatches: unknown[] = [];
  let deleteInBatches: unknown[] = [];
  let neqCalls: number = 0;

  beforeEach(() => {
    callSequence = [];
    upsertBatches = [];
    deleteInBatches = [];
    neqCalls = 0;
    vi.clearAllMocks();
  });

  function setupMock(upsertError: Error | null = null, deleteError: Error | null = null) {
    const mockIn = vi.fn().mockImplementation((_col: string, ids: string[]) => {
      callSequence.push('delete.in');
      deleteInBatches.push(ids);
      return Promise.resolve({ error: deleteError });
    });

    const mockNeq = vi.fn().mockImplementation(() => {
      callSequence.push('delete.neq');
      neqCalls++;
      return Promise.resolve({ error: null });
    });

    const mockDelete = vi.fn().mockReturnValue({ in: mockIn, neq: mockNeq });

    const mockUpsert = vi.fn().mockImplementation((rows: unknown[]) => {
      callSequence.push('upsert');
      upsertBatches.push(rows);
      return Promise.resolve({ error: upsertError });
    });

    vi.mocked(supabase.from).mockImplementation(() => {
      return {
        upsert: mockUpsert,
        delete: mockDelete,
      } as unknown as ReturnType<typeof supabase.from>;
    });
  }

  it('ejecuta upsert antes que delete y nunca llama a deleteAllRows (neq)', async () => {
    setupMock();
    const upserts = [createSampleMatch('m1')];
    const deleteIds = ['m-del-1'];

    await applyMatchChanges({ upserts, deleteIds });

    expect(callSequence).toEqual(['upsert', 'delete.in']);
    expect(neqCalls).toBe(0);
    expect(upsertBatches.length).toBe(1);
    expect(deleteInBatches).toEqual([['m-del-1']]);
  });

  it('si el upsert falla, no llama a delete y propaga el error', async () => {
    setupMock(new Error('Fallo de red en upsert'));
    const upserts = [createSampleMatch('m1')];
    const deleteIds = ['m-del-1'];

    await expect(applyMatchChanges({ upserts, deleteIds })).rejects.toThrow('Fallo de red en upsert');
    expect(callSequence).toEqual(['upsert']);
    expect(deleteInBatches.length).toBe(0);
  });

  it('procesa lotes de 200 elementos tanto para upsert como para delete', async () => {
    setupMock();
    const upserts = Array.from({ length: 205 }, (_, i) => createSampleMatch(`up-${i}`));
    const deleteIds = Array.from({ length: 205 }, (_, i) => `del-${i}`);

    await applyMatchChanges({ upserts, deleteIds });

    expect(upsertBatches.length).toBe(2);
    expect((upsertBatches[0] as unknown[]).length).toBe(200);
    expect((upsertBatches[1] as unknown[]).length).toBe(5);

    expect(deleteInBatches.length).toBe(2);
    expect((deleteInBatches[0] as string[]).length).toBe(200);
    expect((deleteInBatches[1] as string[]).length).toBe(5);
  });
});
