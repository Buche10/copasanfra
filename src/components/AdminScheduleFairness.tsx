'use client';

import React, { useMemo, useState } from 'react';
import { Match, Team, Player, Category, MATCH_TIME_SLOTS } from '@/types';
import { fairnessReport, TeamFairnessReport } from '@/lib/scheduling/fairness';
import {
  buildSharedPlayerPairs,
  getSharedPlayerPairDetails,
  findSharedPlayerConflicts,
  SharedPlayerConflict,
  SharedPlayerPairDetail,
} from '@/lib/scheduling/sharedPlayers';
import { rebalanceFutureDates } from '@/lib/scheduling/rebalance';
import { localDateString } from '@/lib/finesReport';
import { Scale, AlertTriangle, Users, CheckCircle2, RefreshCw } from 'lucide-react';

interface AdminScheduleFairnessProps {
  matches: Match[];
  teams: Team[];
  players: Player[];
  hiddenCategories?: Category[];
  onRebalanceSchedule?: (rebalancedMatches: Match[]) => Promise<void> | void;
}

interface ConflictsAlertProps {
  conflicts: SharedPlayerConflict[];
}

const ConflictsAlert: React.FC<ConflictsAlertProps> = ({ conflicts }) => {
  if (conflicts.length === 0) {
    return (
      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 text-xs text-emerald-800 font-semibold">
        <CheckCircle2 className="w-4 h-4 text-[#00A859] shrink-0" />
        <span>Sin conflictos de horario entre equipos que comparten jugadores en fechas futuras.</span>
      </div>
    );
  }

  return (
    <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-2">
      <div className="flex items-center gap-2 text-rose-800 text-xs font-black uppercase tracking-wider">
        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
        <span>Conflictos de descanso detectados en fechas futuras ({conflicts.length})</span>
      </div>
      <div className="space-y-1.5 text-xs text-rose-700">
        {conflicts.map((c, i) => (
          <div key={`${c.date}-${c.teamAName}-${c.teamBName}-${i}`} className="flex items-start gap-1.5">
            <span className="font-bold">• Fecha {c.date}:</span>
            <span>
              {c.teamAName} ({c.timeA}) y {c.teamBName} ({c.timeB}) juegan{' '}
              <strong className="font-bold">
                {c.type === 'SIMULTANEOUS' ? 'a la misma hora' : 'en turnos consecutivos (sin descanso)'}
              </strong>.
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

interface FairnessTableProps {
  reports: TeamFairnessReport[];
  avgEarlyPct: number;
}

interface FairnessRowProps {
  report: TeamFairnessReport;
  avgEarlyPct: number;
}

const FairnessRow: React.FC<FairnessRowProps> = ({ report: r, avgEarlyPct }) => {
  const isHighEarly = r.matchesCount > 0 && avgEarlyPct > 0 && r.earlyPct > 2 * avgEarlyPct;
  return (
    <tr className={`hover:bg-slate-50 transition-colors ${isHighEarly ? 'bg-amber-50/70' : ''}`}>
      <td className="py-2.5 px-3 font-bold text-slate-900">{r.teamName}</td>
      <td className="py-2.5 px-3 text-slate-600">{r.category}</td>
      <td className="py-2.5 px-3 text-center font-medium text-slate-700">{r.matchesCount}</td>
      <td className="py-2.5 px-3 text-right font-mono">
        <span
          className={`inline-block px-2 py-0.5 rounded-md ${
            isHighEarly ? 'bg-amber-200 text-amber-900 font-black' : 'text-slate-800'
          }`}
        >
          {r.earlyPct.toFixed(1)}%
        </span>
      </td>
      <td className="py-2.5 px-3 text-right font-mono text-slate-700">{r.latePct.toFixed(1)}%</td>
      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">{r.avgSlot.toFixed(2)}</td>
    </tr>
  );
};

interface FairnessTableProps {
  reports: TeamFairnessReport[];
  avgEarlyPct: number;
}

const FairnessTable: React.FC<FairnessTableProps> = ({ reports, avgEarlyPct }) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="font-bold uppercase tracking-wider">Reparto de turnos por equipo</span>
        <span>Media temprano: <strong>{avgEarlyPct.toFixed(1)}%</strong></span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-extrabold uppercase tracking-wider">
            <tr>
              <th className="py-3 px-3">Equipo</th>
              <th className="py-3 px-3">Categoria</th>
              <th className="py-3 px-3 text-center">Partidos</th>
              <th className="py-3 px-3 text-right">% Temprano (08:00-09:15)</th>
              <th className="py-3 px-3 text-right">% Tarde</th>
              <th className="py-3 px-3 text-right">Turno Promedio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reports.map((r) => (
              <FairnessRow key={r.teamId} report={r} avgEarlyPct={avgEarlyPct} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

interface SharedPairsGridProps {
  pairDetails: SharedPlayerPairDetail[];
}

const SharedPairsGrid: React.FC<SharedPairsGridProps> = ({ pairDetails }) => {
  return (
    <div className="space-y-3 pt-2 border-t border-slate-200">
      <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
        <Users className="w-4 h-4 text-blue-600" />
        Equipos que comparten jugadores ({pairDetails.length} pares)
      </h4>

      {pairDetails.length === 0 ? (
        <p className="text-xs text-slate-400 italic">
          No se encontraron equipos que compartan jugadores inscritos con cedula.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {pairDetails.map((pair) => (
            <div
              key={pair.pairKey}
              className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs"
            >
              <div className="space-y-0.5 truncate pr-2">
                <div className="font-bold text-slate-900 truncate">{pair.teamAName}</div>
                <div className="font-bold text-slate-900 truncate">{pair.teamBName}</div>
              </div>
              <span className="shrink-0 bg-blue-100 text-blue-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                {pair.commonPlayerCount} {pair.commonPlayerCount === 1 ? 'jugador' : 'jugadores'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface FairnessHeaderProps {
  isProcessing: boolean;
  canRebalance: boolean;
  onRebalance: () => void;
}

const FairnessHeader: React.FC<FairnessHeaderProps> = ({ isProcessing, canRebalance, onRebalance }) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
      <div>
        <h3 className="font-black text-slate-900 text-lg flex items-center gap-2">
          <Scale className="w-5 h-5 text-[#00A859]" /> Equidad de Horarios
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Distribucion de partidos entre turnos tempranos, medios y tardios a lo largo de la temporada.
        </p>
      </div>

      {canRebalance && (
        <button
          type="button"
          disabled={isProcessing}
          onClick={onRebalance}
          className="px-5 py-2.5 bg-[#00A859] hover:bg-emerald-700 disabled:bg-slate-300 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition-colors shrink-0 flex items-center justify-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
          <span>{isProcessing ? 'Equilibrando...' : 'Equilibrar fechas no jugadas'}</span>
        </button>
      )}
    </div>
  );
};

function confirmRebalance(result: ReturnType<typeof rebalanceFutureDates>): boolean {
  if (result.changed === 0) {
    alert('Todas las fechas futuras ya estan equilibradas. No hay partidos que cambiar.');
    return false;
  }
  const firstDate = result.perDate[0]?.date ?? '';
  const lastDate = result.perDate[result.perDate.length - 1]?.date ?? '';
  const dateRange =
    result.perDate.length === 1 ? `la fecha ${firstDate}` : `de la ${firstDate} a la ${lastDate}`;

  return window.confirm(
    `Se cambiara la hora de ${result.changed} partidos en ${result.perDate.length} fechas (${dateRange}). Las fechas ya jugadas no se tocan.\n\n¿Deseas continuar?`
  );
}

function useFairnessData(matches: Match[], teams: Team[], players: Player[]) {
  const slotCount = MATCH_TIME_SLOTS.length;
  const reports = useMemo(() => fairnessReport(matches, teams, slotCount), [matches, teams, slotCount]);
  const avgEarlyPct = useMemo(
    () => (reports.length > 0 ? reports.reduce((acc, r) => acc + r.earlyPct, 0) / reports.length : 0),
    [reports]
  );
  const sharedPairs = useMemo(() => buildSharedPlayerPairs(players), [players]);
  const pairDetails = useMemo(() => getSharedPlayerPairDetails(players, teams), [players, teams]);
  const conflicts = useMemo(
    () => findSharedPlayerConflicts(matches, sharedPairs, teams, localDateString()),
    [matches, sharedPairs, teams]
  );
  return { reports, avgEarlyPct, pairDetails, conflicts };
}

export const AdminScheduleFairness: React.FC<AdminScheduleFairnessProps> = ({
  matches,
  teams,
  players,
  hiddenCategories = [],
  onRebalanceSchedule,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const { reports, avgEarlyPct, pairDetails, conflicts } = useFairnessData(matches, teams, players);

  const handleRebalanceClick = async () => {
    if (!onRebalanceSchedule || isProcessing) return;
    const result = rebalanceFutureDates(matches, teams, players, hiddenCategories, localDateString());
    if (!confirmRebalance(result)) return;

    try {
      setIsProcessing(true);
      await onRebalanceSchedule(result.matches);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="glass-card rounded-3xl p-6 border border-slate-200 shadow-md space-y-6">
      <FairnessHeader
        isProcessing={isProcessing}
        canRebalance={Boolean(onRebalanceSchedule)}
        onRebalance={handleRebalanceClick}
      />
      <ConflictsAlert conflicts={conflicts} />
      <FairnessTable reports={reports} avgEarlyPct={avgEarlyPct} />
      <SharedPairsGrid pairDetails={pairDetails} />
    </div>
  );
};
