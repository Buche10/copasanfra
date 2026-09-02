'use client';

import React, { useState } from 'react';
import { Team, Category, CATEGORIES } from '@/types';
import { TeamShield } from './TeamShield';
import { X, Save } from 'lucide-react';

interface TeamEditModalProps {
  team: Team;
  onSave: (team: Team) => void;
  onClose: () => void;
}

const LOGOS: [string, string][] = [
  ['scale', 'Balanza de la Justicia'],
  ['landmark', 'Palacio de Justicia / Fiscalía'],
  ['file-text', 'Notarios / Pergamino'],
  ['shield', 'Escudo Defensor'],
  ['book', 'Jurisconsultos'],
  ['graduation', 'Gremio / Abogacía'],
  ['gavel', 'Mazo de Juez'],
  ['crown', 'Corona'],
  ['trophy', 'Trofeo'],
  ['award', 'Medalla'],
];

export const TeamEditModal: React.FC<TeamEditModalProps> = ({ team, onSave, onClose }) => {
  const [name, setName] = useState(team.name);
  const [shortName, setShortName] = useState(team.shortName);
  const [category, setCategory] = useState<Category>(team.category);
  const [logo, setLogo] = useState(team.logo);
  const [primaryColor, setPrimaryColor] = useState(team.primaryColor || '#00A859');
  const [phone, setPhone] = useState(team.phone || '');
  const [clubId, setClubId] = useState(team.clubId || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !shortName.trim()) return;
    onSave({
      ...team,
      name: name.trim(),
      shortName: shortName.trim(),
      category,
      logo,
      primaryColor,
      phone: phone.trim(),
      clubId: clubId.trim() || undefined,
    });
    onClose();
  };

  const field = 'w-full bg-slate-50 text-slate-900 font-semibold text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#00A859]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-100 my-8">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-6 relative flex items-center gap-3">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
          <TeamShield logoKey={logo} name={name} primaryColor={primaryColor} size="md" />
          <div>
            <span className="px-3 py-1 bg-[#00A859]/20 text-[#00A859] border border-[#00A859]/30 rounded-full text-xs font-black uppercase tracking-wider">
              Editar Equipo
            </span>
            <h3 className="text-lg font-black tracking-tight mt-1">{name || 'Equipo'}</h3>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Nombre Completo</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={field} required />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Nombre Corto</label>
            <input type="text" value={shortName} onChange={(e) => setShortName(e.target.value)} className={field} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Categoría</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className={field}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Color</label>
              <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-full h-[42px] bg-slate-50 rounded-xl border border-slate-200 cursor-pointer" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Insignia / Icono</label>
            <select value={logo} onChange={(e) => setLogo(e.target.value)} className={field}>
              {LOGOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Teléfono de Contacto</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0990000000" className={field} />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              Dueño / Club <span className="font-medium text-slate-400">(opcional)</span>
            </label>
            <input type="text" value={clubId} onChange={(e) => setClubId(e.target.value)} placeholder="ej. club-akd" className={field} />
            <p className="text-[11px] text-slate-400 mt-1">Equipos con el mismo dueño se programan en horarios seguidos.</p>
          </div>

          <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
            <button type="button" onClick={onClose} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors">
              Cancelar
            </button>
            <button type="submit" className="flex-1 py-3 bg-[#00A859] hover:bg-emerald-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition-colors flex items-center justify-center gap-1.5">
              <Save className="w-4 h-4" /> Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
