import { describe, it, expect } from 'vitest';
import { Match, MatchEvent } from '@/types';
import {
  YELLOW_CARD_FINE,
  RED_CARD_FINE,
  isChargeable,
  playerFinesForMatch,
  teamFinesForMatch,
  matchFinesTotal,
} from './cardFines';

function createMockMatch(overrides?: Partial<Match>): Match {
  return {
    id: 'match-1',
    category: 'Abierta Varones',
    round: 1,
    date: '2026-03-01',
    time: '08:00',
    stadium: 'Cancha 1',
    homeTeamId: 'team-home',
    awayTeamId: 'team-away',
    homeScore: 0,
    awayScore: 0,
    status: 'FINISHED',
    homeLineup: [],
    awayLineup: [],
    events: [],
    ...overrides,
  };
}

function createCardEvent(
  id: string,
  type: MatchEvent['type'],
  teamId: string,
  playerId: string,
  extra?: Partial<MatchEvent>
): MatchEvent {
  return {
    id,
    matchId: 'match-1',
    minute: 10,
    type,
    teamId,
    playerId,
    ...extra,
  };
}

describe('cardFines module', () => {
  it('defines correct fine constants', () => {
    expect(YELLOW_CARD_FINE).toBe(2);
    expect(RED_CARD_FINE).toBe(4);
  });

  describe('isChargeable', () => {
    it('returns true for IN_PROGRESS and FINISHED matches', () => {
      expect(isChargeable(createMockMatch({ status: 'IN_PROGRESS' }))).toBe(true);
      expect(isChargeable(createMockMatch({ status: 'FINISHED' }))).toBe(true);
    });

    it('returns false for SCHEDULED and SUSPENDED matches', () => {
      expect(isChargeable(createMockMatch({ status: 'SCHEDULED' }))).toBe(false);
      expect(isChargeable(createMockMatch({ status: 'SUSPENDED' }))).toBe(false);
    });
  });

  describe('playerFinesForMatch & matchFinesTotal', () => {
    it('calculates 1 yellow card as $2, yellows: 1, expulsions: 0', () => {
      const match = createMockMatch({
        events: [createCardEvent('e1', 'YELLOW_CARD', 'team-home', 'player-1')],
      });

      const playerFines = playerFinesForMatch(match);
      expect(playerFines).toHaveLength(1);
      expect(playerFines[0]).toEqual({
        matchId: 'match-1',
        round: 1,
        category: 'Abierta Varones',
        teamId: 'team-home',
        playerId: 'player-1',
        kind: 'YELLOW',
        amount: 2,
        isDoubleYellow: false,
      });

      const totals = matchFinesTotal(match);
      expect(totals).toEqual({
        yellows: 1,
        expulsions: 0,
        amount: 2,
      });
    });

    it('calculates 1 direct red card as $4, expulsions: 1', () => {
      const match = createMockMatch({
        events: [createCardEvent('e1', 'RED_CARD', 'team-home', 'player-1')],
      });

      const playerFines = playerFinesForMatch(match);
      expect(playerFines).toHaveLength(1);
      expect(playerFines[0]).toEqual({
        matchId: 'match-1',
        round: 1,
        category: 'Abierta Varones',
        teamId: 'team-home',
        playerId: 'player-1',
        kind: 'EXPULSION',
        amount: 4,
        isDoubleYellow: false,
      });

      const totals = matchFinesTotal(match);
      expect(totals).toEqual({
        yellows: 0,
        expulsions: 1,
        amount: 4,
      });
    });

    it('calculates 2 yellow cards for same player in same match as $4, yellows: 0, expulsions: 1', () => {
      const match = createMockMatch({
        events: [
          createCardEvent('e1', 'YELLOW_CARD', 'team-home', 'player-1'),
          createCardEvent('e2', 'YELLOW_CARD', 'team-home', 'player-1'),
        ],
      });

      const playerFines = playerFinesForMatch(match);
      expect(playerFines).toHaveLength(1);
      expect(playerFines[0]).toEqual({
        matchId: 'match-1',
        round: 1,
        category: 'Abierta Varones',
        teamId: 'team-home',
        playerId: 'player-1',
        kind: 'EXPULSION',
        amount: 4,
        isDoubleYellow: true,
      });

      const totals = matchFinesTotal(match);
      expect(totals).toEqual({
        yellows: 0,
        expulsions: 1,
        amount: 4,
      });
    });

    it('calculates 2 yellow cards + 1 red card for same player as $4', () => {
      const match = createMockMatch({
        events: [
          createCardEvent('e1', 'YELLOW_CARD', 'team-home', 'player-1'),
          createCardEvent('e2', 'YELLOW_CARD', 'team-home', 'player-1'),
          createCardEvent('e3', 'RED_CARD', 'team-home', 'player-1', { isDoubleYellow: true }),
        ],
      });

      const playerFines = playerFinesForMatch(match);
      expect(playerFines).toHaveLength(1);
      expect(playerFines[0].amount).toBe(4);
      expect(playerFines[0].kind).toBe('EXPULSION');
      expect(playerFines[0].isDoubleYellow).toBe(true);

      const totals = matchFinesTotal(match);
      expect(totals).toEqual({
        yellows: 0,
        expulsions: 1,
        amount: 4,
      });
    });

    it('calculates 1 yellow card + 1 direct red card for same player as $4', () => {
      const match = createMockMatch({
        events: [
          createCardEvent('e1', 'YELLOW_CARD', 'team-home', 'player-1'),
          createCardEvent('e2', 'RED_CARD', 'team-home', 'player-1'),
        ],
      });

      const playerFines = playerFinesForMatch(match);
      expect(playerFines).toHaveLength(1);
      expect(playerFines[0].amount).toBe(4);
      expect(playerFines[0].kind).toBe('EXPULSION');

      const totals = matchFinesTotal(match);
      expect(totals).toEqual({
        yellows: 0,
        expulsions: 1,
        amount: 4,
      });
    });

    it('calculates 2 yellow cards from different players on the same team as $4, yellows: 2', () => {
      const match = createMockMatch({
        events: [
          createCardEvent('e1', 'YELLOW_CARD', 'team-home', 'player-1'),
          createCardEvent('e2', 'YELLOW_CARD', 'team-home', 'player-2'),
        ],
      });

      const playerFines = playerFinesForMatch(match);
      expect(playerFines).toHaveLength(2);

      const totals = matchFinesTotal(match);
      expect(totals).toEqual({
        yellows: 2,
        expulsions: 0,
        amount: 4,
      });
    });

    it('calculates yellow cards from same player in different matches as $2 in each match', () => {
      const match1 = createMockMatch({
        id: 'match-1',
        round: 1,
        events: [createCardEvent('e1', 'YELLOW_CARD', 'team-home', 'player-1')],
      });

      const match2 = createMockMatch({
        id: 'match-2',
        round: 2,
        events: [createCardEvent('e2', 'YELLOW_CARD', 'team-home', 'player-1')],
      });

      const finesMatch1 = matchFinesTotal(match1);
      const finesMatch2 = matchFinesTotal(match2);

      expect(finesMatch1).toEqual({ yellows: 1, expulsions: 0, amount: 2 });
      expect(finesMatch2).toEqual({ yellows: 1, expulsions: 0, amount: 2 });
    });

    it('returns $0 for SCHEDULED or SUSPENDED matches with card events', () => {
      const scheduledMatch = createMockMatch({
        status: 'SCHEDULED',
        events: [
          createCardEvent('e1', 'YELLOW_CARD', 'team-home', 'player-1'),
          createCardEvent('e2', 'RED_CARD', 'team-home', 'player-2'),
        ],
      });

      const suspendedMatch = createMockMatch({
        status: 'SUSPENDED',
        events: [
          createCardEvent('e1', 'YELLOW_CARD', 'team-home', 'player-1'),
          createCardEvent('e2', 'RED_CARD', 'team-home', 'player-2'),
        ],
      });

      expect(playerFinesForMatch(scheduledMatch)).toEqual([]);
      expect(matchFinesTotal(scheduledMatch)).toEqual({ yellows: 0, expulsions: 0, amount: 0 });

      expect(playerFinesForMatch(suspendedMatch)).toEqual([]);
      expect(matchFinesTotal(suspendedMatch)).toEqual({ yellows: 0, expulsions: 0, amount: 0 });
    });

    it('ignores GOAL and SUBSTITUTION events', () => {
      const match = createMockMatch({
        events: [
          {
            id: 'g1',
            matchId: 'match-1',
            minute: 15,
            type: 'GOAL',
            teamId: 'team-home',
            playerId: 'player-1',
          },
          {
            id: 's1',
            matchId: 'match-1',
            minute: 45,
            type: 'SUBSTITUTION',
            teamId: 'team-home',
            playerId: 'player-2',
            playerInId: 'player-3',
          },
        ],
      });

      expect(playerFinesForMatch(match)).toEqual([]);
      expect(matchFinesTotal(match)).toEqual({ yellows: 0, expulsions: 0, amount: 0 });
    });
  });

  describe('teamFinesForMatch', () => {
    it('separates home and away team fines correctly', () => {
      const match = createMockMatch({
        events: [
          createCardEvent('e1', 'YELLOW_CARD', 'team-home', 'player-1'),
          createCardEvent('e2', 'RED_CARD', 'team-home', 'player-2'),
          createCardEvent('e3', 'YELLOW_CARD', 'team-away', 'player-3'),
          createCardEvent('e4', 'YELLOW_CARD', 'team-away', 'player-3'),
        ],
      });

      const homeFines = teamFinesForMatch(match, 'team-home');
      expect(homeFines).toEqual({
        teamId: 'team-home',
        yellows: 1,
        expulsions: 1,
        amount: 6,
      });

      const awayFines = teamFinesForMatch(match, 'team-away');
      expect(awayFines).toEqual({
        teamId: 'team-away',
        yellows: 0,
        expulsions: 1,
        amount: 4,
      });
    });

    it('returns zeroes when a team has no card fines', () => {
      const match = createMockMatch({
        events: [createCardEvent('e1', 'YELLOW_CARD', 'team-home', 'player-1')],
      });

      const awayFines = teamFinesForMatch(match, 'team-away');
      expect(awayFines).toEqual({
        teamId: 'team-away',
        yellows: 0,
        expulsions: 0,
        amount: 0,
      });
    });
  });
});
