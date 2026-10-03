import { describe, it, expect } from 'vitest';
import { normalizeAppSettings, DEFAULT_SETTINGS } from './settings';

describe('normalizeAppSettings', () => {
  it('retorna DEFAULT_SETTINGS cuando la entrada es indefinida o vacia', () => {
    expect(normalizeAppSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeAppSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeAppSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('reinforcementsOpen es true por defecto si no esta definido', () => {
    const res = normalizeAppSettings({ registrationsOpen: false });
    expect(res.reinforcementsOpen).toBe(true);
    expect(res.registrationsOpen).toBe(false);
  });

  it('respeta reinforcementsOpen = false cuando viene en el objeto directo', () => {
    const res = normalizeAppSettings({ reinforcementsOpen: false });
    expect(res.reinforcementsOpen).toBe(false);
  });

  it('soporta la estructura envuelta { data: Partial<AppSettings> } de Supabase', () => {
    const raw = {
      data: {
        reinforcementsOpen: false,
        registrationsOpen: true,
        closedRegistrationCategories: ['Abierta Varones'],
      },
    };
    const res = normalizeAppSettings(raw);
    expect(res.reinforcementsOpen).toBe(false);
    expect(res.registrationsOpen).toBe(true);
    expect(res.closedRegistrationCategories).toEqual(['Abierta Varones']);
    expect(res.suspendedCategories).toEqual(DEFAULT_SETTINGS.suspendedCategories);
  });
});
