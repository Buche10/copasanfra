'use client';

import React, { useState } from 'react';
import { Match, Team, Player } from '@/types';
import { TeamShield } from './TeamShield';
import { MatchDetailModal } from './MatchDetailModal';
import { MatchEditModal } from './MatchEditModal';
import { Calendar, MapPin, ChevronRight, ChevronLeft, Edit3, Trophy, ListOrdered, Clock, Coffee } from 'lucide-react';

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

  // Todos los partidos de la jornada (sin filtro de estado) — para fecha,
  // conteo y cálculo de quién descansa.
  const roundMatchesAll = regularMatches.filter((m) => m.round === effectiveRound);
  const roundDate = roundMatchesAll[0]?.date;
  const viewCategory = regularMatches[0]?.category;

  const regularForRound = roundMatchesAll.filter((m) => {
    if (statusFilter === 'ALL') return true;
    return m.status === statusFilter;
  });

  // Equipos de la categoría que NO juegan esta jornada (descansan). Ocurre en
  // categorías con número impar de equipos.
  const categoryTeamIds = new Set<string>();
  regularMatches.forEach((m) => {
    if (m.homeTeamId) categoryTeamIds.add(m.homeTeamId);
    if (m.awayTeamId) categoryTeamIds.add(m.awayTeamId);
  });
  const playingIds = new Set<string>();
  roundMatchesAll.forEach((m) => {
    if (m.homeTeamId) playingIds.add(m.homeTeamId);
    if (m.awayTeamId) playingIds.add(m.awayTeamId);
  });
  const restingTeams = [...categoryTeamIds]
    .filter((id) => !playingIds.has(id))
    .map((id) => teamMap.get(id))
    .filter(Boolean) as Team[];

  const emptySlot = (
    <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-dashed border-slate-300 shrink-0" />
  );

  // Match card (reused in both phases). `compact` esconde fecha/categoría
  // (se muestran en el encabezado de la jornada en la fase regular).
  const renderMatch = (m: Match, compact = false) => {
    const home = m.homeTeamId ? teamMap.get(m.homeTeamId) : undefined;
    const away = m.awayTeamId ? teamMap.get(m.awayTeamId) : undefined;
    const accent = `linear-gradient(90deg, ${home?.primaryColor || '#00A859'}, ${away?.primaryColor || '#0f172a'})`;

    return (
      <div
        key={m.id}
        className="group relative bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden"
      >
        {/* Accent bar con los colores de ambos equipos */}
        <div className="h-1.5 w-full" style={{ background: accent }} />

        <div className="p-4 sm:p-5">
          {/* Meta row: horario, cancha (+fecha/categoría si no es compacto) + estado */}
          <div className="flex items-start justify-between gap-2 mb-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-black text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg">
                <Clock className="w-3.5 h-3.5 text-[#00A859]" /> {m.time || '--:--'}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                <MapPin className="w-3.5 h-3.5 text-rose-600" /> {m.stadium || 'Cancha 1'}
              </span>
              {!compact && m.date && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                  <Calendar className="w-3.5 h-3.5 text-[#00A859]" /> {m.date}
                </span>
              )}
              {!compact && m.category && (
                <span className="text-[10px] font-extrabold bg-slate-900 text-white px-2 py-1 rounded-lg">{m.category}</span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {m.status === 'FINISHED' && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-[#00A859]">Final</span>
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

          {/* Teams row (disposición vertical y centrada) */}
          <div
            onClick={() => setSelectedMatch(m)}
            className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 sm:gap-3 cursor-pointer"
          >
            {/* Home */}
            <div className="flex flex-col items-center text-center gap-2 min-w-0">
              {home ? (
                <TeamShield logoKey={home.logo} name={home.name} shortName={home.shortName} size="lg" />
              ) : emptySlot}
              <span className="text-xs sm:text-sm font-extrabold text-slate-900 leading-tight line-clamp-2">
                {home?.name || 'Por definir'}
              </span>
            </div>

            {/* Center: score o VS */}
            <div className="flex flex-col items-center justify-center pt-2 px-1">
              {m.status === 'SCHEDULED' ? (
                <span className="text-sm font-black text-slate-400 bg-slate-100 px-3.5 py-2 rounded-2xl">VS</span>
              ) : (
                <div className="flex items-center gap-1.5 text-2xl sm:text-3xl font-black text-slate-900">
                  <span className="bg-slate-100 rounded-xl px-2.5 py-1 min-w-[2.25rem] text-center">{m.homeScore}</span>
                  <span className="text-slate-300 text-lg">-</span>
                  <span className="bg-slate-100 rounded-xl px-2.5 py-1 min-w-[2.25rem] text-center">{m.awayScore}</span>
                </div>
              )}
            </div>

            {/* Away */}
            <div className="flex flex-col items-center text-center gap-2 min-w-0">
              {away ? (
                <TeamShield logoKey={away.logo} name={away.name} shortName={away.shortName} size="lg" />
              ) : emptySlot}
              <span className="text-xs sm:text-sm font-extrabold text-slate-900 leading-tight line-clamp-2">
                {away?.name || 'Por definir'}
              </span>
            </div>
          </div>

          {/* Footer CTA */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-center">
            <button
              onClick={() => setSelectedMatch(m)}
              className="text-xs font-bold text-[#00A859] hover:text-emerald-700 flex items-center gap-1 group-hover:gap-1.5 transition-all"
            >
              Ver Planilla <ChevronRight className="w-4 h-4" />
            </button>
          </div>
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

          {/* Round summary: fecha, conteo y quién descansa */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-3xl border border-slate-200 shadow-sm p-4 sm:p-5">
            <div className="min-w-0">
              {viewCategory && (
                <div className="text-[11px] font-black text-[#00A859] uppercase tracking-wide">{viewCategory}</div>
              )}
              <div className="flex items-baseline gap-2 flex-wrap">
                <h3 className="text-xl font-black text-slate-900">Jornada {effectiveRound}</h3>
                {roundDate && <span className="text-xs font-bold text-slate-500">{roundDate}</span>}
              </div>
              <div className="text-xs text-slate-500 font-semibold">
                {roundMatchesAll.length} {roundMatchesAll.length === 1 ? 'partido' : 'partidos'}
              </div>
            </div>

            {restingTeams.length > 0 && (
              <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl px-3.5 py-2 shrink-0">
                <Coffee className="w-5 h-5 text-amber-600 shrink-0" />
                <div className="text-xs">
                  <span className="font-black text-amber-800 uppercase text-[10px] block leading-tight">Descansa esta fecha</span>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    {restingTeams.map((t) => (
                      <span key={t.id} className="inline-flex items-center gap-1 font-black text-slate-800">
                        <TeamShield logoKey={t.logo} name={t.name} shortName={t.shortName} size="sm" />
                        {t.shortName}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {regularForRound.length > 0 ? (
              regularForRound.map((m) => renderMatch(m, true))
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
                {playoffMatches.filter((m) => m.playoffStage === stage).map((m) => renderMatch(m, false))}
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
