import { LEGACY_MATCH_TIME_SLOTS, MATCH_TIME_SLOTS } from '@/types';

/**
 * Convierte la hora de un partido en su indice de turno.
 * Reconoce los turnos actuales y los anteriores (partidos ya guardados con esas horas).
 * Devuelve -1 si la hora no corresponde a ningun turno.
 */
export function getTimeSlotIndex(time?: string): number {
  if (!time) return -1;
  const idx = (MATCH_TIME_SLOTS as readonly string[]).indexOf(time);
  if (idx !== -1) return idx;
  for (const slots of LEGACY_MATCH_TIME_SLOTS) {
    const legacyIdx = slots.indexOf(time);
    if (legacyIdx !== -1) return legacyIdx;
  }
  return -1;
}
