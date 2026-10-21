import { describe, it, expect } from 'vitest';
import { getTimeSlotIndex } from './timeSlots';

describe('getTimeSlotIndex', () => {
  it('reconoce los turnos actuales de 70 minutos', () => {
    expect(getTimeSlotIndex('08:00')).toBe(0);
    expect(getTimeSlotIndex('09:10')).toBe(1);
    expect(getTimeSlotIndex('15:00')).toBe(6);
  });

  it('reconoce el turno retirado de las 16:10', () => {
    expect(getTimeSlotIndex('16:10')).toBe(7);
  });

  it('reconoce los turnos antiguos de 75 minutos de partidos ya jugados', () => {
    expect(getTimeSlotIndex('09:15')).toBe(1);
    expect(getTimeSlotIndex('13:00')).toBe(4);
    expect(getTimeSlotIndex('16:45')).toBe(7);
  });

  it('devuelve -1 para horas desconocidas o vacias', () => {
    expect(getTimeSlotIndex('12:00')).toBe(-1);
    expect(getTimeSlotIndex('')).toBe(-1);
    expect(getTimeSlotIndex(undefined)).toBe(-1);
  });
});
