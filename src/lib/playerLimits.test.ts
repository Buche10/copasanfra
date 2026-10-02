import { describe, it, expect } from 'vitest';
import { maxPlayersForCategory, MAX_PLAYERS_PER_TEAM } from '@/types';

describe('maxPlayersForCategory', () => {
  it('devuelve 35 para +50 Varones', () => {
    expect(maxPlayersForCategory('+50 Varones')).toBe(35);
  });

  it('devuelve 20 para +40 Varones', () => {
    expect(maxPlayersForCategory('+40 Varones')).toBe(20);
  });

  it('devuelve 20 para Abierta Varones', () => {
    expect(maxPlayersForCategory('Abierta Varones')).toBe(20);
  });

  it('devuelve 20 para Damas', () => {
    expect(maxPlayersForCategory('Damas')).toBe(20);
  });

  it('devuelve 20 para categoria indefinida o desconocida', () => {
    expect(maxPlayersForCategory(undefined)).toBe(MAX_PLAYERS_PER_TEAM);
  });
});
