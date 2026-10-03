'use client';

import React from 'react';
import { Player, Team, Match, User } from '@/types';
import { TeamShield } from './TeamShield';
import { CarnetDigital } from './CarnetDigital';
import { X, Trophy, ShieldAlert, Award, Calendar, UserCheck, Activity, QrCode } from 'lucide-react';
import { calculateSanctions, countDoubleYellowYellows, YELLOWS_FOR_SUSPENSION } from '@/lib/sanctions';

interface PlayerProfileModalProps {
  player: Player | null;
  teams: Team[];
  matches: Match[];
  currentUser: User | null;
  onClose: () => void;
}

export const PlayerProfileModal: React.FC<PlayerProfileModalProps> = ({
  player,
  teams,
  matches,
  currentUser,
  onClose,
}) => {
  const [showCarnet, setShowCarnet] = React.useState(false);

  if (!player) return null;

  const team = teams.find((t) => t.id === player.teamId);

  // Compute individual stats for this player across all matches
  let totalGoals = 0;
  let penaltyGoals = 0;
  const matchesSet = new Set<string>();

  matches.forEach((m) => {
    if (m.status === 'FINISHED' || m.status === 'IN_PROGRESS') {
      let playedInMatch = false;

      // Check lineups
      [...m.homeLineup, ...m.awayLineup].forEach((lp) => {
        if (lp.playerId === player.id) playedInMatch = true;
      });

      // Check events
      m.events.forEach((ev) => {
        if (ev.playerId === player.id) {
          playedInMatch = true;
          if (ev.type === 'GOAL' && ev.goalType !== 'OWN_GOAL') {
            totalGoals += 1;
            if (ev.goalType === 'PENALTY') penaltyGoals += 1;
          }
        }
      });

      if (playedInMatch) {
        matchesSet.add(m.id);
      }
    }
  });

  const matchesPlayed = matchesSet.size;
  const goalAverage = matchesPlayed > 0 ? (totalGoals / matchesPlayed).toFixed(2) : '0.00';

  const sanctions = calculateSanctions([player], teams, matches);
  const playerSanction = sanctions.find((s) => s.playerId === player.id);
  const isSuspended = Boolean(playerSanction?.isSuspended);
  const suspensionReason = playerSanction?.suspensionReason || '';
  const yellowCards = playerSanction?.yellowCards ?? 0;
  const expulsions = playerSanction?.expulsions ?? playerSanction?.redCards ?? 0;
  const yellowsTowardNext = playerSanction?.yellowsTowardNext ?? 0;
  const doubleYellowsCount = countDoubleYellowYellows(player.id, matches);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-100 relative my-8">
        
        {/* Top Decorative Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 rounded-2xl bg-white/10 text-white flex items-center justify-center font-black text-2xl border border-white/20 shrink-0">
              #{player.dorsal}
            </div>
            <div>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase bg-[#00A859]/20 text-[#00A859] border border-[#00A859]/30">
                {player.position === 'POR' ? 'Portero' : player.position === 'DEF' ? 'Defensa' : player.position === 'MED' ? 'Mediocampista' : 'Delantero'}
              </span>
              <h3 className="text-xl font-black text-white mt-1 leading-tight">{player.name}</h3>
              <div className="flex items-center space-x-2 text-xs text-slate-300 mt-1">
                {team && (
                  <div className="flex items-center gap-1.5 font-bold">
                    <TeamShield logoKey={team.logo} name={team.name} size="sm" />
                    <span>{team.name}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-6">
          
          {/* Status Badge */}
          {/* Status Badge */}
          <div className="p-3.5 rounded-2xl border text-xs bg-slate-50 border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between font-bold">
              <span className="text-slate-500 font-semibold">Estado Disciplinario:</span>
              {isSuspended ? (
                <span className="px-3 py-1 rounded-full bg-rose-100 text-[#DC2626] font-extrabold flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5" /> Suspendido
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full bg-emerald-100 text-[#00A859] font-extrabold flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5" /> Habilitado
                </span>
              )}
            </div>
            {isSuspended && suspensionReason && (
              <div className="pt-1.5 border-t border-rose-200/60 text-[11px] font-semibold text-rose-700 whitespace-pre-line leading-relaxed">
                {suspensionReason}
              </div>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-center">
              <Trophy className="w-4 h-4 text-[#00A859] mx-auto mb-1" />
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Goles Totales</span>
              <span className="text-2xl font-black text-slate-900">{totalGoals}</span>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-center">
              <Award className="w-4 h-4 text-amber-600 mx-auto mb-1" />
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Penaltis</span>
              <span className="text-2xl font-black text-amber-700">{penaltyGoals}</span>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-center">
              <Activity className="w-4 h-4 text-blue-600 mx-auto mb-1" />
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Promedio</span>
              <span className="text-lg font-black text-slate-900">{goalAverage}</span>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-center">
              <Calendar className="w-4 h-4 text-slate-600 mx-auto mb-1" />
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Partidos</span>
              <span className="text-2xl font-black text-slate-900">{matchesPlayed}</span>
            </div>
          </div>

          {/* Cards Breakdown */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
            <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">
              Historial de Tarjetas
            </h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 space-y-1">
                <div className="flex items-center justify-between font-bold">
                  <span>Amarillas</span>
                  <span className="text-base font-black">{yellowCards}</span>
                </div>
                <div className="text-[11px] text-amber-800 font-medium leading-tight">
                  {yellowsTowardNext}/{YELLOWS_FOR_SUSPENSION} para suspensión por acumulación
                  {doubleYellowsCount > 0 && (
                    <span className="block text-[10px] text-amber-700 mt-0.5 font-normal">
                      ({doubleYellowsCount} en dobles amarillas, no acumulan)
                    </span>
                  )}
                </div>
              </div>
              <div className="p-2.5 bg-rose-50 rounded-xl border border-rose-200 text-rose-900 space-y-1">
                <div className="flex items-center justify-between font-bold">
                  <span>Expulsiones</span>
                  <span className="text-base font-black">{expulsions}</span>
                </div>
                <div className="text-[11px] text-rose-700 font-medium">
                  Rojas directas y dobles amarillas
                </div>
              </div>
            </div>
          </div>

          {/* Legal / Member Info - Visible ONLY for Referees and Admin */}
          {(currentUser?.role === 'REFEREE' || currentUser?.role === 'ADMIN') && (
            <div className="text-xs text-slate-600 space-y-1 bg-[#00A859]/5 p-3 rounded-xl border border-[#00A859]/20">
              <span className="font-bold text-[#00A859] block flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5" /> Identificación Privada (Solo Árbitros/Admin):
              </span>
              <span>Cédula / Registro de Foro: <strong className="text-slate-900 font-mono">{player.cedula}</strong></span>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between">
          {team && (
            <button
              onClick={() => setShowCarnet(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-[#00A859] hover:bg-[#008e4b] text-white font-bold text-xs rounded-xl transition-all shadow-sm"
            >
              <QrCode className="w-4 h-4" />
              <span>Ver Carnet Digital / QR</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors shadow-sm ml-auto"
          >
            Cerrar Ficha
          </button>
        </div>

        {showCarnet && team && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn overflow-y-auto">
            <div className="bg-slate-900 p-4 sm:p-6 rounded-3xl max-w-lg w-full relative">
              <button
                onClick={() => setShowCarnet(false)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>
              <CarnetDigital
                player={player}
                team={team}
                onClose={() => setShowCarnet(false)}
              />
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
