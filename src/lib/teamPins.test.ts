import { describe, it, expect } from 'vitest';
import {
  getEligiblePinTeams,
  formatPinStatus,
  hasHighFailures,
  ipSourceStatus,
  TeamPinInfo,
} from './teamPins';
import { Category, Team } from '@/types';

function createMockTeam(id: string, name: string, category: Category): Team {
  return {
    id,
    name,
    shortName: id,
    category,
    logo: 'logo.png',
    primaryColor: '#00A859',
    secondaryColor: '#FFFFFF',
    delegate: 'Delegado Test',
    phone: '0999999999',
  };
}

describe('getEligiblePinTeams', () => {
  it('filtra solo equipos de Abierta y +40, ordenados por categoria (Abierta primero) y nombre', () => {
    const teams: Team[] = [
      createMockTeam('t-damas', 'Amazonas', 'Damas'),
      createMockTeam('t-plus50', 'Seniors', '+50 Varones'),
      createMockTeam('t-p40-b', 'Beta +40', '+40 Varones'),
      createMockTeam('t-abierta-b', 'Beta Abierta', 'Abierta Varones'),
      createMockTeam('t-p40-a', 'Alfa +40', '+40 Varones'),
      createMockTeam('t-abierta-a', 'Alfa Abierta', 'Abierta Varones'),
    ];

    const result = getEligiblePinTeams(teams);
    expect(result.map((t) => t.id)).toEqual([
      't-abierta-a',
      't-abierta-b',
      't-p40-a',
      't-p40-b',
    ]);
  });
});

describe('formatPinStatus', () => {
  it('retorna Sin código cuando no hay pinInfo', () => {
    const res = formatPinStatus(undefined);
    expect(res).toEqual({ label: 'Sin código', tone: 'none' });
  });

  it('retorna Bloqueado por intentos (60 min) cuando locked es true', () => {
    const pinInfo: TeamPinInfo = {
      teamId: 't-1',
      updatedAt: '2026-10-02T10:00:00Z',
      locked: true,
      failures24h: 30,
    };
    const res = formatPinStatus(pinInfo);
    expect(res).toEqual({ label: 'Bloqueado por intentos (60 min)', tone: 'locked' });
  });

  it('sin bloqueo y con 0 fallos muestra solo la fecha de configuracion', () => {
    const pinInfo: TeamPinInfo = {
      teamId: 't-1',
      updatedAt: '2026-10-02T15:30:00Z',
      locked: false,
      failures24h: 0,
    };
    const res = formatPinStatus(pinInfo);
    expect(res.tone).toBe('active');
    expect(res.label).toContain('Código desde');
    expect(res.label).not.toContain('fallidos');
  });

  it('sin bloqueo y con 3 fallos incluye 3 intentos fallidos en 24 h', () => {
    const pinInfo: TeamPinInfo = {
      teamId: 't-1',
      updatedAt: '2026-10-02T15:30:00Z',
      locked: false,
      failures24h: 3,
    };
    const res = formatPinStatus(pinInfo);
    expect(res.tone).toBe('active');
    expect(res.label).toContain('3 intentos fallidos en 24 h');
  });

  it('sin bloqueo y con 1 fallo maneja singular correctamente', () => {
    const pinInfo: TeamPinInfo = {
      teamId: 't-1',
      updatedAt: '2026-10-02T15:30:00Z',
      locked: false,
      failures24h: 1,
    };
    const res = formatPinStatus(pinInfo);
    expect(res.tone).toBe('active');
    expect(res.label).toContain('1 intento fallido en 24 h');
  });

  it('asigna tono warning cuando hay 10 o mas fallos en 24 h', () => {
    const pinInfo: TeamPinInfo = {
      teamId: 't-1',
      updatedAt: '2026-10-02T15:30:00Z',
      locked: false,
      failures24h: 10,
    };
    const res = formatPinStatus(pinInfo);
    expect(res.tone).toBe('warning');
    expect(res.label).toContain('10 intentos fallidos en 24 h');
  });

  it('retorna la cadena cruda si la fecha es invalida', () => {
    const pinInfo: TeamPinInfo = {
      teamId: 't-1',
      updatedAt: 'fecha-invalida',
      locked: false,
      failures24h: 0,
    };
    const res = formatPinStatus(pinInfo);
    expect(res.tone).toBe('active');
    expect(res.label).toBe('Código desde fecha-invalida');
  });
});

describe('hasHighFailures', () => {
  it('retorna false cuando no hay pinInfo o failures24h es menor a 10', () => {
    expect(hasHighFailures(undefined)).toBe(false);
    expect(
      hasHighFailures({
        teamId: 't-1',
        updatedAt: '2026-10-02T15:30:00Z',
        locked: false,
        failures24h: 9,
      })
    ).toBe(false);
  });

  it('retorna true cuando failures24h es 10 o mas', () => {
    expect(
      hasHighFailures({
        teamId: 't-1',
        updatedAt: '2026-10-02T15:30:00Z',
        locked: false,
        failures24h: 10,
      })
    ).toBe(true);

    expect(
      hasHighFailures({
        teamId: 't-1',
        updatedAt: '2026-10-02T15:30:00Z',
        locked: false,
        failures24h: 25,
      })
    ).toBe(true);
  });
});

describe('ipSourceStatus', () => {
  it('retorna tono active y texto literal cuando el origen es cloudflare', () => {
    const res = ipSourceStatus('cloudflare');
    expect(res).toEqual({
      label: 'Protección por conexión: activa (IP real detectada).',
      tone: 'active',
    });
  });

  it('retorna tono warning y texto literal cuando el origen es forwarded', () => {
    const res = ipSourceStatus('forwarded');
    expect(res).toEqual({
      label: 'Protección por conexión: limitada (no llega la IP real de Cloudflare). Solo rige el tope de 30 fallos por hora del equipo.',
      tone: 'warning',
    });
  });

  it('retorna tono none y texto literal cuando el origen es desconocida, nulo, indefinido o error', () => {
    expect(ipSourceStatus('desconocida')).toEqual({
      label: 'Protección por conexión: no verificada.',
      tone: 'none',
    });

    expect(ipSourceStatus(null)).toEqual({
      label: 'Protección por conexión: no verificada.',
      tone: 'none',
    });

    expect(ipSourceStatus(undefined)).toEqual({
      label: 'Protección por conexión: no verificada.',
      tone: 'none',
    });

    expect(ipSourceStatus('')).toEqual({
      label: 'Protección por conexión: no verificada.',
      tone: 'none',
    });

    expect(ipSourceStatus('error')).toEqual({
      label: 'Protección por conexión: no verificada.',
      tone: 'none',
    });
  });
});

