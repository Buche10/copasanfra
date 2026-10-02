'use client';

import React, { useState, useMemo } from 'react';
import { Player, Team, Category } from '@/types';
import {
  getEligibleTargetCategories,
  validateCrossCategory,
  buildCrossCategoryPlayer,
  crossCategoryErrorMessage,
} from '@/lib/crossCategory';
import { CarnetDigital } from './CarnetDigital';
import { X, CopyPlus, UserCheck } from 'lucide-react';

interface CrossCategoryModalProps {
  player: Player;
  players: Player[];
  teams: Team[];
  suspendedCategories?: Category[];
  onConfirm: (player: Player) => Promise<boolean>;
  onClose: () => void;
}

export const CrossCategoryModal: React.FC<CrossCategoryModalProps> = ({
  player,
  players,
  teams,
  suspendedCategories = [],
  onConfirm,
  onClose,
}) => {
  const sourceTeam = useMemo(
    () => teams.find((t) => t.id === player.teamId),
    [teams, player.teamId]
  );
  const sourceCategory = sourceTeam?.category || 'Desconocida';

  const eligibleCategories = useMemo(() => {
    return getEligibleTargetCategories(player, players, teams).filter(
      (c) => !suspendedCategories.includes(c)
    );
  }, [player, players, teams, suspendedCategories]);

  const [selectedCategory, setSelectedCategory] = useState<Category | ''>(
    eligibleCategories[0] || ''
  );
  const activeCategory =
    selectedCategory && eligibleCategories.includes(selectedCategory)
      ? selectedCategory
      : eligibleCategories[0] || '';

  const eligibleTeams = useMemo(() => {
    if (!activeCategory) return [];
    return teams
      .filter((t) => t.category === activeCategory)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [teams, activeCategory]);

  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const activeTeamId =
    selectedTeamId && eligibleTeams.some((t) => t.id === selectedTeamId)
      ? selectedTeamId
      : eligibleTeams[0]?.id || '';

  const defaultDorsal = useMemo(() => {
    if (!activeTeamId) return '';
    const isTaken = players.some(
      (p) => p.teamId === activeTeamId && p.dorsal === player.dorsal
    );
    return isTaken ? '' : player.dorsal;
  }, [activeTeamId, players, player.dorsal]);

  const [customDorsal, setCustomDorsal] = useState<number | '' | null>(null);
  const activeDorsal = customDorsal !== null ? customDorsal : defaultDorsal;

  const [error, setError] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [createdPlayer, setCreatedPlayer] = useState<Player | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeamId || activeDorsal === '') {
      setError('Por favor completa todos los campos requeridos.');
      return;
    }

    const dorsalNum = Number(activeDorsal);
    const validationErr = validateCrossCategory(
      { source: player, targetTeamId: activeTeamId, dorsal: dorsalNum },
      players,
      teams
    );

    if (validationErr) {
      setError(crossCategoryErrorMessage(validationErr));
      return;
    }

    setError('');
    setIsSaving(true);
    try {
      const newPlayer = buildCrossCategoryPlayer(player, activeTeamId, dorsalNum, new Date());
      const success = await onConfirm(newPlayer);
      if (success) {
        setCreatedPlayer(newPlayer);
      }
    } catch {
      setError('Ocurrió un error al intentar guardar el jugador.');
    } finally {
      setIsSaving(false);
    }
  };

  const field =
    'w-full bg-slate-50 text-slate-900 font-semibold text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#00A859]';

  const createdTeam = useMemo(
    () => (createdPlayer ? teams.find((t) => t.id === createdPlayer.teamId) : null),
    [createdPlayer, teams]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-100 my-8">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-6 relative flex items-center gap-3">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="w-11 h-11 rounded-2xl bg-[#00A859]/20 border border-[#00A859]/30 flex items-center justify-center shrink-0">
            <CopyPlus className="w-6 h-6 text-[#00A859]" />
          </div>
          <div className="min-w-0">
            <span className="px-3 py-1 bg-[#00A859]/20 text-[#00A859] border border-[#00A859]/30 rounded-full text-xs font-black uppercase tracking-wider">
              Segundo Carnet
            </span>
            <h3 className="text-lg font-black tracking-tight mt-1 truncate">{player.name}</h3>
            <p className="text-xs text-slate-400 truncate">
              {sourceTeam?.name} - {sourceCategory}
            </p>
          </div>
        </div>

        {createdPlayer && createdTeam ? (
          <div className="p-6 space-y-4">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-900">
              Carnet de {createdTeam.category}. Es distinto al carnet de {sourceCategory}; el jugador debe presentar el carnet de la categoría en la que juega.
            </div>
            <div className="bg-slate-900 p-4 rounded-2xl">
              <CarnetDigital player={createdPlayer} team={createdTeam} onClose={onClose} />
            </div>
            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Categoría destino</label>
              <select
                value={activeCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value as Category);
                  setSelectedTeamId('');
                  setCustomDorsal(null);
                  setError('');
                }}
                className={field}
                required
              >
                {eligibleCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Equipo destino</label>
              <select
                value={activeTeamId}
                onChange={(e) => {
                  setSelectedTeamId(e.target.value);
                  setCustomDorsal(null);
                  setError('');
                }}
                className={field}
                required
              >
                {eligibleTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Dorsal</label>
              <input
                type="number"
                min={1}
                max={99}
                value={activeDorsal}
                onChange={(e) => {
                  const val = e.target.value === '' ? '' : Number(e.target.value);
                  setCustomDorsal(val);
                  setError('');
                }}
                placeholder="Ej. 10"
                className={field}
                required
              />
            </div>

            {error && (
              <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
                {error}
              </p>
            )}

            <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving || !activeTeamId || activeDorsal === ''}
                className="flex-1 py-3 bg-[#00A859] hover:bg-emerald-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <UserCheck className="w-4 h-4" />
                {isSaving ? 'Guardando...' : 'Habilitar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
