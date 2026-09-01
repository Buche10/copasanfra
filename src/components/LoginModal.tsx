'use client';

import React, { useState } from 'react';
import { X, Key, UserCheck, Shield } from 'lucide-react';

interface LoginModalProps {
  // Returns an error message on failure, or null on success.
  onAuthenticate: (email: string, password: string) => Promise<string | null>;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onAuthenticate, onClose }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const err = await onAuthenticate(email, password);
    setSubmitting(false);
    if (err) {
      setError(err);
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-100 p-6 space-y-6 relative">

        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center mx-auto shadow-md">
            <Shield className="w-7 h-7 text-[#00A859]" />
          </div>
          <h3 className="text-xl font-black text-slate-900">Acceso al Sistema</h3>
          <p className="text-slate-500 text-xs">
            Inicia sesión con tu email y contraseña. Solo administradores y árbitros
            registrados pueden editar el torneo.
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-600">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Email</label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ej. admin@copaabogados.ec"
                autoComplete="email"
                className="w-full bg-slate-50 text-slate-900 font-semibold text-xs px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#00A859]"
                required
              />
              <UserCheck className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Contraseña</label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full bg-slate-50 text-slate-900 font-semibold text-xs px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#00A859]"
                required
              />
              <Key className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-[#00A859] hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition-colors"
          >
            {submitting ? 'Ingresando…' : 'Ingresar al Panel'}
          </button>
        </form>

        <div className="text-center text-[11px] text-slate-400 font-medium">
          Copa Abogados de Tungurahua • Todos los derechos reservados
        </div>

      </div>
    </div>
  );
};
