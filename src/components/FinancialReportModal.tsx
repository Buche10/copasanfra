'use client';

import React from 'react';
import { Match, Team, Player, PaymentMethod } from '@/types';
import { TeamShield } from './TeamShield';
import { DollarSign, Printer, X, FileSpreadsheet } from 'lucide-react';

interface FinancialReportModalProps {
  match: Match;
  teams: Team[];
  players: Player[];
  onClose: () => void;
}

export const FinancialReportModal: React.FC<FinancialReportModalProps> = ({
  match,
  teams,
  onClose,
}) => {
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const homeTeam = teamMap.get(match.homeTeamId);
  const awayTeam = teamMap.get(match.awayTeamId);

  // Financial rates
  const FEE_PER_TEAM = match.financials?.feePerTeam ?? 15;
  const YELLOW_FINE = match.financials?.yellowCardFine ?? 1;
  const RED_FINE = match.financials?.redCardFine ?? 2;
  const REFEREE_PAY = match.financials?.refereePayment ?? 13;

  // Calculate cards per team
  const homeYellows = match.events.filter((e) => e.teamId === match.homeTeamId && e.type === 'YELLOW_CARD').length;
  const awayYellows = match.events.filter((e) => e.teamId === match.awayTeamId && e.type === 'YELLOW_CARD').length;

  const homeReds = match.events.filter((e) => e.teamId === match.homeTeamId && e.type === 'RED_CARD').length;
  const awayReds = match.events.filter((e) => e.teamId === match.awayTeamId && e.type === 'RED_CARD').length;

  // Calculate totals
  const homeFee = FEE_PER_TEAM;
  const awayFee = FEE_PER_TEAM;

  const homeFines = (homeYellows * YELLOW_FINE) + (homeReds * RED_FINE);
  const awayFines = (awayYellows * YELLOW_FINE) + (awayReds * RED_FINE);

  const homeTotal = homeFee + homeFines;
  const awayTotal = awayFee + awayFines;

  const totalCollected = homeTotal + awayTotal;
  const netBalance = totalCollected - REFEREE_PAY;

  // Methods
  const homeFeeMethod: PaymentMethod = match.financials?.homeFeeMethod || 'EFECTIVO';
  const awayFeeMethod: PaymentMethod = match.financials?.awayFeeMethod || 'EFECTIVO';
  const homeFinesMethod: PaymentMethod = match.financials?.homeFinesMethod || 'EFECTIVO';
  const awayFinesMethod: PaymentMethod = match.financials?.awayFinesMethod || 'EFECTIVO';

  // Breakdown cash vs transfer
  let totalEfectivo = 0;
  let totalTransferencia = 0;

  if (homeFeeMethod === 'EFECTIVO') totalEfectivo += homeFee;
  else totalTransferencia += homeFee;

  if (awayFeeMethod === 'EFECTIVO') totalEfectivo += awayFee;
  else totalTransferencia += awayFee;

  if (homeFinesMethod === 'EFECTIVO') totalEfectivo += homeFines;
  else totalTransferencia += homeFines;

  if (awayFinesMethod === 'EFECTIVO') totalEfectivo += awayFines;
  else totalTransferencia += awayFines;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="print-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="print-area bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden border border-slate-200 relative my-8 print:shadow-none print:border-none print:my-0 print:max-w-none print:w-full">
        
        {/* Modal Header Actions (Hidden when printing) */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between print:hidden">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-[#00A859] border border-[#00A859]/30 flex items-center justify-center font-bold">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-white text-base">Reporte Financiero y Cierre de Caja</h3>
              <p className="text-xs text-slate-400">Generación oficial de acta financiera para tesorería</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="flex items-center space-x-1.5 px-4 py-2 bg-[#00A859] hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Content Body */}
        <div className="p-8 space-y-6 text-slate-900 bg-white print:p-4">
          
          {/* Header Branding */}
          <div className="border-b border-slate-200 pb-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-[#00A859] p-0.5 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/colegio-abogados-tungurahua.jpg" alt="Copa Sanfra" className="w-full h-full object-cover rounded-full" />
              </div>
              <div>
                <span className="text-[10px] font-black tracking-widest text-[#00A859] uppercase block">
                  CAMPEONATO OFICIAL 2026
                </span>
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  COPA SANFRA 2026
                </h1>
                <p className="text-xs text-slate-500 font-bold">Acta de Liquidación y Cierre de Caja por Partido</p>
              </div>
            </div>

            <div className="text-right text-xs">
              <span className="px-3 py-1 bg-slate-100 text-slate-800 font-extrabold rounded-lg inline-block border border-slate-200">
                Jornada #{match.round}
              </span>
              <p className="text-[11px] text-slate-500 font-semibold mt-1">{match.date} • {match.time}</p>
              <p className="text-[11px] text-slate-500 font-bold">{match.stadium}</p>
            </div>
          </div>

          {/* Match Teams Banner */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {homeTeam && <TeamShield logoKey={homeTeam.logo} name={homeTeam.name} size="sm" />}
              <span className="font-extrabold text-sm text-slate-900">{homeTeam?.name}</span>
            </div>

            <div className="text-center font-black text-lg text-slate-800 px-4 py-1 bg-white rounded-xl border border-slate-200 shadow-xs">
              {match.homeScore} - {match.awayScore}
            </div>

            <div className="flex items-center space-x-3">
              <span className="font-extrabold text-sm text-slate-900">{awayTeam?.name}</span>
              {awayTeam && <TeamShield logoKey={awayTeam.logo} name={awayTeam.name} size="sm" />}
            </div>
          </div>

          {/* Key Financial Cards Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-200">
              <span className="text-[10px] font-bold text-emerald-800 uppercase block">Total Recaudado</span>
              <span className="text-lg font-black text-[#00A859]">${totalCollected.toFixed(2)}</span>
            </div>

            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase block">Pago Árbitro (-$13)</span>
              <span className="text-lg font-black text-rose-600">-${REFEREE_PAY.toFixed(2)}</span>
            </div>

            <div className="bg-blue-50 p-3 rounded-2xl border border-blue-200">
              <span className="text-[10px] font-bold text-blue-800 uppercase block">Desglose Pago</span>
              <div className="text-xs font-extrabold text-slate-700">
                <span>Efectivo: <strong>${totalEfectivo.toFixed(2)}</strong></span><br />
                <span>Transf: <strong>${totalTransferencia.toFixed(2)}</strong></span>
              </div>
            </div>

            <div className="bg-slate-900 text-white p-3 rounded-2xl border border-slate-800">
              <span className="text-[10px] font-bold text-emerald-400 uppercase block">Saldo Neto Caja</span>
              <span className="text-lg font-black text-white">${netBalance.toFixed(2)}</span>
            </div>
          </div>

          {/* Breakdown Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-[#00A859]" />
              <span>Desglose Detallado por Rubro y Equipo</span>
            </h4>

            <div className="border border-slate-200 rounded-2xl overflow-hidden text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-extrabold">
                    <th className="py-2.5 px-3">Rubro</th>
                    <th className="py-2.5 px-3 text-center">Equipo Local</th>
                    <th className="py-2.5 px-3 text-center">Equipo Visitante</th>
                    <th className="py-2.5 px-3 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {/* Fee per team */}
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-slate-800">
                      Derecho de Partido / Vocalía ($15 c/u)
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="font-bold">${homeFee.toFixed(2)}</span>
                      <span className="text-[10px] text-slate-400 block font-semibold">({homeFeeMethod})</span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="font-bold">${awayFee.toFixed(2)}</span>
                      <span className="text-[10px] text-slate-400 block font-semibold">({awayFeeMethod})</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-black text-slate-900">
                      ${(homeFee + awayFee).toFixed(2)}
                    </td>
                  </tr>

                  {/* Yellow Cards */}
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-slate-800">
                      Multa Amarillas ($1.00 c/u)
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span>{homeYellows} amarillas (${(homeYellows * YELLOW_FINE).toFixed(2)})</span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span>{awayYellows} amarillas (${(awayYellows * YELLOW_FINE).toFixed(2)})</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-black text-slate-900">
                      ${((homeYellows + awayYellows) * YELLOW_FINE).toFixed(2)}
                    </td>
                  </tr>

                  {/* Red Cards */}
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-slate-800">
                      Multa Rojas ($2.00 c/u)
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span>{homeReds} rojas (${(homeReds * RED_FINE).toFixed(2)})</span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span>{awayReds} rojas (${(awayReds * RED_FINE).toFixed(2)})</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-black text-slate-900">
                      ${((homeReds + awayReds) * RED_FINE).toFixed(2)}
                    </td>
                  </tr>

                  {/* Method for fines */}
                  <tr className="bg-slate-50 text-[11px]">
                    <td className="py-2 px-3 font-bold text-slate-500">Método Pago Multas Tarjetas</td>
                    <td className="py-2 px-3 text-center font-bold text-slate-600">{homeFinesMethod}</td>
                    <td className="py-2 px-3 text-center font-bold text-slate-600">{awayFinesMethod}</td>
                    <td className="py-2 px-3 text-right font-bold text-slate-700">Subtotal: ${ (homeFines + awayFines).toFixed(2) }</td>
                  </tr>

                  {/* Subtotal Total Collected */}
                  <tr className="bg-emerald-50 text-emerald-950 font-black border-t border-slate-200">
                    <td colSpan={3} className="py-3 px-3 uppercase tracking-wider">Total Recaudación Bruta</td>
                    <td className="py-3 px-3 text-right text-base text-[#00A859]">${totalCollected.toFixed(2)}</td>
                  </tr>

                  {/* Referee Deduction */}
                  <tr className="bg-rose-50 text-rose-900 font-bold">
                    <td colSpan={3} className="py-2.5 px-3">(-) Pago Honorarios de Arbitraje por Partido</td>
                    <td className="py-2.5 px-3 text-right text-rose-600">-${REFEREE_PAY.toFixed(2)}</td>
                  </tr>

                  {/* Net Balance */}
                  <tr className="bg-slate-900 text-white font-black text-sm">
                    <td colSpan={3} className="py-3 px-3 uppercase tracking-wider">
                      (=) SALDO NETO FINAL ENTREGADO A TESORERÍA
                    </td>
                    <td className="py-3 px-3 text-right text-[#00A859] text-base">${netBalance.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Signatures Section for PDF/Print */}
          <div className="pt-8 border-t border-slate-200 grid grid-cols-3 gap-6 text-center text-[11px] text-slate-600">
            <div className="space-y-1">
              <div className="border-b border-slate-400 h-10 mb-1"></div>
              <p className="font-bold text-slate-800">{match.refereeName || 'Árbitro / Vocal de Mesa'}</p>
              <p className="text-[10px] text-slate-400">Árbitro Oficial</p>
            </div>

            <div className="space-y-1">
              <div className="border-b border-slate-400 h-10 mb-1"></div>
              <p className="font-bold text-slate-800">{homeTeam?.delegate || 'Delegado Local'}</p>
              <p className="text-[10px] text-slate-400">Delegado {homeTeam?.name}</p>
            </div>

            <div className="space-y-1">
              <div className="border-b border-slate-400 h-10 mb-1"></div>
              <p className="font-bold text-slate-800">{awayTeam?.delegate || 'Delegado Visitante'}</p>
              <p className="text-[10px] text-slate-400">Delegado {awayTeam?.name}</p>
            </div>
          </div>

        </div>

        {/* Footer Actions (Hidden when printing) */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 text-right print:hidden">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors shadow-xs"
          >
            Cerrar Reporte
          </button>
        </div>

      </div>
    </div>
  );
};
