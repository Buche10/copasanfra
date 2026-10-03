'use client';

import React, { useState, useMemo } from 'react';
import { Category, Player, PlayerPosition, Team, maxPlayersForCategory } from '@/types';
import { applyWatermarkToPhoto } from '@/lib/watermark';
import { registerReinforcement } from '@/lib/store';
import { reinforcementTargetCategories, validateReinforcementInput, reinforcementMessage } from '@/lib/reinforcement';
import { normalizeCedula } from '@/lib/scheduling/sharedPlayers';
import { ReinforcementSuccessCard } from './ReinforcementSuccessCard';
import { AlertCircle, Camera, FileCheck2, Lock, UserCheck } from 'lucide-react';

interface ReinforcementFormProps {
  teams: Team[];
  players: Player[];
  reinforcementsOpen: boolean;
  suspendedCategories?: Category[];
  pausedCategories?: Category[];
  onReinforcementAdded: (player: Player) => void;
  onCancel?: () => void;
}

export const ReinforcementForm: React.FC<ReinforcementFormProps> = ({
  teams,
  players,
  reinforcementsOpen,
  suspendedCategories = [],
  pausedCategories = [],
  onReinforcementAdded,
  onCancel,
}) => {
  const allowedCategories = useMemo(() => {
    return reinforcementTargetCategories().filter(
      (c) => !suspendedCategories.includes(c) && !pausedCategories.includes(c)
    );
  }, [suspendedCategories, pausedCategories]);

  const [selectedCategory, setSelectedCategory] = useState<Category>(allowedCategories[0] || 'Abierta Varones');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [cedula, setCedula] = useState<string>('');
  const [savedCedula, setSavedCedula] = useState<string>('');
  const [dorsal, setDorsal] = useState<string>('');
  const [position, setPosition] = useState<PlayerPosition | ''>('');
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [isWatermarking, setIsWatermarking] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successPlayer, setSuccessPlayer] = useState<Player | null>(null);

  const availableTeams = useMemo(() => {
    return teams.filter((t) => t.category === selectedCategory).sort((a, b) => a.name.localeCompare(b.name));
  }, [teams, selectedCategory]);

  const selectedTeam = useMemo(() => teams.find((t) => t.id === selectedTeamId), [teams, selectedTeamId]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsWatermarking(true);
      setErrorMsg('');
      const watermarked = await applyWatermarkToPhoto(file, 'COPA ABOGADOS 2026 • REFUERZO OFICIAL');
      setPhotoUrl(watermarked);
    } catch {
      setErrorMsg('No se pudo procesar la foto con marca de agua.');
    } finally {
      setIsWatermarking(false);
    }
  };

  const handleReset = () => {
    setSuccessPlayer(null); setSelectedTeamId(''); setPin(''); setCedula(''); setSavedCedula('');
    setDorsal(''); setPosition(''); setPhotoUrl(''); setConfirmed(false); setErrorMsg('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const curPin = pin;
    const curCedula = cedula;
    const parsedDorsal = parseInt(dorsal, 10);
    setPin(''); // Vaciar codigo tras envio

    const clientErr = validateReinforcementInput(
      { pin: curPin, cedula: curCedula, teamId: selectedTeamId, dorsal: parsedDorsal, position: position || undefined },
      teams,
      players
    );
    if (clientErr) {
      setErrorMsg(reinforcementMessage(clientErr));
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await registerReinforcement({
        pin: curPin,
        cedula: curCedula,
        teamId: selectedTeamId,
        dorsal: parsedDorsal,
        position: position || undefined,
      });
      if (res.status === 'OK' && res.player) {
        setSavedCedula(curCedula);
        onReinforcementAdded(res.player);
        setSuccessPlayer(res.player);
      } else {
        setErrorMsg(reinforcementMessage(res.status));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo habilitar el refuerzo. Inténtalo más tarde.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!reinforcementsOpen) {
    return (
      <div className="max-w-2xl mx-auto my-8 p-8 bg-white border border-slate-200 rounded-2xl shadow-sm text-center">
        <div className="w-12 h-12 mx-auto mb-4 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center">
          <Lock className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-2">Habilitación Cerrada</h3>
        <p className="text-sm text-slate-600">La habilitación de refuerzos está cerrada por la organización.</p>
      </div>
    );
  }

  if (successPlayer && selectedTeam) {
    return (
      <ReinforcementSuccessCard
        player={{ ...successPlayer, cedula: normalizeCedula(savedCedula), photo: photoUrl || undefined }}
        team={selectedTeam}
        onReset={handleReset}
        onCancel={onCancel}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto my-6 p-6 sm:p-8 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-6">
      <div className="space-y-1">
        <div className="inline-flex items-center space-x-2 text-xs font-black uppercase text-[#00A859] tracking-wider">
          <UserCheck className="w-4 h-4" />
          <span>Habilitación de Refuerzo</span>
        </div>
        <h2 className="text-xl font-black text-slate-900">Refuerzo de +40 o +50</h2>
        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
          Si un jugador ya está inscrito y aprobado en +40 (o +50), su equipo de la Abierta puede habilitarlo como refuerzo. Recibirá un carnet distinto para esa categoría; la organización revisará la habilitación.
        </p>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs sm:text-sm text-red-700 flex items-start space-x-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-500" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Categoría Destino</label>
          <select
            value={selectedCategory}
            onChange={(e) => { setSelectedCategory(e.target.value as Category); setSelectedTeamId(''); }}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-[#00A859]"
          >
            {allowedCategories.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Equipo Destino</label>
          <select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            required
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-[#00A859]"
          >
            <option value="">Selecciona un equipo</option>
            {availableTeams.map((team) => {
              const count = players.filter((p) => p.teamId === team.id).length;
              const max = maxPlayersForCategory(team.category);
              return (<option key={team.id} value={team.id}>{team.name} ({count}/{max})</option>);
            })}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Código del Equipo (PIN de 6 dígitos)</label>
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          autoComplete="off"
          required
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder="Código de 6 dígitos"
          className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-[#00A859]"
        />
        <p className="text-[11px] text-slate-500 mt-1">Lo entrega la organización al delegado del equipo.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Cédula del Refuerzo</label>
          <input
            type="text"
            required
            maxLength={10}
            value={cedula}
            onChange={(e) => setCedula(e.target.value.replace(/\D/g, ''))}
            placeholder="10 dígitos"
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-[#00A859]"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Dorsal</label>
          <input
            type="number"
            required
            min={1}
            max={99}
            value={dorsal}
            onChange={(e) => setDorsal(e.target.value)}
            placeholder="1 - 99"
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-[#00A859]"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Posición (Opcional)</label>
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value as PlayerPosition | '')}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-[#00A859]"
          >
            <option value="">Igual que en su categoría</option>
            <option value="POR">Portero (POR)</option>
            <option value="DEF">Defensa (DEF)</option>
            <option value="MED">Mediocampista (MED)</option>
            <option value="DEL">Delantero (DEL)</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Foto para el Carnet (Opcional)</label>
        <div className="flex items-center space-x-3">
          <label className="flex items-center space-x-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl cursor-pointer text-xs font-bold text-slate-700 transition-colors">
            <Camera className="w-4 h-4 text-[#00A859]" />
            <span>{isWatermarking ? 'Procesando...' : 'Subir Foto'}</span>
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={isWatermarking} />
          </label>
          {photoUrl && <span className="text-xs text-[#00A859] font-bold">Foto cargada con marca de agua</span>}
        </div>
      </div>

      <div>
        <label className="flex items-start space-x-3 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1 w-4 h-4 text-[#00A859] rounded border-slate-300 focus:ring-[#00A859]"
          />
          <span className="text-xs font-medium text-slate-700 select-none">
            Confirmo que este jugador es refuerzo de nuestro equipo y que los datos son correctos.
          </span>
        </label>
      </div>

      <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-5 py-2.5 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-200 transition-all">
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={!confirmed || isSubmitting || isWatermarking || !selectedTeamId || !pin || !cedula || !dorsal}
          className="flex items-center space-x-2 px-6 py-2.5 bg-[#00A859] hover:bg-[#008e4b] disabled:bg-slate-200 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-xl shadow-md transition-all"
        >
          <FileCheck2 className="w-4 h-4" />
          <span>{isSubmitting ? 'Verificando...' : 'Habilitar Refuerzo'}</span>
        </button>
      </div>
    </form>
  );
};
