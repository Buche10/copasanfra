'use client';

import React from 'react';
import { TeamStanding, Team } from '@/types';
import { TeamShield } from './TeamShield';
import { HelpCircle, ChevronRight } from 'lucide-react';

interface StandingsTableProps {
  standings: TeamStanding[];
  teams: Team[];
  onSelectTeam: (team: Team) => void;
}

export const StandingsTable: React.FC<StandingsTableProps> = ({
  standings,
  teams,
  onSelectTeam,
}) => {
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 rounded-3xl text-white shadow-xl relative overflow-hidden">
        <div className="space-y-1 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#00A859]/20 text-[#00A859] border border-[#00A859]/30 text-xs font-bold uppercase tracking-wider">
            <span>Campeonato Oficial</span> • <span>Tungurahua</span>
          </div>
          <h2 className="text-2xl font-black tracking-tight">Tabla General de Posiciones</h2>
        </div>
      </div>

      {/* Standings Table Card */}
      <div className="glass-card rounded-3xl overflow-hidden shadow-lg border border-slate-200">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left border-collapse sm:min-w-[640px]">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                <th className="py-4 px-2 sm:px-4 text-center w-12 sm:w-14">Pos</th>
                <th className="py-4 px-2 sm:px-4">Equipo</th>
                <th className="py-4 px-2 sm:px-3 text-center" title="Partidos Jugados">PJ</th>
                <th className="py-4 px-3 text-center hidden sm:table-cell" title="Partidos Ganados">PG</th>
                <th className="py-4 px-3 text-center hidden sm:table-cell" title="Partidos Empatados">PE</th>
                <th className="py-4 px-3 text-center hidden sm:table-cell" title="Partidos Perdidos">PP</th>
                <th className="py-4 px-3 text-center hidden sm:table-cell" title="Goles a Favor">GF</th>
                <th className="py-4 px-3 text-center hidden sm:table-cell" title="Goles en Contra">GC</th>
                <th className="py-4 px-2 sm:px-3 text-center font-bold" title="Diferencia de Goles">DG</th>
                <th className="py-4 px-2 sm:px-4 text-center font-black text-slate-900 bg-slate-200/50">PTS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {standings.map((st, index) => {
                const pos = index + 1;
                const team = teamMap.get(st.teamId);

                return (
                  <React.Fragment key={st.teamId}>
                    <tr
                      onClick={() => team && onSelectTeam(team)}
                      className="hover:bg-slate-100/70 transition-colors cursor-pointer group"
                    >
                      {/* Position */}
                      <td className="py-4 px-4 text-center font-bold">
                        <div className="flex items-center justify-center">
                          <span
                            className={`w-7 h-7 rounded-xl flex items-center justify-center font-extrabold text-xs shadow-sm ${
                              pos === 1
                                ? 'bg-[#00A859] text-white ring-2 ring-[#00A859]/30'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {pos}
                          </span>
                        </div>
                      </td>

                      {/* Team Info */}
                      <td className="py-4 px-4 font-bold text-slate-800">
                        <div className="flex items-center space-x-3">
                          <TeamShield 
                            logoKey={st.logo} 
                            name={st.teamName} 
                            shortName={st.shortName}
                            primaryColor={st.primaryColor}
                            size="md"
                          />
                          <div>
                            <div className="font-extrabold text-slate-900 leading-tight flex items-center gap-1 group-hover:text-[#00A859] transition-colors">
                              {st.teamName} <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs font-normal text-slate-500">
                                {st.shortName}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Stats */}
                      <td className="py-4 px-2 sm:px-3 text-center font-semibold text-slate-700">{st.pj}</td>
                      <td className="py-4 px-3 text-center font-semibold text-emerald-700 hidden sm:table-cell">{st.pg}</td>
                      <td className="py-4 px-3 text-center font-semibold text-amber-700 hidden sm:table-cell">{st.pe}</td>
                      <td className="py-4 px-3 text-center font-semibold text-rose-700 hidden sm:table-cell">{st.pp}</td>
                      <td className="py-4 px-3 text-center text-slate-600 hidden sm:table-cell">{st.gf}</td>
                      <td className="py-4 px-3 text-center text-slate-600 hidden sm:table-cell">{st.gc}</td>

                      {/* Goal Diff */}
                      <td className="py-4 px-2 sm:px-3 text-center font-bold">
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-extrabold ${
                          st.dg > 0 
                            ? 'bg-emerald-100 text-[#00A859]' 
                            : st.dg < 0 
                            ? 'bg-rose-100 text-[#DC2626]' 
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {st.dg > 0 ? `+${st.dg}` : st.dg}
                        </span>
                      </td>

                      {/* Points */}
                      <td className="py-4 px-4 text-center font-black text-base text-[#00A859] bg-slate-100/50">
                        {st.pts}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footnote Criteria */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-center gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-slate-400" />
            <span>Criterios: Puntos → Enfrentamiento Directo → Diferencia Goles → Goles Favor</span>
          </div>
        </div>
      </div>
    </div>
  );
};
