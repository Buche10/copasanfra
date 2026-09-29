'use client';

import React from 'react';
import { MatchEvent, Player, Team } from '@/types';
import { Trash2, Edit2 } from 'lucide-react';

interface MatchEventsListProps {
  events: MatchEvent[];
  playerMap: Map<string, Player>;
  teamMap: Map<string, Team>;
  canEdit?: boolean;
  canDelete?: boolean;
  onEdit?: (ev: MatchEvent) => void;
  onDelete?: (eventId: string) => void;
}

export const MatchEventsList: React.FC<MatchEventsListProps> = ({
  events,
  playerMap,
  teamMap,
  canEdit = false,
  canDelete = false,
  onEdit,
  onDelete,
}) => {
  return (
    <div className="space-y-3">
      <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-wider">
        Eventos Registrados en Planilla ({events.length})
      </h4>

      {events.length === 0 ? (
        <div className="p-6 text-center text-slate-400 text-xs italic bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          No se han registrado eventos aun en esta hoja de control.
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((ev) => {
            const player = playerMap.get(ev.playerId);
            const team = teamMap.get(ev.teamId);

            const eventLabel =
              ev.type === 'GOAL'
                ? ev.goalType === 'OWN_GOAL'
                  ? 'Autogol'
                  : ev.goalType === 'PENALTY'
                  ? 'Gol (Penalti)'
                  : 'Gol (Normal)'
                : ev.type === 'YELLOW_CARD'
                ? 'Tarjeta Amarilla'
                : ev.type === 'RED_CARD'
                ? 'Tarjeta Roja'
                : 'Cambio';

            return (
              <div
                key={ev.id}
                className="flex items-center justify-between p-3 bg-white rounded-2xl border border-slate-200 text-xs shadow-xs"
              >
                <div className="flex items-center space-x-3">
                  <span className="w-8 h-8 rounded-xl bg-slate-900 text-white font-black flex items-center justify-center shrink-0">
                    {ev.minute}&apos;
                  </span>
                  <div>
                    <span className="font-black text-slate-900 mr-2">{eventLabel}</span>
                    <span className="font-bold text-slate-700">
                      {player?.name || 'Jugador'} (#{player?.dorsal ?? '?'})
                    </span>
                    <span className="text-slate-400 ml-2 font-medium">
                      ({team?.shortName || 'Equipo'})
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {canEdit && onEdit && (
                    <button
                      type="button"
                      onClick={() => onEdit(ev)}
                      className="p-2 text-slate-400 hover:text-amber-600 rounded-lg hover:bg-amber-50 transition-colors"
                      title="Editar Evento"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                  {canDelete && onDelete && (
                    <button
                      type="button"
                      onClick={() => onDelete(ev.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                      title="Eliminar Evento"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
