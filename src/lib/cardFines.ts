import { Category, Match } from '@/types';

export const YELLOW_CARD_FINE = 2;
export const RED_CARD_FINE = 4;

export interface PlayerFine {
  matchId: string;
  round: number;
  category: Category;
  teamId: string;
  playerId: string;
  kind: 'YELLOW' | 'EXPULSION';
  amount: number;
  isDoubleYellow?: boolean;
}

export interface TeamMatchFines {
  teamId: string;
  yellows: number;
  expulsions: number;
  amount: number;
}

export function isChargeable(match: Match): boolean {
  return match.status === 'IN_PROGRESS' || match.status === 'FINISHED';
}

interface PlayerCardAccumulator {
  playerId: string;
  teamId: string;
  yellowCount: number;
  redCount: number;
  hasDoubleYellowEvent: boolean;
}

export function playerFinesForMatch(match: Match): PlayerFine[] {
  if (!isChargeable(match)) {
    return [];
  }

  const cardEvents = (match.events || []).filter(
    (ev) => ev.type === 'YELLOW_CARD' || ev.type === 'RED_CARD'
  );

  const cardMap = cardEvents.reduce<Record<string, PlayerCardAccumulator>>((acc, ev) => {
    const key = `${ev.teamId}_${ev.playerId}`;
    const prev = acc[key] || {
      playerId: ev.playerId,
      teamId: ev.teamId,
      yellowCount: 0,
      redCount: 0,
      hasDoubleYellowEvent: false,
    };

    const isYellow = ev.type === 'YELLOW_CARD';
    const isRed = ev.type === 'RED_CARD';
    const isDoubleYellow = Boolean(ev.isDoubleYellow);

    return {
      ...acc,
      [key]: {
        playerId: prev.playerId,
        teamId: prev.teamId,
        yellowCount: prev.yellowCount + (isYellow ? 1 : 0),
        redCount: prev.redCount + (isRed ? 1 : 0),
        hasDoubleYellowEvent: prev.hasDoubleYellowEvent || isDoubleYellow,
      },
    };
  }, {});

  return Object.values(cardMap)
    .map((stats): PlayerFine | null => {
      const hasExpulsion = stats.redCount >= 1 || stats.yellowCount >= 2;

      if (hasExpulsion) {
        const isDoubleYellow = stats.yellowCount >= 2 || stats.hasDoubleYellowEvent;
        return {
          matchId: match.id,
          round: match.round,
          category: match.category,
          teamId: stats.teamId,
          playerId: stats.playerId,
          kind: 'EXPULSION',
          amount: RED_CARD_FINE,
          isDoubleYellow,
        };
      }

      if (stats.yellowCount === 1) {
        return {
          matchId: match.id,
          round: match.round,
          category: match.category,
          teamId: stats.teamId,
          playerId: stats.playerId,
          kind: 'YELLOW',
          amount: YELLOW_CARD_FINE,
          isDoubleYellow: false,
        };
      }

      return null;
    })
    .filter((fine): fine is PlayerFine => fine !== null);
}

interface FinesSummary {
  yellows: number;
  expulsions: number;
  amount: number;
}

function summarizeFines(fines: PlayerFine[]): FinesSummary {
  const yellows = fines.filter((fine) => fine.kind === 'YELLOW').length;
  const expulsions = fines.filter((fine) => fine.kind === 'EXPULSION').length;
  const amount = fines.reduce((sum, fine) => sum + fine.amount, 0);

  return {
    yellows,
    expulsions,
    amount,
  };
}

export function teamFinesForMatch(match: Match, teamId: string): TeamMatchFines {
  const fines = playerFinesForMatch(match).filter((fine) => fine.teamId === teamId);
  const summary = summarizeFines(fines);

  return {
    teamId,
    ...summary,
  };
}

export function matchFinesTotal(match: Match): FinesSummary {
  return summarizeFines(playerFinesForMatch(match));
}
