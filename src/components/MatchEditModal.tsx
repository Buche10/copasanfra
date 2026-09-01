'use client';

import React, { useState } from 'react';
import { Match, Team, CANCHAS, MATCH_TIME_SLOTS } from '@/types';
import { TeamShield } from './TeamShield';
import { X, Calendar, Clock, MapPin, Save } from 'lucide-react';

interface MatchEditModalProps {
  match: Match;
  teams: Team[];
  onSave: (updatedMatch: Match) => void;
  onClose: () => void;
}

export const MatchEditModal: React.FC<MatchEditModalProps> = ({
  match,
  teams,
  onSave,
  onClose,
}) => {
  const [date, setDate] = useState(match.date);
  const [time, setTime] = useState(match.time);
  const [customTime, setCustomTime] = useState('');
  const [isCustomTime, setIsCustomTime] = useState(
    !(MATCH_TIME_SLOTS as readonly string[]).includes(match.time)
  );
  const [stadium, setStadium] = useState(match.stadium || 'Cancha 1');
  const [winnerTeamId, setWinnerTeamId] = useState(match.winnerTeamId || '');

  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const homeTeam = teamMap.get(match.homeTeamId);
  const awayTeam = teamMap.get(match.awayTeamId);

  // Empate en un partido de play off: el admin debe definir quién avanza.
  const isPlayoffTie =
    !!match.isPlayoff &&
    match.status === 'FINISHED' &&
    !!match.homeTeamId &&
    !!match.awayTeamId &&
    match.homeScore === match.awayScore;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalTime = isCustomTime ? customTime || time : time;

    onSave({
      ...match,
      date,
      time: finalTime,
      stadium,
      winnerTeamId: match.isPlayoff ? winnerTeamId || undefined : match.winnerTeamId,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-100 my-8">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="space-y-1">
            <span className="px-3 py-1 bg-[#00A859]/20 text-[#00A859] border border-[#00A859]/30 rounded-full text-xs font-black uppercase tracking-wider">
              Modificar Programación
            </span>
            <h3 className="text-xl font-black tracking-tight">Editar Horario y Cancha</h3>
            <p className="text-slate-300 text-xs">
              Jornada #{match.round} • [{match.category}]
            </p>
          </div>

          {/* Teams preview */}
          <div className="flex items-center justify-around mt-4 pt-4 border-t border-slate-700/60">
            <div className="flex items-center space-x-2">
              <TeamShield logoKey={homeTeam?.logo} name={homeTeam?.name || ''} size="sm" />
              <span className="font-bold text-xs text-white">{homeTeam?.shortName}</span>
            </div>
            <span className="text-xs font-black text-slate-400">VS</span>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-xs text-white">{awayTeam?.shortName}</span>
              <TeamShield logoKey={awayTeam?.logo} name={awayTeam?.name || ''} size="sm" />
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Date Picker */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-[#00A859]" /> Fecha del Partido:
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-slate-50 text-slate-900 font-bold text-xs p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#00A859] focus:outline-none"
              required
            />
          </div>

          {/* Field Selection (Cancha 1 / Cancha 2) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-rose-600" /> Cancha Asignada:
            </label>
            <div className="grid grid-cols-2 gap-3">
              {CANCHAS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setStadium(c)}
                  className={`p-3 text-xs font-black rounded-xl border transition-all ${
                    stadium === c
                      ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  ⚽ {c}
                </button>
              ))}
            </div>
          </div>

          {/* Time Slot Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-blue-600" /> Horario Oficial del Partido:
            </label>

            {!isCustomTime ? (
              <div className="grid grid-cols-4 sm:grid-cols-4 gap-2">
                {MATCH_TIME_SLOTS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTime(t)}
                    className={`py-2 px-1 text-xs font-black rounded-xl border transition-all text-center ${
                      time === t && !isCustomTime
                        ? 'bg-[#00A859] text-white border-[#00A859] shadow-md'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            ) : (
              <input
                type="text"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                placeholder="ej. 08:30"
                className="w-full bg-slate-50 text-slate-900 font-bold text-xs p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#00A859]"
                required
              />
            )}

            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
              <span>Duración: 30m / tiempo + 5m descanso</span>
              <button
                type="button"
                onClick={() => setIsCustomTime(!isCustomTime)}
                className="text-[#00A859] font-bold hover:underline"
              >
                {isCustomTime ? 'Usar Horarios Predefinidos' : 'Ingresar Horario Personalizado'}
              </button>
            </div>
          </div>

          {/* Ganador en caso de empate (solo play offs) */}
          {isPlayoffTie && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
              <label className="block text-xs font-black text-amber-900 flex items-center gap-1.5">
                🏆 Empate en play off — ¿Quién avanza?
              </label>
              <p className="text-[11px] text-amber-700">
                Este partido terminó {match.homeScore}-{match.awayScore}. Define a mano el equipo que pasa a la siguiente ronda (p. ej. tras penales).
              </p>
              <select
                value={winnerTeamId}
                onChange={(e) => setWinnerTeamId(e.target.value)}
                className="w-full bg-white text-slate-900 font-bold text-xs p-3 rounded-xl border border-amber-300 focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                <option value="">— Sin definir —</option>
                <option value={match.homeTeamId}>{homeTeam?.name || 'Local'}</option>
                <option value={match.awayTeamId}>{awayTeam?.name || 'Visitante'}</option>
              </select>
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center space-x-3 pt-4 border-t border-slate-100">
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
              <Save className="w-4 h-4" /> Guardar Cambios
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
