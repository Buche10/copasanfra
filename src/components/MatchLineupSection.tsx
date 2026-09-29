'use client';

import React from 'react';
import { LineupPlayer, Match, Player, Team } from '@/types';
import {
  Ban,
  Camera,
  CheckSquare,
  QrCode,
  Search,
  Square,
  Users,
  X,
} from 'lucide-react';

interface MatchLineupSectionProps {
  sheet: Match;
  homeTeam: Team | undefined;
  awayTeam: Team | undefined;
  homePlayers: Player[];
  awayPlayers: Player[];
  playerMap: Map<string, Player>;
  isSusp: (p: Player) => boolean;
  locked: boolean;
  onTogglePlayer: (teamType: 'HOME' | 'AWAY', player: Player) => void;
  qrScanInput: string;
  onQrInputChange: (val: string) => void;
  onScanAutoCheckin: (rawText: string) => void;
  onOpenScanner: () => void;
  scanMessage: { type: 'success' | 'error' | 'warning'; text: string } | null;
  onClearScanMessage: () => void;
}

export const MatchLineupSection: React.FC<MatchLineupSectionProps> = ({
  sheet,
  homeTeam,
  awayTeam,
  homePlayers,
  awayPlayers,
  playerMap,
  isSusp,
  locked,
  onTogglePlayer,
  qrScanInput,
  onQrInputChange,
  onScanAutoCheckin,
  onOpenScanner,
  scanMessage,
  onClearScanMessage,
}) => {
  const homeLineupPlayers = (sheet.homeLineup || [])
    .map((lp) => playerMap.get(lp.playerId))
    .filter(Boolean) as Player[];
  const awayLineupPlayers = (sheet.awayLineup || [])
    .map((lp) => playerMap.get(lp.playerId))
    .filter(Boolean) as Player[];

  const homeForoCount = homeLineupPlayers.filter((p) => p.affiliation === 'Foro de Abogados').length;
  const homeColegioCount = homeLineupPlayers.filter((p) => p.affiliation !== 'Foro de Abogados').length;
  const awayForoCount = awayLineupPlayers.filter((p) => p.affiliation === 'Foro de Abogados').length;
  const awayColegioCount = awayLineupPlayers.filter((p) => p.affiliation !== 'Foro de Abogados').length;

  return (
    <div className="bg-slate-100/80 p-5 rounded-2xl border border-slate-200 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3 border-slate-200">
        <div className="flex items-center space-x-2">
          <Users className="w-5 h-5 text-[#00A859]" />
          <div>
            <h4 className="font-extrabold text-slate-900 text-sm">Nómina y Concurrencia de Jugadores en Acta</h4>
            <p className="text-xs text-slate-500">
              Marca los jugadores que participaron. Se indica si cada uno es del Colegio o del Foro de Abogados.
            </p>
          </div>
        </div>
      </div>

      {/* Caja de registro automatico por QR */}
      <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 space-y-3 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-[#00A859] font-black text-xs uppercase tracking-wider">
            <QrCode className="w-4 h-4" />
            <span>Registro Automático en Vocalía por Lector QR / Cédula</span>
          </div>
          <span className="text-[10px] text-slate-400 font-bold">Autollenado en tiempo real</span>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={qrScanInput}
              onChange={(e) => onQrInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onScanAutoCheckin(qrScanInput);
                }
              }}
              placeholder="Escanee el carnet o ingrese el código / N° de Cédula..."
              disabled={locked}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-medium text-xs focus:bg-slate-950 focus:ring-2 focus:ring-[#00A859] outline-hidden transition-all placeholder:text-slate-500 disabled:opacity-60"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          </div>
          <button
            type="button"
            onClick={onOpenScanner}
            disabled={locked}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 bg-[#00A859] hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-xl transition-colors cursor-pointer"
          >
            <Camera className="w-4 h-4" />
            <span className="hidden sm:inline">Escanear</span>
          </button>
        </div>

        {scanMessage && (
          <div
            className={`p-3 rounded-xl text-xs font-extrabold flex items-center justify-between ${
              scanMessage.type === 'success'
                ? 'bg-emerald-500/20 border border-[#00A859] text-emerald-300'
                : scanMessage.type === 'warning'
                ? 'bg-amber-500/20 border border-amber-400 text-amber-300'
                : 'bg-rose-500/20 border border-rose-500 text-rose-300'
            }`}
          >
            <span>{scanMessage.text}</span>
            <button
              type="button"
              onClick={onClearScanMessage}
              className="p-1 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Nomina local */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
          <div className="flex flex-col space-y-1 border-b pb-2">
            <div className="flex items-center justify-between">
              <span className="font-black text-xs text-slate-800 uppercase">{homeTeam?.shortName}</span>
              <span className="text-[11px] font-extrabold text-[#00A859]">
                {(sheet.homeLineup || []).length} Presentes
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] font-bold">
              <span className="text-blue-700">Foro: {homeForoCount}</span>
              <span className="text-[#00A859]">Colegio: {homeColegioCount}</span>
            </div>
          </div>
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {homePlayers.map((p) => {
              const isPresent = (sheet.homeLineup || []).some((lp: LineupPlayer) => lp.playerId === p.id);
              const isSuspended = isSusp(p);
              const isForo = p.affiliation === 'Foro de Abogados';

              return (
                <div
                  key={p.id}
                  onClick={() => onTogglePlayer('HOME', p)}
                  className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-colors ${
                    isSuspended
                      ? 'bg-rose-50 border border-rose-200 opacity-85'
                      : isPresent
                      ? 'bg-emerald-50 border border-emerald-200 font-bold text-slate-900'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    {isSuspended ? (
                      <Ban className="w-4 h-4 text-rose-600" />
                    ) : isPresent ? (
                      <CheckSquare className="w-4 h-4 text-[#00A859]" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                    <span className={isSuspended ? 'line-through text-rose-800 font-bold' : ''}>
                      #{p.dorsal} {p.name}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1">
                    <span
                      className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${
                        isForo ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-[#00A859]'
                      }`}
                    >
                      {isForo ? 'Foro' : 'Colegio'}
                    </span>
                    {isSuspended && (
                      <span className="text-[9px] font-extrabold px-1 py-0.5 rounded bg-rose-600 text-white">
                        Sancionado
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Nomina visitante */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
          <div className="flex flex-col space-y-1 border-b pb-2">
            <div className="flex items-center justify-between">
              <span className="font-black text-xs text-slate-800 uppercase">{awayTeam?.shortName}</span>
              <span className="text-[11px] font-extrabold text-[#00A859]">
                {(sheet.awayLineup || []).length} Presentes
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] font-bold">
              <span className="text-blue-700">Foro: {awayForoCount}</span>
              <span className="text-[#00A859]">Colegio: {awayColegioCount}</span>
            </div>
          </div>
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {awayPlayers.map((p) => {
              const isPresent = (sheet.awayLineup || []).some((lp: LineupPlayer) => lp.playerId === p.id);
              const isSuspended = isSusp(p);
              const isForo = p.affiliation === 'Foro de Abogados';

              return (
                <div
                  key={p.id}
                  onClick={() => onTogglePlayer('AWAY', p)}
                  className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-colors ${
                    isSuspended
                      ? 'bg-rose-50 border border-rose-200 opacity-85'
                      : isPresent
                      ? 'bg-emerald-50 border border-emerald-200 font-bold text-slate-900'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    {isSuspended ? (
                      <Ban className="w-4 h-4 text-rose-600" />
                    ) : isPresent ? (
                      <CheckSquare className="w-4 h-4 text-[#00A859]" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                    <span className={isSuspended ? 'line-through text-rose-800 font-bold' : ''}>
                      #{p.dorsal} {p.name}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1">
                    <span
                      className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${
                        isForo ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-[#00A859]'
                      }`}
                    >
                      {isForo ? 'Foro' : 'Colegio'}
                    </span>
                    {isSuspended && (
                      <span className="text-[9px] font-extrabold px-1 py-0.5 rounded bg-rose-600 text-white">
                        Sancionado
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
