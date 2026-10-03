'use client';

import React, { useState, useEffect } from 'react';
import { Team } from '@/types';
import { adminClientIpSource, adminListTeamPins, adminSetTeamPin } from '@/lib/store';
import {
  getEligiblePinTeams,
  formatPinStatus,
  hasHighFailures,
  ipSourceStatus,
  TeamPinInfo,
} from '@/lib/teamPins';
import { KeyRound, Copy, Check, AlertCircle, X, ShieldAlert } from 'lucide-react';

interface AdminTeamPinsProps {
  teams: Team[];
}

export const AdminTeamPins: React.FC<AdminTeamPinsProps> = ({ teams }) => {
  const [pins, setPins] = useState<Record<string, TeamPinInfo>>({});
  const [ipSource, setIpSource] = useState<'cloudflare' | 'forwarded' | 'desconocida' | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [generatedPinData, setGeneratedPinData] = useState<{ teamId: string; pin: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const reloadPins = async () => {
    try {
      const list = await adminListTeamPins();
      const map: Record<string, TeamPinInfo> = {};
      for (const item of list) {
        map[item.teamId] = item;
      }
      setPins(map);
    } catch {
      setErrorMessage('No se pudieron cargar los códigos de los equipos.');
    }
  };

  useEffect(() => {
    let isMounted = true;

    adminClientIpSource()
      .then((source) => {
        if (isMounted) setIpSource(source);
      })
      .catch(() => {
        if (isMounted) setIpSource(null);
      });

    adminListTeamPins()
      .then((list) => {
        if (isMounted) {
          const map: Record<string, TeamPinInfo> = {};
          for (const item of list) {
            map[item.teamId] = item;
          }
          setPins(map);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage('No se pudieron cargar los códigos de los equipos.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
      setGeneratedPinData(null);
    };
  }, []);

  const handleGenerate = async (team: Team) => {
    const existing = pins[team.id];
    if (existing) {
      const ok = window.confirm(`Se invalidará el código actual de ${team.name}. ¿Continuar?`);
      if (!ok) return;
    }
    setErrorMessage('');
    setActionLoadingId(team.id);
    try {
      const pin = await adminSetTeamPin(team.id);
      setGeneratedPinData({ teamId: team.id, pin });
      setCopied(false);
      await reloadPins();
    } catch {
      setErrorMessage('No se pudo generar el código. Inténtalo más tarde.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setErrorMessage('No se pudo copiar al portapapeles.');
    }
  };

  const eligibleTeams = getEligiblePinTeams(teams);
  const ipStatus = ipSourceStatus(ipSource);

  return (
    <div className="space-y-3 pt-3 border-t border-slate-200">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-black text-slate-800 uppercase flex items-center gap-1.5">
            <KeyRound className="w-4 h-4 text-purple-600" />
            Códigos de Equipo para Refuerzos
          </h4>
          <p className="text-[11px] text-slate-500">
            Códigos de 6 dígitos para delegados de Abierta y +40. Solo se muestran al generarlos.
          </p>
        </div>
      </div>

      <div
        className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-2 border ${
          ipStatus.tone === 'active'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : ipStatus.tone === 'warning'
            ? 'bg-amber-50 border-amber-200 text-amber-800'
            : 'bg-slate-50 border-slate-200 text-slate-600'
        }`}
      >
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            ipStatus.tone === 'active'
              ? 'bg-emerald-500'
              : ipStatus.tone === 'warning'
              ? 'bg-amber-500'
              : 'bg-slate-400'
          }`}
        />
        <span>{ipStatus.label}</span>
      </div>

      {errorMessage && (
        <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage('')}
            className="text-rose-500 hover:text-rose-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center text-xs text-slate-400 font-semibold">
          Cargando estado de códigos...
        </div>
      ) : eligibleTeams.length === 0 ? (
        <div className="py-4 text-center text-xs text-slate-400">
          No hay equipos en categorías de refuerzo.
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {eligibleTeams.map((team) => {
            const pinInfo = pins[team.id];
            const status = formatPinStatus(pinInfo);
            const isHighRisk = hasHighFailures(pinInfo);
            const isShowingPin = generatedPinData?.teamId === team.id;
            const isBusy = actionLoadingId === team.id;

            return (
              <div
                key={team.id}
                className={`p-3 rounded-xl border space-y-2 transition-colors ${
                  isHighRisk
                    ? 'bg-amber-50/80 border-amber-300'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-slate-800 truncate">
                        {team.name}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 shrink-0">
                        {team.category}
                      </span>
                    </div>
                    <div className="mt-0.5">
                      <span
                        className={`text-[11px] font-bold ${
                          status.tone === 'locked'
                            ? 'text-rose-600'
                            : isHighRisk
                            ? 'text-amber-800'
                            : status.tone === 'active'
                            ? 'text-emerald-700'
                            : 'text-slate-500'
                        }`}
                      >
                        {status.label}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleGenerate(team)}
                    className="px-3 py-1.5 text-xs font-extrabold rounded-lg bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white transition-colors shrink-0"
                  >
                    {isBusy
                      ? 'Generando...'
                      : pinInfo
                      ? 'Regenerar código'
                      : 'Generar código'}
                  </button>
                </div>

                {isShowingPin && (
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between gap-3 animate-fadeIn">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-purple-900 flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                        <span>Entrégalo al delegado. No se volverá a mostrar.</span>
                      </div>
                      <div className="text-2xl font-mono font-black tracking-widest text-purple-950 mt-1">
                        {generatedPinData.pin}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCopy(generatedPinData.pin)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-black bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                      >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied ? 'Copiado' : 'Copiar'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setGeneratedPinData(null)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-purple-100 transition-colors"
                        title="Cerrar aviso de código"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-100">
        Si un equipo no puede usar su código, regenéralo o habilita el refuerzo desde Jugadores &gt; Habilitar en otra categoría.
      </p>
    </div>
  );
};
