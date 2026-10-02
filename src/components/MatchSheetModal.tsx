'use client';

import React, { useState } from 'react';
import { Match, Team, Player, LineupPlayer, MatchEvent, SheetCorrection, Role } from '@/types';
import { calculateSanctions } from '@/lib/store';
import {
  addEvent,
  removeEvent,
  replaceEvent,
  scoreFromGoals,
  applyCorrection,
  validateCorrectionReason,
  validateScore,
  countSheetChanges,
} from '@/lib/matchSheet';
import { TeamShield } from './TeamShield';
import { CameraQrScanner } from './CameraQrScanner';
import { MatchEventForm } from './MatchEventForm';
import { MatchEventsList } from './MatchEventsList';
import { SheetCorrectionBar } from './SheetCorrectionBar';
import { MatchSanctionsAlert } from './MatchSanctionsAlert';
import { MatchGoalkeepersSection } from './MatchGoalkeepersSection';
import { MatchLineupSection } from './MatchLineupSection';
import confetti from 'canvas-confetti';
import {
  ClipboardList,
  UserCheck,
  FileText,
  Play,
  CheckCheck,
  PencilLine,
} from 'lucide-react';

interface MatchSheetModalProps {
  matches: Match[];
  teams: Team[];
  players: Player[];
  onUpdateMatch: (updatedMatch: Match) => void | boolean | Promise<void | boolean>;
  isAdmin?: boolean;
  canCorrect?: boolean;
  editorName?: string;
  editorRole?: Role;
}

const formatCorrectionTrace = (corrections: SheetCorrection[]): string => {
  const last = corrections[corrections.length - 1];
  const count = corrections.length;
  const times = count === 1 ? '1 vez' : `${count} veces`;
  const localDate = new Date(last.at).toLocaleString();
  const roleLabel = last.role ? ` (${last.role === 'REFEREE' ? 'Árbitro' : 'Administrador'})` : '';
  return `Corregida ${times}. Última: ${last.by}${roleLabel}, ${localDate}: ${last.reason}`;
};

