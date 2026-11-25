'use client';

import React, { useMemo } from 'react';
import { Category, Match, Team, TeamStanding } from '@/types';
import { calculateGroupStandings } from '@/lib/groupStage';
import { TeamShield } from './TeamShield';
import { ChevronRight } from 'lucide-react';

interface GroupStandingsProps {
  category: Category;
  teams: Team[];
  matches: Match[];
  onSelectTeam?: (team: Team) => void;
}

interface SingleGroupTableProps {
  groupLabel: 'Grupo A' | 'Grupo B';
  standings: TeamStanding[];
  teamMap: Map<string, Team>;
  onSelectTeam?: (team: Team) => void;
}

const SingleGroupTable: React.FC<SingleGroupTableProps> = ({
  groupLabel,
  standings,
  teamMap,
  onSelectTeam,
}) => (
  <div className="glass-card rounded-3xl overflow-hidden shadow-lg border border-slate-200 bg-white">
    <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
      <h4 className="font-black text-sm uppercase tracking-wider">{groupLabel}</h4>
      <span className="text-[11px] font-bold text-emerald-300">Clasifican los 4 primeros</span>
    </div>
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full text-left border-collapse sm:min-w-[600px]">
        <thead>
          <tr className="bg-slate-100/80 border-b border-slate-200 text-xs font-extrabold text-slate-600 uppercase tracking-wider">
            <th className="py-3 px-2 sm:px-3 text-center w-10">Pos</th>
            <th className="py-3 px-2 sm:px-3">Equipo</th>
            <th className="py-3 px-2 text-center" title="Partidos Jugados">PJ</th>
            <th className="py-3 px-2 text-center hidden sm:table-cell" title="Partidos Ganados">PG</th>
            <th className="py-3 px-2 text-center hidden sm:table-cell" title="Partidos Empatados">PE</th>
            <th className="py-3 px-2 text-center hidden sm:table-cell" title="Partidos Perdidos">PP</th>
            <th className="py-3 px-2 text-center hidden sm:table-cell" title="Goles a Favor">GF</th>
            <th className="py-3 px-2 text-center hidden sm:table-cell" title="Goles en Contra">GC</th>
            <th className="py-3 px-2 text-center font-bold" title="Diferencia de Goles">DG</th>
            <th className="py-3 px-2 text-center font-bold" title="Bonificación de fase regular">Bonif.</th>
            <th className="py-3 px-2 sm:px-3 text-center font-black text-slate-900 bg-slate-200/50">PTS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm">
          {standings.map((st, index) => {
            const pos = index + 1;
            const team = teamMap.get(st.teamId);
            const qualifies = index < 4;
            const bonus = st.bonus ?? 0;

            return (
              <tr
                key={st.teamId}
                onClick={() => team && onSelectTeam?.(team)}
                className={`transition-colors ${
                  onSelectTeam ? 'hover:bg-slate-100/70 cursor-pointer group' : ''
                } ${qualifies ? 'bg-emerald-500/5 font-semibold' : ''}`}
              >
                <td className="py-3 px-2 sm:px-3 text-center font-bold">
                  <span
                    className={`w-6 h-6 rounded-lg inline-flex items-center justify-center font-extrabold text-xs ${
                      pos === 1
                        ? 'bg-[#00A859] text-white'
                        : qualifies
                        ? 'bg-emerald-100 text-[#00A859] border border-emerald-300'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {pos}
                  </span>
                </td>
                <td className="py-3 px-2 sm:px-3 font-bold text-slate-800">
                  <div className="flex items-center gap-2.5">
                    <TeamShield
                      logoKey={st.logo}
                      name={st.teamName}
                      shortName={st.shortName}
                      primaryColor={st.primaryColor}
                      size="sm"
                    />
                    <span className="font-extrabold text-slate-900 leading-tight flex items-center gap-1 group-hover:text-[#00A859] transition-colors">
                      {st.teamName}
                      {onSelectTeam && (
                        <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </span>
                  </div>
                </td>
                <td className="py-3 px-2 text-center text-slate-600 font-semibold">{st.pj}</td>
                <td className="py-3 px-2 text-center text-slate-600 hidden sm:table-cell">{st.pg}</td>
                <td className="py-3 px-2 text-center text-slate-600 hidden sm:table-cell">{st.pe}</td>
                <td className="py-3 px-2 text-center text-slate-600 hidden sm:table-cell">{st.pp}</td>
                <td className="py-3 px-2 text-center text-slate-600 hidden sm:table-cell">{st.gf}</td>
                <td className="py-3 px-2 text-center text-slate-600 hidden sm:table-cell">{st.gc}</td>
                <td className="py-3 px-2 text-center font-bold text-slate-700">
                  {st.dg > 0 ? `+${st.dg}` : st.dg}
                </td>
                <td className="py-3 px-2 text-center font-bold text-emerald-700">
                  {bonus > 0 ? `+${bonus}` : '0'}
                </td>
                <td className="py-3 px-2 sm:px-3 text-center font-black text-slate-900 bg-slate-100/70">
                  {st.pts}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    <p className="px-4 py-2.5 text-[11px] text-slate-500 bg-slate-50 border-t border-slate-100">
      Empate en puntos: queda arriba quien terminó mejor en la fase regular.
    </p>
  </div>
);

export const GroupStandings: React.FC<GroupStandingsProps> = ({
  category,
  teams,
  matches,
  onSelectTeam,
}) => {
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const groupA = useMemo(
    () => calculateGroupStandings(category, teams, matches, 'A'),
    [category, teams, matches]
  );
  const groupB = useMemo(
    () => calculateGroupStandings(category, teams, matches, 'B'),
    [category, teams, matches]
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <SingleGroupTable
        groupLabel="Grupo A"
        standings={groupA}
        teamMap={teamMap}
        onSelectTeam={onSelectTeam}
      />
      <SingleGroupTable
        groupLabel="Grupo B"
        standings={groupB}
        teamMap={teamMap}
        onSelectTeam={onSelectTeam}
      />
    </div>
  );
};
