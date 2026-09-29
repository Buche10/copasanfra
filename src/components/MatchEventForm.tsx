'use client';

import React, { useState } from 'react';
import { Team, Player, MatchEvent, EventType, GoalType, CardReason } from '@/types';
import { PlusCircle, Edit3, X } from 'lucide-react';

interface MatchEventFormProps {
  matchId: string;
  homeTeam: Team | undefined;
  awayTeam: Team | undefined;
  homePlayers: Player[];
  awayPlayers: Player[];
  isSusp: (p: Player) => boolean;
  allowSuspended?: boolean;
  editingEvent?: MatchEvent | null;
  onSaveEvent: (ev: MatchEvent) => void;
  onCancelEdit?: () => void;
}

export const MatchEventForm: React.FC<MatchEventFormProps> = ({
  matchId,
  homeTeam,
  awayTeam,
  homePlayers,
  awayPlayers,
  isSusp,
  allowSuspended = false,
  editingEvent,
  onSaveEvent,
  onCancelEdit,
}) => {
  const [eventType, setEventType] = useState<EventType>(editingEvent?.type || 'GOAL');
  const [eventTeamId, setEventTeamId] = useState<string>(editingEvent?.teamId || '');
  const [eventPlayerId, setEventPlayerId] = useState<string>(editingEvent?.playerId || '');
  const [eventMinute, setEventMinute] = useState<number>(editingEvent?.minute ?? 15);
  const [goalType, setGoalType] = useState<GoalType>(editingEvent?.goalType || 'REGULAR');
  const [cardReason, setCardReason] = useState<CardReason>(
    editingEvent?.cardReason || 'UNSPORTING'
  );

  const currentTeamPlayers =
    eventTeamId === homeTeam?.id ? homePlayers : eventTeamId === awayTeam?.id ? awayPlayers : [];

  const eligiblePlayers = allowSuspended
    ? currentTeamPlayers
    : currentTeamPlayers.filter((p) => !isSusp(p));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTeamId || !eventPlayerId) return;

    const ev: MatchEvent = {
      id: editingEvent ? editingEvent.id : `ev-${crypto.randomUUID()}`,
      matchId,
      minute: eventMinute,
      type: eventType,
      teamId: eventTeamId,
      playerId: eventPlayerId,
      goalType: eventType === 'GOAL' ? goalType : undefined,
      cardReason:
        eventType === 'YELLOW_CARD' || eventType === 'RED_CARD' ? cardReason : undefined,
    };

    onSaveEvent(ev);
    if (!editingEvent) {
      setEventPlayerId('');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`p-5 rounded-2xl border space-y-4 ${
        editingEvent
          ? 'bg-amber-50/80 border-amber-300'
          : 'bg-slate-100/70 border-slate-200'
      }`}
    >
      <div className="flex items-center justify-between">
        <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
          {editingEvent ? (
            <>
              <Edit3 className="w-4 h-4 text-amber-600" /> Editar Evento Registrado
            </>
          ) : (
            <>
              <PlusCircle className="w-4 h-4 text-[#00A859]" /> Registrar Evento (Gol o Tarjeta)
            </>
          )}
        </h4>
        {editingEvent && onCancelEdit && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800"
          >
            <X className="w-3.5 h-3.5" /> Cancelar edicion
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Tipo de evento */}
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Tipo de Evento</label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value as EventType)}
            className="w-full bg-white text-slate-900 font-bold text-xs p-3 rounded-xl border border-slate-300"
          >
            <option value="GOAL">Gol Anotado</option>
            <option value="YELLOW_CARD">Tarjeta Amarilla</option>
            <option value="RED_CARD">Tarjeta Roja Directa</option>
          </select>
        </div>

        {/* Seleccion de equipo */}
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Equipo</label>
          <select
            value={eventTeamId}
            onChange={(e) => {
              setEventTeamId(e.target.value);
              setEventPlayerId('');
            }}
            className="w-full bg-white text-slate-900 font-bold text-xs p-3 rounded-xl border border-slate-300"
            required
          >
            <option value="">-- Seleccionar Equipo --</option>
            {homeTeam && <option value={homeTeam.id}>{homeTeam.name}</option>}
            {awayTeam && <option value={awayTeam.id}>{awayTeam.name}</option>}
          </select>
        </div>

        {/* Seleccion de jugador */}
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Jugador</label>
          <select
            value={eventPlayerId}
            onChange={(e) => setEventPlayerId(e.target.value)}
            className="w-full bg-white text-slate-900 font-bold text-xs p-3 rounded-xl border border-slate-300"
            disabled={!eventTeamId}
            required
          >
            <option value="">-- Seleccionar Jugador --</option>
            {eligiblePlayers.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.dorsal} {p.name} ({p.position})
                {isSusp(p) ? ' [Sancionado]' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Minuto */}
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Minuto</label>
          <input
            type="number"
            min="1"
            max="120"
            value={eventMinute}
            onChange={(e) => setEventMinute(Number(e.target.value))}
            className="w-full bg-white text-slate-900 font-bold text-xs p-3 rounded-xl border border-slate-300"
            required
          />
        </div>
      </div>

      {/* Sub-opciones especificas segun tipo */}
      {eventType === 'GOAL' && (
        <div className="flex items-center space-x-4 pt-2">
          <span className="text-xs font-bold text-slate-600">Tipo de Gol:</span>
          <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
            <input
              type="radio"
              name="goalType"
              checked={goalType === 'REGULAR'}
              onChange={() => setGoalType('REGULAR')}
            />
            <span>Jugada Normal</span>
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
            <input
              type="radio"
              name="goalType"
              checked={goalType === 'PENALTY'}
              onChange={() => setGoalType('PENALTY')}
            />
            <span>Penalti</span>
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer text-rose-600">
            <input
              type="radio"
              name="goalType"
              checked={goalType === 'OWN_GOAL'}
              onChange={() => setGoalType('OWN_GOAL')}
            />
            <span>Autogol</span>
          </label>
        </div>
      )}

      {(eventType === 'YELLOW_CARD' || eventType === 'RED_CARD') && (
        <div className="pt-2">
          <label className="block text-xs font-bold text-slate-600 mb-1">Motivo de la Tarjeta</label>
          <select
            value={cardReason}
            onChange={(e) => setCardReason(e.target.value as CardReason)}
            className="w-full bg-white text-slate-900 font-bold text-xs p-3 rounded-xl border border-slate-300"
          >
            <option value="UNSPORTING">Conducta antideportiva</option>
            <option value="DISSENT">Reclamo o desaprobacion al arbitro</option>
            <option value="REPEATED_FOULS">Infracciones persistentes</option>
            <option value="SERIOUS_FOUL">Juego brusco grave</option>
            <option value="VIOLENT_CONDUCT">Conducta violenta / Agresion</option>
          </select>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className={`flex-1 py-3 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition-colors ${
            editingEvent
              ? 'bg-amber-600 hover:bg-amber-700'
              : 'bg-[#00A859] hover:bg-emerald-700'
          }`}
        >
          {editingEvent ? 'Guardar Cambio' : '+ Agregar Evento a la Planilla'}
        </button>
        {editingEvent && onCancelEdit && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="px-4 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-colors"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
};
