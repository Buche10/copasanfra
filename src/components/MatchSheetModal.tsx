'use client';

import React, { useState } from 'react';
import { Match, Team, Player, EventType, GoalType, CardReason, MatchEvent, LineupPlayer, MatchFinancials, ArbitrajePayment } from '@/types';
import { calculateSanctions } from '@/lib/store';
import { TeamShield } from './TeamShield';
import { FinancialReportModal } from './FinancialReportModal';
import { CameraQrScanner } from './CameraQrScanner';
import confetti from 'canvas-confetti';
import {
  ClipboardList,
  Trash2,
  UserCheck,
  FileText,
  Play,
  CheckCheck,
  PlusCircle,
  Shield,
  Users,
  CheckSquare,
  Square,
  AlertTriangle,
  Ban,
  QrCode,
  Search,
  X,
  DollarSign,
  Printer,
  Camera
} from 'lucide-react';

interface MatchSheetModalProps {
  matches: Match[];
  teams: Team[];
  players: Player[];
  payments: ArbitrajePayment[];
  onUpdateMatch: (updatedMatch: Match) => void;
}

export const MatchSheetModal: React.FC<MatchSheetModalProps> = ({
  matches,
  teams,
  players,
  payments,
  onUpdateMatch,
}) => {
  const [selectedRound, setSelectedRound] = useState<number | null>(matches[0]?.round ?? null);
  const [selectedMatchId, setSelectedMatchId] = useState<string>(matches[0]?.id || '');
  
  // Event Form State
  const [eventType, setEventType] = useState<EventType>('GOAL');
  const [eventTeamId, setEventTeamId] = useState<string>('');
  const [eventPlayerId, setEventPlayerId] = useState<string>('');
  const [eventMinute, setEventMinute] = useState<number>(15);
  const [goalType, setGoalType] = useState<GoalType>('REGULAR');
  const [cardReason, setCardReason] = useState<CardReason>('UNSPORTING');
  const [refNotes, setRefNotes] = useState<string>('');

  // Automatic Lineup QR Check-in State
  const [qrScanInput, setQrScanInput] = useState('');
  const [scanMessage, setScanMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [showCamera, setShowCamera] = useState(false);

  // Financial Report Modal State
  const [showFinancialReportModal, setShowFinancialReportModal] = useState(false);

  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const playerMap = new Map(players.map((p) => [p.id, p]));

  // Fechas (jornadas) disponibles, para que el árbitro filtre y no vea toda la
  // lista de partidos del campeonato. La fecha efectiva es robusta ante cambios
  // de categoría (si la guardada ya no aplica, cae a la primera disponible).
  const roundList = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const roundDate = (r: number) => matches.find((m) => m.round === r)?.date;
  const effectiveRound =
    selectedRound != null && roundList.includes(selectedRound) ? selectedRound : roundList[0] ?? null;
  const matchesInRound = matches.filter((m) => effectiveRound == null || m.round === effectiveRound);

  // Partido actual: si el id guardado ya no aplica (cambio de categoría/fecha),
  // cae al primer partido de la fecha.
  const currentMatch =
    matches.find((m) => m.id === selectedMatchId) || matchesInRound[0] || matches[0];

  // Calculate sanctions
  const sanctions = calculateSanctions(players, teams, matches);
  const sanctionsMap = new Map(sanctions.map((s) => [s.playerId, s]));

  if (!currentMatch) {
    return (
      <div className="text-center py-12 bg-white rounded-3xl p-8 border border-slate-200">
        <h3 className="text-lg font-bold text-slate-800">No hay partidos asignados para arbitraje</h3>
      </div>
    );
  }

  const homeTeam = teamMap.get(currentMatch.homeTeamId);
  const awayTeam = teamMap.get(currentMatch.awayTeamId);

  // Estado del arbitraje ($15 por fecha) de cada equipo en ESTA fecha. Se toma
  // el último respaldo enviado; "pagado" = respaldo APROBADO por el Admin.
  const arbFor = (teamId: string): ArbitrajePayment | undefined =>
    payments
      .filter((p) => p.teamId === teamId && p.round === currentMatch.round)
      .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''))[0];
  const homeArb = arbFor(currentMatch.homeTeamId);
  const awayArb = arbFor(currentMatch.awayTeamId);
  const homeArbPaid = homeArb?.status === 'APPROVED';
  const awayArbPaid = awayArb?.status === 'APPROVED';

  const homePlayers = players.filter((p) => p.teamId === currentMatch.homeTeamId);
  const awayPlayers = players.filter((p) => p.teamId === currentMatch.awayTeamId);

  // Check suspended players for this match
  const suspendedHomePlayers = homePlayers.filter((p) => sanctionsMap.get(p.id)?.isSuspended);
  const suspendedAwayPlayers = awayPlayers.filter((p) => sanctionsMap.get(p.id)?.isSuspended);
  const allSuspendedInMatch = [...suspendedHomePlayers, ...suspendedAwayPlayers];

  const currentTeamPlayers = eventTeamId === currentMatch.homeTeamId ? homePlayers : awayPlayers;

  // Goalkeepers
  const currentHomeGkId = currentMatch.homeGoalkeeperId || homePlayers.find((p) => p.position === 'POR')?.id || '';
  const currentAwayGkId = currentMatch.awayGoalkeeperId || awayPlayers.find((p) => p.position === 'POR')?.id || '';

  // 8v8 Rule Validation: Max 3 players from Foro de Abogados on pitch
  const homeLineupPlayers = (currentMatch.homeLineup || []).map((lp) => playerMap.get(lp.playerId)).filter(Boolean) as Player[];
  const awayLineupPlayers = (currentMatch.awayLineup || []).map((lp) => playerMap.get(lp.playerId)).filter(Boolean) as Player[];

  const homeForoCount = homeLineupPlayers.filter((p) => p.affiliation === 'Foro de Abogados').length;
  const homeColegioCount = homeLineupPlayers.filter((p) => p.affiliation !== 'Foro de Abogados').length;

  const awayForoCount = awayLineupPlayers.filter((p) => p.affiliation === 'Foro de Abogados').length;
  const awayColegioCount = awayLineupPlayers.filter((p) => p.affiliation !== 'Foro de Abogados').length;

  const handleScanAutoCheckin = (rawText: string) => {
    setQrScanInput(rawText);
    if (!rawText.trim()) {
      setScanMessage(null);
      return;
    }

    let searchId = rawText.trim();
    try {
      if (rawText.includes('{') && rawText.includes('}')) {
        const parsed = JSON.parse(rawText);
        if (parsed.id) searchId = parsed.id;
      }
    } catch {}

    const player = players.find(
      (p) =>
        p.id === searchId ||
        p.cedula === searchId ||
        p.name.toLowerCase() === searchId.toLowerCase() ||
        `#${p.dorsal}` === searchId
    );

    if (!player) {
      setScanMessage({ type: 'error', text: '❌ No se encontró ningún jugador registrado con esa cédula o código QR.' });
      return;
    }

    if (player.teamId !== currentMatch.homeTeamId && player.teamId !== currentMatch.awayTeamId) {
      const playerTeam = teamMap.get(player.teamId);
      setScanMessage({
        type: 'error',
        text: `⚠️ ¡ATENCIÓN JUEZ! #${player.dorsal} ${player.name} pertenece a "${playerTeam?.name || 'otro equipo'}", el cual NO compite en este partido.`,
      });
      return;
    }

    const sanction = sanctionsMap.get(player.id);
    if (sanction?.isSuspended) {
      setScanMessage({
        type: 'error',
        text: `⛔ ¡JUGADOR SANCIONADO! #${player.dorsal} ${player.name} no puede ingresar por sanción disciplinaria (${sanction.suspensionReason}).`,
      });
      return;
    }

    const isHome = player.teamId === currentMatch.homeTeamId;
    const lineupKey = isHome ? 'homeLineup' : 'awayLineup';
    const targetTeam = isHome ? homeTeam : awayTeam;
    const currentLineup: LineupPlayer[] = currentMatch[lineupKey] || [];

    const isAlreadyIn = currentLineup.some((lp) => lp.playerId === player.id);

    if (isAlreadyIn) {
      setScanMessage({
        type: 'warning',
        text: `ℹ️ El jugador #${player.dorsal} ${player.name} YA está registrado en la vocalía de ${targetTeam?.name}.`,
      });
      return;
    }

    const updatedLineup = [
      ...currentLineup,
      { playerId: player.id, isStarter: true, dorsal: player.dorsal, isGoalkeeper: player.position === 'POR' },
    ];

    const updatedMatch: Match = {
      ...currentMatch,
      [lineupKey]: updatedLineup,
    };

    onUpdateMatch(updatedMatch);

    try {
      confetti({ particleCount: 30, spread: 60, origin: { y: 0.6 } });
    } catch {}

    setScanMessage({
      type: 'success',
      text: `✅ ¡REGISTRO AUTOMÁTICO EN VOCALÍA! #${player.dorsal} ${player.name} agregado exitosamente a la nómina de ${targetTeam?.name}.`,
    });
    setQrScanInput('');
  };

  // Financial Calculations for currentMatch
  const homeYellows = currentMatch.events.filter((e) => e.teamId === currentMatch.homeTeamId && e.type === 'YELLOW_CARD').length;
  const awayYellows = currentMatch.events.filter((e) => e.teamId === currentMatch.awayTeamId && e.type === 'YELLOW_CARD').length;
  const homeReds = currentMatch.events.filter((e) => e.teamId === currentMatch.homeTeamId && e.type === 'RED_CARD').length;
  const awayReds = currentMatch.events.filter((e) => e.teamId === currentMatch.awayTeamId && e.type === 'RED_CARD').length;

  const homeFinesAmount = homeYellows * 1 + homeReds * 2;
  const awayFinesAmount = awayYellows * 1 + awayReds * 2;

  const totalMatchFees = 30; // $15 x 2 teams
  const totalMatchFines = homeFinesAmount + awayFinesAmount;
  const totalCollected = totalMatchFees + totalMatchFines;
  const netBalance = totalCollected - 13;

  const handleUpdateFinancialField = (
    field: keyof MatchFinancials,
    value: MatchFinancials[keyof MatchFinancials]
  ) => {
    const updatedMatch: Match = {
      ...currentMatch,
      financials: {
        feePerTeam: 15,
        yellowCardFine: 1,
        redCardFine: 2,
        refereePayment: 13,
        ...currentMatch.financials,
        [field]: value,
      },
    };
    onUpdateMatch(updatedMatch);
  };

  // Toggle player participation in homeLineup or awayLineup
  const handleTogglePlayerLineup = (teamType: 'HOME' | 'AWAY', player: Player) => {
    if (currentMatch.status === 'FINISHED') return;

    const sanction = sanctionsMap.get(player.id);
    if (sanction?.isSuspended) {
      alert(`⚠️ ¡ATENCIÓN JUEZ / VOCAL DE MESA!\n\nEl jugador ${player.name} (#${player.dorsal}) se encuentra SANCIONADO y NO PUEDE jugar este partido.\n\nMotivo: ${sanction.suspensionReason}`);
      return;
    }

    const lineupKey = teamType === 'HOME' ? 'homeLineup' : 'awayLineup';
    const currentLineup: LineupPlayer[] = currentMatch[lineupKey] || [];

    const isAlreadyIn = currentLineup.some((lp) => lp.playerId === player.id);
    let nextLineup: LineupPlayer[];

    if (isAlreadyIn) {
      nextLineup = currentLineup.filter((lp) => lp.playerId !== player.id);
    } else {
      nextLineup = [
        ...currentLineup,
        {
          playerId: player.id,
          isStarter: true,
          dorsal: player.dorsal,
          isGoalkeeper: player.position === 'POR',
        },
      ];
    }

    onUpdateMatch({
      ...currentMatch,
      [lineupKey]: nextLineup,
    });
  };

  // Change designated goalkeeper for team
  const handleChangeGoalkeeper = (teamType: 'HOME' | 'AWAY', goalkeeperId: string) => {
    if (currentMatch.status === 'FINISHED') return;

    const key = teamType === 'HOME' ? 'homeGoalkeeperId' : 'awayGoalkeeperId';
    onUpdateMatch({
      ...currentMatch,
      [key]: goalkeeperId,
    });
  };

  // Handle Event Addition
  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTeamId || !eventPlayerId) return;

    const newEvent: MatchEvent = {
      id: `ev-${crypto.randomUUID()}`,
      matchId: currentMatch.id,
      minute: eventMinute,
      type: eventType,
      teamId: eventTeamId,
      playerId: eventPlayerId,
      goalType: eventType === 'GOAL' ? goalType : undefined,
      cardReason: (eventType === 'YELLOW_CARD' || eventType === 'RED_CARD') ? cardReason : undefined,
    };

    // Calculate score updates if goal
    let newHomeScore = currentMatch.homeScore;
    let newAwayScore = currentMatch.awayScore;

    if (eventType === 'GOAL') {
      if (eventTeamId === currentMatch.homeTeamId) {
        if (goalType === 'OWN_GOAL') newAwayScore += 1;
        else newHomeScore += 1;
      } else {
        if (goalType === 'OWN_GOAL') newHomeScore += 1;
        else newAwayScore += 1;
      }
    }

    const updatedMatch: Match = {
      ...currentMatch,
      homeScore: newHomeScore,
      awayScore: newAwayScore,
      events: [...currentMatch.events, newEvent],
    };

    onUpdateMatch(updatedMatch);
    setEventPlayerId('');
  };

  // Handle Event Deletion
  const handleDeleteEvent = (eventId: string) => {
    const evToDelete = currentMatch.events.find((e) => e.id === eventId);
    if (!evToDelete) return;

    let newHomeScore = currentMatch.homeScore;
    let newAwayScore = currentMatch.awayScore;

    if (evToDelete.type === 'GOAL') {
      if (evToDelete.teamId === currentMatch.homeTeamId) {
        if (evToDelete.goalType === 'OWN_GOAL') newAwayScore = Math.max(0, newAwayScore - 1);
        else newHomeScore = Math.max(0, newHomeScore - 1);
      } else {
        if (evToDelete.goalType === 'OWN_GOAL') newHomeScore = Math.max(0, newHomeScore - 1);
        else newAwayScore = Math.max(0, newAwayScore - 1);
      }
    }

    const updatedMatch: Match = {
      ...currentMatch,
      homeScore: newHomeScore,
      awayScore: newAwayScore,
      events: currentMatch.events.filter((e) => e.id !== eventId),
    };

    onUpdateMatch(updatedMatch);
  };

  // Status Change handlers
  const handleStartMatch = () => {
    onUpdateMatch({
      ...currentMatch,
      status: 'IN_PROGRESS',
    });
  };

  const handleFinishMatch = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });

    onUpdateMatch({
      ...currentMatch,
      status: 'FINISHED',
      homeGoalkeeperId: currentHomeGkId,
      awayGoalkeeperId: currentAwayGkId,
      refereeSigned: true,
      refereeNotes: refNotes || currentMatch.refereeNotes,
      signedAt: new Date().toLocaleString(),
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 rounded-3xl text-white shadow-xl">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#00A859]/20 text-[#00A859] border border-[#00A859]/30 text-xs font-bold uppercase tracking-wider">
            <ClipboardList className="w-3.5 h-3.5 text-[#00A859]" />
            <span>Vocalía y Control Arbitral</span> • <span>Planilla Digital</span>
          </div>
          <h2 className="text-2xl font-black tracking-tight">Hoja de Control Oficial</h2>
          <p className="text-slate-300 text-sm">
            Control de nómina, sancionados, designación de porteros y registro oficial de incidencias.
          </p>
        </div>

        {/* Fecha + Match Selector Dropdowns */}
        <div className="w-full md:w-auto grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3 md:min-w-[520px]">
          {/* Round (Fecha) filter */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Fecha:</label>
            <select
              value={effectiveRound ?? ''}
              onChange={(e) => {
                const r = Number(e.target.value);
                setSelectedRound(r);
                const first = matches.find((m) => m.round === r);
                if (first) {
                  setSelectedMatchId(first.id);
                  setEventTeamId('');
                }
              }}
              className="w-full bg-slate-800 text-white font-bold text-sm px-4 py-3 rounded-2xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-[#00A859]"
            >
              {roundList.map((r) => (
                <option key={r} value={r}>
                  Fecha {r}{roundDate(r) ? ` — ${roundDate(r)}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Match selector (solo los de la fecha elegida) */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
              Seleccionar Partido Asignado:
            </label>
            <select
              value={selectedMatchId}
              onChange={(e) => {
                setSelectedMatchId(e.target.value);
                setEventTeamId('');
              }}
              className="w-full bg-slate-800 text-white font-bold text-sm px-4 py-3 rounded-2xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-[#00A859]"
            >
              {matchesInRound.map((m) => {
                const h = teamMap.get(m.homeTeamId);
                const a = teamMap.get(m.awayTeamId);
                return (
                  <option key={m.id} value={m.id}>
                    [{m.category}] {h?.shortName} vs {a?.shortName} ({m.stadium || 'Cancha 1'} - {m.time})
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </div>

      {/* PROMINENT SANCTION ALERT BANNER FOR REFEREE / CONTROL */}
      {allSuspendedInMatch.length > 0 && (
        <div className="bg-rose-50 border-2 border-rose-400 p-5 rounded-3xl flex flex-col space-y-3 text-rose-950 shadow-lg">
          <div className="flex items-center gap-2 font-black text-sm uppercase text-rose-700 tracking-wide">
            <AlertTriangle className="w-6 h-6 text-rose-600 animate-bounce" />
            <span>⚠️ NOTIFICACIÓN OFICIAL PARA EL ÁRBITRO Y VOCAL DE MESA</span>
          </div>
          <p className="text-xs font-bold text-rose-900">
            Los siguientes jugadores tienen una <span className="underline decoration-rose-500 font-black">SANCIÓN ACTIVA</span> y <span className="uppercase text-rose-700 font-black">NO PUEDEN JUGAR NI FIRMAR EL ACTA</span> en esta fecha:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {allSuspendedInMatch.map((p) => {
              const sanc = sanctionsMap.get(p.id);
              const team = teamMap.get(p.teamId);
              return (
                <div key={p.id} className="bg-white p-3 rounded-2xl border border-rose-300 text-xs font-bold flex items-center justify-between shadow-sm">
                  <div className="flex items-center space-x-2">
                    <Ban className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>#{p.dorsal} {p.name} <span className="text-slate-500">({team?.shortName})</span></span>
                  </div>
                  <span className="text-[10px] font-extrabold bg-rose-100 text-rose-800 px-2 py-1 rounded-lg border border-rose-200">
                    {sanc?.suspensionReason || 'Sancionado'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Match Score & Control Card */}
      <div className="glass-card rounded-3xl p-6 border border-slate-200 shadow-xl space-y-6">
        
        {/* Score Board */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 bg-slate-50 rounded-2xl border border-slate-200">
          {/* Home Team */}
          <div className="text-center space-y-2 flex flex-col items-center">
            <TeamShield logoKey={homeTeam?.logo} name={homeTeam?.name || ''} size="lg" />
            <h3 className="font-extrabold text-slate-900 text-base">{homeTeam?.name}</h3>
            <span className="text-xs text-slate-500 font-semibold">Local</span>
          </div>

          {/* Score Display */}
          <div className="text-center space-y-2">
            <div className="text-5xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <span className="bg-white px-5 py-2 rounded-2xl shadow-inner border border-slate-200">
                {currentMatch.homeScore}
              </span>
              <span className="text-slate-400 font-light text-3xl">:</span>
              <span className="bg-white px-5 py-2 rounded-2xl shadow-inner border border-slate-200">
                {currentMatch.awayScore}
              </span>
            </div>

            <div>
              {currentMatch.status === 'SCHEDULED' && (
                <button
                  onClick={handleStartMatch}
                  className="px-5 py-2.5 bg-[#00A859] hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 mx-auto"
                >
                  <Play className="w-4 h-4 fill-white" /> Iniciar Partido
                </button>
              )}
              {currentMatch.status === 'IN_PROGRESS' && (
                <span className="px-3.5 py-1 bg-rose-600 text-white font-black text-xs rounded-full animate-pulse inline-block shadow-sm">
                  EN JUEGO
                </span>
              )}
              {currentMatch.status === 'FINISHED' && (
                <span className="px-3.5 py-1 bg-emerald-100 text-[#00A859] font-black text-xs rounded-full border border-emerald-200 inline-block">
                  FINALIZADO Y FIRMADO
                </span>
              )}
            </div>
          </div>

          {/* Away Team */}
          <div className="text-center space-y-2 flex flex-col items-center">
            <TeamShield logoKey={awayTeam?.logo} name={awayTeam?.name || ''} size="lg" />
            <h3 className="font-extrabold text-slate-900 text-base">{awayTeam?.name}</h3>
            <span className="text-xs text-slate-500 font-semibold">Visitante</span>
          </div>
        </div>

        {/* SECTION 1: DESIGNATED GOALKEEPER SELECTOR */}
        <div className="bg-slate-100/80 p-5 rounded-2xl border border-slate-200 space-y-4">
          <div className="flex items-center space-x-2 border-b pb-3 border-slate-200">
            <Shield className="w-5 h-5 text-blue-600" />
            <div>
              <h4 className="font-extrabold text-slate-900 text-sm">Designación de Arqueros Titulares</h4>
              <p className="text-xs text-slate-500">
                Selecciona al arquero que atajó en este partido para abonarle las estadísticas de Portería a 0.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Home Goalkeeper */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                🧤 Arquero {homeTeam?.name} (Local):
              </label>
              <select
                value={currentHomeGkId}
                onChange={(e) => handleChangeGoalkeeper('HOME', e.target.value)}
                disabled={currentMatch.status === 'FINISHED'}
                className="w-full bg-slate-50 text-slate-900 font-bold text-xs p-3 rounded-xl border border-slate-300"
              >
                <option value="">-- Seleccionar Arquero --</option>
                {homePlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.dorsal} {p.name} {p.position === 'POR' ? '(Guardameta)' : `(${p.position})`}
                  </option>
                ))}
              </select>
            </div>

            {/* Away Goalkeeper */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                🧤 Arquero {awayTeam?.name} (Visitante):
              </label>
              <select
                value={currentAwayGkId}
                onChange={(e) => handleChangeGoalkeeper('AWAY', e.target.value)}
                disabled={currentMatch.status === 'FINISHED'}
                className="w-full bg-slate-50 text-slate-900 font-bold text-xs p-3 rounded-xl border border-slate-300"
              >
                <option value="">-- Seleccionar Arquero --</option>
                {awayPlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.dorsal} {p.name} {p.position === 'POR' ? '(Guardameta)' : `(${p.position})`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* SECTION 2: PARTICIPATING PLAYERS LINEUP / CONCURRENCIA */}
        <div className="bg-slate-100/80 p-5 rounded-2xl border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3 border-slate-200">
            <div className="flex items-center space-x-2">
              <Users className="w-5 h-5 text-[#00A859]" />
              <div>
                <h4 className="font-extrabold text-slate-900 text-sm">Nómina y Concurrencia de Jugadores en Acta (8 vs 8)</h4>
                <p className="text-xs text-slate-500">
                  Formato 8 en cancha: Máximo 3 del Foro de Abogados por equipo (Mínimo 5 del Colegio de Abogados).
                </p>
              </div>
            </div>

            <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-[#00A859]/10 text-[#00A859] rounded-full text-xs font-black shrink-0">
              <span>Regla Cancha 8v8</span>
            </div>
          </div>

          {/* QR Auto Checkin Box for Referees */}
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
                  onChange={(e) => handleScanAutoCheckin(e.target.value)}
                  placeholder="Escanee el carnet o ingrese el código / N° de Cédula..."
                  disabled={currentMatch.status === 'FINISHED'}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-medium text-xs focus:bg-slate-950 focus:ring-2 focus:ring-[#00A859] outline-none transition-all placeholder:text-slate-500"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              </div>
              <button
                type="button"
                onClick={() => setShowCamera(true)}
                disabled={currentMatch.status === 'FINISHED'}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 bg-[#00A859] hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-xl transition-colors"
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
                <button onClick={() => setScanMessage(null)} className="p-1 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* 8v8 Rule Violation Warning Banner */}
          {(homeForoCount > 3 || awayForoCount > 3) && (
            <div className="p-4 bg-amber-50 border-2 border-amber-400 rounded-2xl text-amber-950 text-xs font-bold space-y-1">
              <div className="flex items-center gap-1.5 text-amber-800 font-black uppercase">
                <AlertTriangle className="w-4 h-4 text-amber-600 animate-bounce" />
                <span>Advertencia de Alineación en Cancha (Regla 8v8)</span>
              </div>
              {homeForoCount > 3 && (
                <p>⚠️ {homeTeam?.name} excede el límite: <strong className="text-red-700 font-black">{homeForoCount} jugadores del Foro en cancha</strong> (Máximo permitido: 3).</p>
              )}
              {awayForoCount > 3 && (
                <p>⚠️ {awayTeam?.name} excede el límite: <strong className="text-red-700 font-black">{awayForoCount} jugadores del Foro en cancha</strong> (Máximo permitido: 3).</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Home Lineup List */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex flex-col space-y-1 border-b pb-2">
                <div className="flex items-center justify-between">
                  <span className="font-black text-xs text-slate-800 uppercase">{homeTeam?.shortName}</span>
                  <span className="text-[11px] font-extrabold text-[#00A859]">
                    {(currentMatch.homeLineup || []).length} Presentes
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] font-bold">
                  <span className={homeForoCount > 3 ? 'text-rose-600 font-black' : 'text-slate-600'}>
                    Foro: {homeForoCount}/3 máx {homeForoCount > 3 && '⚠️ Excedido'}
                  </span>
                  <span className="text-slate-600">
                    Colegio: {homeColegioCount}/5 mín
                  </span>
                </div>
              </div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {homePlayers.map((p) => {
                  const isPresent = (currentMatch.homeLineup || []).some((lp) => lp.playerId === p.id);
                  const isSuspended = sanctionsMap.get(p.id)?.isSuspended;
                  const isForo = p.affiliation === 'Foro de Abogados';

                  return (
                    <div
                      key={p.id}
                      onClick={() => handleTogglePlayerLineup('HOME', p)}
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
                        <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${
                          isForo ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-[#00A859]'
                        }`}>
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

            {/* Away Lineup List */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex flex-col space-y-1 border-b pb-2">
                <div className="flex items-center justify-between">
                  <span className="font-black text-xs text-slate-800 uppercase">{awayTeam?.shortName}</span>
                  <span className="text-[11px] font-extrabold text-[#00A859]">
                    {(currentMatch.awayLineup || []).length} Presentes
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] font-bold">
                  <span className={awayForoCount > 3 ? 'text-rose-600 font-black' : 'text-slate-600'}>
                    Foro: {awayForoCount}/3 máx {awayForoCount > 3 && '⚠️ Excedido'}
                  </span>
                  <span className="text-slate-600">
                    Colegio: {awayColegioCount}/5 mín
                  </span>
                </div>
              </div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {awayPlayers.map((p) => {
                  const isPresent = (currentMatch.awayLineup || []).some((lp) => lp.playerId === p.id);
                  const isSuspended = sanctionsMap.get(p.id)?.isSuspended;
                  const isForo = p.affiliation === 'Foro de Abogados';

                  return (
                    <div
                      key={p.id}
                      onClick={() => handleTogglePlayerLineup('AWAY', p)}
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
                        <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${
                          isForo ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-[#00A859]'
                        }`}>
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

        {/* SECTION 3: EVENT LOGGER FORM */}
        {currentMatch.status !== 'FINISHED' && (
          <form onSubmit={handleAddEvent} className="bg-slate-100/70 p-5 rounded-2xl border border-slate-200 space-y-4">
            <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-[#00A859]" /> Registrar Evento (Gol o Tarjeta)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Event Type */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Tipo de Evento</label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value as EventType)}
                  className="w-full bg-white text-slate-900 font-bold text-xs p-3 rounded-xl border border-slate-300"
                >
                  <option value="GOAL">Gol Anotado</option>
                  <option value="YELLOW_CARD">Tarjeta Amarilla</option>
                  <option value="RED_CARD">Tarjeta Roja Directa</option>
                </select>
              </div>

              {/* Team Select */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Equipo</label>
                <select
                  value={eventTeamId}
                  onChange={(e) => {
                    setEventTeamId(e.target.value);
                    setEventPlayerId('');
                  }}
                  className="w-full bg-white text-slate-900 font-bold text-xs p-3 rounded-xl border border-slate-300"
                  required
                >
                  <option value="">-- Seleccionar Equipo --</option>
                  <option value={currentMatch.homeTeamId}>{homeTeam?.name}</option>
                  <option value={currentMatch.awayTeamId}>{awayTeam?.name}</option>
                </select>
              </div>

              {/* Player Select */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Jugador Habilitado</label>
                <select
                  value={eventPlayerId}
                  onChange={(e) => setEventPlayerId(e.target.value)}
                  className="w-full bg-white text-slate-900 font-bold text-xs p-3 rounded-xl border border-slate-300"
                  disabled={!eventTeamId}
                  required
                >
                  <option value="">-- Seleccionar Jugador --</option>
                  {currentTeamPlayers
                    .filter((p) => !sanctionsMap.get(p.id)?.isSuspended)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.dorsal} {p.name} ({p.position})
                      </option>
                    ))}
                </select>
              </div>

              {/* Minute */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Minuto</label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={eventMinute}
                  onChange={(e) => setEventMinute(Number(e.target.value))}
                  className="w-full bg-white text-slate-900 font-bold text-xs p-3 rounded-xl border border-slate-300"
                  required
                />
              </div>
            </div>

            {/* Event Specific Sub-options */}
            {eventType === 'GOAL' && (
              <div className="flex items-center space-x-4 pt-2">
                <span className="text-xs font-bold text-slate-600">Tipo de Gol:</span>
                <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                  <input
                    type="radio"
                    name="goalType"
                    checked={goalType === 'REGULAR'}
                    onChange={() => setGoalType('REGULAR')}
                  />
                  <span>Jugada Normal</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                  <input
                    type="radio"
                    name="goalType"
                    checked={goalType === 'PENALTY'}
                    onChange={() => setGoalType('PENALTY')}
                  />
                  <span>Penalti</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer text-rose-600">
                  <input
                    type="radio"
                    name="goalType"
                    checked={goalType === 'OWN_GOAL'}
                    onChange={() => setGoalType('OWN_GOAL')}
                  />
                  <span>Autogol</span>
                </label>
              </div>
            )}

            {(eventType === 'YELLOW_CARD' || eventType === 'RED_CARD') && (
              <div className="pt-2">
                <label className="block text-xs font-bold text-slate-600 mb-1">Motivo de la Tarjeta</label>
                <select
                  value={cardReason}
                  onChange={(e) => setCardReason(e.target.value as CardReason)}
                  className="w-full bg-white text-slate-900 font-bold text-xs p-3 rounded-xl border border-slate-300"
                >
                  <option value="UNSPORTING">Conducta antideportiva</option>
                  <option value="DISSENT">Reclamo o desaprobación al árbitro</option>
                  <option value="REPEATED_FOULS">Infracciones persistentes</option>
                  <option value="SERIOUS_FOUL">Juego brusco grave</option>
                  <option value="VIOLENT_CONDUCT">Conducta violenta / Agresión</option>
                </select>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-[#00A859] hover:bg-emerald-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition-colors"
            >
              + Agregar Evento a la Planilla
            </button>
          </form>
        )}

        {/* Registered Events Table */}
        <div className="space-y-3">
          <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-wider">
            Eventos Registrados en Planilla ({currentMatch.events.length})
          </h4>

          {currentMatch.events.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs italic bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              No se han registrado eventos aún en esta hoja de control.
            </div>
          ) : (
            <div className="space-y-2">
              {currentMatch.events.map((ev) => {
                const player = playerMap.get(ev.playerId);
                const team = teamMap.get(ev.teamId);

                return (
                  <div
                    key={ev.id}
                    className="flex items-center justify-between p-3 bg-white rounded-2xl border border-slate-200 text-xs shadow-sm"
                  >
                    <div className="flex items-center space-x-3">
                      <span className="w-8 h-8 rounded-xl bg-slate-900 text-white font-black flex items-center justify-center">
                        {ev.minute}&apos;
                      </span>
                      <div>
                        <span className="font-black text-slate-900 mr-2">
                          {ev.type === 'GOAL' && `Gol (${ev.goalType || 'Normal'})`}
                          {ev.type === 'YELLOW_CARD' && 'Tarjeta Amarilla'}
                          {ev.type === 'RED_CARD' && 'Tarjeta Roja'}
                        </span>
                        <span className="font-bold text-slate-700">
                          {player?.name} (#{player?.dorsal})
                        </span>
                        <span className="text-slate-400 ml-2 font-medium">({team?.shortName})</span>
                      </div>
                    </div>

                    {currentMatch.status !== 'FINISHED' && (
                      <button
                        onClick={() => handleDeleteEvent(ev.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                        title="Eliminar Evento"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SECTION 4: RECAUDACIÓN Y CIERRE FINANCIERO DEL PARTIDO */}
        <div className="bg-emerald-50/60 p-5 rounded-2xl border border-emerald-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200 pb-3">
            <div className="flex items-center space-x-2">
              <DollarSign className="w-5 h-5 text-[#00A859]" />
              <div>
                <h4 className="font-extrabold text-slate-900 text-sm">Control de Cierre de Caja y Cuentas del Partido</h4>
                <p className="text-xs text-slate-500">
                  Tarifas: $15 por equipo • $1 por Amarilla • $2 por Roja • Honorario Árbitro: $13
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowFinancialReportModal(true)}
              className="flex items-center space-x-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-sm shrink-0"
            >
              <Printer className="w-4 h-4 text-[#00A859]" />
              <span>📄 Generar Reporte PDF</span>
            </button>
          </div>

          {/* Estado del arbitraje ($15/fecha) por equipo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { team: homeTeam, paid: homeArbPaid, arb: homeArb, label: 'Local' },
              { team: awayTeam, paid: awayArbPaid, arb: awayArb, label: 'Visitante' },
            ].map(({ team, paid, arb, label }) => (
              <div
                key={label}
                className={`flex items-center justify-between gap-2 p-3 rounded-xl border ${
                  paid ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-300'
                }`}
              >
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Arbitraje {label} ($15)</span>
                  <span className="text-xs font-black text-slate-800 truncate block">{team?.shortName}</span>
                </div>
                <div className="text-right shrink-0">
                  {paid ? (
                    <span className="text-xs font-black text-emerald-700 flex items-center gap-1">
                      <CheckCheck className="w-4 h-4" /> Pagado
                    </span>
                  ) : (
                    <span className="text-xs font-black text-amber-700 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" /> {arb?.status === 'PENDING' ? 'En revisión' : 'No pagado'}
                    </span>
                  )}
                  {paid && arb?.receiptUrl && (
                    <a
                      href={arb.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-bold text-emerald-700 underline"
                    >
                      ver respaldo
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {(!homeArbPaid || !awayArbPaid) && (
            <div className="p-3 bg-amber-100 border border-amber-300 rounded-xl text-[11px] font-bold text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Cobrar el arbitraje en efectivo a:{' '}
                {[!homeArbPaid ? homeTeam?.shortName : null, !awayArbPaid ? awayTeam?.shortName : null]
                  .filter(Boolean)
                  .join(' y ')}
                . Esta novedad constará en el reporte final.
              </span>
            </div>
          )}

          {/* Methods Selection Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Home Financials */}
            <div className="bg-white p-3.5 rounded-xl border border-emerald-200 space-y-2">
              <span className="font-extrabold text-slate-900 block border-b pb-1 uppercase">{homeTeam?.shortName}</span>
              <div className="flex items-center justify-between">
                <span>Vocalía ($15.00):</span>
                <select
                  value={currentMatch.financials?.homeFeeMethod || 'EFECTIVO'}
                  onChange={(e) => handleUpdateFinancialField('homeFeeMethod', e.target.value)}
                  disabled={currentMatch.status === 'FINISHED'}
                  className="bg-slate-50 font-bold px-2 py-1 rounded-lg border border-slate-200 text-xs"
                >
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span>Multas Tarjetas (${homeFinesAmount.toFixed(2)}):</span>
                <select
                  value={currentMatch.financials?.homeFinesMethod || 'EFECTIVO'}
                  onChange={(e) => handleUpdateFinancialField('homeFinesMethod', e.target.value)}
                  disabled={currentMatch.status === 'FINISHED'}
                  className="bg-slate-50 font-bold px-2 py-1 rounded-lg border border-slate-200 text-xs"
                >
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                </select>
              </div>
            </div>

            {/* Away Financials */}
            <div className="bg-white p-3.5 rounded-xl border border-emerald-200 space-y-2">
              <span className="font-extrabold text-slate-900 block border-b pb-1 uppercase">{awayTeam?.shortName}</span>
              <div className="flex items-center justify-between">
                <span>Vocalía ($15.00):</span>
                <select
                  value={currentMatch.financials?.awayFeeMethod || 'EFECTIVO'}
                  onChange={(e) => handleUpdateFinancialField('awayFeeMethod', e.target.value)}
                  disabled={currentMatch.status === 'FINISHED'}
                  className="bg-slate-50 font-bold px-2 py-1 rounded-lg border border-slate-200 text-xs"
                >
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span>Multas Tarjetas (${awayFinesAmount.toFixed(2)}):</span>
                <select
                  value={currentMatch.financials?.awayFinesMethod || 'EFECTIVO'}
                  onChange={(e) => handleUpdateFinancialField('awayFinesMethod', e.target.value)}
                  disabled={currentMatch.status === 'FINISHED'}
                  className="bg-slate-50 font-bold px-2 py-1 rounded-lg border border-slate-200 text-xs"
                >
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                </select>
              </div>
            </div>
          </div>

          {/* Real-time Cash Balance Box */}
          <div className="bg-slate-900 text-white p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="space-y-0.5 text-xs">
              <p className="text-slate-400 font-bold">Vocalías: <strong className="text-white">$30.00</strong> • Multas: <strong className="text-white">${totalMatchFines.toFixed(2)}</strong></p>
              <p className="text-slate-400 font-bold">Total Recaudado: <strong className="text-emerald-400">${totalCollected.toFixed(2)}</strong> • Pago Árbitro: <strong className="text-rose-400">-$13.00</strong></p>
            </div>

            <div className="text-right shrink-0">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">Saldo Neto entregado a caja</span>
              <span className="text-xl font-black text-white">${netBalance.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Referee Final Notes & Sign Off */}
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
          <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#00A859]" /> Informe de Vocalía y Control de Partido
          </h4>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              Observaciones (Estado de cancha, incidentes, novedades en mesas de vocalía):
            </label>
            <textarea
              rows={3}
              value={refNotes || currentMatch.refereeNotes || ''}
              onChange={(e) => setRefNotes(e.target.value)}
              disabled={currentMatch.status === 'FINISHED'}
              placeholder="Ej. El partido se desarrolló sin novedades. Cancha en buen estado..."
              className="w-full bg-white text-slate-900 text-xs p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#00A859]"
            />
          </div>

          {currentMatch.status !== 'FINISHED' ? (
            <button
              onClick={handleFinishMatch}
              className="w-full py-3.5 bg-[#DC2626] hover:bg-rose-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <CheckCheck className="w-4 h-4" /> Finalizar y Firmar Planilla Oficial
            </button>
          ) : (
            <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-[#00A859]">
              <span className="flex items-center gap-1.5">
                <UserCheck className="w-4 h-4" /> Planilla Firmada Oficialmente
              </span>
              <span>{currentMatch.signedAt || 'Firmado'}</span>
            </div>
          )}
        </div>

      </div>

      {/* Financial Report Printable Modal */}
      {showFinancialReportModal && (
        <FinancialReportModal
          match={currentMatch}
          teams={teams}
          players={players}
          payments={payments}
          onClose={() => setShowFinancialReportModal(false)}
        />
      )}

      {showCamera && (
        <CameraQrScanner
          title="Escanear carnet del jugador"
          hint="Apunta al QR del carnet. Se irán registrando en la nómina automáticamente."
          onDetected={(text) => handleScanAutoCheckin(text)}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
};
