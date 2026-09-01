'use client';

import React from 'react';
import { Player, Team } from '@/types';
import { QRCodeGenerator } from './QRCodeGenerator';
import { TeamShield } from './TeamShield';
import { ShieldCheck, Printer, QrCode, User, CheckCircle2, Building2, Eye, FileText, X } from 'lucide-react';

interface CarnetDigitalProps {
  player: Player;
  team: Team;
  onClose?: () => void;
}

export const CarnetDigital: React.FC<CarnetDigitalProps> = ({ player, team, onClose }) => {
  const [showDocModal, setShowDocModal] = React.useState(false);

  // The QR encodes only the player id: a short payload scans reliably at small
  // sizes. The referee's scanner matches this id to the player.
  const qrPayload = player.id;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col items-center justify-center p-4">
      {/* Printable Area Wrapper */}
      <div 
        id="carnet-digital-printable"
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden relative"
      >
        {/* Header Ribbon - Tungurahua Colors */}
        <div className="h-3 w-full grid grid-cols-2">
          <div className="bg-[#DC2626]" />
          <div className="bg-[#00A859]" />
        </div>

        {/* Institution Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src="/colegio-abogados-tungurahua.jpg" 
              alt="Colegio Abogados" 
              className="w-10 h-10 rounded-full border-2 border-[#00A859] object-cover"
            />
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                Colegio de Abogados de Tungurahua
              </span>
              <h2 className="text-sm font-extrabold tracking-tight text-white flex items-center gap-1.5">
                Carnet Oficial <span className="text-[#00A859]">Copa 2026</span>
              </h2>
            </div>
          </div>

          <div className="bg-[#00A859]/20 border border-[#00A859] text-[#00A859] text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[#00A859]" />
            <span>VERIFICADO</span>
          </div>
        </div>

        {/* Carnet Body */}
        <div className="p-6 space-y-6 bg-gradient-to-b from-slate-50 to-white relative">

          {/* Background Watermark Stamp overlay */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-5 select-none font-black text-slate-900 text-6xl rotate-[-30deg]">
            COPA ABOGADOS 2026
          </div>

          {/* Team Header Row */}
          <div 
            className="p-3.5 rounded-2xl flex items-center justify-between border"
            style={{ 
              backgroundColor: `${team.primaryColor}10`, 
              borderColor: `${team.primaryColor}30` 
            }}
          >
            <div className="flex items-center space-x-3">
              <TeamShield logoKey={team.logo} name={team.name} primaryColor={team.primaryColor} size="md" />
              <div>
                <span className="text-xs font-bold text-slate-500 block uppercase">
                  {team.category}
                </span>
                <h3 className="text-lg font-black text-slate-900 leading-tight">
                  {team.name}
                </h3>
              </div>
            </div>
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg text-white shadow-md"
              style={{ backgroundColor: team.primaryColor }}
            >
              #{player.dorsal}
            </div>
          </div>

          {/* Photo & Main Details Layout */}
          <div className="grid grid-cols-12 gap-4 items-center">
            
            {/* Watermarked Photo Container */}
            <div className="col-span-5 flex flex-col items-center">
              <div className="relative w-32 h-32 rounded-2xl overflow-hidden border-2 border-slate-900 shadow-lg bg-slate-100 group">
                {player.photo ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img 
                    src={player.photo} 
                    alt={player.name} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-400">
                    <User className="w-12 h-12" />
                  </div>
                )}

                {/* Micro Anti-Forgery Tag */}
                <div className="absolute bottom-0 inset-x-0 bg-slate-900/85 backdrop-blur-xs text-[9px] font-extrabold text-[#00A859] py-0.5 text-center tracking-tighter">
                  SEGURIDAD OFICIAL
                </div>
              </div>
              <span className="text-[9px] font-bold text-slate-400 mt-1.5 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-[#00A859]" />
                Foto con marca de agua
              </span>
            </div>

            {/* Details Fields */}
            <div className="col-span-7 space-y-2.5 text-left">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Nombre del Jugador
                </span>
                <p className="text-base font-black text-slate-900 leading-snug">
                  {player.name}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    N° Cédula
                  </span>
                  <p className="text-xs font-bold text-slate-800 font-mono">
                    {player.cedula || '---'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Posición
                  </span>
                  <p className="text-xs font-bold text-slate-800">
                    {player.position}
                  </p>
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Afiliación Institucional
                </span>
                <div className="flex flex-col gap-1 mt-0.5">
                  <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 border border-slate-200 text-slate-800">
                    <Building2 className="w-3.5 h-3.5 text-[#00A859]" />
                    <span>{player.affiliation || 'Foro de Abogados'}</span>
                  </div>

                  {player.verificationDoc && (
                    <button
                      onClick={() => setShowDocModal(true)}
                      className="inline-flex items-center space-x-1 text-[11px] font-extrabold text-[#00A859] hover:underline"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Ver Evidencia Adjunta</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

          </div>

          {/* QR Code Referee Scan Section */}
          <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-center justify-between space-x-4 border border-slate-800">
            <div className="flex-1 text-left space-y-1">
              <div className="flex items-center space-x-1.5 text-[#00A859] text-xs font-black">
                <QrCode className="w-4 h-4" />
                <span>CÓDIGO QR ÁRBITRO</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-tight">
                Escanee este código en cancha para validar la identidad y habilitación del jugador.
              </p>
              <span className="text-[9px] font-mono text-slate-400 block pt-1">
                ID: {player.id.substring(0, 12)}
              </span>
            </div>

            {/* QR Code render */}
            <div className="bg-white p-2 rounded-xl shadow-md shrink-0">
              <QRCodeGenerator value={qrPayload} size={88} />
            </div>
          </div>

          {/* Footer Security Strip */}
          <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400 font-semibold">
            <span>Tungurahua - Ecuador</span>
            <span className="text-[#00A859] font-bold">Campeonato 2026</span>
          </div>

        </div>
      </div>

      {/* Buttons Action Bar */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3 no-print">
        <button
          onClick={handlePrint}
          className="flex items-center space-x-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
        >
          <Printer className="w-4 h-4 text-[#00A859]" />
          <span>Imprimir / PDF</span>
        </button>

        {onClose && (
          <button
            onClick={onClose}
            className="flex items-center space-x-2 px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition-all"
          >
            <span>Cerrar</span>
          </button>
        )}
      </div>

      {/* Verification Document Modal Preview */}
      {showDocModal && player.verificationDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white p-6 rounded-3xl max-w-lg w-full relative space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center space-x-2 text-[#00A859] font-black text-sm">
                <FileText className="w-5 h-5" />
                <span>Respaldo de Afiliación - {player.name}</span>
              </div>
              <button
                onClick={() => setShowDocModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-96 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-2 flex items-center justify-center">
              {player.verificationDoc.startsWith('data:image') || player.verificationDoc.startsWith('http') ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={player.verificationDoc}
                  alt="Respaldo del Colegio de Abogados"
                  className="max-w-full h-auto rounded-xl shadow-sm"
                />
              ) : (
                <div className="text-center p-6 text-slate-600 space-y-2">
                  <FileText className="w-12 h-12 text-[#00A859] mx-auto" />
                  <p className="text-xs font-bold">Documento de respaldo cargado (Formato PDF o Archivo)</p>
                  <a
                    href={player.verificationDoc}
                    download={`Respaldo_${player.name}.pdf`}
                    className="inline-block px-4 py-2 bg-[#00A859] text-white text-xs font-bold rounded-xl"
                  >
                    Descargar Archivo
                  </a>
                </div>
              )}
            </div>

            <div className="text-right">
              <button
                onClick={() => setShowDocModal(false)}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
