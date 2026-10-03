import { AppSettings, SUSPENDED_CATEGORIES, COMING_SOON_CATEGORIES } from '@/types';

// Default: mientras no exista la fila (o falle la lectura), se usan las
// categorias suspendidas definidas en el codigo, para no cambiar el comportamiento.
export const DEFAULT_SETTINGS: AppSettings = {
  suspendedCategories: [...SUSPENDED_CATEGORIES],
  comingSoonCategories: [...COMING_SOON_CATEGORIES],
  pausedCategories: [],
  registrationsOpen: true,
  closedRegistrationCategories: [],
  reinforcementsOpen: true,
};

/**
 * Normaliza cualquier objeto crudo (de Supabase o parcial) a una estructura AppSettings valida.
 */
export function normalizeAppSettings(raw?: unknown): AppSettings {
  const s =
    raw && typeof raw === 'object' && 'data' in raw
      ? (raw as { data: Partial<AppSettings> }).data
      : (raw as Partial<AppSettings> | undefined);

  return {
    suspendedCategories: Array.isArray(s?.suspendedCategories)
      ? s!.suspendedCategories!
      : DEFAULT_SETTINGS.suspendedCategories,
    comingSoonCategories: Array.isArray(s?.comingSoonCategories)
      ? s!.comingSoonCategories!
      : DEFAULT_SETTINGS.comingSoonCategories,
    pausedCategories: Array.isArray(s?.pausedCategories)
      ? s!.pausedCategories!
      : DEFAULT_SETTINGS.pausedCategories,
    registrationsOpen:
      typeof s?.registrationsOpen === 'boolean'
        ? s!.registrationsOpen!
        : DEFAULT_SETTINGS.registrationsOpen,
    closedRegistrationCategories: Array.isArray(s?.closedRegistrationCategories)
      ? s!.closedRegistrationCategories!
      : DEFAULT_SETTINGS.closedRegistrationCategories,
    reinforcementsOpen:
      typeof s?.reinforcementsOpen === 'boolean'
        ? s!.reinforcementsOpen!
        : DEFAULT_SETTINGS.reinforcementsOpen,
  };
}
