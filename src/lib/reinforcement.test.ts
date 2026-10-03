import { describe, it, expect } from 'vitest';
import {
  reinforcementTargetCategories,
  validateReinforcementInput,
  reinforcementMessage,
  ReinforcementStatus,
} from './reinforcement';
import { Category, Player, PlayerPosition, Team } from '@/types';

function createMockTeam(id: string, category: Category): Team {
  return {
    id,
    name: `Equipo ${id}`,
    shortName: id,
    category,
    logo: 'logo.png',
    primaryColor: '#00A859',
    secondaryColor: '#FFFFFF',
    delegate: 'Delegado Test',
    phone: '0999999999',
  };
}

function createMockPlayer(
  id: string,
  teamId: string,
  dorsal: number,
  cedula: string,
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED'
): Player {
  return {
    id,
    teamId,
    name: `Jugador ${id}`,
    cedula,
    dorsal,
    position: 'DEL',
    approvalStatus: approvalStatus ?? 'APPROVED',
  };
}

describe('reinforcementTargetCategories', () => {
  it('devuelve Abierta Varones y +40 Varones sin Damas ni +50 Varones', () => {
    const targets = reinforcementTargetCategories();
    expect(targets).toContain('Abierta Varones');
    expect(targets).toContain('+40 Varones');
    expect(targets).not.toContain('Damas');
    expect(targets).not.toContain('+50 Varones');
    expect(targets.length).toBe(2);
  });
});

describe('validateReinforcementInput', () => {
  const teams: Team[] = [
    createMockTeam('t-abierta', 'Abierta Varones'),
    createMockTeam('t-plus40', '+40 Varones'),
    createMockTeam('t-plus50', '+50 Varones'),
    createMockTeam('t-damas', 'Damas'),
  ];

  it('rechaza PIN invalido o faltante', () => {
    expect(
      validateReinforcementInput(
        { pin: '', cedula: '0912345678', teamId: 't-abierta', dorsal: 9 },
        teams,
        []
      )
    ).toBe('INVALID');

    expect(
      validateReinforcementInput(
        { pin: '12345', cedula: '0912345678', teamId: 't-abierta', dorsal: 9 },
        teams,
        []
      )
    ).toBe('INVALID');

    expect(
      validateReinforcementInput(
        { pin: '1234567', cedula: '0912345678', teamId: 't-abierta', dorsal: 9 },
        teams,
        []
      )
    ).toBe('INVALID');

    expect(
      validateReinforcementInput(
        { pin: 'abcdef', cedula: '0912345678', teamId: 't-abierta', dorsal: 9 },
        teams,
        []
      )
    ).toBe('INVALID');
  });

  it('rechaza cedula invalida (no tiene 10 digitos)', () => {
    const res = validateReinforcementInput(
      { pin: '123456', cedula: '12345', teamId: 't-abierta', dorsal: 9 },
      teams,
      []
    );
    expect(res).toBe('INVALID');
  });

  it('rechaza dorsal 0, 100 o con decimales', () => {
    expect(
      validateReinforcementInput(
        { pin: '123456', cedula: '0912345678', teamId: 't-abierta', dorsal: 0 },
        teams,
        []
      )
    ).toBe('INVALID');

    expect(
      validateReinforcementInput(
        { pin: '123456', cedula: '0912345678', teamId: 't-abierta', dorsal: 100 },
        teams,
        []
      )
    ).toBe('INVALID');

    expect(
      validateReinforcementInput(
        { pin: '123456', cedula: '0912345678', teamId: 't-abierta', dorsal: 7.5 },
        teams,
        []
      )
    ).toBe('INVALID');
  });

  it('rechaza posicion invalida', () => {
    expect(
      validateReinforcementInput(
        {
          pin: '123456',
          cedula: '0912345678',
          teamId: 't-abierta',
          dorsal: 10,
          position: 'VOL' as PlayerPosition,
        },
        teams,
        []
      )
    ).toBe('INVALID');
  });

  it('rechaza equipo inexistente', () => {
    const res = validateReinforcementInput(
      { pin: '123456', cedula: '0912345678', teamId: 't-fantasma', dorsal: 10 },
      teams,
      []
    );
    expect(res).toBe('INVALID');
  });

  it('rechaza equipos de categorias no permitidas como destino (Damas o +50)', () => {
    expect(
      validateReinforcementInput(
        { pin: '123456', cedula: '0912345678', teamId: 't-damas', dorsal: 10 },
        teams,
        []
      )
    ).toBe('INVALID');

    expect(
      validateReinforcementInput(
        { pin: '123456', cedula: '0912345678', teamId: 't-plus50', dorsal: 10 },
        teams,
        []
      )
    ).toBe('INVALID');
  });

  it('rechaza dorsal ya ocupado en el equipo destino', () => {
    const players = [createMockPlayer('p1', 't-abierta', 10, '0999999991')];
    const res = validateReinforcementInput(
      { pin: '123456', cedula: '0912345678', teamId: 't-abierta', dorsal: 10 },
      teams,
      players
    );
    expect(res).toBe('DORSAL_TAKEN');
  });

  it('permite dorsal si el jugador que lo tenia fue REJECTED', () => {
    const players = [createMockPlayer('p1', 't-abierta', 10, '0999999991', 'REJECTED')];
    const res = validateReinforcementInput(
      { pin: '123456', cedula: '0912345678', teamId: 't-abierta', dorsal: 10 },
      teams,
      players
    );
    expect(res).toBeNull();
  });

  it('rechaza cuando el equipo destino alcanzo el cupo maximo de 20 en Abierta', () => {
    const players: Player[] = [];
    for (let i = 1; i <= 20; i++) {
      players.push(createMockPlayer(`p-${i}`, 't-abierta', i, `09000000${i < 10 ? '0' + i : i}`));
    }

    const res = validateReinforcementInput(
      { pin: '123456', cedula: '0912345678', teamId: 't-abierta', dorsal: 25 },
      teams,
      players
    );
    expect(res).toBe('TEAM_FULL');
  });

  it('retorna null cuando todos los datos son validos', () => {
    const res = validateReinforcementInput(
      { pin: '123456', cedula: '0912345678', teamId: 't-abierta', dorsal: 7, position: 'DEL' },
      teams,
      []
    );
    expect(res).toBeNull();
  });
});

