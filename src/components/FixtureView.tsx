'use client';

import React, { useState } from 'react';
import { Match, Team, Player } from '@/types';
import { TeamShield } from './TeamShield';
import { MatchDetailModal } from './MatchDetailModal';
import { MatchEditModal } from './MatchEditModal';
import { Calendar, MapPin, ChevronRight, ChevronLeft, Edit3, Trophy, ListOrdered } from 'lucide-react';

interface FixtureViewProps {
  matches: Match[];
  teams: Team[];
  players: Player[];
  onSelectTeam?: (team: Team) => void;
  onGenerateFixture?: () => void;
  onUpdateMatch?: (updatedMatch: Match) => void;
}

const STAGE_LABEL: Record<string, string> = {
  CUARTOS: '⚡ Cuartos de Final',
  SEMIS: '🔥 Semifinales',
  FINAL: '🏆 Gran Final',
};
const STAGE_ORDER = ['CUARTOS', 'SEMIS', 'FINAL'];

export const FixtureView: React.FC<FixtureViewProps> = ({
  matches,
  teams,
  players,
  onGenerateFixture,
  onUpdateMatch,
}) => {
  const [phase, setPhase] = useState<'REGULAR' | 'PLAYOFFS'>('REGULAR');
  const [selectedRound, setSelectedRound] = useState<number>(1);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'FINISHED' | 'IN_PROGRESS' | 'SCHEDULED'>('ALL');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);

  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const regularMatches = matches.filter((m) => !m.isPlayoff);
  const playoffMatches = matches.filter((m) => m.isPlayoff);
  const hasPlayoffs = playoffMatches.length > 0;

  // Regular-season rounds
  const rounds = Array.from(new Set(regularMatches.map((m) => m.round))).sort((a, b) => a - b);
  if (rounds.length === 0) rounds.push(1);
  const effectiveRound = rounds.includes(selectedRound) ? selectedRound : rounds[0];

  const regularForRound = regularMatches.filter((m) => {
    if (m.round !== effectiveRound) return false;
    if (statusFilter === 'ALL') return true;
    return m.status === statusFilter;
  });

  // Match card (reused in both phases). Handles "Por definir" (empty team).
  const renderMatch = (m: Match) => {
    const home = m.homeTeamId ? teamMap.get(m.homeTeamId) : undefined;
    const away = m.awayTeamId ? teamMap.get(m.awayTeamId) : undefined;
    return (
      <div
        key={m.id}
        className="glass-card rounded-3xl p-5 border border-slate-200 shadow-md hover:shadow-xl transition-all group relative overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4 text-xs">
          <div className="flex items-center space-x-2 text-slate-700 font-bold">
            <span className="flex items-center gap-1 text-slate-900 bg-slate-100 px-2.5 py-1 rounded-xl">
              <Calendar className="w-3.5 h-3.5 text-[#00A859]" /> {m.date} - {m.time}
            </span>
            {m.category && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                {m.category}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {m.status === 'FINISHED' && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-[#00A859]">Finalizado</span>
            )}
            {m.status === 'IN_PROGRESS' && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-600 text-white animate-pulse">EN VIVO</span>
            )}
            {m.status === 'SCHEDULED' && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">Por Jugar</span>
            )}
            {onUpdateMatch && (
              <button
                onClick={(e) => { e.stopPropagation(); setEditingMatch(m); }}
                className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                title="Editar Horario y Cancha"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div onClick={() => setSelectedMatch(m)} className="flex items-center justify-between py-2 cursor-pointer">
          {/* Home */}
          <div className="flex-1 flex items-center space-x-3 min-w-0">
            {home ? (
              <TeamShield logoKey={home.logo} name={home.name} shortName={home.shortName} size="md" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-slate-100 border border-dashed border-slate-300 shrink-0" />
            )}
            <div className="min-w-0">
              <h4 className="font-extrabold text-slate-900 text-sm truncate">{home?.name || 'Por definir'}</h4>
              <span className="text-[11px] text-slate-400 font-semibold">Local</span>
            </div>
          </div>

          {/* Score */}
          <div className="px-3 text-center shrink-0">
            {m.status === 'SCHEDULED' ? (
              <span className="text-xs font-black text-slate-400 bg-slate-100 px-3 py-1.5 rounded-xl">VS</span>
            ) : (
              <div className="flex items-center gap-2 text-2xl font-black text-slate-900 bg-slate-100 px-4 py-1.5 rounded-2xl">
                <span>{m.homeScore}</span>
                <span className="text-slate-400 text-base font-normal">-</span>
                <span>{m.awayScore}</span>
              </div>
            )}
          </div>

          {/* Away */}
          <div className="flex-1 flex items-center justify-end space-x-3 text-right min-w-0">
            <div className="min-w-0">
              <h4 className="font-extrabold text-slate-900 text-sm truncate">{away?.name || 'Por definir'}</h4>
              <span className="text-[11px] text-slate-400 font-semibold">Visitante</span>
            </div>
            {away ? (
              <TeamShield logoKey={away.logo} name={away.name} shortName={away.shortName} size="md" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-slate-100 border border-dashed border-slate-300 shrink-0" />
            )}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1 font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-xl truncate max-w-[240px]">
            <MapPin className="w-3.5 h-3.5 text-rose-600 shrink-0" /> {m.stadium || 'Cancha 1'}
          </span>
          <span
            onClick={() => setSelectedMatch(m)}
            className="font-bold text-[#00A859] group-hover:translate-x-1 transition-transform flex items-center gap-0.5 cursor-pointer"
          >
            Ver Planilla <ChevronRight className="w-4 h-4" />
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 rounded-3xl text-white shadow-xl relative overflow-hidden space-y-4">
        <div className="space-y-1 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#00A859]/20 text-[#00A859] border border-[#00A859]/30 text-xs font-bold uppercase tracking-wider">
            <Calendar className="w-3.5 h-3.5 text-[#00A859]" />
            <span>Calendario de Partidos</span> • <span>Tungurahua</span>
          </div>
          <h2 className="text-2xl font-black tracking-tight">Fixture y Resultados</h2>
        </div>

        {/* Phase toggle */}
        <div className="flex items-center gap-2 relative z-10">
          <button
            onClick={() => setPhase('REGULAR')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-black transition-all ${
              phase === 'REGULAR' ? 'bg-[#00A859] text-white shadow-md' : 'bg-white/10 text-slate-200 hover:bg-white/20'
            }`}
          >
            <ListOrdered className="w-4 h-4" /> Fase Regular
          </button>
          {hasPlayoffs && (
            <button
              onClick={() => setPhase('PLAYOFFS')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-black transition-all ${
                phase === 'PLAYOFFS' ? 'bg-amber-500 text-slate-950 shadow-md' : 'bg-white/10 text-slate-200 hover:bg-white/20'
              }`}
            >
              <Trophy className="w-4 h-4" /> Play Offs
            </button>
          )}
        </div>
      </div>

      {phase === 'REGULAR' ? (
        <>
          {/* Round selector + status filter */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl">
              <button
                onClick={() => {
                  const i = rounds.indexOf(effectiveRound);
                  if (i > 0) setSelectedRound(rounds[i - 1]);
                }}
                disabled={rounds.indexOf(effectiveRound) === 0}
                className="p-2 text-slate-500 hover:text-slate-900 disabled:opacity-30 rounded-xl hover:bg-white transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <select
                value={effectiveRound}
                onChange={(e) => setSelectedRound(Number(e.target.value))}
                className="bg-white text-slate-900 font-black text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#00A859]"
              >
                {rounds.map((r) => (
                  <option key={r} value={r}>Jornada {r}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  const i = rounds.indexOf(effectiveRound);
                  if (i < rounds.length - 1) setSelectedRound(rounds[i + 1]);
                }}
                disabled={rounds.indexOf(effectiveRound) === rounds.length - 1}
                className="p-2 text-slate-500 hover:text-slate-900 disabled:opacity-30 rounded-xl hover:bg-white transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
              {(['ALL', 'FINISHED', 'IN_PROGRESS', 'SCHEDULED'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
                    statusFilter === s ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {s === 'ALL' ? 'Todos' : s === 'FINISHED' ? 'Finalizados' : s === 'IN_PROGRESS' ? 'En Vivo' : 'Programados'}
                </button>
              ))}
              {onGenerateFixture && (
                <button
                  onClick={() => {
                    if (window.confirm('¿Generar un nuevo calendario aleatorio (Round-Robin) para todas las categorías? Reemplaza el calendario actual.')) {
                      onGenerateFixture();
                    }
                  }}
                  className="ml-1 px-3 py-1.5 bg-[#00A859] hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all whitespace-nowrap"
                >
                  🎲 Generar
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {regularForRound.length > 0 ? (
              regularForRound.map(renderMatch)
            ) : (
              <div className="col-span-full text-center py-10 text-slate-400 text-sm bg-white rounded-2xl border border-slate-200">
                No hay partidos en esta jornada.
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-6">
          {STAGE_ORDER.filter((stage) => playoffMatches.some((m) => m.playoffStage === stage)).map((stage) => (
            <div key={stage} className="space-y-3">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <span>{STAGE_LABEL[stage]}</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {playoffMatches.filter((m) => m.playoffStage === stage).map(renderMatch)}
              </div>
            </div>
          ))}
          <p className="text-xs text-slate-500 text-center bg-white p-3 rounded-2xl border border-slate-200">
            El cuadro se arma solo con las posiciones de la fase regular y avanza con los ganadores. Si un partido queda empatado, defínelo a mano en <strong>Editar</strong>.
          </p>
        </div>
      )}

      {/* Match Detail Modal */}
      {selectedMatch && (
        <MatchDetailModal
          match={selectedMatch}
          teams={teams}
          players={players}
          onClose={() => setSelectedMatch(null)}
        />
      )}

      {/* Match Edit Schedule/Cancha Modal */}
      {editingMatch && onUpdateMatch && (
        <MatchEditModal
          match={editingMatch}
          teams={teams}
          onSave={onUpdateMatch}
          onClose={() => setEditingMatch(null)}
        />
      )}
    </div>
  );
};
