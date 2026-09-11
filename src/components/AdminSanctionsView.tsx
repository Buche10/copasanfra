'use client';

import React, { useMemo, useState } from 'react';
import { Match, Team, Player, MatchEvent } from '@/types';
import { TeamShield } from './TeamShield';
import { Plus, Trash2, Search, Ban, CreditCard, ShieldAlert } from 'lucide-react';

interface AdminSanctionsViewProps {
  matches: Match[];
  teams: Team[];
  players: Player[];
  onUpdateMatch: (match: Match) => void;
  onUpdatePlayer: (player: Player) => void;
}

// ---------- Editor de tarjetas de UN partido ----------
const MatchCardsEditor: React.FC<{
  match: Match;
  teamMap: Map<string, Team>;
  players: Player[];
  onUpdateMatch: (m: Match) => void;
}> = ({ match, teamMap, players, onUpdateMatch }) => {
  const [teamId, setTeamId] = useState(match.homeTeamId);
  const [playerId, setPlayerId] = useState('');
  const [type, setType] = useState<'YELLOW_CARD' | 'RED_CARD'>('YELLOW_CARD');
  const [minute, setMinute] = useState('');

  const roster = players.filter((p) => p.teamId === teamId).sort((a, b) => a.dorsal - b.dorsal);
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const cards = match.events.filter((e) => e.type === 'YELLOW_CARD' || e.type === 'RED_CARD');

  const add = () => {
    if (!playerId) return;
    const ev: MatchEvent = {
      id: `ev-${crypto.randomUUID()}`,
      matchId: match.id,
      minute: parseInt(minute, 10) || 0,
      type,
      teamId,
      playerId,
      cardReason: 'UNSPORTING',
    };
    onUpdateMatch({ ...match, events: [...match.events, ev] });
    setPlayerId('');
    setMinute('');
  };

  const remove = (id: string) => onUpdateMatch({ ...match, events: match.events.filter((e) => e.id !== id) });

  const field = 'bg-slate-50 text-slate-900 font-bold text-xs p-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#00A859]';

  return (
    <div className="p-4 space-y-3">
      {/* Tarjetas actuales */}
      {cards.length === 0 ? (
        <p className="text-xs text-slate-400 italic">Sin tarjetas registradas.</p>
      ) : (
        <ul className="space-y-1.5">
          {cards.map((ev) => {
            const pl = playerMap.get(ev.playerId);
            const tm = teamMap.get(ev.teamId);
            const isRed = ev.type === 'RED_CARD';
            return (
              <li key={ev.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-2.5 py-1.5 text-xs">
                <span className="flex items-center gap-2 min-w-0">
                  <span className={`inline-block w-3 h-4 rounded-sm shrink-0 ${isRed ? 'bg-rose-600' : 'bg-amber-400'}`} />
                  <span className="font-bold text-slate-800 truncate">#{pl?.dorsal} {pl?.name || 'Jugador'}</span>
                  <span className="text-slate-400">({tm?.shortName})</span>
                  <span className="text-slate-400">{ev.minute ? `${ev.minute}'` : ''}</span>
                </span>
                <button onClick={() => remove(ev.id)} className="p-1 text-slate-400 hover:text-rose-600 rounded" title="Quitar">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Agregar tarjeta */}
      <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
        <select value={teamId} onChange={(e) => { setTeamId(e.target.value); setPlayerId(''); }} className={field}>
          <option value={match.homeTeamId}>{teamMap.get(match.homeTeamId)?.shortName}</option>
          <option value={match.awayTeamId}>{teamMap.get(match.awayTeamId)?.shortName}</option>
        </select>
        <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className={`${field} flex-1 min-w-[140px]`}>
          <option value="">— Jugador —</option>
          {roster.map((p) => (
            <option key={p.id} value={p.id}>#{p.dorsal} {p.name}</option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as 'YELLOW_CARD' | 'RED_CARD')} className={field}>
          <option value="YELLOW_CARD">Amarilla</option>
          <option value="RED_CARD">Roja</option>
        </select>
        <input
          value={minute}
          onChange={(e) => setMinute(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
          placeholder="min"
          inputMode="numeric"
          className={`${field} w-16`}
        />
        <button
          onClick={add}
          disabled={!playerId}
          className="flex items-center gap-1 px-3 py-2 bg-[#00A859] hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> Agregar
        </button>
      </div>
    </div>
  );
};

export const AdminSanctionsView: React.FC<AdminSanctionsViewProps> = ({
  matches,
  teams,
  players,
  onUpdateMatch,
  onUpdatePlayer,
}) => {
  const [mode, setMode] = useState<'tarjetas' | 'suspensiones'>('tarjetas');
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const rounds = useMemo(() => [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b), [matches]);

  const [round, setRound] = useState<number | null>(null);
  const eff = round != null && rounds.includes(round) ? round : rounds[0] ?? null;
  const inRound = useMemo(
    () =>
      matches
        .filter((m) => (eff == null || m.round === eff) && m.homeTeamId && m.awayTeamId)
        .sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.time || '').localeCompare(b.time || '')),
    [matches, eff]
  );

  const [search, setSearch] = useState('');
  const foundPlayers =
    search.trim().length < 2
      ? []
      : players
          .filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, 25);

  const toggleRound = (p: Player, r: number) => {
    const cur = p.suspendedRounds || [];
    const next = cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r].sort((a, b) => a - b);
    onUpdatePlayer({ ...p, suspendedRounds: next });
  };

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-5 sm:p-6 text-white shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#00A859]/20 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-6 h-6 text-[#00A859]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-black tracking-tight leading-tight">Tarjetas y Sanciones</h2>
            <p className="text-xs sm:text-sm text-white/80 font-medium">
              Edita las tarjetas de cada partido y fija las fechas de suspensión de un jugador.
            </p>
          </div>
        </div>
      </div>

      {/* Sub-pestañas */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        <button
          onClick={() => setMode('tarjetas')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-extrabold rounded-lg transition-all ${
            mode === 'tarjetas' ? 'bg-[#00A859] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'
          }`}
        >
          <CreditCard className="w-4 h-4" /> Tarjetas por partido
        </button>
        <button
          onClick={() => setMode('suspensiones')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-extrabold rounded-lg transition-all ${
            mode === 'suspensiones' ? 'bg-[#00A859] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Ban className="w-4 h-4" /> Suspensiones
        </button>
      </div>

      {/* ---- TARJETAS ---- */}
      {mode === 'tarjetas' && (
        <>
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

          <div className="space-y-4">
            {inRound.map((m) => {
              const home = teamMap.get(m.homeTeamId);
              const away = teamMap.get(m.awayTeamId);
              return (
                <div key={m.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50/70">
                    <span className="text-[10px] font-extrabold bg-slate-900 text-white px-2 py-0.5 rounded">{m.category}</span>
                    <TeamShield logoKey={home?.logo} name={home?.name || ''} size="sm" />
                    <span className="text-sm font-black text-slate-800 truncate">{home?.shortName}</span>
                    <span className="text-xs font-black text-slate-400">
                      {m.status === 'SCHEDULED' ? 'vs' : `${m.homeScore} - ${m.awayScore}`}
                    </span>
                    <span className="text-sm font-black text-slate-800 truncate">{away?.shortName}</span>
                    <TeamShield logoKey={away?.logo} name={away?.name || ''} size="sm" />
                  </div>
                  <MatchCardsEditor match={m} teamMap={teamMap} players={players} onUpdateMatch={onUpdateMatch} />
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ---- SUSPENSIONES ---- */}
      {mode === 'suspensiones' && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar jugador por nombre…"
              className="w-full bg-white text-slate-900 font-semibold text-sm pl-10 pr-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#00A859] shadow-xs"
            />
          </div>

          {search.trim().length < 2 ? (
            <p className="text-xs text-slate-500">Escribe al menos 2 letras para buscar.</p>
          ) : foundPlayers.length === 0 ? (
            <p className="text-xs text-slate-500">Sin coincidencias.</p>
          ) : (
            <div className="space-y-3">
              {foundPlayers.map((p) => {
                const team = teamMap.get(p.teamId);
                const susp = p.suspendedRounds || [];
                return (
                  <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-sm font-black text-slate-800">#{p.dorsal} {p.name}</span>
                        <span className="text-xs text-slate-400 ml-2">({team?.name})</span>
                      </div>
                      {susp.length > 0 ? (
                        <span className="text-[10px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                          Suspendido: fecha {susp.join(', ')}
                        </span>
                      ) : (
                        <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          Habilitado
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">Marca las fechas en las que NO puede jugar:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {rounds.map((r) => {
                        const on = susp.includes(r);
                        return (
                          <button
                            key={r}
                            onClick={() => toggleRound(p, r)}
                            className={`px-2.5 py-1 text-xs font-black rounded-lg border transition-all ${
                              on
                                ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            F{r}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
