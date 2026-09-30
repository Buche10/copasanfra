import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  canRegisterInTeam,
  isRlsRegistrationError,
  REGISTRATION_CLOSED_MESSAGE,
  RegistrationClosedError,
} from './registration';
import { Team, Category, Player } from '@/types';
import { insertPlayer } from './store';
import { supabase } from './supabase';

vi.mock('./supabase', () => {
  return {
    isSupabaseConfigured: true,
    TABLES: {
      TEAMS: 'teams',
      PLAYERS: 'players',
      PLAYERS_PUBLIC: 'players_public',
      PLAYERS_ADMIN: 'players_admin',
      PLAYER_DOCS: 'player_docs',
      MATCHES: 'matches',
      USERS: 'users',
      PAYMENTS: 'payments',
      FINE_PAYMENTS: 'fine_payments',
      SETTINGS: 'settings',
    },
    RECEIPTS_BUCKET: 'respaldos',
    supabase: {
      from: vi.fn(),
    },
  };
});

function createMockTeam(category: Category): Team {
  return {
    id: 'team-1',
    name: 'Equipo de Prueba',
    shortName: 'EQP',
    category,
    logo: 'shield-default',
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    delegate: 'Delegado',
    phone: '1234567890',
  };
}

function createMockPlayer(verificationDoc?: string): Player {
  return {
    id: 'player-test-1',
    teamId: 'team-1',
    name: 'Abg. Juan Perez',
    dorsal: 10,
    cedula: '1801234567',
    position: 'DEL',
    affiliation: 'Colegio de Abogados',
    verificationDoc,
    registeredAt: '2026-09-30T10:00:00Z',
    approvalStatus: 'PENDING',
  };
}

describe('RegistrationClosedError', () => {
  it('instancia el error con el mensaje por defecto', () => {
    const error = new RegistrationClosedError();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('RegistrationClosedError');
    expect(error.message).toBe(REGISTRATION_CLOSED_MESSAGE);
  });

  it('permite personalizar el mensaje si se requiere', () => {
    const custom = 'Mensaje personalizado';
    const error = new RegistrationClosedError(custom);
    expect(error.message).toBe(custom);
  });
});

describe('canRegisterInTeam', () => {
  const openCategories: Category[] = ['Abierta Varones', '+40 Varones'];

  it('permite inscribir en equipo de categoria abierta con inscripcion global abierta', () => {
    const team = createMockTeam('Abierta Varones');
    expect(canRegisterInTeam(team, openCategories, true)).toBe(true);
  });

  it('rechaza inscripcion en equipo cuya categoria no esta en categories', () => {
    const team = createMockTeam('Damas');
    expect(canRegisterInTeam(team, openCategories, true)).toBe(false);
  });

  it('rechaza inscripcion cuando la inscripcion global esta cerrada', () => {
    const team = createMockTeam('Abierta Varones');
    expect(canRegisterInTeam(team, openCategories, false)).toBe(false);
  });

  it('rechaza inscripcion cuando el equipo es undefined', () => {
    expect(canRegisterInTeam(undefined, openCategories, true)).toBe(false);
  });

  it('rechaza inscripcion cuando la lista de categorias esta vacia', () => {
    const team = createMockTeam('Abierta Varones');
    expect(canRegisterInTeam(team, [], true)).toBe(false);
  });
});

