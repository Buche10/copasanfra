import { describe, it, expect } from 'vitest';
import {
  CROSS_CATEGORY_TARGETS,
  isValidCedula,
  getEligibleTargetCategories,
  buildEligiblePlayerIds,
  validateCrossCategory,
  buildCrossCategoryPlayer,
  crossCategoryErrorMessage,
  findSameCategoryConflict,
  CrossCategoryError,
} from './crossCategory';
import { Player, Team } from '@/types';
import { buildSharedPlayerPairs, makePairKey } from './scheduling/sharedPlayers';

describe('crossCategory', () => {
  const baseTeams: Team[] = [
    {
      id: 'team-40-1',
      name: 'Veteranos 40',
      shortName: 'VET40',
      category: '+40 Varones',
      logo: 'shield',
      primaryColor: '#00A859',
      secondaryColor: '#FFFFFF',
      delegate: 'Juan Perez',
      phone: '0999999999',
    },
    {
      id: 'team-50-1',
      name: 'Master 50',
      shortName: 'MAS50',
      category: '+50 Varones',
      logo: 'shield',
      primaryColor: '#00A859',
      secondaryColor: '#FFFFFF',
      delegate: 'Carlos Ruiz',
      phone: '0999999998',
    },
    {
      id: 'team-ab-1',
      name: 'Abierta Leones',
      shortName: 'LEO',
      category: 'Abierta Varones',
      logo: 'shield',
      primaryColor: '#00A859',
      secondaryColor: '#FFFFFF',
      delegate: 'Pedro Gomez',
      phone: '0999999997',
    },
    {
      id: 'team-ab-2',
      name: 'Abierta Tigres',
      shortName: 'TIG',
      category: 'Abierta Varones',
      logo: 'shield',
      primaryColor: '#00A859',
      secondaryColor: '#FFFFFF',
      delegate: 'Andres Rios',
      phone: '0999999996',
    },
    {
      id: 'team-da-1',
      name: 'Damas Star',
      shortName: 'DST',
      category: 'Damas',
      logo: 'shield',
      primaryColor: '#00A859',
      secondaryColor: '#FFFFFF',
      delegate: 'Maria Soto',
      phone: '0999999995',
    },
  ];

  const basePlayer40: Player = {
    id: 'p-40-01',
    teamId: 'team-40-1',
    name: 'Roberto Gomez',
    cedula: '1801234567',
    dorsal: 10,
    position: 'DEL',
    affiliation: 'Colegio de Abogados',
    approvalStatus: 'APPROVED',
    photo: 'https://example.com/photo.jpg',
    verificationDoc: 'https://example.com/doc.jpg',
    isCaptain: true,
    suspendedRounds: [1, 2],
  };

  describe('CROSS_CATEGORY_TARGETS y isValidCedula', () => {
    it('define las metas permitidas por categoria', () => {
      expect(CROSS_CATEGORY_TARGETS['+40 Varones']).toEqual(['Abierta Varones']);
      expect(CROSS_CATEGORY_TARGETS['+50 Varones']).toEqual(['+40 Varones', 'Abierta Varones']);
      expect(CROSS_CATEGORY_TARGETS['Abierta Varones']).toEqual([]);
      expect(CROSS_CATEGORY_TARGETS['Damas']).toEqual([]);
    });

    it('valida formato de cedula de 10 digitos', () => {
      expect(isValidCedula('1801234567')).toBe(true);
      expect(isValidCedula('180-123.456 7')).toBe(true);
      expect(isValidCedula('')).toBe(false);
      expect(isValidCedula(undefined)).toBe(false);
      expect(isValidCedula('123')).toBe(false);
      expect(isValidCedula('180123456789')).toBe(false);
      expect(isValidCedula('abcdefghij')).toBe(false);
    });
  });

  describe('getEligibleTargetCategories', () => {
    it('+40 sin registro en Abierta -> [Abierta Varones]', () => {
      const targets = getEligibleTargetCategories(basePlayer40, [basePlayer40], baseTeams);
      expect(targets).toEqual(['Abierta Varones']);
    });

    it('+40 ya en Abierta -> []', () => {
      const playerInAbierta: Player = {
        id: 'p-ab-01',
        teamId: 'team-ab-1',
        name: 'Roberto Gomez',
        cedula: '1801234567',
        dorsal: 9,
        position: 'DEL',
        approvalStatus: 'APPROVED',
      };
      const targets = getEligibleTargetCategories(
        basePlayer40,
        [basePlayer40, playerInAbierta],
        baseTeams
      );
      expect(targets).toEqual([]);
    });

    it('+50 -> [+40 Varones, Abierta Varones] menos las ocupadas', () => {
      const player50: Player = {
        ...basePlayer40,
        id: 'p-50-01',
        teamId: 'team-50-1',
      };
      // Sin registros previos
      expect(getEligibleTargetCategories(player50, [player50], baseTeams)).toEqual([
        '+40 Varones',
        'Abierta Varones',
      ]);

      // Ya registrado en +40
      const playerIn40: Player = {
        ...basePlayer40,
        id: 'p-40-reg',
        teamId: 'team-40-1',
      };
      expect(
        getEligibleTargetCategories(player50, [player50, playerIn40], baseTeams)
      ).toEqual(['Abierta Varones']);

      // Ya registrado en ambas
      const playerInAb: Player = {
        ...basePlayer40,
        id: 'p-ab-reg',
        teamId: 'team-ab-1',
      };
      expect(
        getEligibleTargetCategories(player50, [player50, playerIn40, playerInAb], baseTeams)
      ).toEqual([]);
    });

    it('Abierta -> [] y Damas -> []', () => {
      const playerAb: Player = { ...basePlayer40, id: 'p-ab', teamId: 'team-ab-1' };
      const playerDa: Player = { ...basePlayer40, id: 'p-da', teamId: 'team-da-1' };
      expect(getEligibleTargetCategories(playerAb, [playerAb], baseTeams)).toEqual([]);
      expect(getEligibleTargetCategories(playerDa, [playerDa], baseTeams)).toEqual([]);
    });

    it('jugador sin cedula valida -> []', () => {
      const pSinCedula: Player = { ...basePlayer40, cedula: '' };
      expect(getEligibleTargetCategories(pSinCedula, [pSinCedula], baseTeams)).toEqual([]);

      const pCedulaInvalida: Player = { ...basePlayer40, cedula: '123' };
      expect(getEligibleTargetCategories(pCedulaInvalida, [pCedulaInvalida], baseTeams)).toEqual([]);
    });

    it('un registro REJECTED en Abierta no cuenta como ocupado', () => {
      const rejectedPlayer: Player = {
        id: 'p-ab-rej',
        teamId: 'team-ab-1',
        name: 'Roberto Gomez',
        cedula: '1801234567',
        dorsal: 9,
        position: 'DEL',
        approvalStatus: 'REJECTED',
      };
      const targets = getEligibleTargetCategories(
        basePlayer40,
        [basePlayer40, rejectedPlayer],
        baseTeams
      );
      expect(targets).toEqual(['Abierta Varones']);
    });

    it('cedulas con guiones o espacios se normalizan', () => {
      const playerWithHyphen: Player = {
        ...basePlayer40,
        cedula: '180-123 456-7',
      };
      const existingInAbierta: Player = {
        id: 'p-ab-2',
        teamId: 'team-ab-1',
        name: 'Roberto Gomez',
        cedula: '1801234567',
        dorsal: 8,
        position: 'DEL',
        approvalStatus: 'APPROVED',
      };
      const targets = getEligibleTargetCategories(
        playerWithHyphen,
        [playerWithHyphen, existingInAbierta],
        baseTeams
      );
      expect(targets).toEqual([]);
    });

    it('devuelve vacio si no se encuentra el equipo actual del jugador', () => {
      const orphanPlayer: Player = { ...basePlayer40, teamId: 'equipo-inexistente' };
      expect(getEligibleTargetCategories(orphanPlayer, [orphanPlayer], baseTeams)).toEqual([]);
    });
  });

  describe('buildEligiblePlayerIds', () => {
    it('caso elegible: jugador +40 sin registro en Abierta esta en el Set', () => {
      const eligible = buildEligiblePlayerIds([basePlayer40], baseTeams);
      expect(eligible.has(basePlayer40.id)).toBe(true);
    });

    it('caso ya ocupado: si ya tiene registro no REJECTED en destino, no esta en el Set', () => {
      const playerInAb: Player = {
        id: 'p-ab-01',
        teamId: 'team-ab-1',
        name: 'Roberto Gomez',
        cedula: basePlayer40.cedula,
        dorsal: 9,
        position: 'DEL',
        approvalStatus: 'APPROVED',
      };
      const eligible = buildEligiblePlayerIds([basePlayer40, playerInAb], baseTeams);
      expect(eligible.has(basePlayer40.id)).toBe(false);
    });

    it('caso rechazado: un registro REJECTED en la categoria destino no bloquea la elegibilidad', () => {
      const playerRej: Player = {
        id: 'p-ab-rej',
        teamId: 'team-ab-1',
        name: 'Roberto Gomez',
        cedula: basePlayer40.cedula,
        dorsal: 9,
        position: 'DEL',
        approvalStatus: 'REJECTED',
      };
      const eligible = buildEligiblePlayerIds([basePlayer40, playerRej], baseTeams);
      expect(eligible.has(basePlayer40.id)).toBe(true);
    });

    it('caso sin cedula valida: no se incluye en el Set', () => {
      const pSinCedula: Player = { ...basePlayer40, id: 'p-no-ced', cedula: '' };
      const pCedInvalida: Player = { ...basePlayer40, id: 'p-bad-ced', cedula: '123' };
      const eligible = buildEligiblePlayerIds([pSinCedula, pCedInvalida], baseTeams);
      expect(eligible.has(pSinCedula.id)).toBe(false);
      expect(eligible.has(pCedInvalida.id)).toBe(false);
    });

    it('excluye jugadores de categorias sin destinos elegibles', () => {
      const playerAb: Player = { ...basePlayer40, id: 'p-ab', teamId: 'team-ab-1' };
      const eligible = buildEligiblePlayerIds([playerAb], baseTeams);
      expect(eligible.has(playerAb.id)).toBe(false);
    });
  });

  describe('validateCrossCategory', () => {
    it('detecta NO_CEDULA', () => {
      const p: Player = { ...basePlayer40, cedula: '' };
      const err = validateCrossCategory(
        { source: p, targetTeamId: 'team-ab-1', dorsal: 10 },
        [p],
        baseTeams
      );
      expect(err).toBe('NO_CEDULA');
    });

    it('detecta TEAM_NOT_FOUND', () => {
      const err = validateCrossCategory(
        { source: basePlayer40, targetTeamId: 'inexistente', dorsal: 10 },
        [basePlayer40],
        baseTeams
      );
      expect(err).toBe('TEAM_NOT_FOUND');
    });

    it('detecta CATEGORY_NOT_ALLOWED (+40 -> Damas, Abierta -> +40, o equipo origen no hallado)', () => {
      // +40 -> Damas
      const err1 = validateCrossCategory(
        { source: basePlayer40, targetTeamId: 'team-da-1', dorsal: 10 },
        [basePlayer40],
        baseTeams
      );
      expect(err1).toBe('CATEGORY_NOT_ALLOWED');

      // Abierta -> +40
      const pAb: Player = { ...basePlayer40, teamId: 'team-ab-1' };
      const err2 = validateCrossCategory(
        { source: pAb, targetTeamId: 'team-40-1', dorsal: 10 },
        [pAb],
        baseTeams
      );
      expect(err2).toBe('CATEGORY_NOT_ALLOWED');

      // Equipo origen no encontrado
      const pOrphan: Player = { ...basePlayer40, teamId: 'no-team' };
      const err3 = validateCrossCategory(
        { source: pOrphan, targetTeamId: 'team-ab-1', dorsal: 10 },
        [pOrphan],
        baseTeams
      );
      expect(err3).toBe('CATEGORY_NOT_ALLOWED');
    });

    it('detecta ALREADY_IN_CATEGORY', () => {
      const existingInAb: Player = {
        id: 'p-ab-exist',
        teamId: 'team-ab-2',
        name: 'Roberto Gomez',
        cedula: '1801234567',
        dorsal: 7,
        position: 'DEL',
        approvalStatus: 'APPROVED',
      };
      const err = validateCrossCategory(
        { source: basePlayer40, targetTeamId: 'team-ab-1', dorsal: 10 },
        [basePlayer40, existingInAb],
        baseTeams
      );
      expect(err).toBe('ALREADY_IN_CATEGORY');
    });

    it('detecta INVALID_DORSAL con 0, 100 y 7.5', () => {
      const checkDorsal = (d: number) =>
        validateCrossCategory(
          { source: basePlayer40, targetTeamId: 'team-ab-1', dorsal: d },
          [basePlayer40],
          baseTeams
        );

      expect(checkDorsal(0)).toBe('INVALID_DORSAL');
      expect(checkDorsal(100)).toBe('INVALID_DORSAL');
      expect(checkDorsal(7.5)).toBe('INVALID_DORSAL');
      expect(checkDorsal(-5)).toBe('INVALID_DORSAL');
    });

    it('permite habilitacion en equipo con 20 jugadores (refuerzo no ocupa cupo)', () => {
      const fullTeamPlayers: Player[] = Array.from({ length: 20 }, (_, i) => ({
        id: `p-fill-${i}`,
        teamId: 'team-ab-1',
        name: `Jugador ${i}`,
        cedula: `17000000${i.toString().padStart(2, '0')}`,
        dorsal: i + 1,
        position: 'MED',
      }));

      const err = validateCrossCategory(
        { source: basePlayer40, targetTeamId: 'team-ab-1', dorsal: 99 },
        [basePlayer40, ...fullTeamPlayers],
        baseTeams
      );
      expect(err).toBeNull();
    });

    it('detecta DORSAL_TAKEN', () => {
      const teamPlayer: Player = {
        id: 'p-ab-10',
        teamId: 'team-ab-1',
        name: 'Otro Jugador',
        cedula: '1799999999',
        dorsal: 10,
        position: 'MED',
      };
      const err = validateCrossCategory(
        { source: basePlayer40, targetTeamId: 'team-ab-1', dorsal: 10 },
        [basePlayer40, teamPlayer],
        baseTeams
      );
      expect(err).toBe('DORSAL_TAKEN');
    });

    it('retorna null en caso valido', () => {
      const err = validateCrossCategory(
        { source: basePlayer40, targetTeamId: 'team-ab-1', dorsal: 11 },
        [basePlayer40],
        baseTeams
      );
      expect(err).toBeNull();
    });
  });

  describe('buildCrossCategoryPlayer', () => {
    it('construye un nuevo registro con id distinto, mismos datos base y sin campos volatiles', () => {
      const originalCopy = JSON.parse(JSON.stringify(basePlayer40));
      const fixedDate = new Date('2026-10-02T12:00:00.000Z');

      const built = buildCrossCategoryPlayer(basePlayer40, 'team-ab-1', 77, fixedDate);

      expect(built.id).not.toBe(basePlayer40.id);
      expect(built.id.startsWith('p-')).toBe(true);
      expect(built.teamId).toBe('team-ab-1');
      expect(built.dorsal).toBe(77);
      expect(built.name).toBe(basePlayer40.name);
      expect(built.cedula).toBe(basePlayer40.cedula);
      expect(built.position).toBe(basePlayer40.position);
      expect(built.affiliation).toBe(basePlayer40.affiliation);
      expect(built.approvalStatus).toBe('APPROVED');
      expect(built.registeredAt).toBe('2026-10-02T12:00:00.000Z');
      expect(built.reinforcementOf).toBe(basePlayer40.id);

      // Campos omitidos
      expect(built.photo).toBeUndefined();
      expect(built.verificationDoc).toBeUndefined();
      expect(built.isCaptain).toBeUndefined();
      expect(built.suspendedRounds).toBeUndefined();
      expect(built.hasDoc).toBeUndefined();

      // Inmutabilidad del objeto original
      expect(basePlayer40).toEqual(originalCopy);
    });
  });

  describe('crossCategoryErrorMessage', () => {
    const errorCodes: CrossCategoryError[] = [
      'NO_CEDULA',
      'CATEGORY_NOT_ALLOWED',
      'ALREADY_IN_CATEGORY',
      'TEAM_FULL',
      'DORSAL_TAKEN',
      'TEAM_NOT_FOUND',
      'INVALID_DORSAL',
    ];

    it('devuelve mensaje en espanol para cada codigo de error', () => {
      for (const code of errorCodes) {
        const msg = crossCategoryErrorMessage(code);
        expect(typeof msg).toBe('string');
        expect(msg.length).toBeGreaterThan(10);
      }
      expect(crossCategoryErrorMessage('NO_CEDULA')).toBe(
        'El jugador debe tener una cédula válida de 10 dígitos.'
      );
      expect(crossCategoryErrorMessage('CATEGORY_NOT_ALLOWED')).toBe(
        'La categoría de destino no está permitida para este jugador.'
      );
      expect(crossCategoryErrorMessage('ALREADY_IN_CATEGORY')).toBe(
        'El jugador ya está registrado en un equipo de esa categoría.'
      );
      expect(crossCategoryErrorMessage('TEAM_FULL')).toBe(
        'El equipo elegido ya alcanzó el máximo de jugadores permitidos.'
      );
      expect(crossCategoryErrorMessage('DORSAL_TAKEN')).toBe(
        'Ese dorsal ya está en uso en el equipo elegido.'
      );
      expect(crossCategoryErrorMessage('TEAM_NOT_FOUND')).toBe(
        'El equipo de destino no fue encontrado.'
      );
      expect(crossCategoryErrorMessage('INVALID_DORSAL')).toBe(
        'El dorsal debe ser un número entero entre 1 y 99.'
      );
    });
  });

  describe('findSameCategoryConflict', () => {
    const p1: Player = {
      id: 'p-vet-1',
      teamId: 'team-40-1',
      name: 'Roberto',
      cedula: '1801234567',
      dorsal: 10,
      position: 'DEL',
      approvalStatus: 'APPROVED',
    };

    it('detecta conflicto en la misma categoria', () => {
      // Intentar meter p1 a otro equipo de +40
      const conflict = findSameCategoryConflict('1801234567', 'team-40-1', [p1], baseTeams);
      expect(conflict).toBe(true);
    });

    it('no detecta conflicto en categorias distintas', () => {
      // Intentar meter la misma cedula en Abierta Varones
      const conflict = findSameCategoryConflict('1801234567', 'team-ab-1', [p1], baseTeams);
      expect(conflict).toBe(false);
    });

    it('respeta excludePlayerId (edicion del mismo jugador)', () => {
      const conflict = findSameCategoryConflict(
        '1801234567',
        'team-40-1',
        [p1],
        baseTeams,
        'p-vet-1'
      );
      expect(conflict).toBe(false);
    });

    it('ignora jugadores con approvalStatus REJECTED', () => {
      const rejectedP: Player = { ...p1, approvalStatus: 'REJECTED' };
      const conflict = findSameCategoryConflict('1801234567', 'team-40-1', [rejectedP], baseTeams);
      expect(conflict).toBe(false);
    });

    it('devuelve false con cedula vacia o equipo inexistente', () => {
      expect(findSameCategoryConflict('', 'team-40-1', [p1], baseTeams)).toBe(false);
      expect(findSameCategoryConflict('1801234567', 'no-team', [p1], baseTeams)).toBe(false);
    });
  });

  describe('Integracion con calendario (sharedPlayers)', () => {
    it('tras anadir el registro construido, buildSharedPlayerPairs contiene el par equipo +40 / equipo Abierta', () => {
      const fixedDate = new Date('2026-10-02T12:00:00.000Z');
      const playerAbierta = buildCrossCategoryPlayer(basePlayer40, 'team-ab-1', 7, fixedDate);

      const allPlayers = [basePlayer40, playerAbierta];
      const pairs = buildSharedPlayerPairs(allPlayers);

      const expectedPairKey = makePairKey('team-40-1', 'team-ab-1');
      expect(pairs.has(expectedPairKey)).toBe(true);
    });
  });
});
