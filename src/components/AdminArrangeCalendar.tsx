'use client';

import React, { useState } from 'react';
import { Match, Team, Player, Category } from '@/types';
import { planCalendarArrangement, ArrangePlan } from '@/lib/scheduling/arrangeCalendar';
import { localDateString } from '@/lib/finesReport';
import { Calendar, RefreshCw, AlertTriangle, CheckCircle2, Clock, Trash2, PlusCircle, AlertCircle } from 'lucide-react';

interface AdminArrangeCalendarProps {
  matches: Match[];
  teams: Team[];
  players: Player[];
  activeCategories: Category[];
  loadPlayers?: () => Promise<Player[]>;
  onApplyPlan?: (plan: ArrangePlan) => Promise<boolean>;
}

interface CapacityAlertProps {
  dates: { date: string; matches: number; capacity: number }[];
}

const CapacityAlert: React.FC<CapacityAlertProps> = ({ dates }) => {
  if (dates.length === 0) return null;
  return (
    <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-2 text-rose-800">
      <div className="flex items-center gap-2 font-black uppercase tracking-wider text-rose-700">
        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
        <span>Fechas que superan la capacidad maxima ({dates.length})</span>
      </div>
      <p className="text-rose-700">
        No se puede aplicar el calendario porque las siguientes fechas tienen mas partidos activos que los 16 permitidos (8 turnos x 2 canchas):
      </p>
      <div className="space-y-1 font-semibold">
        {dates.map((oc) => (
          <div key={oc.date} className="flex items-center gap-2">
            <span>• Sabado {oc.date}:</span>
            <span className="font-bold underline">{oc.matches} partidos</span>
            <span className="text-rose-600">(limite: {oc.capacity})</span>
          </div>
        ))}
      </div>
    </div>
  );
};

interface CreatedCategoriesProps {
  categories: ArrangePlan['createdCategories'];
}

const CreatedCategoriesAlert: React.FC<CreatedCategoriesProps> = ({ categories }) => {
  if (categories.length === 0) return null;
  return (
    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-1.5 text-emerald-900">
      <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-emerald-800 text-[11px]">
        <PlusCircle className="w-4 h-4 text-[#00A859] shrink-0" />
        <span>Categorias nuevas a programar ({categories.length})</span>
      </div>
      {categories.map((c) => (
        <div key={c.category} className="text-xs">
          <strong className="font-bold">{c.category}:</strong> {c.rounds} jornadas desde el {c.firstDate} ({c.matches} partidos en total).
        </div>
      ))}
    </div>
  );
};

interface PlanCountsProps {
  stale: number;
  retimed: number;
  cleared: number;
  hasChanges: boolean;
  hasOverCapacity: boolean;
}

const PlanCounts: React.FC<PlanCountsProps> = ({ stale, retimed, cleared, hasChanges, hasOverCapacity }) => {
  return (
    <>
      {stale > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-2 text-amber-900">
          <Trash2 className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Se eliminaran <strong>{stale}</strong> partidos pendientes no jugados de categorias regeneradas.</span>
        </div>
      )}
      {retimed > 0 && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl flex items-center gap-2 text-blue-900">
          <RefreshCw className="w-4 h-4 text-blue-600 shrink-0" />
          <span>Se reasignara horario y cancha a <strong>{retimed}</strong> partidos de fechas futuras.</span>
        </div>
      )}
      {cleared > 0 && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-2 text-slate-700">
          <Clock className="w-4 h-4 text-slate-500 shrink-0" />
          <span><strong>{cleared}</strong> partidos de categorias en pausa, proximamente o suspendidas quedaran sin hora hasta su activacion.</span>
        </div>
      )}
      {!hasChanges && !hasOverCapacity && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-2 text-slate-600">
          <CheckCircle2 className="w-4 h-4 text-[#00A859] shrink-0" />
          <span>El calendario ya esta al dia segun las categorias activas. No se requieren cambios.</span>
        </div>
      )}
    </>
  );
};

const PlanWarnings: React.FC<{ warnings: string[] }> = ({ warnings }) => {
  if (warnings.length === 0) return null;
  return (
    <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-1 text-amber-900">
      <div className="flex items-center gap-2 font-bold text-amber-800 text-[11px] uppercase tracking-wider">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
        <span>Avisos ({warnings.length})</span>
      </div>
      {warnings.map((w, idx) => (
        <div key={idx} className="text-xs text-amber-800">• {w}</div>
      ))}
    </div>
  );
};