export const MatchSheetModal: React.FC<MatchSheetModalProps> = ({
  matches,
  teams,
  players,
  onUpdateMatch,
  isAdmin = false,
  canCorrect = isAdmin,
  editorName = '',
  editorRole,
}) => {
  const [selectedRound, setSelectedRound] = useState<number | null>(matches[0]?.round ?? null);
  const [selectedMatchId, setSelectedMatchId] = useState<string>(matches[0]?.id || '');

  // Modo correccion (ADMIN)
  const [draft, setDraft] = useState<Match | null>(null);
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [homeScoreInput, setHomeScoreInput] = useState<string>('0');
  const [awayScoreInput, setAwayScoreInput] = useState<string>('0');
  const [isSavingCorrection, setIsSavingCorrection] = useState<boolean>(false);
  const [editingEvent, setEditingEvent] = useState<MatchEvent | null>(null);

  // Observaciones por partido (árbitro) y QR Check-in
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [qrScanInput, setQrScanInput] = useState('');
  const [scanMessage, setScanMessage] = useState<{
    type: 'success' | 'error' | 'warning';
    text: string;
  } | null>(null);
  const [showCamera, setShowCamera] = useState(false);

  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const playerMap = new Map(players.map((p) => [p.id, p]));

  const roundList = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const roundDate = (r: number) => matches.find((m) => m.round === r)?.date;
  const effectiveRound =
    selectedRound != null && roundList.includes(selectedRound) ? selectedRound : roundList[0] ?? null;
  const matchesInRound = matches.filter((m) => effectiveRound == null || m.round === effectiveRound);

  const currentMatch =
    matches.find((m) => m.id === selectedMatchId) || matchesInRound[0] || matches[0];

  const sheet = draft ?? currentMatch;
  const isCorrectionMode = draft !== null;
  const locked = sheet?.status === 'FINISHED' && draft === null;

  const sanctions = calculateSanctions(players, teams, matches);
  const sanctionsMap = new Map(sanctions.map((s) => [s.playerId, s]));

  if (!currentMatch) {
    return (
      <div className="text-center py-12 bg-white rounded-3xl p-8 border border-slate-200">
        <h3 className="text-lg font-bold text-slate-800">No hay partidos asignados para arbitraje</h3>
      </div>
    );
  }

  const homeTeam = teamMap.get(sheet.homeTeamId);
  const awayTeam = teamMap.get(sheet.awayTeamId);

  const homePlayers = players.filter((p) => p.teamId === sheet.homeTeamId);
  const awayPlayers = players.filter((p) => p.teamId === sheet.awayTeamId);

  const isManualSusp = (p: Player) => (p.suspendedRounds || []).includes(sheet.round);
  const isSusp = (p: Player) => Boolean(sanctionsMap.get(p.id)?.cardSuspended) || isManualSusp(p);
  const suspReason = (p: Player) =>
    isManualSusp(p)
      ? `Suspensión fecha ${sheet.round}`
      : sanctionsMap.get(p.id)?.suspensionReason || 'Sancionado';

  const suspendedHomePlayers = homePlayers.filter(isSusp);
  const suspendedAwayPlayers = awayPlayers.filter(isSusp);
  const allSuspendedInMatch = [...suspendedHomePlayers, ...suspendedAwayPlayers];

  const currentHomeGkId =
    sheet.homeGoalkeeperId || homePlayers.find((p) => p.position === 'POR')?.id || '';
  const currentAwayGkId =
    sheet.awayGoalkeeperId || awayPlayers.find((p) => p.position === 'POR')?.id || '';

  const commit = (next: Match) => {
    if (draft !== null) {
      setDraft(next);
      setHomeScoreInput(String(next.homeScore));
      setAwayScoreInput(String(next.awayScore));
    } else {
      onUpdateMatch(next);
    }
  };

  const handleSelectRound = (r: number) => {
    if (draft) {
      const ok = window.confirm(
        'Tienes un borrador de corrección activo. ¿Deseas descartarlo y cambiar de fecha?'
      );
      if (!ok) return;
      setDraft(null);
      setEditingEvent(null);
    }
    setSelectedRound(r);
    const first = matches.find((m) => m.round === r);
    if (first) {
      setSelectedMatchId(first.id);
    }
  };

  const handleSelectMatch = (id: string) => {
    if (draft) {
      const ok = window.confirm(
        'Tienes un borrador de corrección activo. ¿Deseas descartarlo y cambiar de partido?'
      );
      if (!ok) return;
      setDraft(null);
      setEditingEvent(null);
    }
    setSelectedMatchId(id);
  };

  const handleStartCorrection = () => {
    setDraft(currentMatch);
    setCorrectionReason('');
    setHomeScoreInput(String(currentMatch.homeScore ?? 0));
    setAwayScoreInput(String(currentMatch.awayScore ?? 0));
    setEditingEvent(null);
  };

  const handleDiscardCorrection = () => {
    const hasChanges = draft ? countSheetChanges(currentMatch, draft) > 0 : false;
    if (hasChanges) {
      const ok = window.confirm('¿Deseas descartar los cambios realizados en el borrador?');
      if (!ok) return;
    }
    setDraft(null);
    setCorrectionReason('');
    setEditingEvent(null);
  };

  const handleSaveCorrection = async () => {
    if (!draft) return;
    const reasonErr = validateCorrectionReason(correctionReason);
    if (reasonErr) {
      alert(reasonErr);
      return;
    }

    const hScore = validateScore(homeScoreInput);
    const aScore = validateScore(awayScoreInput);
    if (hScore === null || aScore === null) {
      alert('Los marcadores deben ser números enteros entre 0 y 99.');
      return;
    }

    const draftWithScores: Match = {
      ...draft,
      homeScore: hScore,
      awayScore: aScore,
    };

    const changeCount = countSheetChanges(currentMatch, draftWithScores);
    const matchLabel = `${homeTeam?.name || 'Local'} vs ${awayTeam?.name || 'Visitante'}`;
    const confirmMsg = `Se guardarán ${changeCount} cambio${
      changeCount === 1 ? '' : 's'
    } en el partido ${matchLabel}. ¿Deseas continuar?`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    const correctionRole: 'ADMIN' | 'REFEREE' | undefined =
      editorRole === 'REFEREE' ? 'REFEREE' : editorRole === 'ADMIN' ? 'ADMIN' : (isAdmin ? 'ADMIN' : undefined);
    const defaultBy = correctionRole === 'REFEREE' ? 'Árbitro' : 'Administrador';
    const correction: SheetCorrection = {
      at: new Date().toISOString(),
      by: editorName || defaultBy,
      role: correctionRole,
      reason: correctionReason.trim(),
    };

    const finalMatch = applyCorrection(currentMatch, draftWithScores, correction);

    try {
      setIsSavingCorrection(true);
      const saved = await onUpdateMatch(finalMatch);
      if (saved !== false) {
        setDraft(null);
        setCorrectionReason('');
        setEditingEvent(null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al guardar la corrección.');
    } finally {
      setIsSavingCorrection(false);
    }
  };

  const handleRecalculateScore = () => {
    if (!draft) return;
    const { homeScore, awayScore } = scoreFromGoals(draft);
    setDraft({ ...draft, homeScore, awayScore });
    setHomeScoreInput(String(homeScore));
    setAwayScoreInput(String(awayScore));
  };

  const handleScanAutoCheckin = (rawText: string) => {
    if (locked) return;
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
      setScanMessage({
        type: 'error',
        text: 'No se encontró ningún jugador registrado con esa cédula o código QR.',
      });
      return;
    }

    if (player.teamId !== sheet.homeTeamId && player.teamId !== sheet.awayTeamId) {
      const playerTeam = teamMap.get(player.teamId);
      setScanMessage({
        type: 'error',
        text: `Atención: #${player.dorsal} ${player.name} pertenece a "${
          playerTeam?.name || 'otro equipo'
        }", el cual no compite en este partido.`,
      });
      return;
    }

    if (isSusp(player)) {
      if (isCorrectionMode) {
        const ok = window.confirm(
          `Atención: El jugador #${player.dorsal} ${player.name} figura como sancionado (${suspReason(
            player
          )}). ¿Deseas agregarlo a la nómina de todos modos?`
        );
        if (!ok) return;
      } else {
        setScanMessage({
          type: 'error',
          text: `Jugador sancionado: #${player.dorsal} ${player.name} no puede ingresar por sanción disciplinaria (${suspReason(
            player
          )}).`,
        });
        return;
      }
    }

    const isHome = player.teamId === sheet.homeTeamId;
    const lineupKey = isHome ? 'homeLineup' : 'awayLineup';
    const targetTeam = isHome ? homeTeam : awayTeam;
    const currentLineup: LineupPlayer[] = sheet[lineupKey] || [];

    const isAlreadyIn = currentLineup.some((lp) => lp.playerId === player.id);

    if (isAlreadyIn) {
      setScanMessage({
        type: 'warning',
        text: `El jugador #${player.dorsal} ${player.name} ya está registrado en la vocalía de ${targetTeam?.name}.`,
      });
      return;
    }

    const updatedLineup = [
      ...currentLineup,
      {
        playerId: player.id,
        isStarter: true,
        dorsal: player.dorsal,
        isGoalkeeper: player.position === 'POR',
      },
    ];

    commit({
      ...sheet,
      [lineupKey]: updatedLineup,
    });

    if (!isCorrectionMode) {
      try {
        confetti({ particleCount: 30, spread: 60, origin: { y: 0.6 } });
      } catch {}
    }

    setScanMessage({
      type: 'success',
      text: `Registro en vocalía: #${player.dorsal} ${player.name} agregado a la nómina de ${targetTeam?.name}.`,
    });
    setQrScanInput('');
  };

  const handleTogglePlayerLineup = (teamType: 'HOME' | 'AWAY', player: Player) => {
    if (locked) return;

    if (isSusp(player)) {
      if (isCorrectionMode) {
        const ok = window.confirm(
          `Atención:\n\nEl jugador ${player.name} (#${player.dorsal}) figura actualmente como sancionado (${suspReason(
            player
          )}).\n\n¿Deseas incluirlo de todos modos en la nómina de este partido?`
        );
        if (!ok) return;
      } else {
        alert(
          `Atención Juez / Vocal de Mesa:\n\nEl jugador ${player.name} (#${player.dorsal}) se encuentra sancionado y no puede jugar este partido.\n\nMotivo: ${suspReason(
            player
          )}`
        );
        return;
      }
    }

    const lineupKey = teamType === 'HOME' ? 'homeLineup' : 'awayLineup';
    const currentLineup: LineupPlayer[] = sheet[lineupKey] || [];
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

    commit({
      ...sheet,
      [lineupKey]: nextLineup,
    });
  };

  const handleChangeGoalkeeper = (teamType: 'HOME' | 'AWAY', goalkeeperId: string) => {
    if (locked) return;
    const key = teamType === 'HOME' ? 'homeGoalkeeperId' : 'awayGoalkeeperId';
    commit({
      ...sheet,
      [key]: goalkeeperId,
    });
  };

  const handleSaveEvent = (ev: MatchEvent) => {
    if (editingEvent) {
      const next = replaceEvent(sheet, ev);
      commit(next);
      setEditingEvent(null);
    } else {
      const next = addEvent(sheet, ev);
      commit(next);
    }
  };

  const handleDeleteEvent = (eventId: string) => {
    const next = removeEvent(sheet, eventId);
    commit(next);
    if (editingEvent?.id === eventId) {
      setEditingEvent(null);
    }
  };

  const handleStartMatch = () => {
    commit({
      ...sheet,
      status: 'IN_PROGRESS',
    });
  };

  const handleFinishMatch = () => {
    if (isCorrectionMode) return;
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });

    const finalNotes = notesDraft[currentMatch.id] ?? currentMatch.refereeNotes ?? '';

    onUpdateMatch({
      ...currentMatch,
      status: 'FINISHED',
      homeGoalkeeperId: currentHomeGkId,
      awayGoalkeeperId: currentAwayGkId,
      refereeSigned: true,
      refereeNotes: finalNotes,
      signedAt: new Date().toLocaleString(),
      signedBy: editorName || undefined,
    });
  };

  const handleNotesChange = (notes: string) => {
    if (draft) {
      commit({
        ...sheet,
        refereeNotes: notes,
      });
    } else {
      setNotesDraft((prev) => ({
        ...prev,
        [currentMatch.id]: notes,
      }));
    }
  };

  const hasDraftChanges = draft ? countSheetChanges(currentMatch, draft) > 0 : false;
  const reasonError = isCorrectionMode ? validateCorrectionReason(correctionReason) : null;
  const scoreError =
    isCorrectionMode &&
    (validateScore(homeScoreInput) === null || validateScore(awayScoreInput) === null)
      ? 'Los marcadores deben ser números enteros entre 0 y 99.'
      : null;

  return (
    <div className="space-y-6">
      {/* Encabezado */}
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

        {/* Selectores de Fecha y Partido */}
        <div className="w-full md:w-auto grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3 md:min-w-[520px]">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Fecha:</label>
            <select
              value={effectiveRound ?? ''}
              onChange={(e) => handleSelectRound(Number(e.target.value))}
              className="w-full bg-slate-800 text-white font-bold text-sm px-4 py-3 rounded-2xl border border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-[#00A859]"
            >
              {roundList.map((r) => (
                <option key={r} value={r}>
                  Fecha {r}{roundDate(r) ? ` — ${roundDate(r)}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
              Seleccionar Partido Asignado:
            </label>
            <select
              value={selectedMatchId}
              onChange={(e) => handleSelectMatch(e.target.value)}
              className="w-full bg-slate-800 text-white font-bold text-sm px-4 py-3 rounded-2xl border border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-[#00A859]"
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

      {/* Barra de Modo Correccion */}
      {isCorrectionMode && (
        <SheetCorrectionBar
          reason={correctionReason}
          onReasonChange={setCorrectionReason}
          homeScoreInput={homeScoreInput}
          awayScoreInput={awayScoreInput}
          homeTeamName={homeTeam?.shortName || 'Local'}
          awayTeamName={awayTeam?.shortName || 'Visitante'}
          onHomeScoreChange={(v) => {
            setHomeScoreInput(v);
            const num = validateScore(v);
            if (num !== null && draft) setDraft({ ...draft, homeScore: num });
          }}
          onAwayScoreChange={(v) => {
            setAwayScoreInput(v);
            const num = validateScore(v);
            if (num !== null && draft) setDraft({ ...draft, awayScore: num });
          }}
          onRecalculateFromGoals={handleRecalculateScore}
          onDiscard={handleDiscardCorrection}
          onSave={handleSaveCorrection}
          hasChanges={hasDraftChanges}
          reasonError={reasonError}
          scoreError={scoreError}
          isSaving={isSavingCorrection}
        />
      )}

      {/* Alerta de sancionados */}
      <MatchSanctionsAlert
        suspendedPlayers={allSuspendedInMatch}
        teamMap={teamMap}
        suspReason={suspReason}
      />

      {/* Marcador y Tarjeta Principal */}
      <div className="glass-card rounded-3xl p-6 border border-slate-200 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 bg-slate-50 rounded-2xl border border-slate-200">
          <div className="text-center space-y-2 flex flex-col items-center">
            <TeamShield logoKey={homeTeam?.logo} name={homeTeam?.name || ''} size="lg" />
            <h3 className="font-extrabold text-slate-900 text-base">{homeTeam?.name}</h3>
            <span className="text-xs text-slate-500 font-semibold">Local</span>
          </div>

          <div className="text-center space-y-2">
            <div className="text-5xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <span className="bg-white px-5 py-2 rounded-2xl shadow-inner border border-slate-200">
                {sheet.homeScore}
              </span>
              <span className="text-slate-400 font-light text-3xl">:</span>
              <span className="bg-white px-5 py-2 rounded-2xl shadow-inner border border-slate-200">
                {sheet.awayScore}
              </span>
            </div>

            <div>
              {sheet.status === 'SCHEDULED' && (
                <button
                  type="button"
                  onClick={handleStartMatch}
                  className="px-5 py-2.5 bg-[#00A859] hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 mx-auto cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" /> Iniciar Partido
                </button>
              )}
              {sheet.status === 'IN_PROGRESS' && (
                <span className="px-3.5 py-1 bg-rose-600 text-white font-black text-xs rounded-full animate-pulse inline-block shadow-xs">
                  EN JUEGO
                </span>
              )}
              {sheet.status === 'FINISHED' && (
                <span className="px-3.5 py-1 bg-emerald-100 text-[#00A859] font-black text-xs rounded-full border border-emerald-200 inline-block">
                  FINALIZADO Y FIRMADO
                </span>
              )}
            </div>
          </div>

          <div className="text-center space-y-2 flex flex-col items-center">
            <TeamShield logoKey={awayTeam?.logo} name={awayTeam?.name || ''} size="lg" />
            <h3 className="font-extrabold text-slate-900 text-base">{awayTeam?.name}</h3>
            <span className="text-xs text-slate-500 font-semibold">Visitante</span>
          </div>
        </div>

        {/* Seccion 1: Designacion de Arqueros */}
        <MatchGoalkeepersSection
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homePlayers={homePlayers}
          awayPlayers={awayPlayers}
          currentHomeGkId={currentHomeGkId}
          currentAwayGkId={currentAwayGkId}
          locked={locked}
          onChangeGoalkeeper={handleChangeGoalkeeper}
        />

        {/* Seccion 2: Nomina y Concurrencia */}
        <MatchLineupSection
          sheet={sheet}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homePlayers={homePlayers}
          awayPlayers={awayPlayers}
          playerMap={playerMap}
          isSusp={isSusp}
          locked={locked}
          onTogglePlayer={handleTogglePlayerLineup}
          qrScanInput={qrScanInput}
          onQrInputChange={setQrScanInput}
          onScanAutoCheckin={handleScanAutoCheckin}
          onOpenScanner={() => setShowCamera(true)}
          scanMessage={scanMessage}
          onClearScanMessage={() => setScanMessage(null)}
        />

        {/* Seccion 3: Formulario de Eventos */}
        {!locked && (
          <MatchEventForm
            key={editingEvent ? editingEvent.id : 'new-event'}
            matchId={sheet.id}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            homePlayers={homePlayers}
            awayPlayers={awayPlayers}
            isSusp={isSusp}
            allowSuspended={isCorrectionMode}
            editingEvent={editingEvent}
            onSaveEvent={handleSaveEvent}
            onCancelEdit={() => setEditingEvent(null)}
          />
        )}

        {/* Lista de eventos registrados */}
        <MatchEventsList
          events={sheet.events || []}
          playerMap={playerMap}
          teamMap={teamMap}
          canEdit={isCorrectionMode}
          canDelete={!locked}
          onEdit={(ev) => setEditingEvent(ev)}
          onDelete={handleDeleteEvent}
        />

        {/* Observaciones y Firma */}
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
              value={
                isCorrectionMode
                  ? draft?.refereeNotes ?? ''
                  : notesDraft[currentMatch.id] ?? currentMatch.refereeNotes ?? ''
              }
              onChange={(e) => handleNotesChange(e.target.value)}
              disabled={locked}
              placeholder="Ej. El partido se desarrolló sin novedades. Cancha en buen estado..."
              className="w-full bg-white text-slate-900 text-xs p-3 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#00A859] disabled:opacity-60"
            />
          </div>

          {!isCorrectionMode && sheet.status !== 'FINISHED' ? (
            <button
              type="button"
              onClick={handleFinishMatch}
              className="w-full py-3.5 bg-[#DC2626] hover:bg-rose-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCheck className="w-4 h-4" /> Finalizar y Firmar Planilla Oficial
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-[#00A859]">
                <span className="flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4" /> Planilla Firmada Oficialmente
                </span>
                <div className="flex items-center gap-3">
                  <span>
                    {sheet.signedBy
                      ? `Firmado por ${sheet.signedBy}${sheet.signedAt ? `, ${sheet.signedAt}` : ''}`
                      : sheet.signedAt || 'Firmado'}
                  </span>
                  {canCorrect && currentMatch.status === 'FINISHED' && !draft && (
                    <button
                      type="button"
                      onClick={handleStartCorrection}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <PencilLine className="w-3.5 h-3.5" />
                      <span>Corregir planilla</span>
                    </button>
                  )}
                </div>
              </div>

              {sheet.corrections && sheet.corrections.length > 0 && (
                <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-950 font-medium">
                  {formatCorrectionTrace(sheet.corrections)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

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
