'use client';

import React, { useState } from 'react';
import { Player, Team, PlayerPosition } from '@/types';
import { X, Save, UserCog } from 'lucide-react';

interface PlayerEditModalProps {
  player: Player;
  teams: Team[];
  onSave: (player: Player) => void;
  onClose: () => void;
}

const POSITIONS: [PlayerPosition, string][] = [
  ['POR', 'Portero'],
  ['DEF', 'Defensa'],
  ['MED', 'Mediocampista'],
  ['DEL', 'Delantero'],
];

const AFFILIATIONS: NonNullable<Player['affiliation']>[] = ['Colegio de Abogados', 'Foro de Abogados'];

export const PlayerEditModal: React.FC<PlayerEditModalProps> = ({ player, teams, onSave, onClose }) => {
  const [teamId, setTeamId] = useState(player.teamId);
  const [name, setName] = useState(player.name);
  const [cedula, setCedula] = useState(player.cedula || '');
  const [dorsal, setDorsal] = useState(player.dorsal);
  const [position, setPosition] = useState<PlayerPosition>(player.position);
  const [affiliation, setAffiliation] = useState<Player['affiliation']>(player.affiliation);
  const [isCaptain, setIsCaptain] = useState(Boolean(player.isCaptain));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !teamId) return;
    onSave({
      ...player,
      teamId,
      name: name.trim(),
      cedula: cedula.trim(),
      dorsal,
      position,
      affiliation,
      isCaptain,
    });
    onClose();
  };

  const field =
    'w-full bg-slate-50 text-slate-900 font-semibold text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#00A859]';

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
            <UserCog className="w-6 h-6 text-[#00A859]" />
          </div>
          <div className="min-w-0">
            <span className="px-3 py-1 bg-[#00A859]/20 text-[#00A859] border border-[#00A859]/30 rounded-full text-xs font-black uppercase tracking-wider">
              Editar Jugador
            </span>
            <h3 className="text-lg font-black tracking-tight mt-1 truncate">{name || 'Jugador'}</h3>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Nombre Completo</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={field} required />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Equipo</label>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={field} required>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.category}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Dorsal</label>
              <input
                type="number"
                min={1}
                max={99}
                value={dorsal}
                onChange={(e) => setDorsal(Number(e.target.value))}
                className={field}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Posición</label>
              <select value={position} onChange={(e) => setPosition(e.target.value as PlayerPosition)} className={field}>
                {POSITIONS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Cédula / N° Foro</label>
            <input type="text" value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="1801234567" className={field} />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Afiliación</label>
            <select
              value={affiliation || ''}
              onChange={(e) => setAffiliation((e.target.value || undefined) as Player['affiliation'])}
              className={field}
            >
              <option value="">Sin especificar</option>
              {AFFILIATIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isCaptain}
              onChange={(e) => setIsCaptain(e.target.checked)}
              className="w-4 h-4 accent-[#00A859]"
            />
            <span className="text-xs font-bold text-slate-700">Es capitán del equipo</span>
          </label>

          <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-3 bg-[#00A859] hover:bg-emerald-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition-colors flex items-center justify-center gap-1.5"
            >
              <Save className="w-4 h-4" /> Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
