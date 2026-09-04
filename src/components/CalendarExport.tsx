'use client';

import React, { useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Match, Team, Category } from '@/types';
import { asset } from '@/lib/basePath';
import { Download, FileImage, CalendarDays, ClipboardList, ChevronDown, Loader2 } from 'lucide-react';

interface CalendarExportProps {
  matches: Match[];
  teams: Team[];
}

const fmtLongDate = (iso?: string) => {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-EC', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
};

export const CalendarExport: React.FC<CalendarExportProps> = ({ matches, teams }) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'FECHA' | 'CATEGORIA'>('FECHA');
  const [downloading, setDownloading] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const teamName = useMemo(() => {
    const map = new Map(teams.map((t) => [t.id, t]));
    return (id: string) => map.get(id)?.name ?? 'Por definir';
  }, [teams]);

  // Fechas (sábados) disponibles según el calendario.
  const dates = useMemo(
    () => [...new Set(matches.map((m) => m.date).filter(Boolean))].sort(),
    [matches]
  );
  // Categorías presentes en el calendario.
  const categories = useMemo(
    () => [...new Set(matches.map((m) => m.category))] as Category[],
    [matches]
  );

  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedCat, setSelectedCat] = useState<Category | ''>('');

  const activeDate = selectedDate || dates[0] || '';
  const activeCat = selectedCat || categories[0] || '';

  // Partidos del día (todas las categorías), ordenados por hora y cancha.
  const dayMatches = useMemo(
    () =>
      matches
        .filter((m) => m.date === activeDate)
        .sort((a, b) => (a.time || '').localeCompare(b.time || '') || (a.stadium || '').localeCompare(b.stadium || '')),
    [matches, activeDate]
  );

  // Partidos de la categoría, agrupados por jornada.
  const catRounds = useMemo(() => {
    const map = new Map<number, { round: number; date?: string; items: Match[] }>();
    matches
      .filter((m) => m.category === activeCat)
      .forEach((m) => {
        const g = map.get(m.round) ?? { round: m.round, date: m.date, items: [] };
        if (!g.date && m.date) g.date = m.date;
        g.items.push(m);
        map.set(m.round, g);
      });
    return [...map.values()]
      .map((g) => ({ ...g, items: g.items.sort((a, b) => (a.time || '').localeCompare(b.time || '')) }))
      .sort((a, b) => a.round - b.round);
  }, [matches, activeCat]);

  const download = async () => {
    const node = reportRef.current;
    if (!node) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true, backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.download =
        mode === 'FECHA' ? `programacion-${activeDate}.png` : `calendario-${activeCat.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      alert('No se pudo generar la imagen. Intenta de nuevo.');
    } finally {
      setDownloading(false);
    }
  };

  if (matches.length === 0) return null;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-black text-slate-800">
          <FileImage className="w-5 h-5 text-[#00A859]" /> Descargar / Imprimir programación
        </span>
        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-slate-100 pt-4">
          {/* Modo */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              <button
                onClick={() => setMode('FECHA')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold rounded-lg transition-all ${
                  mode === 'FECHA' ? 'bg-[#00A859] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <ClipboardList className="w-4 h-4" /> Informe de la fecha
              </button>
              <button
                onClick={() => setMode('CATEGORIA')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold rounded-lg transition-all ${
                  mode === 'CATEGORIA' ? 'bg-[#00A859] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <CalendarDays className="w-4 h-4" /> Calendario por categoría
              </button>
            </div>

            {mode === 'FECHA' ? (
              <select
                value={activeDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-slate-50 text-slate-900 font-bold text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#00A859]"
              >
                {dates.map((d) => (
                  <option key={d} value={d}>{fmtLongDate(d)}</option>
                ))}
              </select>
            ) : (
              <select
                value={activeCat}
                onChange={(e) => setSelectedCat(e.target.value as Category)}
                className="bg-slate-50 text-slate-900 font-bold text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#00A859]"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}

            <button
              onClick={download}
              disabled={downloading}
              className="ml-auto flex items-center gap-1.5 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-extrabold rounded-xl transition-colors"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-[#00A859]" />}
              {downloading ? 'Generando…' : 'Descargar imagen'}
            </button>
          </div>

          {/* Vista previa exportable */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div ref={reportRef} className="bg-white mx-auto" style={{ width: 820 }}>
              {/* Encabezado documento */}
              <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b-2 border-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset('/colegio-abogados-tungurahua.jpg')} alt="Logo" className="w-14 h-14 rounded-full border-2 border-[#00A859] object-cover" />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider leading-tight">
                    Colegio de Abogados de Tungurahua · Copa Sanfra 2026
                  </p>
                  <h3 className="text-xl font-black text-slate-900 leading-tight">
                    {mode === 'FECHA' ? 'Programación Oficial de la Fecha' : `Calendario — ${activeCat}`}
                  </h3>
                  {mode === 'FECHA' && (
                    <p className="text-sm font-bold text-[#00A859] capitalize">{fmtLongDate(activeDate)}</p>
                  )}
                </div>
              </div>

              {mode === 'FECHA' ? (
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 uppercase text-[11px] font-extrabold">
                      <th className="px-4 py-2.5">Hora</th>
                      <th className="px-4 py-2.5">Cancha</th>
                      <th className="px-4 py-2.5">Categoría</th>
                      <th className="px-4 py-2.5">Partido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayMatches.map((m) => (
                      <tr key={m.id} className="border-b border-slate-100">
                        <td className="px-4 py-2.5 font-black text-slate-900 whitespace-nowrap">{m.time || '--:--'}</td>
                        <td className="px-4 py-2.5 font-semibold text-slate-700 whitespace-nowrap">{m.stadium || 'Cancha 1'}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-[11px] font-extrabold bg-slate-900 text-white px-2 py-0.5 rounded">{m.category}</span>
                        </td>
                        <td className="px-4 py-2.5 font-bold text-slate-900">
                          {teamName(m.homeTeamId)} <span className="text-slate-400 font-normal">vs</span> {teamName(m.awayTeamId)}
                          {m.isPlayoff && <span className="ml-2 text-[10px] font-black text-amber-600">({m.playoffStage})</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-5 space-y-4">
                  {catRounds.map((g) => (
                    <div key={g.round} className="rounded-2xl border border-slate-200 overflow-hidden">
                      <div className="flex items-center justify-between bg-slate-900 text-white px-4 py-2">
                        <span className="text-sm font-black">Jornada {g.round}</span>
                        {g.date && <span className="text-xs font-semibold text-slate-300 capitalize">{fmtLongDate(g.date)}</span>}
                      </div>
                      <table className="w-full text-left text-sm">
                        <tbody>
                          {g.items.map((m) => (
                            <tr key={m.id} className="border-b border-slate-100 last:border-0">
                              <td className="px-4 py-2 font-black text-slate-900 whitespace-nowrap w-16">{m.time || '--:--'}</td>
                              <td className="px-4 py-2 text-slate-600 whitespace-nowrap w-24">{m.stadium || 'Cancha 1'}</td>
                              <td className="px-4 py-2 font-bold text-slate-900">
                                {teamName(m.homeTeamId)} <span className="text-slate-400 font-normal">vs</span> {teamName(m.awayTeamId)}
                                {m.isPlayoff && <span className="ml-2 text-[10px] font-black text-amber-600">({m.playoffStage})</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}

              {/* Pie */}
              <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400 font-semibold">
                <span>Tungurahua – Ecuador</span>
                <span className="text-[#00A859] font-bold">Copa Sanfra 2026</span>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-500">
            Consejo: en el celular, mantén presionada la imagen descargada para compartirla por WhatsApp con los árbitros.
          </p>
        </div>
      )}
    </div>
  );
};
