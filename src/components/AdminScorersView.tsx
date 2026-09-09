'use client';

import React, { useMemo, useState } from 'react';
import { Match, Team, Player, MatchEvent } from '@/types';
import { TeamShield } from './TeamShield';
import { Goal, Save } from 'lucide-react';

interface AdminScorersViewProps {
  matches: Match[];
  teams: Team[];
  players: Player[];
  onUpdateMatch: (match: Match) => void;
}

export const AdminScorersView: React.FC<AdminScorersViewProps> = ({ matches, teams, players, onUpdateMatch }) => {
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const rounds = useMemo(() => [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b), [matches]);
  const [round, setRound] = useState<number | null>(null);
  const eff = round != null && rounds.includes(round) ? round : rounds[0] ?? null;

  // Solo partidos jugados (con marcador) de la fecha.
  const inRound = useMemo(
    () =>
      matches
        .filter((m) => (eff == null || m.round === eff) && m.homeTeamId && m.awayTeamId)
        .filter((m) => m.status !== 'SCHEDULED' && m.homeScore + m.awayScore > 0)
        .sort(
          (a, b) =>
            (a.category || '').localeCompare(b.category || '') || (a.time || '').localeCompare(b.time || '')
        ),
    [matches, eff]
  );

  // Borrador de goleadores por partido: { matchId: { home: playerId[], away: playerId[] } }
  const [draft, setDraft] = useState<Record<string, { home: string[]; away: string[] }>>({});
  const [savedId, setSavedId] = useState<string | null>(null);

  const goalsOf = (m: Match, teamId: string) =>
    m.events.filter((e) => e.type === 'GOAL' && e.teamId === teamId).map((e) => e.playerId);

  const slots = (m: Match, side: 'home' | 'away'): string[] => {
    if (draft[m.id]) return draft[m.id][side];
    const score = side === 'home' ? m.homeScore : m.awayScore;
    const teamId = side === 'home' ? m.homeTeamId : m.awayTeamId;
    const existing = goalsOf(m, teamId);
    return Array.from({ length: score }, (_, i) => existing[i] ?? '');
  };

  const setSlot = (m: Match, side: 'home' | 'away', idx: number, value: string) => {
    setDraft((d) => {
      const cur = d[m.id] ?? { home: slots(m, 'home'), away: slots(m, 'away') };
      const arr = [...cur[side]];
      arr[idx] = value;
      return { ...d, [m.id]: { ...cur, [side]: arr } };
    });
    setSavedId(null);
  };

  const save = (m: Match) => {
    const homeSlots = slots(m, 'home');
    const awaySlots = slots(m, 'away');
    // Conserva tarjetas y demás eventos; reemplaza solo los goles.
    const nonGoals = m.events.filter((e) => e.type !== 'GOAL');
    const mkGoals = (playerIds: string[], teamId: string): MatchEvent[] =>
      playerIds
        .filter((pid) => pid) // vacío = autogol / sin anotador → no crea goleador
        .map((pid) => ({
          id: `ev-${crypto.randomUUID()}`,
          matchId: m.id,
          minute: 0,
          type: 'GOAL' as const,
          teamId,
          playerId: pid,
          goalType: 'REGULAR' as const,
        }));
    const events = [
      ...nonGoals,
      ...mkGoals(homeSlots, m.homeTeamId),
      ...mkGoals(awaySlots, m.awayTeamId),
    ];
    // El marcador NO cambia: se conserva homeScore/awayScore.
    onUpdateMatch({ ...m, events });
    setSavedId(m.id);
  };

  const rosterOf = (teamId: string) =>
    players.filter((p) => p.teamId === teamId).sort((a, b) => a.dorsal - b.dorsal);

  if (rounds.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-10 text-center">
        <Goal className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h3 className="text-lg font-black text-slate-800">Sin partidos</h3>
      </div>
    );
  }

  const teamGoalColumn = (m: Match, side: 'home' | 'away') => {
    const teamId = side === 'home' ? m.homeTeamId : m.awayTeamId;
    const roster = rosterOf(teamId);
    const arr = slots(m, side);
    if (arr.length === 0) {
      return <p className="text-xs text-slate-400 italic">Sin goles.</p>;
    }
    return (
      <div className="space-y-1.5">
        {arr.map((pid, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 w-9 shrink-0">Gol {i + 1}</span>
            <select
              value={pid}
              onChange={(e) => setSlot(m, side, i, e.target.value)}
              className="flex-1 bg-slate-50 text-slate-900 font-bold text-xs p-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#00A859]"
            >
              <option value="">— Autogol / sin anotador —</option>
              {roster.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.dorsal} {p.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-5 sm:p-6 text-white shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#00A859]/20 flex items-center justify-center shrink-0">
            <Goal className="w-6 h-6 text-[#00A859]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-black tracking-tight leading-tight">Cargar Goleadores</h2>
            <p className="text-xs sm:text-sm text-white/80 font-medium">
              Elige quién anotó cada gol. El marcador no cambia; solo se registran los goleadores.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 p-1.5 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-x-auto scrollbar-none">
        {rounds.map((r) => (
          <button
            key={r}
            onClick={() => setRound(r)}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all ${
              eff === r ? 'bg-[#00A859] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Fecha {r}
          </button>
        ))}
      </div>

      {inRound.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-8 text-center text-sm text-slate-500">
          No hay partidos con marcador en esta fecha. Carga primero los resultados en la pestaña <strong>Resultados</strong>.
        </div>
      ) : (
        <div className="space-y-4">
          {inRound.map((m) => {
            const home = teamMap.get(m.homeTeamId);
            const away = teamMap.get(m.awayTeamId);
            return (
              <div key={m.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50/70">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-extrabold bg-slate-900 text-white px-2 py-0.5 rounded">{m.category}</span>
                    <TeamShield logoKey={home?.logo} name={home?.name || ''} size="sm" />
                    <span className="text-sm font-black text-slate-800 truncate">{home?.shortName}</span>
                    <span className="text-sm font-black text-slate-900">{m.homeScore} - {m.awayScore}</span>
                    <span className="text-sm font-black text-slate-800 truncate">{away?.shortName}</span>
                    <TeamShield logoKey={away?.logo} name={away?.name || ''} size="sm" />
                  </div>
                  <button
                    onClick={() => save(m)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#00A859] hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl transition-colors shrink-0"
                  >
                    <Save className="w-4 h-4" /> {savedId === m.id ? 'Guardado ✓' : 'Guardar goleadores'}
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                  <div className="space-y-2">
                    <h4 className="text-xs font-black text-slate-700 uppercase truncate">{home?.name}</h4>
                    {teamGoalColumn(m, 'home')}
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-xs font-black text-slate-700 uppercase truncate">{away?.name}</h4>
                    {teamGoalColumn(m, 'away')}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
