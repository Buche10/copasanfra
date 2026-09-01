import { supabase, isSupabaseConfigured } from './supabase';

/**
 * Autenticación con Supabase Auth (email + contraseña).
 * La sesión la gestiona Supabase (se persiste en el navegador y se restaura
 * automáticamente al recargar). El rol/nombre de la app se resuelve aparte,
 * mapeando el email de la sesión contra la tabla `users`.
 */

function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'El email aún no ha sido confirmado.';
  if (m.includes('too many requests')) return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
  return message;
}

export async function signIn(email: string, password: string): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase no está configurado. Revisa las variables de entorno.');
  }
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(translateAuthError(error.message));
}

export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured) return;
  await supabase.auth.signOut();
}

// Email of the currently authenticated user, or null if there is no session.
export async function getCurrentSessionEmail(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.email ?? null;
}
