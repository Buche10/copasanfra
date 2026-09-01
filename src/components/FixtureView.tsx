'use client';

import React, { useState } from 'react';
import { Match, Team, Player } from '@/types';
import { TeamShield } from './TeamShield';
import { MatchDetailModal } from './MatchDetailModal';
import { MatchEditModal } from './MatchEditModal';
import { Calendar, MapPin, ChevronRight, ChevronLeft, Edit3 } from 'lucide-react';

interface FixtureViewProps {
  matches: Match[];
  teams: Team[];
  players: Player[];
  onSelectTeam?: (team: Team) => void;
  onGenerateFixture?: () => void;
  onUpdateMatch?: (updatedMatch: Match) => void;
}

export const FixtureView: React.FC<FixtureViewProps> = ({
  matches,
  teams,
  players,
  onGenerateFixture,
  onUpdateMatch,
}) => {
  const [selectedRound, setSelectedRound] = useState<number>(1);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'FINISHED' | 'IN_PROGRESS' | 'SCHEDULED'>('ALL');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);

  const teamMap = new Map(teams.map((t) => [t.id, t]));

  // Get max round available
  const rounds = Array.from(new Set(matches.map((m) => m.round))).sort((a, b) => a - b);
  if (rounds.length === 0) rounds.push(1);

  // Filter matches
  const filteredMatches = matches.filter((m) => {
    const matchRound = m.round === selectedRound;
    if (!matchRound) return false;
    if (statusFilter === 'ALL') return true;
    return m.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 rounded-3xl text-white shadow-xl relative overflow-hidden">
        <div className="space-y-1 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#00A859]/20 text-[#00A859] border border-[#00A859]/30 text-xs font-bold uppercase tracking-wider">
            <Calendar className="w-3.5 h-3.5 text-[#00A859]" />
            <span>Calendario de Partidos</span> • <span>Tungurahua</span>
          </div>
          <h2 className="text-2xl font-black tracking-tight">Fixture y Resultados</h2>
          <p className="text-slate-300 text-sm">
            Consulta la programación oficial de Cancha 1 y Cancha 2, horarios y resultados.
          </p>
        </div>

        {/* Navigation & Round Selector Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 relative z-10 w-full md:w-auto">
          {/* Quick Dropdown for Jump to Round */}
          <div className="flex items-center gap-1.5 bg-slate-800 p-1.5 rounded-2xl border border-slate-700">
            <button
              onClick={() => {
                const currentIndex = rounds.indexOf(selectedRound);
                if (currentIndex > 0) setSelectedRound(rounds[currentIndex - 1]);
              }}
              disabled={rounds.indexOf(selectedRound) === 0}
              className="p-2 text-slate-300 hover:text-white disabled:opacity-30 disabled:hover:text-slate-300 rounded-xl hover:bg-slate-700 transition-colors"
              title="Jornada Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <select
              value={selectedRound}
              onChange={(e) => setSelectedRound(Number(e.target.value))}
              className="bg-slate-900 text-white font-black text-xs px-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-[#00A859]"
            >
              {rounds.map((r, index) => {
                const isLastRound = index === rounds.length - 1;
                const isPenultimate = index === rounds.length - 2;
                const isAntepenultimate = index === rounds.length - 3;
                const currentCat = matches[0]?.category;

                let label = `Jornada ${r}`;
                if (currentCat === 'Damas' || currentCat === '+50 Varones') {
                  if (isLastRound && rounds.length > 1) label = `🏆 Gran Final (Jornada ${r})`;
                } else {
                  if (rounds.length > 3) {
                    if (isAntepenultimate) label = `⚡ Cuartos de Final (Jornada ${r})`;
                    else if (isPenultimate) label = `🔥 Semifinales (Jornada ${r})`;
                    else if (isLastRound) label = `🏆 Gran Final (Jornada ${r})`;
                  }
                }

                return (
                  <option key={r} value={r}>
                    {label}
                  </option>
                );
              })}
            </select>

            <button
              onClick={() => {
                const currentIndex = rounds.indexOf(selectedRound);
                if (currentIndex < rounds.length - 1) setSelectedRound(rounds[currentIndex + 1]);
              }}
              disabled={rounds.indexOf(selectedRound) === rounds.length - 1}
              className="p-2 text-slate-300 hover:text-white disabled:opacity-30 disabled:hover:text-slate-300 rounded-xl hover:bg-slate-700 transition-colors"
              title="Siguiente Jornada"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Round Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-xs sm:max-w-md scrollbar-thin">
            {rounds.map((r, index) => {
              const isLastRound = index === rounds.length - 1;
              const isPenultimate = index === rounds.length - 2;
              const isAntepenultimate = index === rounds.length - 3;
              const currentCat = matches[0]?.category;

              let label = `J${r}`;

              if (currentCat === 'Damas' || currentCat === '+50 Varones') {
                if (isLastRound && rounds.length > 1) label = '🏆 Final';
              } else {
                if (rounds.length > 3) {
                  if (isAntepenultimate) label = '⚡ Cuartos';
                  else if (isPenultimate) label = '🔥 Semis';
                  else if (isLastRound) label = '🏆 Final';
                }
              }
              
              return (
                <button
                  key={r}
                  onClick={() => setSelectedRound(r)}
                  className={`px-3 py-1.5 text-xs font-black rounded-xl whitespace-nowrap transition-all ${
                    selectedRound === r
                      ? isLastRound
                        ? 'bg-amber-500 text-slate-950 shadow-md scale-105'
                        : 'bg-[#00A859] text-white shadow-md scale-105'
                      : isLastRound
                      ? 'bg-amber-400/20 text-amber-300 hover:bg-amber-400/30'
                      : 'bg-white/10 hover:bg-white/20 text-slate-200'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between bg-white p-2 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
              statusFilter === 'ALL' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Todos los Partidos
          </button>
          <button
            onClick={() => setStatusFilter('FINISHED')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
              statusFilter === 'FINISHED' ? 'bg-[#00A859] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Finalizados
          </button>
          <button
            onClick={() => setStatusFilter('IN_PROGRESS')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
              statusFilter === 'IN_PROGRESS' ? 'bg-[#DC2626] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            En Vivo
          </button>
          <button
            onClick={() => setStatusFilter('SCHEDULED')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
              statusFilter === 'SCHEDULED' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Programados
          </button>
        </div>

        <div className="flex items-center space-x-3">
          {onGenerateFixture && (
            <button
              onClick={() => {
                if (window.confirm('¿Deseas generar un nuevo calendario aleatorio de partidos (Round-Robin) para todas las categorías?')) {
                  onGenerateFixture();
                }
              }}
              className="px-3.5 py-1.5 bg-[#00A859] hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5"
            >
              🎲 Generar Fixture Aleatorio
            </button>
          )}
          <span className="text-xs font-semibold text-slate-500 px-2 hidden sm:inline">
            Mostrando {filteredMatches.length} partidos
          </span>
        </div>
      </div>

      {/* Matches Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredMatches.map((m) => {
          const home = teamMap.get(m.homeTeamId);
          const away = teamMap.get(m.awayTeamId);

          return (
            <div
              key={m.id}
              className="glass-card rounded-3xl p-5 border border-slate-200 shadow-md hover:shadow-xl transition-all group relative overflow-hidden"
            >
              {/* Top Bar Info */}
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
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-[#00A859]">
                      Finalizado
                    </span>
                  )}
                  {m.status === 'IN_PROGRESS' && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-600 text-white animate-pulse">
                      EN VIVO
                    </span>
                  )}
                  {m.status === 'SCHEDULED' && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">
                      Por Jugar
                    </span>
                  )}

                  {onUpdateMatch && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingMatch(m);
                      }}
                      className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                      title="Editar Horario y Cancha"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Score Display / Click to open details */}
              <div 
                onClick={() => setSelectedMatch(m)}
                className="flex items-center justify-between py-2 cursor-pointer"
              >
                {/* Home */}
                <div className="flex-1 flex items-center space-x-3">
                  <TeamShield logoKey={home?.logo} name={home?.name || ''} shortName={home?.shortName} size="md" />
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-sm">{home?.name}</h4>
                    <span className="text-[11px] text-slate-400 font-semibold">Local</span>
                  </div>
                </div>

                {/* Score */}
                <div className="px-4 text-center">
                  {m.status === 'SCHEDULED' ? (
                    <span className="text-xs font-black text-slate-400 bg-slate-100 px-3 py-1.5 rounded-xl">
                      VS
                    </span>
                  ) : (
                    <div className="flex items-center gap-2 text-2xl font-black text-slate-900 bg-slate-100 px-4 py-1.5 rounded-2xl">
                      <span>{m.homeScore}</span>
                      <span className="text-slate-400 text-base font-normal">-</span>
                      <span>{m.awayScore}</span>
                    </div>
                  )}
                </div>

                {/* Away */}
                <div className="flex-1 flex items-center justify-end space-x-3 text-right">
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-sm">{away?.name}</h4>
                    <span className="text-[11px] text-slate-400 font-semibold">Visitante</span>
                  </div>
                  <TeamShield logoKey={away?.logo} name={away?.name || ''} shortName={away?.shortName} size="md" />
                </div>
              </div>

              {/* Stadium & Footer */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1 font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-xl truncate max-w-[240px]">
                  <MapPin className="w-3.5 h-3.5 text-rose-600 shrink-0" /> {m.stadium || 'Cancha 1'}
                </span>
                
                <div className="flex items-center space-x-2">
                  {onUpdateMatch && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingMatch(m);
                      }}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                    >
                      <Edit3 className="w-3 h-3" /> Editar
                    </button>
                  )}
                  <span 
                    onClick={() => setSelectedMatch(m)}
                    className="font-bold text-[#00A859] group-hover:translate-x-1 transition-transform flex items-center gap-0.5 cursor-pointer"
                  >
                    Ver Planilla <ChevronRight className="w-4 h-4" />
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

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
