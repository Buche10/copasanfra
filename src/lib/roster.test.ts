import { describe, it, expect } from 'vitest';
import { Player, Team } from '@/types';
import {
  isReinforcement,
  rosterCount,
  reinforcementCount,
  isRosterFull,
  rosterLabel,
} from './roster';

describe('roster utilities', () => {
  const teamAbierta: Team = {
    id: 't-abierta',
    name: 'Leones',
    shortName: 'LEO',
    category: 'Abierta Varones',
    logo: 'shield',
    primaryColor: '#00A859',
    secondaryColor: '#FFFFFF',
    delegate: 'Delegado Leones',
    phone: '0999999991',
  };

  const team50: Team = {
    id: 't-50',
    name: 'Veteranos',
    shortName: 'VET',
    category: '+50 Varones',
    logo: 'shield',
    primaryColor: '#00A859',
    secondaryColor: '#FFFFFF',
    delegate: 'Delegado Vet',
    phone: '0999999992',
  };

  const createPlayer = (id: string, teamId: string, reinforcementOf?: string): Player => ({
    id,
    teamId,
    name: `Jugador ${id}`,
    cedula: '0912345678',
    dorsal: 10,
    position: 'MED',
    reinforcementOf,
  });

  describe('isReinforcement', () => {
    it('retorna true cuando reinforcementOf tiene un ID valido', () => {
      expect(isReinforcement({ reinforcementOf: 'p-source-1' })).toBe(true);
    });

    it('retorna false cuando reinforcementOf es undefined, null o cadena vacia', () => {
      expect(isReinforcement({})).toBe(false);
      expect(isReinforcement({ reinforcementOf: undefined })).toBe(false);
      expect(isReinforcement({ reinforcementOf: null })).toBe(false);
      expect(isReinforcement({ reinforcementOf: '' })).toBe(false);
      expect(isReinforcement({ reinforcementOf: '   ' })).toBe(false);
    });
  });

  describe('rosterCount y reinforcementCount', () => {
    it('cuenta solo los jugadores propios en rosterCount y solo refuerzos en reinforcementCount', () => {
      const players: Player[] = [
        createPlayer('p-1', 't-abierta'),
        createPlayer('p-2', 't-abierta'),
        createPlayer('p-3', 't-abierta', 'p-source-1'),
        createPlayer('p-4', 't-abierta', 'p-source-2'),
        createPlayer('p-5', 't-other'),
      ];

      expect(rosterCount(players, 't-abierta')).toBe(2);
      expect(reinforcementCount(players, 't-abierta')).toBe(2);
      expect(rosterCount(players, 't-other')).toBe(1);
      expect(reinforcementCount(players, 't-other')).toBe(0);
      expect(rosterCount(players, 't-empty')).toBe(0);
      expect(reinforcementCount(players, 't-empty')).toBe(0);
    });
  });

  describe('isRosterFull', () => {
    it('verifica el cupo de 20 en Abierta Varones segun jugadores propios', () => {
      const players20: Player[] = Array.from({ length: 20 }, (_, i) =>
        createPlayer(`p-${i}`, 't-abierta')
      );

      expect(isRosterFull(players20, teamAbierta)).toBe(true);

      const players19: Player[] = players20.slice(0, 19);
      expect(isRosterFull(players19, teamAbierta)).toBe(false);

      // Con 19 propios + 2 refuerzos = 21 en total, pero NO esta lleno de propios
      const playersWithReinf = [...players19, createPlayer('p-r1', 't-abierta', 'p-src1'), createPlayer('p-r2', 't-abierta', 'p-src2')];
      expect(isRosterFull(playersWithReinf, teamAbierta)).toBe(false);
    });

    it('verifica el cupo de 35 en +50 Varones', () => {
      const players34: Player[] = Array.from({ length: 34 }, (_, i) =>
        createPlayer(`p-${i}`, 't-50')
      );
      expect(isRosterFull(players34, team50)).toBe(false);

      const players35 = [...players34, createPlayer('p-34', 't-50')];
      expect(isRosterFull(players35, team50)).toBe(true);
    });
  });

  describe('rosterLabel', () => {
    it('formatea "X/Y" cuando el equipo no tiene refuerzos', () => {
      const players = [
        createPlayer('p-1', 't-abierta'),
        createPlayer('p-2', 't-abierta'),
      ];
      expect(rosterLabel(players, teamAbierta)).toBe('2/20');
    });

    it('formatea "X/Y + 1 refuerzo" en singular cuando tiene 1 refuerzo', () => {
      const players20: Player[] = Array.from({ length: 20 }, (_, i) =>
        createPlayer(`p-${i}`, 't-abierta')
      );
      players20.push(createPlayer('p-r1', 't-abierta', 'p-src1'));

      expect(rosterLabel(players20, teamAbierta)).toBe('20/20 + 1 refuerzo');
    });

    it('formatea "X/Y + N refuerzos" en plural cuando tiene mas de 1 refuerzo', () => {
      const players20: Player[] = Array.from({ length: 20 }, (_, i) =>
        createPlayer(`p-${i}`, 't-abierta')
      );
      players20.push(createPlayer('p-r1', 't-abierta', 'p-src1'));
      players20.push(createPlayer('p-r2', 't-abierta', 'p-src2'));

      expect(rosterLabel(players20, teamAbierta)).toBe('20/20 + 2 refuerzos');
    });
  });
});
