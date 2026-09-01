'use client';

import React from 'react';
import { GoalkeeperStat, Team } from '@/types';
import { TeamShield } from './TeamShield';
import { Shield, Award, ChevronRight, CheckCircle2 } from 'lucide-react';

interface BestGoalkeeperTableProps {
  goalkeepers: GoalkeeperStat[];
  teams: Team[];
  onSelectTeam: (team: Team) => void;
}

export const BestGoalkeeperTable: React.FC<BestGoalkeeperTableProps> = ({
  goalkeepers,
  teams,
  onSelectTeam,
}) => {
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  // Filter goalkeepers with at least 1 match played if available, otherwise show all
  const activeGoalkeepers = goalkeepers;
  const topGoalkeeper = activeGoalkeepers[0];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-6 rounded-3xl text-white shadow-xl relative overflow-hidden">
        <div className="space-y-1 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 border border-blue-400/30 text-xs font-bold uppercase tracking-wider">
            <Shield className="w-3.5 h-3.5 text-blue-400" />
            <span>Premio Guante de Oro</span> • <span>Tungurahua</span>
          </div>
          <h2 className="text-2xl font-black tracking-tight">Tabla de Valla Menos Vencida</h2>
          <p className="text-slate-300 text-sm">
            Clasificación oficial del Mejor Arquero evaluado por promedio de goles recibidos por partido.
          </p>
        </div>

        {topGoalkeeper && (
          <div className="flex items-center gap-3 bg-white/10 p-3.5 rounded-2xl border border-white/10 backdrop-blur-md relative z-10">
            <div className="w-12 h-12 rounded-xl bg-amber-400/20 border border-amber-400/40 text-amber-300 flex items-center justify-center font-extrabold text-lg">
              🏆
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase text-amber-300 tracking-wider block">
                Líder Guante de Oro
              </span>
              <div className="font-extrabold text-sm text-white">
                {topGoalkeeper.playerName}
              </div>
              <div className="text-xs text-slate-300 flex items-center gap-1.5 mt-0.5">
                <span>{topGoalkeeper.teamName}</span>
                <span className="text-blue-300 font-bold">• {topGoalkeeper.goalsConceded} Goles Encajados</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table Card */}
      <div className="glass-card rounded-3xl overflow-hidden shadow-lg border border-slate-200">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                <th className="py-4 px-4 text-center w-12">Pos</th>
                <th className="py-4 px-4">Arquero / Equipo</th>
                <th className="py-4 px-3 text-center">Categoría</th>
                <th className="py-4 px-3 text-center" title="Partidos Jugados">PJ</th>
                <th className="py-4 px-3 text-center text-rose-600 font-bold" title="Goles Encajados">Goles Recibidos</th>
                <th className="py-4 px-3 text-center text-emerald-700 font-bold" title="Vallas Invictas (Partidos a 0)">Vallas Invictas</th>
                <th className="py-4 px-4 text-center font-black text-slate-900 bg-slate-200/50">Promedio / Coef.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {activeGoalkeepers.map((gk, index) => {
                const pos = index + 1;
                const team = teamMap.get(gk.teamId);

                return (
                  <tr
                    key={gk.teamId}
                    onClick={() => team && onSelectTeam(team)}
                    className={`hover:bg-slate-100/70 transition-colors cursor-pointer group ${
                      pos === 1 ? 'bg-amber-50/25' : ''
                    }`}
                  >
                    {/* Position */}
                    <td className="py-4 px-4 text-center font-bold">
                      <div className="flex items-center justify-center">
                        <span
                          className={`w-7 h-7 rounded-xl flex items-center justify-center font-extrabold text-xs shadow-sm ${
                            pos === 1
                              ? 'bg-amber-500 text-white ring-2 ring-amber-500/30'
                              : pos === 2
                              ? 'bg-slate-300 text-slate-800'
                              : pos === 3
                              ? 'bg-amber-700 text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {pos}
                        </span>
                      </div>
                    </td>

                    {/* Goalkeeper & Team Info */}
                    <td className="py-4 px-4 font-bold text-slate-800">
                      <div className="flex items-center space-x-3">
                        <TeamShield
                          logoKey={gk.teamLogo}
                          name={gk.teamName}
                          shortName={gk.teamName}
                          primaryColor={gk.primaryColor}
                          size="md"
                        />
                        <div>
                          <div className="font-extrabold text-slate-900 leading-tight flex items-center gap-1.5 group-hover:text-[#00A859] transition-colors">
                            <span>{gk.playerName}</span>
                            {pos === 1 && (
                              <Award className="w-4 h-4 text-amber-500 shrink-0" />
                            )}
                            <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <div className="text-xs font-normal text-slate-500">
                            {gk.teamName} • Dorsal #{gk.dorsal}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-4 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                        {gk.category}
                      </span>
                    </td>

                    {/* Stats */}
                    <td className="py-4 px-3 text-center font-semibold text-slate-700">{gk.matchesPlayed}</td>

                    {/* Goles Encajados */}
                    <td className="py-4 px-3 text-center font-bold text-rose-600 bg-rose-50/30">
                      {gk.goalsConceded}
                    </td>

                    {/* Clean Sheets */}
                    <td className="py-4 px-3 text-center font-bold text-emerald-700">
                      <div className="flex items-center justify-center space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{gk.cleanSheets}</span>
                      </div>
                    </td>

                    {/* Coeficiente Promedio */}
                    <td className="py-4 px-4 text-center font-black text-base text-blue-600 bg-slate-100/50">
                      {gk.matchesPlayed > 0 ? gk.ratio.toFixed(2) : '0.00'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footnote */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-500" />
            <span>Criterio de clasificación: Menor promedio de goles por partido → Más Vallas Invictas</span>
          </div>
          <span className="font-semibold text-slate-600">Copa Abogados 2026</span>
        </div>
      </div>
    </div>
  );
};
