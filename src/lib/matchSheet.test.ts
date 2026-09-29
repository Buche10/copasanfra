import { describe, it, expect } from 'vitest';
import {
  goalDelta,
  addEvent,
  removeEvent,
  replaceEvent,
  scoreFromGoals,
  applyCorrection,
  validateCorrectionReason,
  validateScore,
  countSheetChanges,
} from './matchSheet';
import { Match, MatchEvent, SheetCorrection } from '@/types';

function createMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm-1',
    category: 'Abierta Varones',
    round: 1,
    date: '2026-05-10',
    time: '10:00',
    stadium: 'Cancha 1',
    homeTeamId: 'team-home',
    awayTeamId: 'team-away',
    homeScore: 0,
    awayScore: 0,
    status: 'IN_PROGRESS',
    homeLineup: [],
    awayLineup: [],
    events: [],
    ...overrides,
  };
}

describe('goalDelta', () => {
  const match = createMatch();

  it('returns home +1 for regular goal by home team', () => {
    const ev: MatchEvent = {
      id: 'e1',
      matchId: 'm-1',
      minute: 10,
      type: 'GOAL',
      goalType: 'REGULAR',
      teamId: 'team-home',
      playerId: 'p1',
    };
    expect(goalDelta(match, ev)).toEqual({ home: 1, away: 0 });
  });

  it('returns away +1 for penalty goal by away team and home +1 for penalty goal by home team', () => {
    const penaltyAway: MatchEvent = {
      id: 'e2',
      matchId: 'm-1',
      minute: 15,
      type: 'GOAL',
      goalType: 'PENALTY',
      teamId: 'team-away',
      playerId: 'p2',
    };
    expect(goalDelta(match, penaltyAway)).toEqual({ home: 0, away: 1 });

    const penaltyHome: MatchEvent = {
      id: 'e2-home',
      matchId: 'm-1',
      minute: 18,
      type: 'GOAL',
      goalType: 'PENALTY',
      teamId: 'team-home',
      playerId: 'p1',
    };
    expect(goalDelta(match, penaltyHome)).toEqual({ home: 1, away: 0 });
  });

  it('awards goal to opponent on own goal', () => {
    const homeOwnGoal: MatchEvent = {
      id: 'e3',
      matchId: 'm-1',
      minute: 20,
      type: 'GOAL',
      goalType: 'OWN_GOAL',
      teamId: 'team-home',
      playerId: 'p1',
    };
    expect(goalDelta(match, homeOwnGoal)).toEqual({ home: 0, away: 1 });

    const awayOwnGoal: MatchEvent = {
      id: 'e4',
      matchId: 'm-1',
      minute: 25,
      type: 'GOAL',
      goalType: 'OWN_GOAL',
      teamId: 'team-away',
      playerId: 'p2',
    };
    expect(goalDelta(match, awayOwnGoal)).toEqual({ home: 1, away: 0 });
  });

  it('returns 0/0 for non-goal events or unknown teams', () => {
    const yellowCard: MatchEvent = {
      id: 'e5',
      matchId: 'm-1',
      minute: 30,
      type: 'YELLOW_CARD',
      teamId: 'team-home',
      playerId: 'p1',
    };
    expect(goalDelta(match, yellowCard)).toEqual({ home: 0, away: 0 });

    const otherTeamGoal: MatchEvent = {
      id: 'e6',
      matchId: 'm-1',
      minute: 35,
      type: 'GOAL',
      teamId: 'team-unknown',
      playerId: 'p3',
    };
    expect(goalDelta(match, otherTeamGoal)).toEqual({ home: 0, away: 0 });
  });
});

