'use client';

import React, { useMemo, useState } from 'react';
import { Match, Team } from '@/types';
import { TeamShield } from './TeamShield';
import { Dice5, Save, ListChecks } from 'lucide-react';

interface AdminResultsViewProps {
  matches: Match[];
  teams: Team[];
  onSaveResults: (results: { id: string; homeScore: number; awayScore: number }[]) => void;
}

export const AdminResultsView: React.FC<AdminResultsViewProps> = ({ matches, teams, onSaveResults }) => {
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const rounds = useMemo(() => [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b), [matches]);
  const [round, setRound] = useState<number | null>(null);
  const eff = round != null && rounds.includes(round) ? round : rounds[0] ?? null;

  const inRound = useMemo(
    () =>
      matches
        .filter((m) => eff == null || m.round === eff)
        .filter((m) => m.homeTeamId && m.awayTeamId) // omite play offs "por definir"
        .sort(
          (a, b) =>
            (a.category || '').localeCompare(b.category || '') || (a.time || '').localeCompare(b.time || '')
        ),
    [matches, eff]
  );

  // Borrador de marcadores por partido (texto de los inputs).
  const [draft, setDraft] = useState<Record<string, { h: string; a: string }>>({});
  const val = (m: Match, k: 'h' | 'a') =>
    draft[m.id]?.[k] ?? (m.status !== 'SCHEDULED' ? String(k === 'h' ? m.homeScore : m.awayScore) : '');
  const setVal = (m: Match, k: 'h' | 'a', v: string) => {
    const clean = v.replace(/[^0-9]/g, '').slice(0, 2);
    setDraft((d) => {
      const cur = d[m.id] ?? { h: val(m, 'h'), a: val(m, 'a') };
      return { ...d, [m.id]: { ...cur, [k]: clean } };
    });
  };

  const randomFill = () => {
    const rand = () => String(Math.floor(Math.random() * 6)); // 0..5
    setDraft((d) => {
      const nd = { ...d };
      inRound.forEach((m) => {
        nd[m.id] = { h: rand(), a: rand() };
      });
      return nd;
    });
  };

  const [saving, setSaving] = useState(false);
  const saveAll = () => {
    const results = inRound
      .map((m) => {
        const h = parseInt(val(m, 'h'), 10);
        const a = parseInt(val(m, 'a'), 10);
        return Number.isNaN(h) || Number.isNaN(a) ? null : { id: m.id, homeScore: h, awayScore: a };
      })
      .filter((r): r is { id: string; homeScore: number; awayScore: number } => r !== null);

    if (results.length === 0) {
      alert('Escribe al menos un marcador antes de guardar.');
      return;
    }
    if (!window.confirm(`¿Guardar ${results.length} resultado(s) de la Fecha ${eff} y marcarlos como FINALIZADOS?`)) return;
    setSaving(true);
    try {
      onSaveResults(results);
      setDraft({});
    } finally {
      setSaving(false);
    }
  };

  if (rounds.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-10 text-center">
        <ListChecks className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h3 className="text-lg font-black text-slate-800">Sin partidos</h3>
        <p className="text-sm text-slate-500 mt-1">Los resultados se cargan cuando haya calendario.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-5 sm:p-6 text-white shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#00A859]/20 flex items-center justify-center shrink-0">
            <ListChecks className="w-6 h-6 text-[#00A859]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-black tracking-tight leading-tight">Cargar Resultados</h2>
            <p className="text-xs sm:text-sm text-white/80 font-medium">
              Escribe los marcadores y guárdalos como finalizados. Útil cuando los árbitros no cargaron en cancha.
            </p>
          </div>
        </div>
      </div>

      {/* Selector de fecha + acciones */}
      <div className="flex flex-wrap items-center gap-2">
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
        <button
          onClick={randomFill}
          className="ml-auto flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-extrabold rounded-xl transition-colors"
        >
          <Dice5 className="w-4 h-4 text-[#00A859]" /> Llenar al azar
        </button>
        <button
          onClick={saveAll}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-[#00A859] hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-extrabold rounded-xl transition-colors"
        >
          <Save className="w-4 h-4" /> Guardar y finalizar
        </button>
      </div>

      {/* Lista de partidos con inputs */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm divide-y divide-slate-100">
        {inRound.map((m) => {
          const home = teamMap.get(m.homeTeamId);
          const away = teamMap.get(m.awayTeamId);
          return (
            <div key={m.id} className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-3">
              <span className="text-[9px] font-extrabold bg-slate-900 text-white px-1.5 py-0.5 rounded shrink-0 hidden sm:inline">
                {m.category}
              </span>
              <div className="flex items-center gap-1.5 flex-1 justify-end min-w-0">
                <span className="text-xs sm:text-sm font-black text-slate-800 truncate text-right">{home?.shortName}</span>
                <TeamShield logoKey={home?.logo} name={home?.name || ''} size="sm" />
              </div>
              <input
                inputMode="numeric"
                value={val(m, 'h')}
                onChange={(e) => setVal(m, 'h', e.target.value)}
                placeholder="-"
                className="w-11 text-center bg-slate-50 text-slate-900 font-black text-base p-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#00A859]"
              />
              <span className="text-slate-300 font-black">-</span>
              <input
                inputMode="numeric"
                value={val(m, 'a')}
                onChange={(e) => setVal(m, 'a', e.target.value)}
                placeholder="-"
                className="w-11 text-center bg-slate-50 text-slate-900 font-black text-base p-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#00A859]"
              />
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <TeamShield logoKey={away?.logo} name={away?.name || ''} size="sm" />
                <span className="text-xs sm:text-sm font-black text-slate-800 truncate">{away?.shortName}</span>
              </div>
              {m.status === 'FINISHED' && (
                <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded shrink-0 hidden sm:inline">
                  Final
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-500">
        Al guardar, los partidos quedan <strong>FINALIZADOS</strong> y las tablas de posiciones se actualizan
        solas. (No registra goleadores individuales; eso se hace por jugador en la Planilla si se necesita.)
      </p>
    </div>
  );
};
