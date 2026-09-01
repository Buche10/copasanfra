'use client';

import React from 'react';
import { PlayerScorer, Player, Team } from '@/types';
import { TeamShield } from './TeamShield';
import { Flame, ChevronRight } from 'lucide-react';

interface ScorersTableProps {
  scorers: PlayerScorer[];
  players: Player[];
  teams: Team[];
  onSelectPlayer: (player: Player) => void;
  onSelectTeam: (team: Team) => void;
}

export const ScorersTable: React.FC<ScorersTableProps> = ({
  scorers,
  players,
  teams,
  onSelectPlayer,
  onSelectTeam,
}) => {
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-amber-700 via-amber-800 to-amber-900 p-6 rounded-3xl text-white shadow-xl relative overflow-hidden">
        <div className="space-y-1 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-amber-100 backdrop-blur-md text-xs font-bold uppercase tracking-wider">
            <Flame className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
            <span>Bota de Oro</span> • <span>Copa Abogados</span>
          </div>
          <h2 className="text-2xl font-black tracking-tight">Tabla de Goleadores</h2>
          <p className="text-amber-100 text-sm">
            Consulta el rendimiento goleador individual. Haz clic en un jugador o equipo para ver su ficha completa.
          </p>
        </div>
      </div>

      {/* Top 3 Podiums */}
      {scorers.length >= 3 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 2nd Place */}
          <div 
            onClick={() => {
              const p = playerMap.get(scorers[1].playerId);
              if (p) onSelectPlayer(p);
            }}
            className="glass-card rounded-3xl p-5 border border-slate-200 shadow-md flex items-center space-x-4 relative overflow-hidden order-2 md:order-1 cursor-pointer hover:shadow-xl transition-all"
          >
            <div className="w-12 h-12 rounded-2xl bg-slate-200 text-slate-800 flex items-center justify-center font-black text-sm shadow-inner shrink-0">
              2°
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">2° Lugar</span>
              <h4 className="font-extrabold text-slate-900 truncate">{scorers[1].playerName}</h4>
              <p className="text-xs text-slate-500 font-medium">
                {scorers[1].teamName}
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-[#00A859]">{scorers[1].goals}</span>
              <span className="block text-[10px] font-bold uppercase text-slate-400">Goles</span>
            </div>
          </div>

          {/* 1st Place (Gold Highlight) */}
          <div 
            onClick={() => {
              const p = playerMap.get(scorers[0].playerId);
              if (p) onSelectPlayer(p);
            }}
            className="bg-gradient-to-b from-amber-50 to-white rounded-3xl p-6 border-2 border-amber-400 shadow-xl flex items-center space-x-4 relative overflow-hidden order-1 md:order-2 transform md:-translate-y-2 cursor-pointer hover:shadow-2xl transition-all"
          >
            <div className="w-14 h-14 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-black text-lg shadow-lg shrink-0">
              1°
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-black text-amber-600 uppercase tracking-wider flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 fill-amber-500" /> Líder de Goleo
              </span>
              <h3 className="font-black text-lg text-slate-900 truncate">{scorers[0].playerName}</h3>
              <p className="text-xs font-bold text-slate-600">
                {scorers[0].teamName}
              </p>
            </div>
            <div className="text-right">
              <span className="text-3xl font-black text-[#00A859]">{scorers[0].goals}</span>
              <span className="block text-[10px] font-bold uppercase text-slate-400">Goles</span>
            </div>
          </div>

          {/* 3rd Place */}
          <div 
            onClick={() => {
              const p = playerMap.get(scorers[2].playerId);
              if (p) onSelectPlayer(p);
            }}
            className="glass-card rounded-3xl p-5 border border-slate-200 shadow-md flex items-center space-x-4 relative overflow-hidden order-3 cursor-pointer hover:shadow-xl transition-all"
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-900 flex items-center justify-center font-black text-sm shadow-inner shrink-0">
              3°
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">3° Lugar</span>
              <h4 className="font-extrabold text-slate-900 truncate">{scorers[2].playerName}</h4>
              <p className="text-xs text-slate-500 font-medium">
                {scorers[2].teamName}
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-[#00A859]">{scorers[2].goals}</span>
              <span className="block text-[10px] font-bold uppercase text-slate-400">Goles</span>
            </div>
          </div>
        </div>
      )}

      {/* Scorers Table */}
      <div className="glass-card rounded-3xl overflow-hidden shadow-lg border border-slate-200">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left border-collapse min-w-[650px]">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                <th className="py-4 px-4 text-center w-12">Pos</th>
                <th className="py-4 px-4">Jugador</th>
                <th className="py-4 px-4">Equipo</th>
                <th className="py-4 px-3 text-center" title="Posición">Pos.</th>
                <th className="py-4 px-3 text-center" title="Partidos Jugados">PJ</th>
                <th className="py-4 px-3 text-center" title="Goles de Penalti">Penales</th>
                <th className="py-4 px-3 text-center" title="Promedio de Goles por Partido">Promedio</th>
                <th className="py-4 px-4 text-center font-black text-slate-900 bg-slate-200/50">Goles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {scorers.map((sc, index) => {
                const pos = index + 1;
                const avg = sc.matchesPlayed > 0 ? (sc.goals / sc.matchesPlayed).toFixed(2) : '0.00';
                const playerObj = playerMap.get(sc.playerId);
                const teamObj = teamMap.get(sc.teamId);

                return (
                  <tr key={sc.playerId} className="hover:bg-slate-50 transition-colors">
                    <td className="py-4 px-4 text-center font-bold">
                      <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-extrabold text-xs mx-auto ${
                        pos === 1 ? 'bg-amber-500 text-white' : pos === 2 ? 'bg-slate-300 text-slate-800' : pos === 3 ? 'bg-amber-800 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {pos}
                      </span>
                    </td>
                    <td 
                      onClick={() => playerObj && onSelectPlayer(playerObj)}
                      className="py-4 px-4 font-bold text-slate-900 cursor-pointer hover:text-[#00A859] transition-colors"
                    >
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-700">
                          #{sc.dorsal}
                        </div>
                        <div>
                          <div className="font-extrabold flex items-center gap-1">
                            {sc.playerName} <ChevronRight className="w-3 h-3 text-slate-400" />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td 
                      onClick={() => teamObj && onSelectTeam(teamObj)}
                      className="py-4 px-4 text-slate-700 cursor-pointer hover:text-[#00A859] transition-colors"
                    >
                      <div className="flex items-center space-x-2">
                        <TeamShield logoKey={sc.teamLogo} name={sc.teamName} size="sm" />
                        <span className="font-semibold text-xs text-slate-700">{sc.teamName}</span>
                      </div>
                    </td>
                    <td className="py-4 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-600">
                        {sc.position}
                      </span>
                    </td>
                    <td className="py-4 px-3 text-center font-semibold text-slate-600">{sc.matchesPlayed}</td>
                    <td className="py-4 px-3 text-center font-semibold text-amber-700">{sc.penalties}</td>
                    <td className="py-4 px-3 text-center font-semibold text-slate-500">{avg} / pj</td>
                    <td className="py-4 px-4 text-center font-black text-lg text-[#00A859] bg-slate-100/50">
                      {sc.goals}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
