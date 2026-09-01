'use client';

import React, { useState } from 'react';
import { Player, Team, Match } from '@/types';
import { calculateSanctions } from '@/lib/store';
import { TeamShield } from './TeamShield';
import { QrCode, Search, CheckCircle2, ShieldAlert, X, User, Sparkles } from 'lucide-react';

interface QRScannerModalProps {
  players: Player[];
  teams: Team[];
  matches?: Match[];
  onClose: () => void;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  players,
  teams,
  matches = [],
  onClose,
}) => {
  const [searchInput, setSearchInput] = useState('');
  const [scannedPlayer, setScannedPlayer] = useState<Player | null>(null);

  const teamMap = new Map(teams.map((t) => [t.id, t]));

  // Calculate sanctions to check if player is currently suspended
  const sanctions = calculateSanctions(players, teams, matches);
  const sanctionsMap = new Map(sanctions.map((s) => [s.playerId, s]));

  // Process search query or QR JSON string
  const handleSearch = (query: string) => {
    setSearchInput(query);
    if (!query.trim()) {
      setScannedPlayer(null);
      return;
    }

    let searchId = query.trim();

    // Check if input is a JSON payload from QR Code
    try {
      if (query.includes('{') && query.includes('}')) {
        const parsed = JSON.parse(query);
        if (parsed.id) searchId = parsed.id;
      }
    } catch {
      // Not JSON, continue text search
    }

    const matched = players.find(
      (p) =>
        p.id === searchId ||
        p.cedula === searchId ||
        p.name.toLowerCase().includes(searchId.toLowerCase()) ||
        `#${p.dorsal}` === searchId
    );

    setScannedPlayer(matched || null);
  };

  const selectedTeam = scannedPlayer ? teamMap.get(scannedPlayer.teamId) : null;
  const sanction = scannedPlayer ? sanctionsMap.get(scannedPlayer.id) : null;
  const isSuspended = sanction?.isSuspended;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200 relative my-8">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-[#00A859]/20 text-[#00A859] border border-[#00A859]/30 flex items-center justify-center font-black">
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-[#00A859] uppercase tracking-widest block">
                Herramienta Arbitral
              </span>
              <h3 className="text-lg font-black text-white">Escáner & Lector de QR</h3>
            </div>
          </div>
        </div>

        {/* Scanner Content */}
        <div className="p-6 space-y-6">
          
          {/* Input / Scanner Simulation */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Escanear o Pegar Código QR / Cédula / Nombre del Jugador
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Pegue aquí los datos del QR o busque por N° Cédula o Nombre..."
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium text-xs focus:bg-white focus:ring-2 focus:ring-[#00A859] outline-none transition-all"
                autoFocus
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            </div>
            <p className="text-[11px] text-slate-500 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[#00A859]" />
              El lector decodifica instantáneamente la firma digital del carnet.
            </p>
          </div>

          {/* Quick Select Player List if no exact match yet */}
          {!scannedPlayer && (
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                O seleccione un jugador para validar:
              </span>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {players.slice(0, 10).map((p) => {
                  const t = teamMap.get(p.teamId);
                  return (
                    <div
                      key={p.id}
                      onClick={() => setScannedPlayer(p)}
                      className="p-2.5 bg-slate-50 hover:bg-[#00A859]/10 rounded-xl border border-slate-200 cursor-pointer flex items-center justify-between transition-colors text-xs"
                    >
                      <div className="flex items-center space-x-2.5">
                        <span className="font-black text-slate-900">#{p.dorsal}</span>
                        <div>
                          <p className="font-bold text-slate-900">{p.name}</p>
                          <p className="text-[10px] text-slate-500">{t?.name}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-extrabold text-[#00A859] bg-white px-2 py-0.5 rounded-md border border-slate-200">
                        Validar
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Scanned Player Result Card */}
          {scannedPlayer && (
            <div className="bg-slate-900 text-white rounded-3xl p-6 space-y-5 border border-slate-800 animate-fadeIn relative">
              
              {/* Verification Status Banner */}
              {isSuspended ? (
                <div className="bg-rose-500/20 border border-rose-500 text-rose-300 p-3 rounded-2xl flex items-center justify-between text-xs font-black">
                  <div className="flex items-center space-x-2">
                    <ShieldAlert className="w-5 h-5 text-rose-400" />
                    <span>JUGADOR SUSPENDIDO / NO PUEDE JUGAR</span>
                  </div>
                </div>
              ) : (
                <div className="bg-[#00A859]/20 border border-[#00A859] text-[#00A859] p-3 rounded-2xl flex items-center justify-between text-xs font-black">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>HABILITADO OFICIALMENTE EN CANCHA</span>
                  </div>
                </div>
              )}

              {/* Player Info Row */}
              <div className="flex items-center space-x-4">
                <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-[#00A859] bg-slate-800 shrink-0">
                  {scannedPlayer.photo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img 
                      src={scannedPlayer.photo} 
                      alt={scannedPlayer.name} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-500">
                      <User className="w-8 h-8" />
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-black text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-md">
                      #{scannedPlayer.dorsal}
                    </span>
                    <span className="text-xs font-bold text-slate-400">
                      {scannedPlayer.position}
                    </span>
                  </div>
                  <h4 className="text-lg font-black text-white leading-snug">
                    {scannedPlayer.name}
                  </h4>
                  {selectedTeam && (
                    <div className="flex items-center space-x-2">
                      <TeamShield logoKey={selectedTeam.logo} name={selectedTeam.name} size="sm" />
                      <span className="text-xs font-bold text-slate-300">{selectedTeam.name}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">N° Cédula</span>
                  <span className="font-mono font-bold text-slate-200">{scannedPlayer.cedula}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Afiliación</span>
                  <span className="font-bold text-[#00A859]">{scannedPlayer.affiliation || 'Foro de Abogados'}</span>
                </div>
              </div>

              {isSuspended && sanction && (
                <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-xl text-xs text-rose-200">
                  <strong>Motivo de Suspensión:</strong> {sanction.suspensionReason}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 text-right">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors shadow-sm"
          >
            Cerrar Escáner
          </button>
        </div>

      </div>
    </div>
  );
};
