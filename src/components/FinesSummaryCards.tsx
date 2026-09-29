'use client';

import React from 'react';
import { FinesReportTotals } from '@/lib/finesReport';

interface FinesSummaryCardsProps {
  totals: FinesReportTotals;
}

const money = (n: number) => `$${n.toFixed(2)}`;

export const FinesSummaryCards: React.FC<FinesSummaryCardsProps> = ({ totals }) => {
  const isUpToDate = totals.balance <= 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
        <span className="text-[10px] font-bold text-slate-500 uppercase block leading-tight">
          Total Generado
        </span>
        <span className="text-xl font-black text-slate-900">{money(totals.generated)}</span>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
        <span className="text-[10px] font-bold text-slate-500 uppercase block leading-tight">
          Total Pagado
        </span>
        <span className="text-xl font-black text-emerald-700">{money(totals.paid)}</span>
      </div>
      <div
        className={`rounded-2xl border p-4 shadow-xs ${
          isUpToDate ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
        }`}
      >
        <span className="text-[10px] font-bold text-slate-500 uppercase block leading-tight">
          Saldo Pendiente ({isUpToDate ? 'A favor / Al día' : 'Por cobrar'})
        </span>
        <span
          className={`text-xl font-black ${
            isUpToDate ? 'text-[#00A859]' : 'text-rose-700'
          }`}
        >
          {totals.balance < 0 ? '-' : ''}
          {money(Math.abs(totals.balance))}
        </span>
      </div>
    </div>
  );
};
