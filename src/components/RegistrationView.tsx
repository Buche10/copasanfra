'use client';

import React, { useState } from 'react';
import { Category, CATEGORIES, MAX_PLAYERS_PER_TEAM, Player, PlayerPosition, Team } from '@/types';
import { applyWatermarkToPhoto } from '@/lib/watermark';
import { isCedulaRegistered } from '@/lib/store';
import { CarnetDigital } from './CarnetDigital';
import { TeamShield } from './TeamShield';
import { 
  UserPlus, 
  ShieldCheck, 
  Upload, 
  FileText, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft, 
  User, 
  Trophy, 
  Shirt, 
  CreditCard, 
  Building2, 
  Camera, 
  AlertCircle,
  Sparkles
} from 'lucide-react';

interface RegistrationViewProps {
  teams: Team[];
  players: Player[];
  // Devuelve true si el jugador se guardó correctamente (false si falló).
  onAddPlayer: (player: Player) => Promise<boolean> | void;
  onCancel?: () => void;
}

export const RegistrationView: React.FC<RegistrationViewProps> = ({
  teams,
  players,
  onAddPlayer,
  onCancel,
}) => {
  // Wizard Step state: 1: Categoria/Equipo, 2: Datos, 3: Afiliacion/Respaldo, 4: Foto, 5: Carnet Final
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Form Fields State
  const [selectedCategory, setSelectedCategory] = useState<Category>('Abierta Varones');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [name, setName] = useState('');
  const [dorsal, setDorsal] = useState<string>('');
  const [cedula, setCedula] = useState('');
  const [position, setPosition] = useState<PlayerPosition>('DEL');
  const [affiliation, setAffiliation] = useState<'Colegio de Abogados' | 'Foro de Abogados'>('Colegio de Abogados');
  
  // File Upload States
  const [verificationDoc, setVerificationDoc] = useState<string>('');
  const [verificationFileName, setVerificationFileName] = useState<string>('');
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [isWatermarking, setIsWatermarking] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Chequeo de cédula duplicada (paso 2) y confirmación final (paso 4).
  const [checkingCedula, setCheckingCedula] = useState(false);
  const [cedulaError, setCedulaError] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  // Verifica en el servidor si la cédula ya existe antes de continuar. Evita
  // que la persona llene todo el formulario y suba archivos para nada.
  const goFromStep2 = async () => {
    if (checkingCedula || !name.trim() || dorsal === '' || cedula.trim() === '') return;
    setCedulaError('');
    setCheckingCedula(true);
    try {
      const exists = await isCedulaRegistered(cedula);
      if (exists) {
        setCedulaError(
          'Ya existe un jugador registrado con esta cédula. Si crees que es un error, contacta al administrador.'
        );
        return;
      }
      setStep(3);
    } catch (err) {
      // Fail-open: si el chequeo falla (SQL sin desplegar / red), NO bloquear la
      // inscripción; el admin revisa los pendientes. Solo se registra el error.
      console.error('No se pudo verificar la cédula (se continúa):', err);
      setStep(3);
    } finally {
      setCheckingCedula(false);
    }
  };

  // Generated Registered Player state
  const [registeredPlayer, setRegisteredPlayer] = useState<Player | null>(null);

  // Filter teams by currently selected category
  const filteredTeams = teams.filter((t) => t.category === selectedCategory);
  const selectedTeam = teams.find((t) => t.id === selectedTeamId);

  // Roster count per team (to enforce the max players per team).
  const teamCount = (teamId: string) => players.filter((p) => p.teamId === teamId).length;
  const selectedTeamFull = selectedTeam ? teamCount(selectedTeam.id) >= MAX_PLAYERS_PER_TEAM : false;

  // Handle Photo Upload & Automatic Watermarking
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsWatermarking(true);
      setErrorMsg('');
      const watermarkedBase64 = await applyWatermarkToPhoto(file, 'COPA ABOGADOS 2026 • REGISTRO OFICIAL');
      setPhotoUrl(watermarkedBase64);
    } catch (err) {
      console.error('Error applying watermark:', err);
      setErrorMsg('No se pudo procesar la foto con marca de agua. Intenta con otra imagen.');
    } finally {
      setIsWatermarking(false);
    }
  };

  // Handle Verification Document Upload (for Colegio de Abogados)
  const handleDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setVerificationFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      setVerificationDoc(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Validations per Step
  const canProceedFromStep1 = selectedTeamId !== '' && !selectedTeamFull;
  const canProceedFromStep2 = name.trim() !== '' && dorsal !== '' && cedula.trim() !== '';
  const canProceedFromStep3 = verificationDoc !== '';
  const canProceedFromStep4 = photoUrl !== '';

  // Final Form Submission
  const [submitting, setSubmitting] = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeam || submitting) return;
    if (teamCount(selectedTeam.id) >= MAX_PLAYERS_PER_TEAM) {
      setStep(1);
      return;
    }

    // Jugador que se GUARDA en la base: sin la foto (solo se usa para el
    // carnet en el momento, no se persiste para no llenar la base de datos).
    const playerToSave: Player = {
      id: `player-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      teamId: selectedTeam.id,
      name: name.trim(),
      dorsal: parseInt(dorsal, 10) || 1,
      cedula: cedula.trim(),
      position: position,
      affiliation: affiliation,
      verificationDoc: verificationDoc,
      registeredAt: new Date().toISOString(),
      approvalStatus: 'PENDING',
    };

    // Guardar en la base (sin foto). Solo avanzar si se guardó correctamente.
    setSubmitting(true);
    const saved = await onAddPlayer(playerToSave);
    setSubmitting(false);
    if (saved === false) return; // el handler ya mostró el error

    // Para el carnet que se muestra/imprime ahora sí usamos la foto (solo local)
    setRegisteredPlayer({ ...playerToSave, photo: photoUrl });
    setStep(5);
  };

  return (
    <div className="max-w-3xl mx-auto py-4 px-4 sm:px-6">
      
      {/* Header Title */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center space-x-2 px-3 py-1 bg-[#00A859]/10 text-[#00A859] rounded-full text-xs font-bold uppercase tracking-wider mb-2">
          <UserPlus className="w-3.5 h-3.5" />
          <span>Inscripción Oficial de Jugadores</span>
        </div>
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">
          Formulario de Registro
        </h2>
        <p className="text-sm text-slate-500 mt-1 max-w-lg mx-auto">
          Complete los datos requeridos para emitir su carnet digital verificado con código QR anti-falsificación.
        </p>
      </div>

      {/* Wizard Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between relative max-w-xl mx-auto">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-200 -z-10 rounded-full" />
          <div 
            className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-[#00A859] -z-10 transition-all duration-300 rounded-full"
            style={{ width: `${((step - 1) / 4) * 100}%` }}
          />

          {[
            { num: 1, label: 'Equipo' },
            { num: 2, label: 'Datos' },
            { num: 3, label: 'Afiliación' },
            { num: 4, label: 'Foto' },
            { num: 5, label: 'Carnet' },
          ].map((item) => (
            <div key={item.num} className="flex flex-col items-center">
              <div 
                className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-xs transition-all ${
                  step >= item.num 
                    ? 'bg-[#00A859] text-white shadow-md shadow-[#00A859]/30 ring-4 ring-white' 
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                {step > item.num ? <CheckCircle2 className="w-5 h-5" /> : item.num}
              </div>
              <span className={`text-[11px] font-bold mt-1.5 ${step >= item.num ? 'text-slate-900' : 'text-slate-400'}`}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Card Container */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8 relative overflow-hidden">
        
        {/* STEP 1: CATEGORY & TEAM */}
        {step === 1 && (
          <div className="space-y-6 animate-fadeIn">
            <div>
              <label className="block text-xs font-extrabold uppercase text-slate-500 tracking-wider mb-2 flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-[#00A859]" />
                1. Seleccione la Categoría
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(cat);
                      setSelectedTeamId('');
                    }}
                    className={`p-3.5 rounded-2xl border text-center text-xs font-bold transition-all ${
                      selectedCategory === cat
                        ? 'bg-[#00A859] text-white border-[#00A859] shadow-md'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase text-slate-500 tracking-wider mb-2 flex items-center gap-1.5">
                <Shirt className="w-4 h-4 text-[#00A859]" />
                2. Seleccione el Equipo ({filteredTeams.length} Disponibles)
              </label>
              {filteredTeams.length === 0 ? (
                <div className="p-6 bg-amber-50 text-amber-700 rounded-2xl border border-amber-200 text-xs font-bold text-center">
                  No hay equipos registrados aún en la categoría {selectedCategory}.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                  {filteredTeams.map((t) => {
                    const count = teamCount(t.id);
                    const full = count >= MAX_PLAYERS_PER_TEAM;
                    return (
                      <div
                        key={t.id}
                        onClick={() => { if (!full) setSelectedTeamId(t.id); }}
                        className={`p-4 rounded-2xl border transition-all flex items-center justify-between ${
                          full
                            ? 'border-slate-200 bg-slate-100 opacity-60 cursor-not-allowed'
                            : selectedTeamId === t.id
                            ? 'border-[#00A859] bg-[#00A859]/5 ring-2 ring-[#00A859] cursor-pointer'
                            : 'border-slate-200 bg-white hover:border-slate-300 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <TeamShield logoKey={t.logo} name={t.name} primaryColor={t.primaryColor} size="md" />
                          <div>
                            <h4 className="font-extrabold text-slate-900 text-sm">
                              {t.name}
                            </h4>
                            <span className="text-xs text-slate-500 font-semibold">
                              {t.shortName}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                            full ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {full ? 'Cupo lleno' : `${count}/${MAX_PLAYERS_PER_TEAM}`}
                          </span>
                          {selectedTeamId === t.id && !full && (
                            <CheckCircle2 className="w-5 h-5 text-[#00A859]" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="button"
                disabled={!canProceedFromStep1}
                onClick={() => setStep(2)}
                className="flex items-center space-x-2 px-6 py-3 bg-[#00A859] hover:bg-[#008e4b] disabled:bg-slate-200 disabled:cursor-not-allowed text-white font-extrabold text-sm rounded-xl shadow-md transition-all"
              >
                <span>Siguiente: Datos Personales</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: PERSONAL DETAILS */}
        {step === 2 && (
          <div className="space-y-6 animate-fadeIn">
            <h3 className="text-lg font-black text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <User className="w-5 h-5 text-[#00A859]" />
              Datos Personales del Jugador
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Abg. Carlos Mendoza"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:bg-white focus:ring-2 focus:ring-[#00A859] outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    N° de Camiseta (Dorsal) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={dorsal}
                      onChange={(e) => setDorsal(e.target.value)}
                      placeholder="10"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-black text-base focus:bg-white focus:ring-2 focus:ring-[#00A859] outline-none transition-all"
                    />
                    <Shirt className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    N° de Cédula *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={cedula}
                      onChange={(e) => { setCedula(e.target.value); setCedulaError(''); }}
                      placeholder="1804291823"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono text-sm focus:bg-white focus:ring-2 focus:ring-[#00A859] outline-none transition-all"
                    />
                    <CreditCard className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Posición en Campo
                  </label>
                  <select
                    value={position}
                    onChange={(e) => setPosition(e.target.value as PlayerPosition)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold focus:bg-white focus:ring-2 focus:ring-[#00A859] outline-none transition-all"
                  >
                    <option value="POR">Arquero (POR)</option>
                    <option value="DEF">Defensa (DEF)</option>
                    <option value="MED">Mediocampista (MED)</option>
                    <option value="DEL">Delantero (DEL)</option>
                  </select>
                </div>
              </div>
            </div>

            {cedulaError && (
              <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{cedulaError}</span>
              </div>
            )}

            <div className="pt-4 flex justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center space-x-2 px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Anterior</span>
              </button>

              <button
                type="button"
                disabled={!canProceedFromStep2 || checkingCedula}
                onClick={goFromStep2}
                className="flex items-center space-x-2 px-6 py-3 bg-[#00A859] hover:bg-[#008e4b] disabled:bg-slate-200 disabled:cursor-not-allowed text-white font-extrabold text-sm rounded-xl shadow-md transition-all"
              >
                <span>{checkingCedula ? 'Verificando cédula…' : 'Siguiente: Afiliación'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: AFFILIATION & PROOF DOCUMENT */}
        {step === 3 && (
          <div className="space-y-6 animate-fadeIn">
            <h3 className="text-lg font-black text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#00A859]" />
              Tipo de Afiliación Institucional
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                onClick={() => setAffiliation('Colegio de Abogados')}
                className={`p-5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                  affiliation === 'Colegio de Abogados'
                    ? 'border-[#00A859] bg-[#00A859]/5 ring-2 ring-[#00A859]'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-extrabold text-[#00A859] bg-[#00A859]/10 px-2.5 py-0.5 rounded-full">
                      Requerido Respaldo
                    </span>
                    {affiliation === 'Colegio de Abogados' && <CheckCircle2 className="w-5 h-5 text-[#00A859]" />}
                  </div>
                  <h4 className="font-extrabold text-slate-900 text-base">
                    Colegio de Abogados
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Miembros matriculados del Colegio de Abogados de Tungurahua.
                  </p>
                </div>
              </div>

              <div
                onClick={() => setAffiliation('Foro de Abogados')}
                className={`p-5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                  affiliation === 'Foro de Abogados'
                    ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-600'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-extrabold text-blue-600 bg-blue-100 px-2.5 py-0.5 rounded-full">
                      Requerido Respaldo
                    </span>
                    {affiliation === 'Foro de Abogados' && <CheckCircle2 className="w-5 h-5 text-blue-600" />}
                  </div>
                  <h4 className="font-extrabold text-slate-900 text-base">
                    Foro de Abogados
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Abogados registrados en el Foro de la Función Judicial.
                  </p>
                </div>
              </div>
            </div>

            {/* Document Upload for ALL affiliations */}
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <label className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                Adjuntar Respaldo de {affiliation} *
              </label>
              <p className="text-xs text-slate-500">
                Suba una foto o documento escaneado (carné del Foro, credencial del Colegio o certificado) para revisión administrativa.
              </p>

              <div className="relative border-2 border-dashed border-slate-300 hover:border-[#00A859] rounded-2xl p-6 text-center bg-white transition-colors cursor-pointer group">
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleDocUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-[#00A859]/10 text-[#00A859] flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  {verificationFileName ? (
                    <div className="flex items-center space-x-2 text-xs font-bold text-[#00A859]">
                      <FileText className="w-4 h-4" />
                      <span>{verificationFileName}</span>
                    </div>
                  ) : (
                    <span className="text-xs font-bold text-slate-600 group-hover:text-[#00A859]">
                      Haga clic o arrastre su certificado / carné de respaldo aquí
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex items-center space-x-2 px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Anterior</span>
              </button>

              <button
                type="button"
                disabled={!canProceedFromStep3}
                onClick={() => setStep(4)}
                className="flex items-center space-x-2 px-6 py-3 bg-[#00A859] hover:bg-[#008e4b] disabled:bg-slate-200 disabled:cursor-not-allowed text-white font-extrabold text-sm rounded-xl shadow-md transition-all"
              >
                <span>Siguiente: Foto con Marca de Agua</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: PLAYER PHOTO & WATERMARK */}
        {step === 4 && (
          <div className="space-y-6 animate-fadeIn">
            <h3 className="text-lg font-black text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <Camera className="w-5 h-5 text-[#00A859]" />
              Foto del Jugador y Marca de Agua Anti-Falsificación
            </h3>

            <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-center space-x-3">
              <Sparkles className="w-5 h-5 text-[#00A859] shrink-0" />
              <p className="text-xs text-slate-300 leading-relaxed">
                Al seleccionar la foto, el sistema estampará automáticamente la <strong className="text-white">marca de agua digital oficial y sello de seguridad</strong> para proteger su carnet contra adulteraciones.
              </p>
            </div>

            <p className="text-[11px] text-slate-500 text-center px-4">
              🔒 La foto se usa <strong>solo para generar tu carnet</strong> en este momento; <strong>no se almacena</strong>. Descárgalo o imprímelo al finalizar.
            </p>

            {errorMsg && (
              <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex flex-col items-center justify-center space-y-4">
              
              {/* Photo Upload Dropzone / Preview */}
              <div className="relative w-48 h-48 rounded-3xl overflow-hidden border-4 border-slate-900 shadow-xl bg-slate-100 flex items-center justify-center">
                {photoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img 
                    src={photoUrl} 
                    alt="Marca de Agua Aplicada" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-4 text-center text-slate-400">
                    <User className="w-16 h-16 mb-2" />
                    <span className="text-xs font-bold">Sin Foto</span>
                  </div>
                )}

                {isWatermarking && (
                  <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-xs flex flex-col items-center justify-center text-white p-4">
                    <div className="w-8 h-8 border-4 border-[#00A859] border-t-transparent rounded-full animate-spin mb-2" />
                    <span className="text-xs font-bold text-[#00A859]">Aplicando Marca de Agua...</span>
                  </div>
                )}
              </div>

              {/* Upload Input Button */}
              <label className="cursor-pointer inline-flex items-center space-x-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-md transition-all">
                <Upload className="w-4 h-4 text-[#00A859]" />
                <span>{photoUrl ? 'Cambiar Foto' : 'Cargar Foto de Perfil'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>

              {photoUrl && (
                <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-emerald-50 text-[#00A859] border border-emerald-200 rounded-full text-xs font-bold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Marca de Agua Oficial Estampada</span>
                </div>
              )}
            </div>

            {/* Confirmación final: datos correctos + carnet se genera una sola vez */}
            <label className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-left cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="w-5 h-5 accent-[#00A859] mt-0.5 shrink-0"
              />
              <span className="text-xs text-amber-900 font-semibold leading-relaxed">
                Confirmo que revisé y <strong>todos los datos son correctos</strong> (nombre, cédula,
                equipo, dorsal). Entiendo que, por seguridad, el <strong>carnet se genera una sola
                vez</strong>: debo <strong>descargarlo o tomar una captura de pantalla</strong> apenas
                aparezca.
              </span>
            </label>

            <div className="pt-2 flex justify-between">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="flex items-center space-x-2 px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Anterior</span>
              </button>

              <button
                type="button"
                disabled={!canProceedFromStep4 || isWatermarking || submitting || !confirmed}
                onClick={handleSubmit}
                className="flex items-center space-x-2 px-8 py-3.5 bg-[#00A859] hover:bg-[#008e4b] disabled:bg-slate-200 disabled:cursor-not-allowed text-white font-black text-sm rounded-xl shadow-lg transition-all"
              >
                <span>{submitting ? 'Guardando…' : 'Confirmar y Generar Carnet'}</span>
                <CheckCircle2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: CARNET GENERATED */}
        {step === 5 && registeredPlayer && selectedTeam && (
          <div className="space-y-6 animate-fadeIn text-center">
            <div className="inline-flex items-center space-x-2 px-4 py-1.5 bg-emerald-100 text-[#00A859] rounded-full text-xs font-black uppercase">
              <CheckCircle2 className="w-4 h-4" />
              <span>Inscripción Exitosa y Guardada</span>
            </div>

            {/* Carnet Component */}
            <CarnetDigital
              player={registeredPlayer}
              team={selectedTeam}
            />

            <div className="pt-4 flex items-center justify-center space-x-4">
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setName('');
                  setDorsal('');
                  setCedula('');
                  setPhotoUrl('');
                  setVerificationDoc('');
                  setVerificationFileName('');
                  setRegisteredPlayer(null);
                  setConfirmed(false);
                  setCedulaError('');
                }}
                className="px-6 py-3 bg-[#00A859] text-white font-extrabold text-sm rounded-xl shadow-md hover:bg-[#008e4b] transition-all"
              >
                Inscribir Otro Jugador
              </button>

              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-6 py-3 bg-slate-200 text-slate-800 font-bold text-sm rounded-xl hover:bg-slate-300 transition-all"
                >
                  Volver al Inicio
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