describe('isRlsRegistrationError', () => {
  it('reconoce una instancia de RegistrationClosedError', () => {
    expect(isRlsRegistrationError(new RegistrationClosedError())).toBe(true);
  });

  it('reconoce como categoria cerrada un error RLS en la tabla players', () => {
    const error = new Error('new row violates row-level security policy for table "players"');
    expect(isRlsRegistrationError(error)).toBe(true);
  });

  it('reconoce error con codigo 42501 en la tabla players', () => {
    const error = new Error('Error al guardar en "players": 42501 permission denied');
    expect(isRlsRegistrationError(error)).toBe(true);
  });

  it('NO reconoce como categoria cerrada un error RLS en player_docs', () => {
    const error = new Error('new row violates row-level security policy for table "player_docs"');
    expect(isRlsRegistrationError(error)).toBe(false);
  });

  it('NO reconoce mensaje compuesto de respaldo que mencione player_docs', () => {
    const error = new Error('No se pudo guardar el respaldo. Intenta de nuevo. (new row violates row-level security policy for table "player_docs")');
    expect(isRlsRegistrationError(error)).toBe(false);
  });

  it('devuelve false para errores comunes no relacionados con RLS', () => {
    const error = new Error('Network timeout');
    expect(isRlsRegistrationError(error)).toBe(false);
  });

  it('maneja valores no Error como strings o null', () => {
    expect(isRlsRegistrationError('violates row-level security policy for table "players"')).toBe(true);
    expect(isRlsRegistrationError('violates row-level security policy for table "player_docs"')).toBe(false);
    expect(isRlsRegistrationError(null)).toBe(false);
    expect(isRlsRegistrationError(undefined)).toBe(false);
  });
});

describe('REGISTRATION_CLOSED_MESSAGE', () => {
  it('contiene el mensaje esperado para el usuario', () => {
    expect(REGISTRATION_CLOSED_MESSAGE).toBe('La inscripción para esta categoría está cerrada.');
  });
});

function mockTableReturn(obj: unknown): ReturnType<typeof supabase.from> {
  return obj as unknown as ReturnType<typeof supabase.from>;
}

describe('insertPlayer con RLS en base de datos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lanza RegistrationClosedError cuando el insert en players falla por RLS', async () => {
    const mockInsert = vi.fn().mockResolvedValue({
      error: {
        message: 'new row violates row-level security policy for table "players"',
        code: '42501',
      },
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'players') {
        return mockTableReturn({ insert: mockInsert });
      }
      return mockTableReturn({});
    });

    const player = createMockPlayer();

    await expect(insertPlayer(player)).rejects.toThrow(RegistrationClosedError);
  });

  it('guarda el jugador exitosamente cuando no hay error', async () => {
    const mockInsertPlayers = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'players') {
        return mockTableReturn({ insert: mockInsertPlayers });
      }
      return mockTableReturn({});
    });

    const player = createMockPlayer();

    await expect(insertPlayer(player)).resolves.toBeUndefined();
    expect(mockInsertPlayers).toHaveBeenCalledTimes(1);
  });

  it('guarda el jugador y el documento cuando incluye verificationDoc', async () => {
    const mockInsertPlayers = vi.fn().mockResolvedValue({ error: null });
    const mockInsertDocs = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'players') {
        return mockTableReturn({ insert: mockInsertPlayers });
      }
      if (table === 'player_docs') {
        return mockTableReturn({ insert: mockInsertDocs });
      }
      return mockTableReturn({});
    });

    const player = createMockPlayer('data:image/png;base64,mockdoc');

    await expect(insertPlayer(player)).resolves.toBeUndefined();
    expect(mockInsertPlayers).toHaveBeenCalledTimes(1);
    expect(mockInsertDocs).toHaveBeenCalledTimes(1);
  });

  it('lanza error estandar y deshace cuando falla player_docs, sin lanzar RegistrationClosedError', async () => {
    const mockInsertPlayers = vi.fn().mockResolvedValue({ error: null });
    const mockInsertDocs = vi.fn().mockResolvedValue({
      error: { message: 'new row violates row-level security policy for table "player_docs"' },
    });
    const mockDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const mockDelete = vi.fn().mockReturnValue({ eq: mockDeleteEq });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'players') {
        return mockTableReturn({ insert: mockInsertPlayers, delete: mockDelete });
      }
      if (table === 'player_docs') {
        return mockTableReturn({ insert: mockInsertDocs });
      }
      return mockTableReturn({});
    });

    const player = createMockPlayer('data:image/png;base64,mockdoc');

    await expect(insertPlayer(player)).rejects.toThrow('No se pudo guardar el respaldo');
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });
});
