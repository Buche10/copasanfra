'use client';

import React, { useState } from 'react';
import { CardFinePayment, PaymentMethod, Team } from '@/types';
import { validateFinePayment, localDateString } from '@/lib/finesReport';
import { PlusCircle, AlertCircle, DollarSign } from 'lucide-react';

interface FinePaymentFormProps {
  teams: Team[];
  adminName: string;
  onPaymentAdded: (payment: CardFinePayment) => Promise<void>;
}

export const FinePaymentForm: React.FC<FinePaymentFormProps> = ({
  teams,
  adminName,
  onPaymentAdded,
}) => {
  const [teamId, setTeamId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [method, setMethod] = useState<PaymentMethod>('EFECTIVO');
  const [paidAt, setPaidAt] = useState<string>(localDateString());
  const [note, setNote] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const sortedTeams = [...teams].sort((a, b) => a.name.localeCompare(b.name));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedAmount = parseFloat(amount);
    const validTeamIds = new Set(teams.map((t) => t.id));

    const validation = validateFinePayment(
      {
        teamId,
        amount: parsedAmount,
        method,
        paidAt,
        note,
      },
      validTeamIds
    );

    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    const team = teams.find((t) => t.id === teamId);
    if (!team) {
      setError('Equipo no encontrado');
      return;
    }

    const newPayment: CardFinePayment = {
      id: `fp-${crypto.randomUUID()}`,
      teamId: validation.value.teamId,
      category: team.category,
      amount: validation.value.amount,
      method: validation.value.method,
      paidAt: validation.value.paidAt,
      note: validation.value.note,
      registeredBy: adminName,
      createdAt: new Date().toISOString(),
    };

    setIsSubmitting(true);
    try {
      await onPaymentAdded(newPayment);
      setAmount('');
      setNote('');
      setPaidAt(localDateString());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar el pago');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 print:hidden">
      <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
        <DollarSign className="w-5 h-5 text-[#00A859]" />
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">
          Registrar Pago de Multa
        </h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <div className="space-y-1">
            <label className="font-bold text-slate-700 block">Equipo *</label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-hidden focus:border-[#00A859]"
              required
            >
              <option value="">Seleccionar equipo...</option>
              {sortedTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.category})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700 block">Monto ($) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max="1000"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-hidden focus:border-[#00A859]"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700 block">Método *</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-hidden focus:border-[#00A859]"
              required
            >
              <option value="EFECTIVO">Efectivo</option>
              <option value="TRANSFERENCIA">Transferencia</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700 block">Fecha de Pago *</label>
            <input
              type="date"
              max={localDateString()}
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-hidden focus:border-[#00A859]"
              required
            />
          </div>

          <div className="space-y-1 sm:col-span-2 lg:col-span-1">
            <label className="font-bold text-slate-700 block">Nota / Comprobante</label>
            <input
              type="text"
              maxLength={200}
              placeholder="Ej: Transferencia #4591"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-hidden focus:border-[#00A859]"
            />
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="font-bold">{error}</span>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting || !teamId || !amount}
            className="px-5 py-2.5 bg-[#00A859] hover:bg-emerald-600 disabled:bg-slate-300 text-white text-xs font-black rounded-xl transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{isSubmitting ? 'Guardando...' : 'Registrar Pago'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