const PlanOverview: React.FC<{ plan: ArrangePlan }> = ({ plan }) => {
  const hasChanges =
    plan.createdCategories.length > 0 ||
    plan.removedStaleMatches > 0 ||
    plan.retimedMatches > 0 ||
    plan.clearedMatches > 0;

  return (
    <div className="space-y-4 pt-2 border-t border-slate-200 text-xs">
      <CapacityAlert dates={plan.overCapacityDates} />
      <CreatedCategoriesAlert categories={plan.createdCategories} />
      <PlanCounts
        stale={plan.removedStaleMatches}
        retimed={plan.retimedMatches}
        cleared={plan.clearedMatches}
        hasChanges={Boolean(hasChanges)}
        hasOverCapacity={plan.overCapacityDates.length > 0}
      />
      <PlanWarnings warnings={plan.warnings} />
    </div>
  );
};

interface ActionButtonsProps {
  onReview: () => void;
  onApply: () => void;
  plan: ArrangePlan | null;
  canApply: boolean;
  isApplying: boolean;
  isReviewing: boolean;
}

const ActionButtons: React.FC<ActionButtonsProps> = ({
  onReview,
  onApply,
  plan,
  canApply,
  isApplying,
  isReviewing,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onReview}
        disabled={isApplying || isReviewing}
        className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition-colors flex items-center gap-2"
      >
        <RefreshCw className={`w-4 h-4 ${isReviewing ? 'animate-spin' : ''}`} />
        <span>{isReviewing ? 'Revisando...' : 'Revisar cambios'}</span>
      </button>

      {plan && (
        <button
          type="button"
          onClick={onApply}
          disabled={!canApply}
          className="px-5 py-2.5 bg-[#00A859] hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition-colors flex items-center gap-2"
        >
          <CheckCircle2 className={`w-4 h-4 ${isApplying ? 'animate-spin' : ''}`} />
          <span>{isApplying ? 'Aplicando...' : 'Aplicar'}</span>
        </button>
      )}
    </div>
  );
};

function checkHasChanges(plan: ArrangePlan | null): boolean {
  return Boolean(
    plan &&
      (plan.createdCategories.length > 0 ||
        plan.removedStaleMatches > 0 ||
        plan.retimedMatches > 0 ||
        plan.clearedMatches > 0)
  );
}

const CalendarHeader: React.FC = () => (
  <div className="space-y-1 border-b border-slate-200 pb-4">
    <h3 className="font-black text-slate-900 text-lg flex items-center gap-2">
      <Calendar className="w-5 h-5 text-[#00A859]" /> Acomodar calendario
    </h3>
    <p className="text-xs text-slate-500">
      Asigna hora y cancha a todas las fechas futuras de las categorías activas y crea el calendario de las
      categorías activas que aún no empezaron. Las fechas jugadas no se tocan.
    </p>
  </div>
);

function useArrangeActions(
  matches: Match[],
  teams: Team[],
  players: Player[],
  activeCategories: Category[],
  onApplyPlan?: (plan: ArrangePlan) => Promise<boolean>,
  loadPlayers?: () => Promise<Player[]>
) {
  const [plan, setPlan] = useState<ArrangePlan | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);

  const handleReview = async () => {
    setIsReviewing(true);
    try {
      const fullPlayers = loadPlayers ? await loadPlayers() : players;
      setPlan(
        planCalendarArrangement({
          matches,
          teams,
          players: fullPlayers,
          activeCategories,
          today: localDateString(),
        })
      );
    } finally {
      setIsReviewing(false);
    }
  };

  const handleApplyClick = async () => {
    if (!plan || !onApplyPlan || isApplying || plan.overCapacityDates.length > 0) return;
    const ok = window.confirm(
      'Se aplicarán los cambios mostrados. Avisa a los delegados de los nuevos horarios.\n\n¿Deseas continuar?'
    );
    if (!ok) return;

    try {
      setIsApplying(true);
      if (await onApplyPlan(plan)) setPlan(null);
    } finally {
      setIsApplying(false);
    }
  };

  const hasChanges = checkHasChanges(plan);
  const canApply = Boolean(hasChanges && plan?.overCapacityDates.length === 0 && onApplyPlan && !isApplying);

  return { plan, isApplying, isReviewing, handleReview, handleApplyClick, canApply };
}

export const AdminArrangeCalendar: React.FC<AdminArrangeCalendarProps> = ({
  matches,
  teams,
  players,
  activeCategories,
  loadPlayers,
  onApplyPlan,
}) => {
  const { plan, isApplying, isReviewing, handleReview, handleApplyClick, canApply } = useArrangeActions(
    matches,
    teams,
    players,
    activeCategories,
    onApplyPlan,
    loadPlayers
  );

  return (
    <div className="glass-card rounded-3xl p-6 border border-slate-200 shadow-md space-y-4">
      <CalendarHeader />
      <ActionButtons
        onReview={handleReview}
        onApply={handleApplyClick}
        plan={plan}
        canApply={canApply}
        isApplying={isApplying}
        isReviewing={isReviewing}
      />
      {plan && <PlanOverview plan={plan} />}
    </div>
  );
};
