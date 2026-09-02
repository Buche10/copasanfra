'use client';

import React, { useMemo, useState } from 'react';
import { Team, Match, ArbitrajePayment, Category, ARBITRAJE_FEE } from '@/types';
import { TeamShield } from './TeamShield';
import {
  DollarSign,
  Upload,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  Loader2,
  Trash2,
  CalendarClock,
} from 'lucide-react';

interface ArbitrajeViewProps {
  teams: Team[];
  matches: Match[];
  payments: ArbitrajePayment[];
  category: Category;
  isAdmin: boolean;
  onSubmit: (team: Team, round: number, matchDate: string | undefined, file: File) => Promise<void>;
  onReview: (payment: ArbitrajePayment, status: 'APPROVED' | 'REJECTED') => Promise<void>;
  onDelete: (payment: ArbitrajePayment) => Promise<void>;
}

interface RoundInfo {
  round: number;
  date?: string;
  teamIds: string[];
}

const fmtDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('es-EC', { weekday: 'short', day: '2-digit', month: 'short' });
};

// Jueves anterior al sábado de la fecha (fecha del partido - 2 días).
const deadlineLabel = (matchDate?: string) => {
  if (!matchDate) return null;
  const d = new Date(matchDate + 'T00:00:00');
  d.setDate(d.getDate() - 2);
  return d.toLocaleDateString('es-EC', { weekday: 'long', day: '2-digit', month: 'short' });
};

