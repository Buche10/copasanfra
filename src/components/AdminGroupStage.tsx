'use client';

import React, { useMemo, useState } from 'react';
import { Category, Match, Team } from '@/types';
import {
  GROUP_STAGE_CONFIG,
  buildCreateGroupStageBatch,
  buildGroups,
  generateGroupStageMatches,
  hasGroupStage,
  isValidSaturday,
  restoreBracketBeforeGroups,
  shiftBracketAfterGroups,
} from '@/lib/groupStage';
import { localDateString } from '@/lib/finesReport';
import { changedPlayoffMatches, recomputePlayoffs } from '@/lib/playoffs';
import { applyMatchChanges } from '@/lib/store';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Layers,
  Trash2,
} from 'lucide-react';

interface AdminGroupStageProps {
  matches: Match[];
  teams: Team[];
  onMatchesUpdated: (nextMatches: Match[]) => void;
}

function defaultNextSaturday(): string {
  const now = new Date();
  const diff = (6 - now.getDay() + 7) % 7;
  now.setDate(now.getDate() + diff);
  return localDateString(now);
}

function getDisableReason(cat: Category, matches: Match[]): string | null {
  const catMatches = matches.filter((m) => m.category === cat);
  const regular = catMatches.filter((m) => !m.isPlayoff);
  if (regular.length === 0) {
    return 'No hay partidos de fase regular en esta categoría.';
  }
  const pendingRegular = regular.filter((m) => m.status !== 'FINISHED').length;
  if (pendingRegular > 0) {
    return `Faltan ${pendingRegular} partidos de fase regular por finalizar.`;
  }
  if (hasGroupStage(cat, matches)) {
    return 'La fase de grupos ya fue creada para esta categoría.';
  }
  const activePlayoff = catMatches.some(
    (m) => m.isPlayoff && (m.status === 'FINISHED' || m.status === 'IN_PROGRESS')
  );
  if (activePlayoff) {
    return 'Ya hay partidos de play off jugados o en juego.';
  }
  return null;
}