describe('addEvent', () => {
  it('adds goal for home team and increments homeScore without mutating original', () => {
    const match = createMatch({ homeScore: 1, awayScore: 0 });
    const ev: MatchEvent = {
      id: 'ev-1',
      matchId: match.id,
      minute: 12,
      type: 'GOAL',
      goalType: 'REGULAR',
      teamId: 'team-home',
      playerId: 'p1',
    };

    const updated = addEvent(match, ev);

    expect(updated.homeScore).toBe(2);
    expect(updated.awayScore).toBe(0);
    expect(updated.events).toHaveLength(1);
    expect(updated.events[0]).toEqual(ev);

    // Verify immutability
    expect(match.homeScore).toBe(1);
    expect(match.events).toHaveLength(0);
  });

  it('adds own goal from home team and increments awayScore', () => {
    const match = createMatch({ homeScore: 0, awayScore: 0 });
    const ev: MatchEvent = {
      id: 'ev-2',
      matchId: match.id,
      minute: 22,
      type: 'GOAL',
      goalType: 'OWN_GOAL',
      teamId: 'team-home',
      playerId: 'p1',
    };

    const updated = addEvent(match, ev);

    expect(updated.homeScore).toBe(0);
    expect(updated.awayScore).toBe(1);
  });

  it('adds card event without changing scores', () => {
    const match = createMatch({ homeScore: 1, awayScore: 1 });
    const ev: MatchEvent = {
      id: 'ev-3',
      matchId: match.id,
      minute: 40,
      type: 'YELLOW_CARD',
      teamId: 'team-home',
      playerId: 'p1',
    };

    const updated = addEvent(match, ev);

    expect(updated.homeScore).toBe(1);
    expect(updated.awayScore).toBe(1);
    expect(updated.events).toHaveLength(1);
  });
});

describe('removeEvent', () => {
  it('removes goal and decrements score without dropping below 0', () => {
    const goalEv: MatchEvent = {
      id: 'ev-goal',
      matchId: 'm-1',
      minute: 10,
      type: 'GOAL',
      goalType: 'REGULAR',
      teamId: 'team-home',
      playerId: 'p1',
    };
    const match = createMatch({
      homeScore: 1,
      awayScore: 0,
      events: [goalEv],
    });

    const updated = removeEvent(match, 'ev-goal');

    expect(updated.homeScore).toBe(0);
    expect(updated.awayScore).toBe(0);
    expect(updated.events).toHaveLength(0);
  });

  it('does not reduce score below 0 when goal is removed', () => {
    const goalEv: MatchEvent = {
      id: 'ev-goal',
      matchId: 'm-1',
      minute: 10,
      type: 'GOAL',
      goalType: 'REGULAR',
      teamId: 'team-home',
      playerId: 'p1',
    };
    const match = createMatch({
      homeScore: 0, // already 0
      awayScore: 0,
      events: [goalEv],
    });

    const updated = removeEvent(match, 'ev-goal');

    expect(updated.homeScore).toBe(0);
    expect(updated.events).toHaveLength(0);
  });

  it('returns identical match if event id is not found', () => {
    const match = createMatch({ homeScore: 2, awayScore: 1 });
    const updated = removeEvent(match, 'non-existent-id');

    expect(updated).toBe(match);
  });
});

