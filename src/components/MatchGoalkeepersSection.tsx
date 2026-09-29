'use client';

import React from 'react';
import { Player, Team } from '@/types';
import { Shield } from 'lucide-react';

interface MatchGoalkeepersSectionProps {
  homeTeam: Team | undefined;
  awayTeam: Team | undefined;
  homePlayers: Player[];
  awayPlayers: Player[];
  currentHomeGkId: string;
  currentAwayGkId: string;
  locked: boolean;
  onChangeGoalkeeper: (teamType: 'HOME' | 'AWAY', gkId: string) => void;
}

export const MatchGoalkeepersSection: React.FC<MatchGoalkeepersSectionProps> = ({
  homeTeam,
  awayTeam,
  homePlayers,
  awayPlayers,
  currentHomeGkId,
  currentAwayGkId,
  locked,
  onChangeGoalkeeper,
}) => {
  return (
    <div className="bg-slate-100/80 p-5 rounded-2xl border border-slate-200 space-y-4">
      <div className="flex items-center space-x-2 border-b pb-3 border-slate-200">
        <Shield className="w-5 h-5 text-blue-600" />
        <div>
          <h4 className="font-extrabold text-slate-900 text-sm">Designación de Arqueros Titulares</h4>
          <p className="text-xs text-slate-500">
            Selecciona al arquero que atajó en este partido para abonarle las estadísticas de Portería a 0.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
          <label className="block text-xs font-bold text-slate-700">
            Arquero {homeTeam?.name} (Local):
          </label>
          <select
            value={currentHomeGkId}
            onChange={(e) => onChangeGoalkeeper('HOME', e.target.value)}
            disabled={locked}
            className="w-full bg-slate-50 text-slate-900 font-bold text-xs p-3 rounded-xl border border-slate-300 disabled:opacity-60"
          >
            <option value="">-- Seleccionar Arquero --</option>
            {homePlayers.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.dorsal} {p.name} {p.position === 'POR' ? '(Guardameta)' : `(${p.position})`}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
          <label className="block text-xs font-bold text-slate-700">
            Arquero {awayTeam?.name} (Visitante):
          </label>
          <select
            value={currentAwayGkId}
            onChange={(e) => onChangeGoalkeeper('AWAY', e.target.value)}
            disabled={locked}
            className="w-full bg-slate-50 text-slate-900 font-bold text-xs p-3 rounded-xl border border-slate-300 disabled:opacity-60"
          >
            <option value="">-- Seleccionar Arquero --</option>
            {awayPlayers.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.dorsal} {p.name} {p.position === 'POR' ? '(Guardameta)' : `(${p.position})`}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};
