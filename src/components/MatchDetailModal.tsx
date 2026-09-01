'use client';

import React from 'react';
import { Match, Team, Player } from '@/types';
import { TeamShield } from './TeamShield';
import { X, Calendar, MapPin, User, FileText, CheckCircle2, Trophy } from 'lucide-react';

interface MatchDetailModalProps {
  match: Match | null;
  teams: Team[];
  players: Player[];
  onClose: () => void;
}

export const MatchDetailModal: React.FC<MatchDetailModalProps> = ({
  match,
  teams,
  players,
  onClose,
}) => {
  if (!match) return null;

  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const playerMap = new Map(players.map((p) => [p.id, p]));

  const homeTeam = teamMap.get(match.homeTeamId);
  const awayTeam = teamMap.get(match.awayTeamId);

  // Group events by minute
  const eventsSorted = [...match.events].sort((a, b) => a.minute - b.minute);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden border border-slate-100 my-8">
        
        {/* Top Header Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="text-center space-y-1">
            <span className="px-3 py-1 bg-[#00A859]/20 text-[#00A859] border border-[#00A859]/30 rounded-full text-xs font-black uppercase tracking-wider">
              Jornada #{match.round} • Ficha de Partido
            </span>
            <div className="flex items-center justify-center gap-4 text-xs text-slate-300 mt-2">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-[#00A859]" /> {match.date} - {match.time}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-[#DC2626]" /> {match.stadium}
              </span>
            </div>
          </div>

          {/* Score Board Display */}
          <div className="flex items-center justify-between mt-6 px-4">
            {/* Home Team */}
            <div className="flex-1 flex flex-col items-center text-center space-y-2">
              <TeamShield logoKey={homeTeam?.logo} name={homeTeam?.name || ''} size="lg" />
              <h3 className="font-extrabold text-base leading-tight text-white">{homeTeam?.name}</h3>
            </div>

            {/* Score Center */}
            <div className="px-6 text-center space-y-1">
              <div className="text-4xl font-black tracking-tight text-white flex items-center gap-2">
                <span>{match.homeScore}</span>
                <span className="text-slate-500 font-thin text-2xl">:</span>
                <span>{match.awayScore}</span>
              </div>
              <div>
                {match.status === 'FINISHED' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Finalizado
                  </span>
                )}
                {match.status === 'IN_PROGRESS' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500 text-white animate-pulse">
                    EN VIVO
                  </span>
                )}
                {match.status === 'SCHEDULED' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-700 text-slate-300">
                    Programado
                  </span>
                )}
              </div>
            </div>

            {/* Away Team */}
            <div className="flex-1 flex flex-col items-center text-center space-y-2">
              <TeamShield logoKey={awayTeam?.logo} name={awayTeam?.name || ''} size="lg" />
              <h3 className="font-extrabold text-base leading-tight text-white">{awayTeam?.name}</h3>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
          
          {/* Match Timeline Events */}
          <div className="space-y-3">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[#00A859]" /> Incidencias del Partido
            </h4>

            {eventsSorted.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-sm italic bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                No hay eventos o goles registrados en esta ficha.
              </div>
            ) : (
              <div className="space-y-2">
                {eventsSorted.map((ev) => {
                  const player = playerMap.get(ev.playerId);
                  const isHome = ev.teamId === match.homeTeamId;

                  return (
                    <div 
                      key={ev.id} 
                      className={`flex items-center justify-between p-3 rounded-2xl border text-sm ${
                        isHome ? 'bg-emerald-50/40 border-emerald-100' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      {/* Left: Minute & Type */}
                      <div className="flex items-center space-x-3">
                        <span className="w-8 h-8 rounded-xl bg-slate-900 text-white font-extrabold text-xs flex items-center justify-center shadow-sm">
                          {ev.minute}&apos;
                        </span>
                        <div>
                          <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                            {ev.type === 'GOAL' && <span className="text-[#00A859]">Gol Anotado ({ev.goalType || 'Normal'})</span>}
                            {ev.type === 'YELLOW_CARD' && <span className="text-amber-700">Tarjeta Amarilla</span>}
                            {ev.type === 'RED_CARD' && <span className="text-rose-600 font-black">Tarjeta Roja Directa</span>}
                            {ev.type === 'SUBSTITUTION' && <span className="text-blue-600">Cambio</span>}
                          </div>
                          <div className="text-xs font-semibold text-slate-600">
                            {player?.name || 'Jugador'} (#{player?.dorsal})
                          </div>
                        </div>
                      </div>

                      {/* Right: Team emblem */}
                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-500">
                          {isHome ? homeTeam?.shortName : awayTeam?.shortName}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Signature Status & Notes */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="flex items-center gap-1 font-bold">
                <User className="w-4 h-4 text-[#00A859]" /> Planilla Oficial de Control
              </span>
              {match.refereeSigned ? (
                <span className="flex items-center gap-1 font-extrabold text-[#00A859]">
                  <CheckCircle2 className="w-4 h-4" /> Planilla Firmada Oficialmente
                </span>
              ) : (
                <span className="text-slate-400 font-medium">Planilla Pendiente de Firma</span>
              )}
            </div>

            {match.refereeNotes && (
              <div className="mt-2 text-xs text-slate-600 italic bg-white p-3 rounded-xl border border-slate-200">
                <FileText className="w-3.5 h-3.5 text-slate-400 inline mr-1" />
                &quot;{match.refereeNotes}&quot;
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 text-right">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-xl transition-colors shadow-sm"
          >
            Cerrar Ficha
          </button>
        </div>

      </div>
    </div>
  );
};