export const AdminGroupStage: React.FC<AdminGroupStageProps> = ({
  matches,
  teams,
  onMatchesUpdated,
}) => {
  const configuredCats = Object.keys(GROUP_STAGE_CONFIG) as Category[];
  const [selectedCat, setSelectedCat] = useState<Category>(
    configuredCats[0] ?? '+40 Varones'
  );
  const [startDate, setStartDate] = useState<string>(defaultNextSaturday);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const teamNameMap = useMemo(
    () => new Map(teams.map((t) => [t.id, t.name])),
    [teams]
  );

  const clubNameMap = useMemo(() => {
    const map = new Map<string, string>();
    teams.forEach((t) => {
      const cid = t.clubId || t.id;
      if (!map.has(cid)) map.set(cid, t.name);
    });
    return map;
  }, [teams]);

  const alreadyCreated = hasGroupStage(selectedCat, matches);
  const disableReason = getDisableReason(selectedCat, matches);
  const dateValid = isValidSaturday(startDate);
  const canCreate = !disableReason && dateValid && !busy;

  const canUndo =
    alreadyCreated &&
    !matches.some(
      (m) =>
        m.category === selectedCat &&
        m.playoffStage === 'GRUPOS' &&
        (m.status === 'FINISHED' || m.status === 'IN_PROGRESS')
    ) &&
    !busy;

  const preview = useMemo(() => {
    if (alreadyCreated || !dateValid) return null;
    const groups = buildGroups(selectedCat, teams, matches);
    const gen = generateGroupStageMatches({
      cat: selectedCat,
      teams,
      matches,
      startDate,
    });
    const lastGroupDate = gen.matches.reduce(
      (max, m) => (m.date > max ? m.date : max),
      startDate
    );
    const shifted = shiftBracketAfterGroups({
      cat: selectedCat,
      matches,
      teams,
      lastGroupDate,
    });
    return { groups, gen, shifted };
  }, [alreadyCreated, dateValid, selectedCat, teams, matches, startDate]);

  const handleCreate = async () => {
    if (!canCreate || !preview) return;
    setBusy(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const { upserts, nextMatches } = buildCreateGroupStageBatch(
        matches,
        teams,
        preview.gen.matches,
        preview.shifted
      );
      await applyMatchChanges({ upserts, deleteIds: [] });
      onMatchesUpdated(nextMatches);
      setSuccessMsg(
        `Fase de grupos creada: ${preview.gen.matches.length} partidos agregados y cuadro reprogramado.`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar la fase de grupos. Revisa tu conexión e inténtalo de nuevo.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleUndo = async () => {
    if (!canUndo) return;
    setBusy(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const groupIds = matches
        .filter((m) => m.category === selectedCat && m.playoffStage === 'GRUPOS')
        .map((m) => m.id);
      const restored = restoreBracketBeforeGroups(selectedCat, matches);
      await applyMatchChanges({ upserts: restored, deleteIds: groupIds });

      const restoredMap = new Map(restored.map((m) => [m.id, m]));
      const groupIdSet = new Set(groupIds);
      const nextRaw = matches
        .filter((m) => !groupIdSet.has(m.id))
        .map((m) => restoredMap.get(m.id) ?? m);
      const reconciled = recomputePlayoffs(nextRaw, teams);
      const changed = changedPlayoffMatches(nextRaw, reconciled);
      if (changed.length > 0) {
        await applyMatchChanges({ upserts: changed, deleteIds: [] });
      }
      onMatchesUpdated(reconciled);
      setSuccessMsg('Fase de grupos eliminada y cuadro restaurado.');
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo quitar la fase de grupos.'
      );
    } finally {
      setBusy(false);
    }
  };

  const groupedByRound = useMemo(() => {
    if (!preview) return [];
    const map = new Map<number, Match[]>();
    preview.gen.matches.forEach((m) => {
      const arr = map.get(m.round) ?? [];
      arr.push(m);
      map.set(m.round, arr);
    });
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [preview]);

  if (configuredCats.length === 0) return null;

  return (
    <div className="glass-card rounded-3xl p-6 border border-slate-200 shadow-md space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="space-y-1">
          <h3 className="font-black text-slate-900 text-lg flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#00A859]" /> Fase de grupos
          </h3>
          <p className="text-xs text-slate-500">
            Genera los dos grupos, 5 fechas de partidos y reprograma el cuadro final detrás.
          </p>
        </div>

        {configuredCats.length > 1 && (
          <select
            value={selectedCat}
            onChange={(e) => setSelectedCat(e.target.value as Category)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white"
          >
            {configuredCats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <label className="space-y-1 text-xs font-bold text-slate-700">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-[#00A859]" /> Fecha de inicio (sábado)
          </span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={alreadyCreated || busy}
            className="block px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-white disabled:bg-slate-100"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCreate}
            disabled={!canCreate}
            className="px-4 py-2.5 bg-[#00A859] hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-black rounded-xl transition-colors"
          >
            {busy ? 'Guardando...' : 'Crear fase de grupos'}
          </button>

          {alreadyCreated && (
            <button
              type="button"
              onClick={handleUndo}
              disabled={!canUndo}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-black rounded-xl transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Quitar fase de grupos
            </button>
          )}
        </div>
      </div>

      {!dateValid && !alreadyCreated && (
        <p className="text-xs font-semibold text-rose-600">
          La fecha de inicio debe tener formato YYYY-MM-DD y caer en sábado.
        </p>
      )}

      {disableReason && (
        <p className="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
          {disableReason}
        </p>
      )}

      {alreadyCreated && !canUndo && (
        <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          No se puede quitar la fase de grupos porque ya hay partidos en juego o finalizados.
        </p>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-[#00A859]" />
          <span>{successMsg}</span>
        </div>
      )}

      {preview && (
        <div className="space-y-4 pt-2">
          {preview.gen.unscheduled.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Quedaron {preview.gen.unscheduled.length} partidos sin turno libre asignado; revisa sus horarios manualmente.
              </span>
            </div>
          )}

          {preview.gen.backToBack.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Partidos seguidos del mismo dueño ({preview.gen.backToBack.length})</span>
              </div>
              {preview.gen.backToBack.map((b, idx) => (
                <div key={`${b.date}-${b.clubId}-${idx}`} className="pl-6">
                  {b.date}: {clubNameMap.get(b.clubId) ?? b.clubId} juega {b.times[0]} y {b.times[1]} seguidos
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(['A', 'B'] as const).map((g) => (
              <div key={g} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                <div className="text-xs font-black text-slate-900 uppercase">Grupo {g}</div>
                {preview.groups[g].map((entry) => (
                  <div key={entry.teamId} className="flex items-center justify-between text-xs text-slate-700">
                    <span className="font-semibold">
                      {entry.regularPosition}. {teamNameMap.get(entry.teamId) ?? entry.teamId}
                    </span>
                    <span className="font-black text-[#00A859]">
                      {entry.bonus > 0 ? `+${entry.bonus} pts` : '0 pts'}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-black text-slate-800 uppercase">Vista previa de las 5 fechas</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {groupedByRound.map(([roundNum, ms]) => (
                <div key={roundNum} className="rounded-2xl border border-slate-200 bg-white p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-black text-slate-900">
                    <span>Jornada {roundNum}</span>
                    <span className="text-slate-500">{ms[0]?.date}</span>
                  </div>
                  {ms.map((m) => (
                    <div key={m.id} className="text-[11px] text-slate-700 flex items-center justify-between gap-2">
                      <span className="truncate">
                        <strong>[{m.groupName}]</strong> {teamNameMap.get(m.homeTeamId) ?? m.homeTeamId} vs{' '}
                        {teamNameMap.get(m.awayTeamId) ?? m.awayTeamId}
                      </span>
                      <span className="shrink-0 font-bold text-slate-500">
                        {m.time || 'Sin hora'} · {m.stadium || '-'}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {preview.shifted.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-1">
              <div className="text-xs font-black text-slate-800 uppercase">Nuevas fechas del cuadro</div>
              {preview.shifted.map((m) => (
                <div key={m.id} className="text-[11px] text-slate-700 flex items-center justify-between">
                  <span className="font-bold">
                    {m.playoffStage} ({m.bracketSlot})
                  </span>
                  <span>
                    {m.date} · {m.time || 'Sin hora'} · {m.stadium || '-'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
