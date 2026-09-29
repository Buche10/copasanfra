'use client';

import React from 'react';
import { Match, Team, Player, CardFinePayment } from '@/types';
import { TeamFinesRow } from '@/lib/finesReport';
import { AlertTriangle, CheckCircle, Trash2 } from 'lucide-react';

interface FinesTeamDetailProps {
  row: TeamFinesRow;
  teamPayments: CardFinePayment[];
  matchMap: Map<string, Match>;
  teamMap: Map<string, Team>;
  playerMap: Map<string, Player>;
  onDeletePayment: (paymentId: string) => Promise<void>;
}

const money = (n: number) => `$${n.toFixed(2)}`;

export const FinesTeamDetail: React.FC<FinesTeamDetailProps> = ({
  row,
  teamPayments,
  matchMap,
  teamMap,
  playerMap,
  onDeletePayment,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Detalle de tarjetas del equipo */}
      <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-2xs space-y-2">
        <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wide flex items-center gap-1.5 border-b pb-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          Detalle de Tarjetas ({row.details.length})
        </h4>
        {row.details.length === 0 ? (
          <p className="text-slate-400 italic text-xs">Sin tarjetas registradas.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-xs">
            {row.details.map((fine) => {
              const match = matchMap.get(fine.matchId);
              const rivalId =
                match?.homeTeamId === row.teamId ? match?.awayTeamId : match?.homeTeamId;
              const rival = rivalId ? teamMap.get(rivalId) : undefined;
              const player = playerMap.get(fine.playerId);
              const isExp = fine.kind === 'EXPULSION';

              return (
                <li
                  key={`${fine.matchId}-${fine.playerId}`}
                  className="py-1.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <span className="font-bold text-slate-800 block truncate">
                      #{player?.dorsal ?? '?'} {player?.name || 'Jugador'}
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      Fecha {fine.round} vs {rival?.shortName || 'Rival'}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        isExp ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {isExp
                        ? fine.isDoubleYellow
                          ? 'Expulsión (doble amarilla)'
                          : 'Expulsión'
                        : 'Amarilla'}
                    </span>
                    <span className="font-black text-slate-900 block text-xs mt-0.5">
                      {money(fine.amount)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Historial de pagos del equipo */}
      <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-2xs space-y-2">
        <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wide flex items-center gap-1.5 border-b pb-1.5">
          <CheckCircle className="w-3.5 h-3.5 text-[#00A859]" />
          Historial de Pagos ({teamPayments.length})
        </h4>
        {teamPayments.length === 0 ? (
          <p className="text-slate-400 italic text-xs">Sin pagos registrados.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-xs">
            {teamPayments.map((p) => (
              <li key={p.id} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-emerald-700">
                      {money(p.amount)}
                    </span>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">
                      {p.method}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    {p.paidAt} · por {p.registeredBy}
                    {p.note ? ` · ${p.note}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeletePayment(p.id);
                  }}
                  title="Anular pago"
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer print:hidden shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
