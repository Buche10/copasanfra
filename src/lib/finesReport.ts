import { Category, Match, PaymentMethod, Team, CardFinePayment } from '@/types';
import { isChargeable, playerFinesForMatch, PlayerFine } from './cardFines';

export interface FinesReportFilters {
  category: Category | 'ALL';
  upToRound: number | null;
}

export interface TeamFinesRow {
  teamId: string;
  teamName: string;
  shortName: string;
  category: Category;
  yellows: number;
  expulsions: number;
  generated: number;
  paid: number;
  balance: number;
  details: PlayerFine[];
}

export interface FinesReportTotals {
  generated: number;
  paid: number;
  balance: number;
}

export interface FinesReportResult {
  rows: TeamFinesRow[];
  totals: FinesReportTotals;
}

export interface ValidatedFinePaymentInput {
  teamId: string;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  note?: string;
}

export function localDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

interface TeamAccumulatedFines {
  yellows: number;
  expulsions: number;
  generated: number;
  details: PlayerFine[];
}

export function buildFinesReport(
  teams: Team[],
  matches: Match[],
  payments: CardFinePayment[],
  filters: FinesReportFilters
): FinesReportResult {
  const filteredTeams =
    filters.category === 'ALL'
      ? teams
      : teams.filter((t) => t.category === filters.category);

  const teamFinesMap = new Map<string, TeamAccumulatedFines>();

  const relevantMatches = matches.filter((m) => {
    if (!isChargeable(m)) return false;
    if (filters.category !== 'ALL' && m.category !== filters.category) return false;
    if (filters.upToRound != null && m.round > filters.upToRound) return false;
    return true;
  });

  for (const match of relevantMatches) {
    const fines = playerFinesForMatch(match);
    for (const fine of fines) {
      const existing = teamFinesMap.get(fine.teamId) || {
        yellows: 0,
        expulsions: 0,
        generated: 0,
        details: [],
      };

      const updated: TeamAccumulatedFines = {
        yellows: existing.yellows + (fine.kind === 'YELLOW' ? 1 : 0),
        expulsions: existing.expulsions + (fine.kind === 'EXPULSION' ? 1 : 0),
        generated: round2(existing.generated + fine.amount),
        details: [...existing.details, fine],
      };
      teamFinesMap.set(fine.teamId, updated);
    }
  }

  const teamPaidMap = new Map<string, number>();
  for (const payment of payments) {
    const prevPaid = teamPaidMap.get(payment.teamId) || 0;
    teamPaidMap.set(payment.teamId, round2(prevPaid + payment.amount));
  }

  const rows: TeamFinesRow[] = filteredTeams.map((team) => {
    const finesData = teamFinesMap.get(team.id) || {
      yellows: 0,
      expulsions: 0,
      generated: 0,
      details: [],
    };
    const paid = round2(teamPaidMap.get(team.id) || 0);
    const generated = round2(finesData.generated);
    const balance = round2(generated - paid);

    return {
      teamId: team.id,
      teamName: team.name,
      shortName: team.shortName,
      category: team.category,
      yellows: finesData.yellows,
      expulsions: finesData.expulsions,
      generated,
      paid,
      balance,
      details: finesData.details,
    };
  });

  const sortedRows = [...rows].sort((a, b) => {
    if (b.balance !== a.balance) {
      return b.balance - a.balance;
    }
    return a.teamName.localeCompare(b.teamName);
  });

  const totalGenerated = round2(sortedRows.reduce((sum, r) => sum + r.generated, 0));
  const totalPaid = round2(sortedRows.reduce((sum, r) => sum + r.paid, 0));
  const totalBalance = round2(totalGenerated - totalPaid);

  return {
    rows: sortedRows,
    totals: {
      generated: totalGenerated,
      paid: totalPaid,
      balance: totalBalance,
    },
  };
}

export function validateFinePayment(
  input: unknown,
  validTeamIds?: Set<string> | string[]
): { ok: true; value: ValidatedFinePaymentInput } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Datos de pago inválidos' };
  }

  const record = input as Record<string, unknown>;

  if (typeof record.teamId !== 'string' || !record.teamId.trim()) {
    return { ok: false, error: 'Equipo requerido' };
  }
  const teamId = record.teamId.trim();

  if (validTeamIds) {
    const teamSet = Array.isArray(validTeamIds) ? new Set(validTeamIds) : validTeamIds;
    if (!teamSet.has(teamId)) {
      return { ok: false, error: 'Equipo inexistente o no válido' };
    }
  }

  const amount = record.amount;
  if (typeof amount !== 'number' || Number.isNaN(amount) || !Number.isFinite(amount)) {
    return { ok: false, error: 'El monto debe ser un número válido' };
  }
  if (amount <= 0) {
    return { ok: false, error: 'El monto debe ser mayor a 0' };
  }
  if (amount > 1000) {
    return { ok: false, error: 'El monto no puede superar $1000' };
  }

  if (Math.abs(Math.round(amount * 100) - amount * 100) > 1e-9) {
    return { ok: false, error: 'El monto puede tener máximo 2 decimales' };
  }

  const method = record.method;
  if (method !== 'EFECTIVO' && method !== 'TRANSFERENCIA') {
    return { ok: false, error: 'Método de pago inválido (debe ser EFECTIVO o TRANSFERENCIA)' };
  }

  const paidAt = record.paidAt;
  if (typeof paidAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) {
    return { ok: false, error: 'Fecha inválida (formato AAAA-MM-DD)' };
  }

  const [y, m, d] = paidAt.split('-').map(Number);
  const parsedDate = new Date(y, m - 1, d);
  if (
    parsedDate.getFullYear() !== y ||
    parsedDate.getMonth() !== m - 1 ||
    parsedDate.getDate() !== d
  ) {
    return { ok: false, error: 'Fecha calendario inválida' };
  }

  const todayStr = localDateString();
  if (paidAt > todayStr) {
    return { ok: false, error: 'La fecha de pago no puede ser futura' };
  }

  const noteRaw = record.note;
  const noteTrimmed = typeof noteRaw === 'string' ? noteRaw.trim() : '';
  if (noteTrimmed.length > 200) {
    return { ok: false, error: 'La nota no puede superar los 200 caracteres' };
  }

  return {
    ok: true,
    value: {
      teamId,
      amount,
      method,
      paidAt,
      note: noteTrimmed || undefined,
    },
  };
}

function escapeCsvText(value: string): string {
  let str = value ?? '';
  if (/^[-+=@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toFinesCsv(rows: TeamFinesRow[], totals: FinesReportTotals): string {
  const header = 'Equipo;Categoria;Amarillas;Expulsiones;Generado;Pagado;Saldo';

  const dataLines = rows.map((r) => {
    const teamEscaped = escapeCsvText(r.teamName);
    const catEscaped = escapeCsvText(r.category);
    return `${teamEscaped};${catEscaped};${r.yellows};${r.expulsions};${r.generated.toFixed(
      2
    )};${r.paid.toFixed(2)};${r.balance.toFixed(2)}`;
  });

  const totalsLine = `TOTAL;;;;${totals.generated.toFixed(2)};${totals.paid.toFixed(
    2
  )};${totals.balance.toFixed(2)}`;

  return [header, ...dataLines, totalsLine].join('\n');
}
