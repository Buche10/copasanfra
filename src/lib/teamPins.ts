import { Team } from '@/types';
import { reinforcementTargetCategories } from './reinforcement';

export interface TeamPinInfo {
  teamId: string;
  updatedAt: string;
  locked: boolean;
  failures24h: number;
}

export type PinTone = 'none' | 'active' | 'locked' | 'warning';

export interface PinStatusDisplay {
  label: string;
  tone: PinTone;
}

/**
 * Filtra los equipos pertenecientes a categorias destino de refuerzos
 * (Abierta Varones y +40 Varones), ordenados primero por categoria y luego por nombre.
 */
export function getEligiblePinTeams(teams: Team[]): Team[] {
  const allowed = reinforcementTargetCategories();
  return teams
    .filter((t) => allowed.includes(t.category))
    .sort((a, b) => {
      if (a.category !== b.category) {
        return a.category === 'Abierta Varones' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
}

/**
 * Determina si un equipo presenta alto volumen de fallos en 24h (>= 10 intentos).
 */
export function hasHighFailures(pinInfo?: TeamPinInfo): boolean {
  return Boolean(pinInfo && pinInfo.failures24h >= 10);
}

/**
 * Retorna la etiqueta y el tono visual de estado del PIN para un equipo dado.
 */
export function formatPinStatus(pinInfo?: TeamPinInfo): PinStatusDisplay {
  if (!pinInfo) {
    return { label: 'Sin código', tone: 'none' };
  }
  if (pinInfo.locked) {
    return { label: 'Bloqueado por intentos (60 min)', tone: 'locked' };
  }

  const d = new Date(pinInfo.updatedAt);
  const formatted = isNaN(d.getTime())
    ? pinInfo.updatedAt
    : `${d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;

  const baseLabel = `Código desde ${formatted}`;
  const failures = pinInfo.failures24h || 0;

  if (failures > 0) {
    const failureMsg =
      failures === 1 ? '1 intento fallido en 24 h' : `${failures} intentos fallidos en 24 h`;
    return {
      label: `${baseLabel} • ${failureMsg}`,
      tone: failures >= 10 ? 'warning' : 'active',
    };
  }

  return {
    label: baseLabel,
    tone: 'active',
  };
}

export type IpSourceTone = 'active' | 'warning' | 'none';

export interface IpSourceStatusDisplay {
  label: string;
  tone: IpSourceTone;
}

/**
 * Diagnostica el origen de la IP del cliente para informar al Admin sobre la proteccion por conexion.
 */
export function ipSourceStatus(source?: string | null): IpSourceStatusDisplay {
  if (source === 'cloudflare') {
    return {
      label: 'Protección por conexión: activa (IP real detectada).',
      tone: 'active',
    };
  }
  if (source === 'forwarded') {
    return {
      label: 'Protección por conexión: limitada (no llega la IP real de Cloudflare). Solo rige el tope de 30 fallos por hora del equipo.',
      tone: 'warning',
    };
  }
  return {
    label: 'Protección por conexión: no verificada.',
    tone: 'none',
  };
}

