import { Match, MatchEvent, SheetCorrection } from '@/types';

/**
 * Calcula el impacto en el marcador de un evento de partido.
 * Los goles suman al equipo correspondiente, salvo el autogol que suma al rival.
 * Las tarjetas y otros eventos no alteran el marcador.
 */
export function goalDelta(
  match: Pick<Match, 'homeTeamId' | 'awayTeamId'>,
  ev: MatchEvent
): { home: number; away: number } {
  if (ev.type !== 'GOAL') {
    return { home: 0, away: 0 };
  }

  const isOwnGoal = ev.goalType === 'OWN_GOAL';
  if (ev.teamId === match.homeTeamId) {
    return isOwnGoal ? { home: 0, away: 1 } : { home: 1, away: 0 };
  }
  if (ev.teamId === match.awayTeamId) {
    return isOwnGoal ? { home: 1, away: 0 } : { home: 0, away: 1 };
  }

  return { home: 0, away: 0 };
}

/**
 * Agrega un evento al partido y actualiza el marcador si corresponde.
 * Funcion pura e inmutable.
 */
export function addEvent(match: Match, ev: MatchEvent): Match {
  const delta = goalDelta(match, ev);
  const homeScore = Math.max(0, (match.homeScore ?? 0) + delta.home);
  const awayScore = Math.max(0, (match.awayScore ?? 0) + delta.away);

  return {
    ...match,
    homeScore,
    awayScore,
    events: [...(match.events ?? []), ev],
  };
}

/**
 * Elimina un evento por ID y descuenta su efecto en el marcador sin bajar de cero.
 * Si el ID no existe devuelve el partido sin modificar.
 */
export function removeEvent(match: Match, eventId: string): Match {
  const events = match.events ?? [];
  const evToDelete = events.find((e) => e.id === eventId);
  if (!evToDelete) {
    return match;
  }

  const delta = goalDelta(match, evToDelete);
  const homeScore = Math.max(0, (match.homeScore ?? 0) - delta.home);
  const awayScore = Math.max(0, (match.awayScore ?? 0) - delta.away);

  return {
    ...match,
    homeScore,
    awayScore,
    events: events.filter((e) => e.id !== eventId),
  };
}

/**
 * Reemplaza un evento existente ajustando la diferencia en el marcador entre
 * el evento previo y el actualizado. Sin bajar de cero.
 */
export function replaceEvent(match: Match, updated: MatchEvent): Match {
  const events = match.events ?? [];
  const oldEvent = events.find((e) => e.id === updated.id);
  if (!oldEvent) {
    return match;
  }

  const oldDelta = goalDelta(match, oldEvent);
  const newDelta = goalDelta(match, updated);
  const deltaHome = newDelta.home - oldDelta.home;
  const deltaAway = newDelta.away - oldDelta.away;

  const homeScore = Math.max(0, (match.homeScore ?? 0) + deltaHome);
  const awayScore = Math.max(0, (match.awayScore ?? 0) + deltaAway);

  return {
    ...match,
    homeScore,
    awayScore,
    events: events.map((e) => (e.id === updated.id ? updated : e)),
  };
}

/**
 * Recalcula el marcador acumulando exclusivamente los eventos de gol registrados.
 */
export function scoreFromGoals(match: Match): { homeScore: number; awayScore: number } {
  return (match.events ?? []).reduce(
    (acc, ev) => {
      const delta = goalDelta(match, ev);
      return {
        homeScore: acc.homeScore + delta.home,
        awayScore: acc.awayScore + delta.away,
      };
    },
    { homeScore: 0, awayScore: 0 }
  );
}

/**
 * Aplica una correccion al partido conservando los metadatos de firma original
 * y anadiendo la correccion al historial.
 */
export function applyCorrection(
  original: Match,
  draft: Match,
  correction: SheetCorrection
): Match {
  return {
    ...draft,
    status: original.status,
    refereeSigned: original.refereeSigned,
    signedAt: original.signedAt,
    corrections: [...(original.corrections ?? []), { ...correction }],
  };
}

/**
 * Valida el motivo de correccion (entre 5 y 300 caracteres tras recortar espacios).
 */
export function validateCorrectionReason(text: string | null | undefined): string | null {
  const trimmed = (text ?? '').trim();
  if (trimmed.length < 5) {
    return 'El motivo debe tener al menos 5 caracteres.';
  }
  if (trimmed.length > 300) {
    return 'El motivo no puede superar los 300 caracteres.';
  }
  return null;
}

/**
 * Valida un puntaje para el marcador (entero entre 0 y 99).
 */
export function validateScore(value: string | null | undefined): number | null {
  const trimmed = (value ?? '').trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const num = Number(trimmed);
  if (num < 0 || num > 99) {
    return null;
  }
  return num;
}

/**
 * Cuenta la cantidad de cambios entre la versión original del partido y el borrador de corrección.
 * Función pura e inmutable.
 */
export function countSheetChanges(original: Match, draft: Match): number {
  const scalarDiffs = [
    original.homeScore !== draft.homeScore,
    original.awayScore !== draft.awayScore,
    original.homeGoalkeeperId !== draft.homeGoalkeeperId,
    original.awayGoalkeeperId !== draft.awayGoalkeeperId,
    (original.refereeNotes || '') !== (draft.refereeNotes || ''),
  ].filter(Boolean).length;

  const origLineupSet = new Set(
    [...(original.homeLineup || []), ...(original.awayLineup || [])].map((l) => l.playerId)
  );
  const draftLineupSet = new Set(
    [...(draft.homeLineup || []), ...(draft.awayLineup || [])].map((l) => l.playerId)
  );
  const removedLineup = [...origLineupSet].filter((id) => !draftLineupSet.has(id)).length;
  const addedLineup = [...draftLineupSet].filter((id) => !origLineupSet.has(id)).length;
  const lineupDiffs = removedLineup + addedLineup;

  const origEventsMap = new Map((original.events || []).map((e) => [e.id, JSON.stringify(e)]));
  const draftEventsMap = new Map((draft.events || []).map((e) => [e.id, JSON.stringify(e)]));
  const modifiedOrAddedEvents = [...draftEventsMap.entries()].filter(
    ([id, str]) => !origEventsMap.has(id) || origEventsMap.get(id) !== str
  ).length;
  const removedEvents = [...origEventsMap.keys()].filter((id) => !draftEventsMap.has(id)).length;
  const eventDiffs = modifiedOrAddedEvents + removedEvents;

  return scalarDiffs + lineupDiffs + eventDiffs;
}