describe('replaceEvent', () => {
  it('moves goal point from home to away when team is changed', () => {
    const oldEv: MatchEvent = {
      id: 'ev-1',
      matchId: 'm-1',
      minute: 15,
      type: 'GOAL',
      teamId: 'team-home',
      playerId: 'p1',
    };
    const match = createMatch({
      homeScore: 2,
      awayScore: 0,
      events: [oldEv],
    });

    const newEv: MatchEvent = {
      ...oldEv,
      teamId: 'team-away',
      playerId: 'p2',
    };

    const updated = replaceEvent(match, newEv);

    expect(updated.homeScore).toBe(1);
    expect(updated.awayScore).toBe(1);
    expect(updated.events[0].teamId).toBe('team-away');
  });

  it('decrements score when goal is replaced with card', () => {
    const oldEv: MatchEvent = {
      id: 'ev-1',
      matchId: 'm-1',
      minute: 20,
      type: 'GOAL',
      teamId: 'team-home',
      playerId: 'p1',
    };
    const match = createMatch({
      homeScore: 1,
      awayScore: 0,
      events: [oldEv],
    });

    const newEv: MatchEvent = {
      id: 'ev-1',
      matchId: 'm-1',
      minute: 20,
      type: 'YELLOW_CARD',
      teamId: 'team-home',
      playerId: 'p1',
    };

    const updated = replaceEvent(match, newEv);

    expect(updated.homeScore).toBe(0);
    expect(updated.awayScore).toBe(0);
    expect(updated.events[0].type).toBe('YELLOW_CARD');
  });

  it('keeps score unchanged when card is changed from one player to another', () => {
    const oldEv: MatchEvent = {
      id: 'ev-card',
      matchId: 'm-1',
      minute: 33,
      type: 'YELLOW_CARD',
      teamId: 'team-home',
      playerId: 'p1',
    };
    const match = createMatch({
      homeScore: 1,
      awayScore: 1,
      events: [oldEv],
    });

    const newEv: MatchEvent = {
      ...oldEv,
      playerId: 'p2',
    };

    const updated = replaceEvent(match, newEv);

    expect(updated.homeScore).toBe(1);
    expect(updated.awayScore).toBe(1);
    expect(updated.events[0].playerId).toBe('p2');
  });

  it('returns original match if updated event id does not exist', () => {
    const match = createMatch({ homeScore: 1, awayScore: 0 });
    const ev: MatchEvent = {
      id: 'ghost-id',
      matchId: 'm-1',
      minute: 10,
      type: 'GOAL',
      teamId: 'team-home',
      playerId: 'p1',
    };

    const updated = replaceEvent(match, ev);

    expect(updated).toBe(match);
  });
});

describe('scoreFromGoals', () => {
  it('correctly calculates total scores with regular, penalty and own goals', () => {
    const match = createMatch({
      events: [
        {
          id: 'g1',
          matchId: 'm-1',
          minute: 5,
          type: 'GOAL',
          goalType: 'REGULAR',
          teamId: 'team-home',
          playerId: 'p1',
        },
        {
          id: 'g2',
          matchId: 'm-1',
          minute: 25,
          type: 'GOAL',
          goalType: 'PENALTY',
          teamId: 'team-home',
          playerId: 'p1',
        },
        {
          id: 'g3',
          matchId: 'm-1',
          minute: 40,
          type: 'GOAL',
          goalType: 'OWN_GOAL',
          teamId: 'team-home', // own goal by home -> away +1
          playerId: 'p2',
        },
        {
          id: 'g4',
          matchId: 'm-1',
          minute: 55,
          type: 'GOAL',
          goalType: 'REGULAR',
          teamId: 'team-away',
          playerId: 'p3',
        },
        {
          id: 'card1',
          matchId: 'm-1',
          minute: 60,
          type: 'RED_CARD',
          teamId: 'team-away',
          playerId: 'p3',
        },
      ],
    });

    const score = scoreFromGoals(match);

    expect(score).toEqual({ homeScore: 2, awayScore: 2 });
  });

  it('returns 0/0 when there are no events', () => {
    const match = createMatch({ events: [] });
    expect(scoreFromGoals(match)).toEqual({ homeScore: 0, awayScore: 0 });
  });
});

