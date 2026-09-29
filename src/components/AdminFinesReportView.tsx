'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Match, Team, Player, CardFinePayment, Category, CATEGORIES } from '@/types';
import { YELLOW_CARD_FINE, RED_CARD_FINE } from '@/lib/cardFines';
import { buildFinesReport, toFinesCsv, localDateString } from '@/lib/finesReport';
import { getFinePayments, upsertFinePayment, deleteFinePayment } from '@/lib/store';
import { TeamShield } from './TeamShield';
import { FinePaymentForm } from './FinePaymentForm';
import { FinesSummaryCards } from './FinesSummaryCards';
import { FinesTeamDetail } from './FinesTeamDetail';
import {
  Receipt,
  Download,
  Printer,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

interface AdminFinesReportViewProps {
  teams: Team[];
  matches: Match[];
  adminName: string;
  players?: Player[];
}

const money = (n: number) => `$${n.toFixed(2)}`;

export const AdminFinesReportView: React.FC<AdminFinesReportViewProps> = ({
  teams,
  matches,
  adminName,
  players = [],
}) => {
  const [payments, setPayments] = useState<CardFinePayment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<Category | 'ALL'>('ALL');
  const [upToRound, setUpToRound] = useState<number | null>(null);
  const [showZeroBalance, setShowZeroBalance] = useState<boolean>(false);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const matchMap = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);

  const rounds = useMemo(
    () => [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b),
    [matches]
  );

  const reloadPayments = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getFinePayments();
      setPayments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar los pagos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    getFinePayments()
      .then((data) => {
        if (isMounted) {
          setPayments(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Error al cargar los pagos.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const report = useMemo(() => {
    return buildFinesReport(teams, matches, payments, { category, upToRound });
  }, [teams, matches, payments, category, upToRound]);

  const paymentsByTeam = useMemo(() => {
    const map = new Map<string, CardFinePayment[]>();
    for (const payment of payments) {
      const list = map.get(payment.teamId);
      if (list) {
        list.push(payment);
      } else {
        map.set(payment.teamId, [payment]);
      }
    }
    return map;
  }, [payments]);

  const visibleRows = useMemo(() => {
    if (showZeroBalance) return report.rows;
    return report.rows.filter((r) => r.generated > 0 || r.paid > 0);
  }, [report.rows, showZeroBalance]);

  const handleAddPayment = async (newPayment: CardFinePayment) => {
    const prev = payments;
    setPayments((current) => [newPayment, ...current]);
    try {
      await upsertFinePayment(newPayment);
    } catch (err) {
      setPayments(prev);
      throw err;
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!window.confirm('¿Deseas anular este pago de multa?')) {
      return;
    }
    const prev = payments;
    setPayments((current) => current.filter((p) => p.id !== paymentId));
    try {
      await deleteFinePayment(paymentId);
    } catch (err) {
      setPayments(prev);
      alert(err instanceof Error ? err.message : 'Error al anular el pago.');
    }
  };

  const handleExportCsv = () => {
    const csvContent = toFinesCsv(visibleRows, report.totals);
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = localDateString();
    link.href = url;
    link.download = `multas-tarjetas-${today}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-5 sm:p-6 text-white shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#00A859]/20 flex items-center justify-center shrink-0">
              <Receipt className="w-6 h-6 text-[#00A859]" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight leading-tight">Multas por Tarjetas</h2>
              <p className="text-xs sm:text-sm text-white/80 font-medium">
                Amarilla ${YELLOW_CARD_FINE} · Roja o doble amarilla ${RED_CARD_FINE}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={handleExportCsv}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all border border-slate-700 flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Exportar CSV</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-3.5 py-2 bg-[#00A859] hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir</span>
            </button>
          </div>
        </div>
      </div>

      {/* Formulario para registrar pago */}
      <FinePaymentForm teams={teams} adminName={adminName} onPaymentAdded={handleAddPayment} />

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-500 uppercase text-[10px]">Categoría:</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category | 'ALL')}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-hidden"
            >
              <option value="ALL">Todas las categorías</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-500 uppercase text-[10px]">Hasta la fecha:</span>
            <select
              value={upToRound ?? ''}
              onChange={(e) => setUpToRound(e.target.value ? Number(e.target.value) : null)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-hidden"
            >
              <option value="">Todas las fechas</option>
              {rounds.map((r) => (
                <option key={r} value={r}>
                  Fecha {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700 text-xs">
          <input
            type="checkbox"
            checked={showZeroBalance}
            onChange={(e) => setShowZeroBalance(e.target.checked)}
            className="w-4 h-4 rounded text-[#00A859] focus:ring-[#00A859]"
          />
          <span>Mostrar equipos sin deuda</span>
        </label>
      </div>

      {/* Tarjetas de Resumen */}
      <FinesSummaryCards totals={report.totals} />

      {/* Estado de carga o error */}
      {loading && (
        <div className="p-8 text-center bg-white rounded-3xl border border-slate-200">
          <RefreshCw className="w-6 h-6 animate-spin text-slate-400 mx-auto mb-2" />
          <p className="text-xs text-slate-500 font-bold">Cargando pagos de multas...</p>
        </div>
      )}

      {error && !loading && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-rose-700 font-bold">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
            <span>{error}</span>
          </div>
          <button
            onClick={reloadPayments}
            className="px-3 py-1.5 bg-rose-600 text-white rounded-xl font-black hover:bg-rose-700 cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Tabla de Multas por Equipo */}
      {!loading && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          {visibleRows.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-xs font-bold">
              No hay equipos con multas o pagos registrados en esta selección.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4">Equipo</th>
                    <th className="py-3 px-3">Categoría</th>
                    <th className="py-3 px-3 text-center">Amarillas</th>
                    <th className="py-3 px-3 text-center">Expulsiones</th>
                    <th className="py-3 px-3 text-right">Generado</th>
                    <th className="py-3 px-3 text-right">Pagado</th>
                    <th className="py-3 px-3 text-right">Saldo</th>
                    <th className="py-3 px-4 text-center print:hidden">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {visibleRows.map((row) => {
                    const isExpanded = expandedTeamId === row.teamId;
                    const teamPayments = paymentsByTeam.get(row.teamId) ?? [];

                    return (
                      <React.Fragment key={row.teamId}>
                        <tr
                          onClick={() => setExpandedTeamId(isExpanded ? null : row.teamId)}
                          className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <TeamShield logoKey={teamMap.get(row.teamId)?.logo} name={row.teamName} size="sm" />
                              <div className="min-w-0">
                                <span className="font-bold text-slate-900 block truncate">{row.teamName}</span>
                                <span className="text-[10px] text-slate-400 font-bold">{row.shortName}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-slate-600 font-bold whitespace-nowrap">{row.category}</td>
                          <td className="py-3 px-3 text-center font-bold text-amber-600">{row.yellows}</td>
                          <td className="py-3 px-3 text-center font-bold text-rose-600">{row.expulsions}</td>
                          <td className="py-3 px-3 text-right font-bold text-slate-900">{money(row.generated)}</td>
                          <td className="py-3 px-3 text-right font-bold text-emerald-700">{money(row.paid)}</td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-lg font-black text-xs ${
                                row.balance > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {row.balance < 0 ? '-' : ''}
                              {money(Math.abs(row.balance))}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center print:hidden">
                            <button
                              type="button"
                              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-slate-50/90 border-b border-slate-200">
                            <td colSpan={8} className="p-4">
                              <FinesTeamDetail
                                row={row}
                                teamPayments={teamPayments}
                                matchMap={matchMap}
                                teamMap={teamMap}
                                playerMap={playerMap}
                                onDeletePayment={handleDeletePayment}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
