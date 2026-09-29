'use client';

import React from 'react';
import { AlertCircle, Calculator, RotateCcw, Save } from 'lucide-react';

interface SheetCorrectionBarProps {
  reason: string;
  onReasonChange: (r: string) => void;
  homeScoreInput: string;
  awayScoreInput: string;
  homeTeamName: string;
  awayTeamName: string;
  onHomeScoreChange: (v: string) => void;
  onAwayScoreChange: (v: string) => void;
  onRecalculateFromGoals: () => void;
  onDiscard: () => void;
  onSave: () => void;
  hasChanges: boolean;
  reasonError: string | null;
  scoreError: string | null;
  isSaving?: boolean;
}

export const SheetCorrectionBar: React.FC<SheetCorrectionBarProps> = ({
  reason,
  onReasonChange,
  homeScoreInput,
  awayScoreInput,
  homeTeamName,
  awayTeamName,
  onHomeScoreChange,
  onAwayScoreChange,
  onRecalculateFromGoals,
  onDiscard,
  onSave,
  hasChanges,
  reasonError,
  scoreError,
  isSaving = false,
}) => {
  const canSave = hasChanges && reasonError === null && scoreError === null && !isSaving;

  return (
    <div className="bg-amber-50 border-2 border-amber-300 rounded-3xl p-5 shadow-lg space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200 pb-3">
        <div className="flex items-center gap-2 text-amber-900 font-extrabold text-sm">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
          <span>Modo corrección: los cambios no se guardan hasta confirmar</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDiscard}
            disabled={isSaving}
            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Descartar
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {isSaving ? 'Guardando...' : 'Guardar corrección'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        {/* Motivo de la correccion */}
        <div className="md:col-span-2 space-y-1.5">
          <label className="block font-bold text-slate-700">
            Motivo de la corrección * <span className="text-[10px] text-slate-500 font-medium">(5 a 300 caracteres)</span>
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Ej: Corrección de autor de gol del minuto 23 por reclamo en acta..."
            className={`w-full px-3 py-2 bg-white rounded-xl border font-medium text-slate-900 focus:outline-hidden ${
              reason.length > 0 && reasonError ? 'border-rose-400 bg-rose-50/30' : 'border-amber-300'
            }`}
          />
          {reason.length > 0 && reasonError && (
            <p className="text-[11px] font-bold text-rose-600">{reasonError}</p>
          )}
        </div>

        {/* Ajuste manual de marcador y recalculo */}
        <div className="space-y-1.5">
          <label className="block font-bold text-slate-700">
            Marcador manual (0 - 99)
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <span className="block text-[10px] text-slate-500 truncate" title={homeTeamName}>
                {homeTeamName}
              </span>
              <input
                type="number"
                min="0"
                max="99"
                value={homeScoreInput}
                onChange={(e) => onHomeScoreChange(e.target.value)}
                className="w-full px-2 py-1.5 text-center bg-white border border-amber-300 rounded-lg font-black text-sm"
              />
            </div>
            <span className="font-bold text-slate-400 pt-3">:</span>
            <div className="flex-1">
              <span className="block text-[10px] text-slate-500 truncate" title={awayTeamName}>
                {awayTeamName}
              </span>
              <input
                type="number"
                min="0"
                max="99"
                value={awayScoreInput}
                onChange={(e) => onAwayScoreChange(e.target.value)}
                className="w-full px-2 py-1.5 text-center bg-white border border-amber-300 rounded-lg font-black text-sm"
              />
            </div>
          </div>
          {scoreError && (
            <p className="text-[10px] font-bold text-rose-600">{scoreError}</p>
          )}
          <button
            type="button"
            onClick={onRecalculateFromGoals}
            className="w-full mt-1 px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[11px] rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
          >
            <Calculator className="w-3.5 h-3.5" /> Recalcular desde goles
          </button>
        </div>
      </div>
    </div>
  );
};