describe('applyCorrection', () => {
  it('applies correction, preserves status and signature, appends to corrections history without mutation', () => {
    const original = Object.freeze(
      createMatch({
        status: 'FINISHED',
        refereeSigned: true,
        signedAt: '2026-05-10T12:00:00Z',
        corrections: [
          {
            at: '2026-05-11T10:00:00Z',
            by: 'Admin 1',
            reason: 'Correccion previa de dorsal',
          },
        ],
      })
    );

    const draft = Object.freeze(
      createMatch({
        homeScore: 3,
        awayScore: 2,
        status: 'IN_PROGRESS', // draft accidentally changed status
        refereeSigned: false,
        signedAt: undefined,
      })
    );

    const newCorrection: SheetCorrection = {
      at: '2026-05-12T15:00:00Z',
      by: 'Admin 2',
      reason: 'Ajuste de marcador por gol anulado por VAR arbitral',
    };

    const result = applyCorrection(original, draft, newCorrection);

    // Metadata is preserved from original
    expect(result.status).toBe('FINISHED');
    expect(result.refereeSigned).toBe(true);
    expect(result.signedAt).toBe('2026-05-10T12:00:00Z');

    // Scores and events from draft are kept
    expect(result.homeScore).toBe(3);
    expect(result.awayScore).toBe(2);

    // Corrections appended
    expect(result.corrections).toHaveLength(2);
    expect(result.corrections?.[0].by).toBe('Admin 1');
    expect(result.corrections?.[1].by).toBe('Admin 2');

    // Original and draft remain untouched
    expect(original.corrections).toHaveLength(1);
  });

  it('handles applyCorrection when original has no previous corrections', () => {
    const original = createMatch({ corrections: undefined });
    const draft = createMatch({ homeScore: 1 });
    const correction: SheetCorrection = {
      at: '2026-05-12T15:00:00Z',
      by: 'Admin',
      reason: 'Primera correccion',
    };

    const result = applyCorrection(original, draft, correction);
    expect(result.corrections).toEqual([correction]);
  });

  it('handles addEvent, removeEvent, replaceEvent and scoreFromGoals with undefined optional fields', () => {
    const rawMatch = {
      id: 'm-raw',
      category: 'Abierta Varones',
      round: 1,
      date: '2026-05-10',
      time: '10:00',
      stadium: 'Cancha 1',
      homeTeamId: 'team-home',
      awayTeamId: 'team-away',
      status: 'IN_PROGRESS',
      homeLineup: [],
      awayLineup: [],
    } as unknown as Match;

    const goalEv: MatchEvent = {
      id: 'ev-raw',
      matchId: 'm-raw',
      minute: 10,
      type: 'GOAL',
      teamId: 'team-home',
      playerId: 'p1',
    };

    const added = addEvent(rawMatch, goalEv);
    expect(added.homeScore).toBe(1);
    expect(added.awayScore).toBe(0);

    const matchNoEvents = { ...rawMatch, events: undefined } as unknown as Match;
    expect(removeEvent(matchNoEvents, 'nonexistent')).toBe(matchNoEvents);
    expect(replaceEvent(matchNoEvents, goalEv)).toBe(matchNoEvents);
    expect(scoreFromGoals(matchNoEvents)).toEqual({ homeScore: 0, awayScore: 0 });
  });
});

describe('validateCorrectionReason', () => {
  it('rejects text under 5 characters', () => {
    expect(validateCorrectionReason('abcd')).toBe('El motivo debe tener al menos 5 caracteres.');
    expect(validateCorrectionReason('   ')).toBe('El motivo debe tener al menos 5 caracteres.');
    expect(validateCorrectionReason('')).toBe('El motivo debe tener al menos 5 caracteres.');
    expect(validateCorrectionReason(null)).toBe('El motivo debe tener al menos 5 caracteres.');
  });

  it('accepts text with exactly 5 characters', () => {
    expect(validateCorrectionReason('12345')).toBeNull();
  });

  it('accepts text with exactly 300 characters', () => {
    const text300 = 'a'.repeat(300);
    expect(validateCorrectionReason(text300)).toBeNull();
  });

  it('rejects text over 300 characters', () => {
    const text301 = 'a'.repeat(301);
    expect(validateCorrectionReason(text301)).toBe('El motivo no puede superar los 300 caracteres.');
  });
});

describe('validateScore', () => {
  it('accepts valid score integers between 0 and 99', () => {
    expect(validateScore('0')).toBe(0);
    expect(validateScore('1')).toBe(1);
    expect(validateScore('42')).toBe(42);
    expect(validateScore('99')).toBe(99);
    expect(validateScore('  5  ')).toBe(5);
  });

  it('rejects negative numbers, decimals, non-integers, and numbers >= 100', () => {
    expect(validateScore('-1')).toBeNull();
    expect(validateScore('100')).toBeNull();
    expect(validateScore('150')).toBeNull();
    expect(validateScore('abc')).toBeNull();
    expect(validateScore('2.5')).toBeNull();
    expect(validateScore('')).toBeNull();
    expect(validateScore(null)).toBeNull();
    expect(validateScore(undefined)).toBeNull();
  });
});

