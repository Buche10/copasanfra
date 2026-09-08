'use client';

import React, { useMemo, useState } from 'react';
import { Match, Team, Player } from '@/types';
import { TeamShield } from './TeamShield';
import { FileText, DollarSign, Square, AlertTriangle } from 'lucide-react';

interface AdminActasViewProps {
  matches: Match[];
  teams: Team[];
  players: Player[];
}

// Valores por PARTIDO (según definición del torneo).
export const TEAM_FEE = 15; // vocalía/arbitraje por equipo (ingreso)
export const REFEREE_FEE = 13; // pago árbitro (egreso)
export const CANCHA_FEE = 20; // alquiler cancha (egreso)
export const YELLOW_FINE = 1; // multa por amarilla (ingreso)
export const RED_FINE = 2; // multa por roja (ingreso)

const money = (n: number) => `$${n.toFixed(2)}`;

export const AdminActasView: React.FC<AdminActasViewProps> = ({ matches, teams, players }) => {
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const rounds = useMemo(() => [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b), [matches]);
  const [round, setRound] = useState<number | null>(null);
  const effRound = round != null && rounds.includes(round) ? round : rounds[0] ?? null;

  const inRound = useMemo(
    () =>
      matches
        .filter((m) => effRound == null || m.round === effRound)
        .sort(
          (a, b) =>
            (a.category || '').localeCompare(b.category || '') ||
            (a.time || '').localeCompare(b.time || '')
        ),
    [matches, effRound]
  );

  // Ingreso/egreso por partido.
  const calc = (m: Match) => {
    const yellows = m.events.filter((e) => e.type === 'YELLOW_CARD').length;
    const reds = m.events.filter((e) => e.type === 'RED_CARD').length;
    const fines = yellows * YELLOW_FINE + reds * RED_FINE;
    const income = TEAM_FEE * 2 + fines; // 2 equipos + multas
    const expense = REFEREE_FEE + CANCHA_FEE; // árbitro + cancha
    return { yellows, reds, fines, income, expense, balance: income - expense };
  };

  // Totales de la fecha
  const totals = inRound.reduce(
    (acc, m) => {
      const { income, expense, balance } = calc(m);
      acc.income += income;
      acc.expense += expense;
      acc.balance += balance;
      return acc;
    },
    { income: 0, expense: 0, balance: 0 }
  );

  if (rounds.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-10 text-center">
        <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h3 className="text-lg font-black text-slate-800">Sin partidos</h3>
        <p className="text-sm text-slate-500 mt-1">Las actas aparecerán cuando haya calendario.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-5 sm:p-6 text-white shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#00A859]/20 flex items-center justify-center shrink-0">
            <FileText className="w-6 h-6 text-[#00A859]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-black tracking-tight leading-tight">Actas y Cobros por Partido</h2>
            <p className="text-xs sm:text-sm text-white/80 font-medium">
              Sanciones (tarjetas) y cobros: multas + árbitro {money(REFEREE_FEE)} + cancha {money(CANCHA_FEE)} por partido.
            </p>
          </div>
        </div>
      </div>

      {/* Selector de fecha */}
      <div className="flex items-center gap-2 p-1.5 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-x-auto scrollbar-none">
        {rounds.map((r) => (
          <button
            key={r}
            onClick={() => setRound(r)}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all ${
              effRound === r ? 'bg-[#00A859] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Fecha {r}
          </button>
        ))}
      </div>

      {/* Resumen de la fecha: ingresos, egresos y saldo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase block leading-tight">Ingresos (vocalías + multas)</span>
          <span className="text-lg font-black text-slate-800">{money(totals.income)}</span>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase block leading-tight">Egresos (árbitros + canchas)</span>
          <span className="text-lg font-black text-rose-700">−{money(totals.expense)}</span>
        </div>
        <div className={`rounded-2xl border p-4 shadow-xs ${totals.balance >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
          <span className="text-[10px] font-bold text-slate-500 uppercase block leading-tight">
            Saldo de la fecha ({totals.balance >= 0 ? 'ganancia' : 'pérdida'})
          </span>
          <span className={`text-lg font-black ${totals.balance >= 0 ? 'text-[#00A859]' : 'text-rose-700'}`}>
            {totals.balance >= 0 ? '' : '−'}{money(Math.abs(totals.balance))}
          </span>
        </div>
      </div>

      {/* Actas por partido */}
      <div className="space-y-4">
        {inRound.map((m) => {
          const home = teamMap.get(m.homeTeamId);
          const away = teamMap.get(m.awayTeamId);
          const cards = m.events.filter((e) => e.type === 'YELLOW_CARD' || e.type === 'RED_CARD');
          const { yellows, reds, income, expense, balance } = calc(m);

          return (
            <div key={m.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Cabecera del acta */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50/70">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-extrabold bg-slate-900 text-white px-2 py-0.5 rounded">{m.category}</span>
                  <TeamShield logoKey={home?.logo} name={home?.name || ''} size="sm" />
                  <span className="text-sm font-black text-slate-800 truncate">{home?.shortName}</span>
                  <span className="text-xs font-black text-slate-400">
                    {m.status === 'SCHEDULED' ? 'vs' : `${m.homeScore} - ${m.awayScore}`}
                  </span>
                  <span className="text-sm font-black text-slate-800 truncate">{away?.shortName}</span>
                  <TeamShield logoKey={away?.logo} name={away?.name || ''} size="sm" />
                </div>
                <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">
                  {m.date || 'sin fecha'} · {m.time || '--:--'} · {m.stadium || 'Cancha 1'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:gap-4 p-4">
                {/* Sanciones */}
                <div className="space-y-2">
                  <h4 className="text-xs font-black text-slate-700 uppercase flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500" /> Sanciones (tarjetas)
                  </h4>
                  {cards.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Sin tarjetas en este partido.</p>
                  ) : (
                    <ul className="space-y-1">
                      {cards.map((ev) => {
                        const pl = playerMap.get(ev.playerId);
                        const tm = teamMap.get(ev.teamId);
                        const isRed = ev.type === 'RED_CARD';
                        return (
                          <li key={ev.id} className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-2 min-w-0">
                              <span
                                className={`inline-block w-3 h-4 rounded-sm shrink-0 ${isRed ? 'bg-rose-600' : 'bg-amber-400'}`}
                              />
                              <span className="font-bold text-slate-800 truncate">
                                #{pl?.dorsal} {pl?.name || 'Jugador'}
                              </span>
                              <span className="text-slate-400">({tm?.shortName})</span>
                            </span>
                            <span className={`font-black ${isRed ? 'text-rose-700' : 'text-amber-700'}`}>
                              {money(isRed ? RED_FINE : YELLOW_FINE)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* Cuentas del partido: ingresos − egresos = saldo */}
                <div className="mt-3 md:mt-0 bg-slate-50 rounded-2xl border border-slate-200 p-3 text-xs space-y-1.5">
                  <span className="text-[10px] font-black text-emerald-700 uppercase">Ingresos</span>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Vocalía (2 × {money(TEAM_FEE)})</span>
                    <span className="font-bold text-slate-800">{money(TEAM_FEE * 2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 flex items-center gap-1"><Square className="w-3 h-3 text-amber-500" /> Amarillas ({yellows})</span>
                    <span className="font-bold text-slate-800">{money(yellows * YELLOW_FINE)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 flex items-center gap-1"><Square className="w-3 h-3 text-rose-600" /> Rojas ({reds})</span>
                    <span className="font-bold text-slate-800">{money(reds * RED_FINE)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 pt-1">
                    <span className="font-bold text-slate-700">Total ingresos</span>
                    <span className="font-black text-emerald-700">{money(income)}</span>
                  </div>

                  <span className="text-[10px] font-black text-rose-700 uppercase pt-1 block">Egresos</span>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Árbitro</span>
                    <span className="font-bold text-slate-800">−{money(REFEREE_FEE)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Cancha</span>
                    <span className="font-bold text-slate-800">−{money(CANCHA_FEE)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 pt-1">
                    <span className="font-bold text-slate-700">Total egresos</span>
                    <span className="font-black text-rose-700">−{money(expense)}</span>
                  </div>

                  <div className={`flex items-center justify-between rounded-xl px-2 py-1.5 mt-1 ${balance >= 0 ? 'bg-emerald-100' : 'bg-rose-100'}`}>
                    <span className="font-black text-slate-900 flex items-center gap-1">
                      <DollarSign className={`w-3.5 h-3.5 ${balance >= 0 ? 'text-[#00A859]' : 'text-rose-600'}`} />
                      Saldo ({balance >= 0 ? 'ganancia' : 'pérdida'})
                    </span>
                    <span className={`font-black text-sm ${balance >= 0 ? 'text-[#00A859]' : 'text-rose-700'}`}>
                      {balance >= 0 ? '' : '−'}{money(Math.abs(balance))}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
