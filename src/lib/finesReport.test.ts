import { describe, it, expect, vi } from 'vitest';
import { Match, MatchEvent, Team, CardFinePayment } from '@/types';
import {
  buildFinesReport,
  validateFinePayment,
  toFinesCsv,
  localDateString,
} from './finesReport';

function createMockTeam(id: string, name: string, category: Team['category'] = 'Abierta Varones'): Team {
  return {
    id,
    name,
    shortName: name.slice(0, 3).toUpperCase(),
    category,
    logo: 'logo-key',
    primaryColor: '#00A859',
    secondaryColor: '#FFFFFF',
    delegate: 'Delegado',
    phone: '0999999999',
  };
}

function createMockMatch(overrides?: Partial<Match>): Match {
  return {
    id: 'match-1',
    category: 'Abierta Varones',
    round: 1,
    date: '2026-03-01',
    time: '08:00',
    stadium: 'Cancha 1',
    homeTeamId: 'team-1',
    awayTeamId: 'team-2',
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

function createPayment(
  id: string,
  teamId: string,
  amount: number,
  overrides?: Partial<CardFinePayment>
): CardFinePayment {
  return {
    id,
    teamId,
    category: 'Abierta Varones',
    amount,
    method: 'EFECTIVO',
    paidAt: '2026-03-05',
    registeredBy: 'Admin',
    createdAt: '2026-03-05T12:00:00.000Z',
    ...overrides,
  };
}

describe('finesReport module', () => {
  describe('localDateString', () => {
    it('formats local date correctly without jumping to next day at night', () => {
      const dateAtNight = new Date(2026, 8, 29, 23, 30);
      expect(localDateString(dateAtNight)).toBe('2026-09-29');
    });
  });

  describe('buildFinesReport', () => {
    it('calculates generated fines and subtracts payments for multiple teams and rounds', () => {
      const teamA = createMockTeam('team-a', 'Atletico');
      const teamB = createMockTeam('team-b', 'Barcelona');

      const match1 = createMockMatch({
        id: 'm1',
        round: 1,
        events: [
          createCardEvent('e1', 'YELLOW_CARD', 'team-a', 'p1'), // $2
          createCardEvent('e2', 'RED_CARD', 'team-b', 'p2'), // $4
        ],
      });

      const match2 = createMockMatch({
        id: 'm2',
        round: 2,
        events: [
          createCardEvent('e3', 'YELLOW_CARD', 'team-a', 'p3'), // $2
        ],
      });

      // teamA generated = $4, paid = $2 -> balance = $2
      // teamB generated = $4, paid = $0 -> balance = $4
      const payments = [createPayment('pay-1', 'team-a', 2)];

      const report = buildFinesReport(
        [teamA, teamB],
        [match1, match2],
        payments,
        { category: 'ALL', upToRound: null }
      );

      expect(report.rows).toHaveLength(2);

      // Order by balance desc: teamB ($4) then teamA ($2)
      expect(report.rows[0].teamId).toBe('team-b');
      expect(report.rows[0].generated).toBe(4);
      expect(report.rows[0].paid).toBe(0);
      expect(report.rows[0].balance).toBe(4);
      expect(report.rows[0].expulsions).toBe(1);
      expect(report.rows[0].yellows).toBe(0);

      expect(report.rows[1].teamId).toBe('team-a');
      expect(report.rows[1].generated).toBe(4);
      expect(report.rows[1].paid).toBe(2);
      expect(report.rows[1].balance).toBe(2);
      expect(report.rows[1].yellows).toBe(2);
      expect(report.rows[1].expulsions).toBe(0);

      expect(report.totals).toEqual({
        generated: 8,
        paid: 2,
        balance: 6,
      });
    });

    it('calculates negative balance when a team has overpaid', () => {
      const team = createMockTeam('team-1', 'Equipo Solvente');
      const match = createMockMatch({
        events: [createCardEvent('e1', 'YELLOW_CARD', 'team-1', 'p1')], // $2
      });
      const payments = [createPayment('pay-1', 'team-1', 10)]; // $10

      const report = buildFinesReport([team], [match], payments, {
        category: 'ALL',
        upToRound: null,
      });

      expect(report.rows[0].generated).toBe(2);
      expect(report.rows[0].paid).toBe(10);
      expect(report.rows[0].balance).toBe(-8);
      expect(report.totals.balance).toBe(-8);
    });

    it('filters teams and matches by category', () => {
      const teamOpen = createMockTeam('t-open', 'Open FC', 'Abierta Varones');
      const team40 = createMockTeam('t-40', 'Veteranos', '+40 Varones');

      const matchOpen = createMockMatch({
        category: 'Abierta Varones',
        events: [createCardEvent('e1', 'YELLOW_CARD', 't-open', 'p1')],
      });
      const match40 = createMockMatch({
        category: '+40 Varones',
        events: [createCardEvent('e2', 'RED_CARD', 't-40', 'p2')],
      });

      const report = buildFinesReport(
        [teamOpen, team40],
        [matchOpen, match40],
        [],
        { category: '+40 Varones', upToRound: null }
      );

      expect(report.rows).toHaveLength(1);
      expect(report.rows[0].teamId).toBe('t-40');
      expect(report.rows[0].generated).toBe(4);
      expect(report.totals.generated).toBe(4);
    });

    it('filters matches up to upToRound without filtering team payments', () => {
      const team = createMockTeam('t-1', 'Equipo Test');
      const mRound1 = createMockMatch({
        round: 1,
        events: [createCardEvent('e1', 'YELLOW_CARD', 't-1', 'p1')], // $2
      });
      const mRound2 = createMockMatch({
        round: 2,
        events: [createCardEvent('e2', 'YELLOW_CARD', 't-1', 'p2')], // $2
      });

      // Payments from both dates
      const payments = [
        createPayment('p1', 't-1', 2, { paidAt: '2026-03-01' }),
        createPayment('p2', 't-1', 2, { paidAt: '2026-03-10' }),
      ];

      const report = buildFinesReport([team], [mRound1, mRound2], payments, {
        category: 'ALL',
        upToRound: 1,
      });

      // Match 2 is excluded, generated should be $2
      expect(report.rows[0].generated).toBe(2);
      // All payments are kept ($4 total paid)
      expect(report.rows[0].paid).toBe(4);
      expect(report.rows[0].balance).toBe(-2);
    });

    it('does not add fines from SCHEDULED matches', () => {
      const team = createMockTeam('t-1', 'Equipo Test');
      const matchScheduled = createMockMatch({
        status: 'SCHEDULED',
        events: [createCardEvent('e1', 'RED_CARD', 't-1', 'p1')],
      });

      const report = buildFinesReport([team], [matchScheduled], [], {
        category: 'ALL',
        upToRound: null,
      });

      expect(report.rows[0].generated).toBe(0);
      expect(report.rows[0].balance).toBe(0);
    });

    it('handles floating point rounding cleanly', () => {
      const team = createMockTeam('t-1', 'Equipo Test');
      const match = createMockMatch({
        events: [createCardEvent('e1', 'YELLOW_CARD', 't-1', 'p1')], // $2
      });

      // 0.1 + 0.2 payments to test float precision
      const payments = [
        createPayment('p1', 't-1', 0.1),
        createPayment('p2', 't-1', 0.2),
      ];

      const report = buildFinesReport([team], [match], payments, {
        category: 'ALL',
        upToRound: null,
      });

      expect(report.rows[0].paid).toBe(0.3);
      expect(report.rows[0].balance).toBe(1.7);
    });

    it('does not mutate its inputs or accumulators (immutable)', () => {
      const team = Object.freeze(createMockTeam('t-1', 'Equipo Inmutable'));
      const match = Object.freeze(
        createMockMatch({
          events: Object.freeze([
            Object.freeze(createCardEvent('e1', 'YELLOW_CARD', 't-1', 'p1')),
            Object.freeze(createCardEvent('e2', 'YELLOW_CARD', 't-1', 'p1')),
          ]) as unknown as MatchEvent[],
        })
      );
      const payments = Object.freeze([
        Object.freeze(createPayment('pay-1', 't-1', 4)),
      ]);

      const frozenTeams = Object.freeze([team]);
      const frozenMatches = Object.freeze([match]);

      expect(() =>
        buildFinesReport(
          frozenTeams as Team[],
          frozenMatches as Match[],
          payments as CardFinePayment[],
          {
            category: 'ALL',
            upToRound: null,
          }
        )
      ).not.toThrow();

      const result = buildFinesReport(
        frozenTeams as Team[],
        frozenMatches as Match[],
        payments as CardFinePayment[],
        { category: 'ALL', upToRound: null }
      );
      expect(result.rows[0].generated).toBe(4);
      expect(result.rows[0].paid).toBe(4);
      expect(result.rows[0].balance).toBe(0);
    });
  });

  describe('validateFinePayment', () => {
    const validTeams = new Set(['team-1', 'team-2']);

    const validPaymentInput = {
      teamId: 'team-1',
      amount: 4,
      method: 'EFECTIVO',
      paidAt: '2026-01-15',
      note: '  Pago de prueba  ',
    };

    it('accepts a valid payment and trims note whitespace', () => {
      const res = validateFinePayment(validPaymentInput, validTeams);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.teamId).toBe('team-1');
        expect(res.value.amount).toBe(4);
        expect(res.value.method).toBe('EFECTIVO');
        expect(res.value.paidAt).toBe('2026-01-15');
        expect(res.value.note).toBe('Pago de prueba');
      }
    });

    it('validates dates against local time using fake timers', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 8, 29, 21, 0));

      expect(validateFinePayment({ ...validPaymentInput, paidAt: '2026-09-29' }, validTeams).ok).toBe(true);
      expect(validateFinePayment({ ...validPaymentInput, paidAt: '2026-09-30' }, validTeams).ok).toBe(false);

      vi.useRealTimers();
    });

    it('rejects 0, negative, NaN, >1000, and numbers with >2 decimal places', () => {
      expect(validateFinePayment({ ...validPaymentInput, amount: 0 }, validTeams).ok).toBe(false);
      expect(validateFinePayment({ ...validPaymentInput, amount: -5 }, validTeams).ok).toBe(false);
      expect(validateFinePayment({ ...validPaymentInput, amount: NaN }, validTeams).ok).toBe(false);
      expect(validateFinePayment({ ...validPaymentInput, amount: 1000.01 }, validTeams).ok).toBe(false);
      expect(validateFinePayment({ ...validPaymentInput, amount: 4.123 }, validTeams).ok).toBe(false);
    });

    it('rejects numbers with more than 2 decimal places including scientific notation', () => {
      expect(validateFinePayment({ ...validPaymentInput, amount: 1e-7 }, validTeams).ok).toBe(false);
      expect(validateFinePayment({ ...validPaymentInput, amount: 0.001 }, validTeams).ok).toBe(false);
      expect(validateFinePayment({ ...validPaymentInput, amount: 0.01 }, validTeams).ok).toBe(true);
      expect(validateFinePayment({ ...validPaymentInput, amount: 12.5 }, validTeams).ok).toBe(true);
    });

    it('rejects invalid payment method', () => {
      const res = validateFinePayment({ ...validPaymentInput, method: 'BITCOIN' }, validTeams);
      expect(res.ok).toBe(false);
    });

    it('rejects malformed or future dates', () => {
      expect(validateFinePayment({ ...validPaymentInput, paidAt: 'not-a-date' }, validTeams).ok).toBe(false);
      expect(validateFinePayment({ ...validPaymentInput, paidAt: '2026-02-31' }, validTeams).ok).toBe(false);
      expect(validateFinePayment({ ...validPaymentInput, paidAt: '2099-01-01' }, validTeams).ok).toBe(false);
    });

    it('rejects nonexistent team if validTeamIds is provided', () => {
      const res = validateFinePayment({ ...validPaymentInput, teamId: 'unknown-team' }, validTeams);
      expect(res.ok).toBe(false);
    });

    it('rejects note with more than 200 characters', () => {
      const longNote = 'a'.repeat(201);
      const res = validateFinePayment({ ...validPaymentInput, note: longNote }, validTeams);
      expect(res.ok).toBe(false);
    });
  });

  describe('toFinesCsv', () => {
    it('produces valid CSV with headers, escaped quotes, and protection against formula injection', () => {
      const rows = [
        {
          teamId: 't1',
          teamName: '=DangerousFormula',
          shortName: 'DAN',
          category: 'Abierta Varones' as const,
          yellows: 1,
          expulsions: 0,
          generated: 2,
          paid: 0,
          balance: 2,
          details: [],
        },
        {
          teamId: 't2',
          teamName: 'Team "Quotes"; Special',
          shortName: 'QUO',
          category: 'Abierta Varones' as const,
          yellows: 0,
          expulsions: 1,
          generated: 4,
          paid: 4,
          balance: 0,
          details: [],
        },
      ];

      const totals = { generated: 6, paid: 4, balance: 2 };
      const csv = toFinesCsv(rows, totals);

      const lines = csv.split('\n');
      expect(lines[0]).toBe('Equipo;Categoria;Amarillas;Expulsiones;Generado;Pagado;Saldo');

      // The formula injection name must have prepended single quote
      expect(lines[1]).toContain("'=DangerousFormula");

      // The quotes in name must be escaped as double quotes
      expect(lines[2]).toContain('"Team ""Quotes""; Special"');

      // Totals row at the bottom
      expect(lines[3]).toBe('TOTAL;;;;6.00;4.00;2.00');
    });
  });
});