describe('reinforcementMessage', () => {
  const allStatuses: ReinforcementStatus[] = [
    'OK',
    'INVALID',
    'CLOSED',
    'NOT_ELIGIBLE',
    'ALREADY_IN_CATEGORY',
    'TEAM_FULL',
    'DORSAL_TAKEN',
    'NO_PIN',
    'BAD_PIN',
    'LOCKED',
  ];

  it('devuelve texto no vacio para cada estado', () => {
    for (const status of allStatuses) {
      const msg = reinforcementMessage(status);
      expect(typeof msg).toBe('string');
      expect(msg.trim().length).toBeGreaterThan(0);
    }
  });

  it('mensajes de PIN son claros y en espanol', () => {
    expect(reinforcementMessage('BAD_PIN')).toBe('El código del equipo no es correcto.');
    expect(reinforcementMessage('LOCKED')).toBe(
      'Demasiados intentos fallidos. Espera unos minutos o solicita un nuevo código a la organización.'
    );
    expect(reinforcementMessage('NO_PIN')).toBe(
      'Tu equipo aún no tiene código de habilitación. Solicítalo a la organización.'
    );
  });

  it('NOT_ELIGIBLE no revela si la cedula existe o no', () => {
    const msg = reinforcementMessage('NOT_ELIGIBLE');
    expect(msg).toContain('No encontramos un jugador aprobado de +40 o +50 con esa cédula');
    expect(msg.toLowerCase()).not.toContain('inexistente');
    expect(msg.toLowerCase()).not.toContain('no existe');
  });

  it('retorna mensaje por defecto para estados desconocidos', () => {
    const msg = reinforcementMessage('OTRO' as ReinforcementStatus);
    expect(msg).toBe('Ocurrió un error inesperado al procesar el refuerzo.');
  });
});
