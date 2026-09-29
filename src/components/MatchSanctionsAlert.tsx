'use client';

import React from 'react';
import { Player, Team } from '@/types';
import { AlertTriangle, Ban } from 'lucide-react';

interface MatchSanctionsAlertProps {
  suspendedPlayers: Player[];
  teamMap: Map<string, Team>;
  suspReason: (p: Player) => string;
}

export const MatchSanctionsAlert: React.FC<MatchSanctionsAlertProps> = ({
  suspendedPlayers,
  teamMap,
  suspReason,
}) => {
  if (suspendedPlayers.length === 0) return null;

  return (
    <div className="bg-rose-50 border-2 border-rose-400 p-5 rounded-3xl flex flex-col space-y-3 text-rose-950 shadow-lg">
      <div className="flex items-center gap-2 font-black text-sm uppercase text-rose-700 tracking-wide">
        <AlertTriangle className="w-6 h-6 text-rose-600 animate-bounce" />
        <span>NOTIFICACIÓN OFICIAL PARA EL ÁRBITRO Y VOCAL DE MESA</span>
      </div>
      <p className="text-xs font-bold text-rose-900">
        Los siguientes jugadores tienen una{' '}
        <span className="underline decoration-rose-500 font-black">SANCIÓN ACTIVA</span> y{' '}
        <span className="uppercase text-rose-700 font-black">NO PUEDEN JUGAR NI FIRMAR EL ACTA</span> en
        esta fecha:
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
        {suspendedPlayers.map((p) => {
          const team = teamMap.get(p.teamId);
          return (
            <div
              key={p.id}
              className="bg-white p-3 rounded-2xl border border-rose-300 text-xs font-bold flex items-center justify-between shadow-xs"
            >
              <div className="flex items-center space-x-2">
                <Ban className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  #{p.dorsal} {p.name} <span className="text-slate-500">({team?.shortName})</span>
                </span>
              </div>
              <span className="text-[10px] font-extrabold bg-rose-100 text-rose-800 px-2 py-1 rounded-lg border border-rose-200">
                {suspReason(p)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
