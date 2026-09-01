'use client';

import React from 'react';
import { PlayerSanction, Player, Team } from '@/types';
import { TeamShield } from './TeamShield';
import { ShieldAlert, AlertTriangle, CheckCircle, ChevronRight } from 'lucide-react';

interface SanctionsTableProps {
  sanctions: PlayerSanction[];
  players: Player[];
  teams: Team[];
  onSelectPlayer: (player: Player) => void;
  onSelectTeam: (team: Team) => void;
}

export const SanctionsTable: React.FC<SanctionsTableProps> = ({
  sanctions,
  players,
  teams,
  onSelectPlayer,
  onSelectTeam,
}) => {
  const suspendedPlayers = sanctions.filter((s) => s.isSuspended);
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-rose-800 via-rose-900 to-slate-900 p-6 rounded-3xl text-white shadow-xl relative overflow-hidden">
        <div className="space-y-1 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-rose-100 backdrop-blur-md text-xs font-bold uppercase tracking-wider">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-200" />
            <span>Juego Limpio & Disciplina</span>
          </div>
          <h2 className="text-2xl font-black tracking-tight">Tabla de Tarjetas y Sanciones</h2>
          <p className="text-rose-100 text-sm">
            Control disciplinario oficial y habilitación de jugadores para las próximas fechas.
          </p>
        </div>
      </div>

      {/* Active Suspensions Alert Section */}
      {suspendedPlayers.length > 0 && (
        <div className="bg-rose-50 border-2 border-rose-200 rounded-3xl p-6 shadow-md">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-[#DC2626] text-white flex items-center justify-center font-bold shadow">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-lg">
                Jugadores Suspendidos ({suspendedPlayers.length})
              </h3>
              <p className="text-xs text-slate-600">
                Inhabilitados automáticamente para jugar la siguiente jornada según el reglamento disciplinario.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {suspendedPlayers.map((sp) => {
              const playerObj = playerMap.get(sp.playerId);

              return (
                <div 
                  key={sp.playerId} 
                  onClick={() => playerObj && onSelectPlayer(playerObj)}
                  className="bg-white p-4 rounded-2xl border border-rose-200 shadow-sm flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow"
                >
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-400">#{sp.dorsal}</span>
                    <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1">
                      {sp.playerName} <ChevronRight className="w-3 h-3 text-slate-400" />
                    </h4>
                    <p className="text-xs text-slate-500 font-medium">
                      {sp.teamName}
                    </p>
                    <p className="text-[11px] font-semibold text-rose-600 mt-1">
                      {sp.suspensionReason}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="px-2.5 py-1 bg-rose-600 text-white font-extrabold text-xs rounded-xl inline-block shadow-sm">
                      {sp.matchesRemaining} Fecha{sp.matchesRemaining > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Complete Discipline Log */}
      <div className="glass-card rounded-3xl overflow-hidden shadow-lg border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <h4 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">
            Registro Histórico de Amonestaciones
          </h4>
          <span className="text-xs text-slate-500 font-medium">5 Amarillas = 1 Partido Suspensión</span>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left border-collapse sm:min-w-[600px]">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                <th className="py-4 px-2 sm:px-4">Jugador</th>
                <th className="py-4 px-4 hidden sm:table-cell">Equipo</th>
                <th className="py-4 px-2 sm:px-3 text-center">Amar.</th>
                <th className="py-4 px-2 sm:px-3 text-center">Rojas</th>
                <th className="py-4 px-2 sm:px-4 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {sanctions.map((sc) => {
                const playerObj = playerMap.get(sc.playerId);
                const teamObj = teamMap.get(sc.teamId);

                return (
                  <tr key={sc.playerId} className="hover:bg-slate-50 transition-colors">
                    <td 
                      onClick={() => playerObj && onSelectPlayer(playerObj)}
                      className="py-4 px-4 font-bold text-slate-900 cursor-pointer hover:text-[#00A859] transition-colors"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-slate-400 font-semibold">#{sc.dorsal}</span>
                        <span className="flex items-center gap-1">
                          {sc.playerName} <ChevronRight className="w-3 h-3 text-slate-400" />
                        </span>
                      </div>
                    </td>
                    <td
                      onClick={() => teamObj && onSelectTeam(teamObj)}
                      className="py-4 px-4 text-slate-700 cursor-pointer hover:text-[#00A859] transition-colors hidden sm:table-cell"
                    >
                      <div className="flex items-center space-x-2">
                        <TeamShield logoKey={sc.teamLogo} name={sc.teamName} size="sm" />
                        <span className="font-semibold text-xs text-slate-700">{sc.teamName}</span>
                      </div>
                    </td>
                    <td className="py-4 px-2 sm:px-3 text-center font-bold text-amber-700">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 rounded-lg border border-amber-200">
                        <span className="w-2.5 h-3.5 bg-amber-400 rounded-sm inline-block shadow-sm"></span>
                        {sc.yellowCards}
                      </span>
                    </td>
                    <td className="py-4 px-2 sm:px-3 text-center font-bold text-rose-700">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-50 rounded-lg border border-rose-200">
                        <span className="w-2.5 h-3.5 bg-rose-600 rounded-sm inline-block shadow-sm"></span>
                        {sc.redCards}
                      </span>
                    </td>
                    <td className="py-4 px-2 sm:px-4 text-center">
                      {sc.isSuspended ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-100 text-rose-700 font-extrabold text-xs rounded-full border border-rose-200">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                          Suspendido ({sc.matchesRemaining} fecha)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-[#00A859] font-extrabold text-xs rounded-full border border-emerald-200">
                          <CheckCircle className="w-3.5 h-3.5 text-[#00A859]" />
                          Habilitado
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
