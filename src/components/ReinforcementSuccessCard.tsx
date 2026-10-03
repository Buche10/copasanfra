'use client';

import React from 'react';
import { Player, Team } from '@/types';
import { CarnetDigital } from './CarnetDigital';
import { CheckCircle2 } from 'lucide-react';

interface ReinforcementSuccessCardProps {
  player: Player;
  team: Team;
  onReset: () => void;
  onCancel?: () => void;
}

export const ReinforcementSuccessCard: React.FC<ReinforcementSuccessCardProps> = ({
  player,
  team,
  onReset,
  onCancel,
}) => {
  return (
    <div className="max-w-2xl mx-auto my-6 space-y-6 text-center animate-fadeIn">
      <div className="inline-flex items-center space-x-2 px-4 py-1.5 bg-emerald-50 text-[#00A859] rounded-full text-xs font-black uppercase border border-emerald-200">
        <CheckCircle2 className="w-4 h-4" />
        <span>Refuerzo Registrado Exitosamente</span>
      </div>
      <p className="text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 max-w-lg mx-auto">
        Carnet de {team.category}. Pendiente de aprobación por la organización. Es distinto al carnet de su otra categoría.
      </p>
      <div className="flex justify-center">
        <CarnetDigital player={player} team={team} />
      </div>
      <div className="pt-2 flex items-center justify-center space-x-4">
        <button
          type="button"
          onClick={onReset}
          className="px-6 py-3 bg-[#00A859] text-white font-extrabold text-sm rounded-xl shadow-md hover:bg-[#008e4b] transition-all"
        >
          Habilitar Otro Refuerzo
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-3 bg-slate-200 text-slate-800 font-bold text-sm rounded-xl hover:bg-slate-300 transition-all"
          >
            Volver
          </button>
        )}
      </div>
    </div>
  );
};
