'use client';

import React from 'react';
import { Team, Player, Match, TeamStanding } from '@/types';
import { TeamShield } from './TeamShield';
import { X, Users, Phone, UserCheck } from 'lucide-react';

interface TeamProfileModalProps {
  team: Team | null;
  standing?: TeamStanding;
  players: Player[];
  matches: Match[];
  onSelectPlayer: (player: Player) => void;
  onClose: () => void;
}

export const TeamProfileModal: React.FC<TeamProfileModalProps> = ({
  team,
  standing,
  players,
  matches,
  onSelectPlayer,
  onClose,
}) => {
  if (!team) return null;

  const teamPlayers = players.filter((p) => p.teamId === team.id);

  // Compute individual stats for each player in this team
  const playerStatsMap: Record<string, { goals: number; yellow: number; red: number }> = {};

  teamPlayers.forEach((p) => {
    playerStatsMap[p.id] = { goals: 0, yellow: 0, red: 0 };
  });

  matches.forEach((m) => {
    if (m.status === 'FINISHED' || m.status === 'IN_PROGRESS') {
      m.events.forEach((ev) => {
        if (ev.teamId === team.id && playerStatsMap[ev.playerId]) {
          if (ev.type === 'GOAL' && ev.goalType !== 'OWN_GOAL') playerStatsMap[ev.playerId].goals += 1;
          if (ev.type === 'YELLOW_CARD') playerStatsMap[ev.playerId].yellow += 1;
          if (ev.type === 'RED_CARD') playerStatsMap[ev.playerId].red += 1;
        }
      });
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden border border-slate-100 relative my-8">
        
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-4">
            <TeamShield
              logoKey={team.logo}
              name={team.name}
              shortName={team.shortName}
              primaryColor={team.primaryColor}
              secondaryColor={team.secondaryColor}
              size="lg"
            />
            <div>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase bg-[#00A859]/20 text-[#00A859] border border-[#00A859]/30">
                Ficha Institucional del Club
              </span>
              <h2 className="text-2xl font-black text-white mt-1 leading-tight">{team.name}</h2>
              <div className="text-xs text-slate-300 mt-1 flex items-center gap-3">
                {team.delegate && (
                  <>
                    <span className="flex items-center gap-1 font-semibold">
                      <UserCheck className="w-3.5 h-3.5 text-[#00A859]" /> Delegado: {team.delegate}
                    </span>
                    <span>•</span>
                  </>
                )}
                <span className="flex items-center gap-1 font-medium">
                  <Phone className="w-3.5 h-3.5 text-slate-400" /> {team.phone}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          
          {/* Quick Standing Stats Ticker */}
          {standing && (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Puntos</span>
                <span className="text-xl font-black text-[#00A859]">{standing.pts}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">PJ</span>
                <span className="text-xl font-black text-slate-800">{standing.pj}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">PG</span>
                <span className="text-xl font-black text-emerald-700">{standing.pg}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">PE</span>
                <span className="text-xl font-black text-amber-700">{standing.pe}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">PP</span>
                <span className="text-xl font-black text-rose-700">{standing.pp}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Dif. Goles</span>
                <span className="text-xl font-black text-slate-800">
                  {standing.dg > 0 ? `+${standing.dg}` : standing.dg}
                </span>
              </div>
            </div>
          )}

          {/* Plantilla / Roster Table */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-slate-900 text-sm flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#00A859]" /> Plantilla de Jugadores ({teamPlayers.length})
              </span>
              <span className="text-xs text-slate-400 font-normal">Haz clic en un jugador para ver su expediente</span>
            </h4>

            <div className="glass-card rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 uppercase font-extrabold border-b">
                      <th className="p-3 w-10 text-center">#</th>
                      <th className="p-3">Nombre del Jugador</th>
                      <th className="p-3 text-center">Posición</th>
                      <th className="p-3 text-center">Goles</th>
                      <th className="p-3 text-center">Tarjetas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {teamPlayers.map((p) => {
                      const st = playerStatsMap[p.id] || { goals: 0, yellow: 0, red: 0 };
                      return (
                        <tr
                          key={p.id}
                          onClick={() => onSelectPlayer(p)}
                          className="hover:bg-slate-50 cursor-pointer transition-colors"
                        >
                          <td className="p-3 text-center font-black text-slate-900">#{p.dorsal}</td>
                          <td className="p-3 font-bold text-slate-900">{p.name}</td>
                          <td className="p-3 text-center">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                              {p.position}
                            </span>
                          </td>
                          <td className="p-3 text-center font-extrabold text-[#00A859]">
                            {st.goals > 0 ? `${st.goals} Goles` : '0'}
                          </td>
                          <td className="p-3 text-center font-semibold">
                            <span className="text-amber-700 font-bold mr-2 inline-flex items-center gap-1">
                              <span className="w-2.5 h-3.5 bg-amber-400 rounded-sm inline-block shadow-sm"></span>
                              {st.yellow}
                            </span>
                            <span className="text-rose-700 font-bold inline-flex items-center gap-1">
                              <span className="w-2.5 h-3.5 bg-rose-600 rounded-sm inline-block shadow-sm"></span>
                              {st.red}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 text-right">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors shadow-sm"
          >
            Cerrar Ficha
          </button>
        </div>

      </div>
    </div>
  );
};