describe('countSheetChanges', () => {
  it('returns 0 when original and draft are identical', () => {
    const orig = Object.freeze(
      createMatch({
        homeScore: 2,
        awayScore: 1,
        homeGoalkeeperId: 'gk-1',
        awayGoalkeeperId: 'gk-2',
        refereeNotes: 'Sin novedades',
        homeLineup: [{ playerId: 'p1', isStarter: true, dorsal: 10 }],
        events: [
          {
            id: 'e1',
            matchId: 'm-1',
            minute: 10,
            type: 'GOAL',
            teamId: 'team-home',
            playerId: 'p1',
          },
        ],
      })
    );
    const draft = Object.freeze(createMatch({ ...orig }));

    expect(countSheetChanges(orig, draft)).toBe(0);
  });

  it('counts changes in scores, goalkeepers, notes, lineups and events', () => {
    const orig = Object.freeze(
      createMatch({
        homeScore: 0,
        awayScore: 0,
        homeGoalkeeperId: 'gk-1',
        awayGoalkeeperId: 'gk-2',
        refereeNotes: 'Original notes',
        homeLineup: [{ playerId: 'p1', isStarter: true, dorsal: 10 }],
        awayLineup: [{ playerId: 'p2', isStarter: true, dorsal: 9 }],
        events: [
          {
            id: 'e1',
            matchId: 'm-1',
            minute: 10,
            type: 'GOAL',
            teamId: 'team-home',
            playerId: 'p1',
          },
          {
            id: 'e2',
            matchId: 'm-1',
            minute: 20,
            type: 'YELLOW_CARD',
            teamId: 'team-away',
            playerId: 'p2',
          },
        ],
      })
    );

    const draft = Object.freeze(
      createMatch({
        homeScore: 1, // +1 (scalar)
        awayScore: 2, // +1 (scalar)
        homeGoalkeeperId: 'gk-alt', // +1 (scalar)
        awayGoalkeeperId: 'gk-2', // unchanged
        refereeNotes: 'Edited notes', // +1 (scalar)
        homeLineup: [
          { playerId: 'p1', isStarter: true, dorsal: 10 },
          { playerId: 'p3', isStarter: true, dorsal: 7 }, // +1 (lineup added)
        ],
        awayLineup: [], // +1 (lineup p2 removed)
        events: [
          // e1 edited: minute changed to 15 -> +1 (event modified)
          {
            id: 'e1',
            matchId: 'm-1',
            minute: 15,
            type: 'GOAL',
            teamId: 'team-home',
            playerId: 'p1',
          },
          // e2 removed -> +1 (event removed)
          // e3 added -> +1 (event added)
          {
            id: 'e3',
            matchId: 'm-1',
            minute: 44,
            type: 'RED_CARD',
            teamId: 'team-away',
            playerId: 'p4',
          },
        ],
      })
    );

    // scalar: 4 (homeScore, awayScore, homeGk, notes)
    // lineup: 2 (p3 added, p2 removed)
    // events: 3 (e1 modified, e2 removed, e3 added)
    // total: 4 + 2 + 3 = 9
    expect(countSheetChanges(orig, draft)).toBe(9);
  });

  it('handles matches with undefined optional fields in countSheetChanges', () => {
    const orig = {
      id: 'm-orig',
      category: 'Abierta Varones',
      round: 1,
      date: '2026-05-10',
      time: '10:00',
      stadium: 'Cancha 1',
      homeTeamId: 'team-home',
      awayTeamId: 'team-away',
      status: 'IN_PROGRESS',
    } as unknown as Match;

    const draft = { ...orig } as unknown as Match;
    expect(countSheetChanges(orig, draft)).toBe(0);
  });
});