export const ArbitrajeView: React.FC<ArbitrajeViewProps> = ({
  teams,
  matches,
  payments,
  category,
  isAdmin,
  onSubmit,
  onReview,
  onDelete,
}) => {
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Fechas (jornadas) de la categoría, tomadas del calendario regular.
  const rounds = useMemo<RoundInfo[]>(() => {
    const map = new Map<number, RoundInfo>();
    matches
      .filter((m) => m.category === category && !m.isPlayoff)
      .forEach((m) => {
        const info = map.get(m.round) ?? { round: m.round, date: m.date, teamIds: [] };
        if (!info.date && m.date) info.date = m.date;
        if (!info.teamIds.includes(m.homeTeamId)) info.teamIds.push(m.homeTeamId);
        if (!info.teamIds.includes(m.awayTeamId)) info.teamIds.push(m.awayTeamId);
        map.set(m.round, info);
      });
    return [...map.values()].sort((a, b) => a.round - b.round);
  }, [matches, category]);

  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const activeRound = rounds.find((r) => r.round === selectedRound) ?? rounds[0];

  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  // Último respaldo enviado por equipo para la fecha activa.
  const latestPayment = (teamId: string, round: number): ArbitrajePayment | undefined =>
    payments
      .filter((p) => p.teamId === teamId && p.round === round)
      .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''))[0];

  const handleFile = async (team: Team, round: number, matchDate: string | undefined, file?: File) => {
    if (!file) return;
    const key = `${team.id}-${round}`;
    setUploadingKey(key);
    try {
      await onSubmit(team, round, matchDate, file);
    } finally {
      setUploadingKey(null);
    }
  };

  const review = async (payment: ArbitrajePayment, status: 'APPROVED' | 'REJECTED') => {
    setBusyId(payment.id);
    try {
      await onReview(payment, status);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (payment: ArbitrajePayment) => {
    if (!window.confirm('¿Eliminar este respaldo/pago?')) return;
    setBusyId(payment.id);
    try {
      await onDelete(payment);
    } finally {
      setBusyId(null);
    }
  };

  if (rounds.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-10 text-center">
        <DollarSign className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h3 className="text-lg font-black text-slate-800">Aún no hay fechas</h3>
        <p className="text-sm text-slate-500 mt-1">
          El control de arbitraje aparecerá cuando se genere el calendario de esta categoría.
        </p>
      </div>
    );
  }

  const roundTeams = activeRound ? activeRound.teamIds.map((id) => teamMap.get(id)).filter(Boolean) as Team[] : [];
  const paidCount = activeRound
    ? roundTeams.filter((t) => latestPayment(t.id, activeRound.round)?.status === 'APPROVED').length
    : 0;

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="bg-gradient-to-r from-emerald-600 via-[#00A859] to-emerald-700 rounded-3xl p-5 sm:p-6 text-white shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
            <DollarSign className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-black tracking-tight leading-tight">Arbitraje — Control de pagos</h2>
            <p className="text-xs sm:text-sm text-white/85 font-medium">
              Cada equipo cancela ${ARBITRAJE_FEE} por fecha. Sube el respaldo (comprobante) hasta el jueves.
            </p>
          </div>
        </div>
      </div>

      {/* Selector de fecha */}
      <div className="flex items-center gap-2 p-1.5 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-x-auto scrollbar-none">
        {rounds.map((r) => {
          const isActive = activeRound?.round === r.round;
          return (
            <button
              key={r.round}
              onClick={() => setSelectedRound(r.round)}
              className={`flex flex-col items-center px-4 py-2 rounded-xl transition-all whitespace-nowrap ${
                isActive ? 'bg-[#00A859] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className="text-xs font-extrabold">Fecha {r.round}</span>
              {r.date && <span className={`text-[10px] font-semibold ${isActive ? 'text-white/80' : 'text-slate-400'}`}>{fmtDate(r.date)}</span>}
            </button>
          );
        })}
      </div>

      {activeRound && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Resumen fecha */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50/70">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <CalendarClock className="w-4 h-4 text-[#00A859]" />
              {deadlineLabel(activeRound.date) ? (
                <span>Cancelar hasta el <span className="text-slate-900 capitalize">{deadlineLabel(activeRound.date)}</span></span>
              ) : (
                <span>Fecha {activeRound.round}</span>
              )}
            </div>
            <span className="text-xs font-black px-3 py-1 rounded-full bg-emerald-100 text-emerald-700">
              {paidCount}/{roundTeams.length} equipos al día
            </span>
          </div>

          {/* Lista de equipos */}
          <ul className="divide-y divide-slate-100">
            {roundTeams.map((team) => {
              const payment = latestPayment(team.id, activeRound.round);
              const status = payment?.status;
              const key = `${team.id}-${activeRound.round}`;
              const isUploading = uploadingKey === key;
              const canUpload = !status || status === 'REJECTED';

              return (
                <li key={team.id} className="flex flex-wrap items-center gap-3 px-4 sm:px-5 py-3">
                  <TeamShield logoKey={team.logo} name={team.name} primaryColor={team.primaryColor} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-slate-800 truncate">{team.name}</p>
                    {payment?.submittedAt && (
                      <p className="text-[11px] text-slate-400 font-medium">
                        Respaldo enviado {new Date(payment.submittedAt).toLocaleDateString('es-EC', { day: '2-digit', month: 'short' })}
                      </p>
                    )}
                  </div>

                  {/* Estado */}
                  {status === 'APPROVED' && (
                    <span className="flex items-center gap-1 text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Pagado
                    </span>
                  )}
                  {status === 'PENDING' && (
                    <span className="flex items-center gap-1 text-xs font-black text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                      <Clock className="w-3.5 h-3.5" /> En revisión
                    </span>
                  )}
                  {status === 'REJECTED' && (
                    <span className="flex items-center gap-1 text-xs font-black text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full">
                      <XCircle className="w-3.5 h-3.5" /> Rechazado
                    </span>
                  )}
                  {!status && (
                    <span className="flex items-center gap-1 text-xs font-black text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">
                      <Clock className="w-3.5 h-3.5" /> Pendiente
                    </span>
                  )}

                  {/* Ver respaldo */}
                  {payment?.receiptUrl && (
                    <a
                      href={payment.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-[#00A859] px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" /> Ver
                    </a>
                  )}

                  {/* Acciones Admin */}
                  {isAdmin && payment && status !== 'APPROVED' && (
                    <button
                      onClick={() => review(payment, 'APPROVED')}
                      disabled={busyId === payment.id}
                      className="text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Aprobar
                    </button>
                  )}
                  {isAdmin && payment && status === 'PENDING' && (
                    <button
                      onClick={() => review(payment, 'REJECTED')}
                      disabled={busyId === payment.id}
                      className="text-xs font-black text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Rechazar
                    </button>
                  )}
                  {isAdmin && payment && (
                    <button
                      onClick={() => remove(payment)}
                      disabled={busyId === payment.id}
                      title="Eliminar"
                      className="text-slate-400 hover:text-rose-600 disabled:opacity-50 p-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}

                  {/* Subir respaldo (público) */}
                  {canUpload && (
                    <label
                      className={`flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                        isUploading
                          ? 'bg-slate-200 text-slate-500 cursor-wait'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {isUploading ? 'Subiendo…' : status === 'REJECTED' ? 'Reenviar' : 'Subir respaldo'}
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        disabled={isUploading}
                        onChange={(e) => handleFile(team, activeRound.round, activeRound.date, e.target.files?.[0] || undefined)}
                      />
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};
