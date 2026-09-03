'use client';

import React, { useState, useRef } from 'react';
import { Team, Player, Category, CATEGORIES, MAX_PLAYERS_PER_TEAM } from '@/types';
import { TeamShield } from './TeamShield';
import { Settings, Plus, RefreshCw, Shield, Users, Trophy, Eye, FileText, X, Download, Upload, Pencil, Trash2 } from 'lucide-react';
import { TeamEditModal } from './TeamEditModal';
import { PlayerEditModal } from './PlayerEditModal';
import { exportAllData, importAllData, getPlayerVerificationDoc } from '@/lib/store';
import { seasonSaturdays } from '@/lib/fixtureGenerator';

interface AdminModalProps {
  teams: Team[];
  players: Player[];
  onAddTeam: (team: Team) => void;
  onUpdateTeam?: (team: Team) => void;
  onDeleteTeam?: (team: Team) => void;
  onAddPlayer: (player: Player) => void;
  onUpdatePlayer?: (player: Player) => void;
  onApprovePlayer?: (player: Player) => void;
  onDeletePlayer?: (player: Player) => void;
  onResetData: () => void;
  onGenerateFixture?: (blockedByCategory?: Partial<Record<Category, string[]>>) => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({
  teams,
  players,
  onAddTeam,
  onUpdateTeam,
  onDeleteTeam,
  onAddPlayer,
  onUpdatePlayer,
  onApprovePlayer,
  onDeletePlayer,
  onResetData,
  onGenerateFixture,
}) => {
  const [editTeam, setEditTeam] = useState<Team | null>(null);
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [activeTab, setActiveTab] = useState<'teams' | 'players' | 'settings'>('teams');
  const [filterCategory, setFilterCategory] = useState<Category | 'ALL'>('ALL');
  const [filterTeamId, setFilterTeamId] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'APPROVED' | 'PENDING'>('ALL');
  const [docLoading, setDocLoading] = useState(false);
  // Descansos por categoría: sábados ('YYYY-MM-DD') en que esa categoría NO juega.
  const [blockedByCategory, setBlockedByCategory] = useState<Record<string, string[]>>({});

  const NUM_WEEKENDS = 18;
  const weekends = seasonSaturdays(NUM_WEEKENDS);
  const isBlocked = (cat: Category, date: string) => (blockedByCategory[cat] ?? []).includes(date);
  const toggleBlock = (cat: Category, date: string) => {
    setBlockedByCategory((prev) => {
      const cur = prev[cat] ?? [];
      const next = cur.includes(date) ? cur.filter((d) => d !== date) : [...cur, date];
      return { ...prev, [cat]: next };
    });
  };
  const fmtSat = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short' });
  const totalBlocked = Object.values(blockedByCategory).reduce((n, arr) => n + arr.length, 0);
  const [selectedDocPlayer, setSelectedDocPlayer] = useState<Player | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleExportBackup = async () => {
    let data;
    try {
      data = await exportAllData();
    } catch (err) {
      alert(`❌ No se pudo generar el respaldo:\n\n${err instanceof Error ? err.message : 'Error inesperado.'}`);
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `copa-abogados-respaldo-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const error = await importAllData(parsed);
        if (error) {
          alert(`❌ No se pudo restaurar el respaldo:\n\n${error}`);
          return;
        }
        alert('✅ Respaldo restaurado correctamente. La aplicación se recargará para aplicar los datos.');
        window.location.reload();
      } catch (err) {
        alert(`❌ No se pudo restaurar el respaldo:\n\n${err instanceof Error ? err.message : 'El archivo no es un JSON válido.'}`);
      } finally {
        if (importInputRef.current) importInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleApprove = (player: Player) => {
    // Aprobar elimina el documento de respaldo (ya cumplió su función).
    if (onApprovePlayer) onApprovePlayer(player);
    else if (onUpdatePlayer) onUpdatePlayer({ ...player, approvalStatus: 'APPROVED', verificationDoc: undefined });
    setSelectedDocPlayer(null);
  };

  // Abre el respaldo: la lista no trae la imagen (por rendimiento), así que se
  // carga bajo demanda solo cuando se necesita verla.
  const openDoc = async (player: Player) => {
    if (player.verificationDoc) {
      setSelectedDocPlayer(player);
      return;
    }
    setDocLoading(true);
    try {
      const doc = await getPlayerVerificationDoc(player.id);
      setSelectedDocPlayer({ ...player, verificationDoc: doc });
    } catch {
      alert('No se pudo cargar el respaldo. Intenta de nuevo.');
    } finally {
      setDocLoading(false);
    }
  };

  const handleReject = (player: Player) => {
    if (!onDeletePlayer) return;
    if (window.confirm(`¿Rechazar y ELIMINAR la inscripción de "${player.name}"? El jugador se quitará del equipo y no se podrá recuperar.`)) {
      onDeletePlayer(player);
      setSelectedDocPlayer(null);
    }
  };

  const handleDelete = (player: Player) => {
    if (!onDeletePlayer) return;
    if (window.confirm(`¿ELIMINAR al jugador "${player.name}"? Se quitará del equipo y no se podrá recuperar.`)) {
      onDeletePlayer(player);
    }
  };

  // New Team Form State
  const [teamName, setTeamName] = useState('');
  const [teamShortName, setTeamShortName] = useState('');
  const [teamCategory, setTeamCategory] = useState<Category>('Abierta Varones');
  const [teamLogo, setTeamLogo] = useState('scale');
  const [teamPhone, setTeamPhone] = useState('');
  const [teamClubId, setTeamClubId] = useState('');

  // Existing owners/clubs (to suggest when grouping teams of the same owner).
  const existingClubs = Array.from(
    new Set(teams.map((t) => t.clubId).filter((c): c is string => Boolean(c)))
  ).sort();

  // New Player Form State
  const [playerTeamId, setPlayerTeamId] = useState(teams[0]?.id || '');
  const [playerName, setPlayerName] = useState('');
  const [playerCedula, setPlayerCedula] = useState('');
  const [playerDorsal, setPlayerDorsal] = useState(10);
  const [playerPosition, setPlayerPosition] = useState<'POR' | 'DEF' | 'MED' | 'DEL'>('MED');

  const handleCreateTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName || !teamShortName) return;

    const newTeam: Team = {
      id: `team-${crypto.randomUUID()}`,
      name: teamName,
      shortName: teamShortName,
      category: teamCategory,
      logo: teamLogo,
      primaryColor: '#00A859',
      secondaryColor: '#FFFFFF',
      delegate: '',
      phone: teamPhone || '0990000000',
      clubId: teamClubId.trim() || undefined,
    };

    onAddTeam(newTeam);
    setTeamName('');
    setTeamShortName('');
    setTeamPhone('');
    setTeamClubId('');
  };

  const handleCreatePlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName || !playerTeamId) return;

    if (players.filter((p) => p.teamId === playerTeamId).length >= MAX_PLAYERS_PER_TEAM) {
      alert(`Este equipo ya tiene ${MAX_PLAYERS_PER_TEAM} jugadores (máximo permitido).`);
      return;
    }

    const newPlayer: Player = {
      id: `p-${crypto.randomUUID()}`,
      teamId: playerTeamId,
      name: playerName,
      cedula: playerCedula || '1800000000',
      dorsal: playerDorsal,
      position: playerPosition,
    };

    onAddPlayer(newPlayer);
    setPlayerName('');
    setPlayerCedula('');
  };

  // ---- Filtros de la lista de jugadores (categoría -> equipo) ----
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const teamsForFilter = teams
    .filter((t) => filterCategory === 'ALL' || t.category === filterCategory)
    .sort((a, b) => a.name.localeCompare(b.name));

  const catIndex = (c?: string) => {
    const i = CATEGORIES.indexOf(c as Category);
    return i === -1 ? 99 : i;
  };

  const visiblePlayers = players
    .filter((p) => {
      const team = teamById.get(p.teamId);
      if (filterCategory !== 'ALL' && team?.category !== filterCategory) return false;
      if (filterTeamId !== 'ALL' && p.teamId !== filterTeamId) return false;
      if (filterStatus !== 'ALL' && (p.approvalStatus || 'APPROVED') !== filterStatus) return false;
      return true;
    })
    .sort((a, b) => {
      const ta = teamById.get(a.teamId);
      const tb = teamById.get(b.teamId);
      const ci = catIndex(ta?.category) - catIndex(tb?.category);
      if (ci !== 0) return ci;
      const nameCmp = (ta?.name || '').localeCompare(tb?.name || '');
      if (nameCmp !== 0) return nameCmp;
      return a.dorsal - b.dorsal;
    });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-rose-900 via-rose-800 to-rose-950 p-6 rounded-3xl text-white shadow-xl">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-rose-100 border border-white/30 text-xs font-bold uppercase tracking-wider">
            <Settings className="w-3.5 h-3.5 text-rose-200" />
            <span>Panel de Administración</span> • <span>Copa Abogados</span>
          </div>
          <h2 className="text-2xl font-black tracking-tight">Gestión del Campeonato</h2>
          <p className="text-rose-100 text-sm">
            Agrega equipos, enrola jugadores o restablece las semillas de demostración.
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center space-x-2 bg-black/20 p-1.5 rounded-2xl border border-white/10">
          <button
            onClick={() => setActiveTab('teams')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'teams' ? 'bg-white text-rose-900 shadow' : 'text-rose-200 hover:bg-white/10'
            }`}
          >
            Equipos ({teams.length})
          </button>
          <button
            onClick={() => setActiveTab('players')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'players' ? 'bg-white text-rose-900 shadow' : 'text-rose-200 hover:bg-white/10'
            }`}
          >
            Jugadores ({players.length})
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'settings' ? 'bg-white text-rose-900 shadow' : 'text-rose-200 hover:bg-white/10'
            }`}
          >
            Configuración
          </button>
        </div>
      </div>

      {/* Tab 1: Teams Management */}
      {activeTab === 'teams' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Create Team Form */}
          <div className="glass-card rounded-3xl p-6 border border-slate-200 shadow-md space-y-4">
            <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#00A859]" /> Registrar Nuevo Equipo
            </h3>

            <form onSubmit={handleCreateTeam} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Nombre Completo del Equipo</label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="ej. Abogados San Francisco"
                  className="w-full bg-slate-50 text-slate-900 font-semibold text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#00A859]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Nombre Corto</label>
                <input
                  type="text"
                  value={teamShortName}
                  onChange={(e) => setTeamShortName(e.target.value)}
                  placeholder="ej. San Francisco"
                  className="w-full bg-slate-50 text-slate-900 font-semibold text-xs p-3 rounded-xl border border-slate-200"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Categoría del Campeonato</label>
                <select
                  value={teamCategory}
                  onChange={(e) => setTeamCategory(e.target.value as Category)}
                  className="w-full bg-slate-50 text-slate-900 font-bold text-xs p-3 rounded-xl border border-slate-200"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Insignia / Icono Institucional</label>
                <select
                  value={teamLogo}
                  onChange={(e) => setTeamLogo(e.target.value)}
                  className="w-full bg-slate-50 text-slate-900 font-bold text-xs p-3 rounded-xl border border-slate-200"
                >
                  <option value="scale">Balanza de la Justicia</option>
                  <option value="landmark">Palacio de Justicia / Fiscalía</option>
                  <option value="file-text">Notarios / Pergamino</option>
                  <option value="shield">Escudo Defensor</option>
                  <option value="book">Jurisconsultos</option>
                  <option value="graduation">Gremio / Abogacía</option>
                  <option value="gavel">Mazo de Juez</option>
                  <option value="crown">Consultorio UTA</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Teléfono de Contacto</label>
                <input
                  type="tel"
                  value={teamPhone}
                  onChange={(e) => setTeamPhone(e.target.value)}
                  placeholder="0990000000"
                  className="w-full bg-slate-50 text-slate-900 font-semibold text-xs p-3 rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Dueño / Club <span className="font-medium text-slate-400">(opcional)</span>
                </label>
                <input
                  type="text"
                  list="club-options"
                  value={teamClubId}
                  onChange={(e) => setTeamClubId(e.target.value)}
                  placeholder="ej. club-akd"
                  className="w-full bg-slate-50 text-slate-900 font-semibold text-xs p-3 rounded-xl border border-slate-200"
                />
                <datalist id="club-options">
                  {existingClubs.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <p className="text-[11px] text-slate-400 mt-1">
                  Los equipos con el mismo dueño (en distintas categorías) se programan en horarios seguidos y nunca a la misma hora.
                </p>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-[#00A859] hover:bg-emerald-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition-colors"
              >
                + Crear Equipo
              </button>
            </form>
          </div>

          {/* Teams List */}
          <div className="lg:col-span-2 glass-card rounded-3xl p-6 border border-slate-200 shadow-md space-y-4">
            <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
              <Trophy className="w-5 h-5 text-[#00A859]" /> Equipos Enrolados ({teams.length})
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {teams.map((t) => (
                <div key={t.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center gap-3">
                  <TeamShield logoKey={t.logo} name={t.name} shortName={t.shortName} primaryColor={t.primaryColor} size="md" />
                  <div className="min-w-0 flex-1">
                    <h4 className="font-black text-slate-900 text-sm truncate">{t.name}</h4>
                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-200 text-slate-700">
                      {t.category}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    {onUpdateTeam && (
                      <button
                        onClick={() => setEditTeam(t)}
                        className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-bold inline-flex items-center gap-1 transition-colors"
                      >
                        <Pencil className="w-3 h-3 text-[#00A859]" /> Editar
                      </button>
                    )}
                    {onDeleteTeam && (
                      <button
                        onClick={() => {
                          if (window.confirm(`¿Eliminar el equipo "${t.name}"? Se borrarán también sus jugadores y sus partidos. No se puede deshacer.`)) {
                            onDeleteTeam(t);
                          }
                        }}
                        className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-bold inline-flex items-center gap-1 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" /> Eliminar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal de edición de equipo */}
      {editTeam && onUpdateTeam && (
        <TeamEditModal
          team={editTeam}
          onSave={onUpdateTeam}
          onClose={() => setEditTeam(null)}
        />
      )}

      {/* Modal de edición de jugador */}
      {editPlayer && onUpdatePlayer && (
        <PlayerEditModal
          player={editPlayer}
          teams={teams}
          onSave={onUpdatePlayer}
          onClose={() => setEditPlayer(null)}
        />
      )}

      {/* Tab 2: Players Management */}
      {activeTab === 'players' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Create Player Form */}
          <div className="glass-card rounded-3xl p-6 border border-slate-200 shadow-md space-y-4">
            <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#00A859]" /> Enrolar Nuevo Jugador
            </h3>

            <form onSubmit={handleCreatePlayer} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Equipo</label>
                <select
                  value={playerTeamId}
                  onChange={(e) => setPlayerTeamId(e.target.value)}
                  className="w-full bg-slate-50 text-slate-900 font-bold text-xs p-3 rounded-xl border border-slate-200"
                  required
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Nombre Completo (Ab. / Dr.)</label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Ab. Carlos Benítez"
                  className="w-full bg-slate-50 text-slate-900 font-semibold text-xs p-3 rounded-xl border border-slate-200"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Número Dorsal</label>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={playerDorsal}
                    onChange={(e) => setPlayerDorsal(Number(e.target.value))}
                    className="w-full bg-slate-50 text-slate-900 font-semibold text-xs p-3 rounded-xl border border-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Posición</label>
                  <select
                    value={playerPosition}
                    onChange={(e) => setPlayerPosition(e.target.value as 'POR' | 'DEF' | 'MED' | 'DEL')}
                    className="w-full bg-slate-50 text-slate-900 font-bold text-xs p-3 rounded-xl border border-slate-200"
                  >
                    <option value="POR">Portero</option>
                    <option value="DEF">Defensa</option>
                    <option value="MED">Mediocampista</option>
                    <option value="DEL">Delantero</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Cédula / N° Foro Abogados</label>
                <input
                  type="text"
                  value={playerCedula}
                  onChange={(e) => setPlayerCedula(e.target.value)}
                  placeholder="1801234567"
                  className="w-full bg-slate-50 text-slate-900 font-semibold text-xs p-3 rounded-xl border border-slate-200"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-[#00A859] hover:bg-emerald-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition-colors"
              >
                + Enrolar Jugador
              </button>
            </form>
          </div>

          {/* Players List */}
          <div className="lg:col-span-2 glass-card rounded-3xl p-6 border border-slate-200 shadow-md space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <Users className="w-5 h-5 text-[#00A859]" /> Jugadores ({visiblePlayers.length})
              </h3>

              <div className="flex items-center gap-2">
                <select
                  value={filterCategory}
                  onChange={(e) => {
                    setFilterCategory(e.target.value as Category | 'ALL');
                    setFilterTeamId('ALL');
                  }}
                  className="bg-slate-50 text-slate-900 font-bold text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#00A859]"
                >
                  <option value="ALL">Todas las categorías</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <select
                  value={filterTeamId}
                  onChange={(e) => setFilterTeamId(e.target.value)}
                  className="bg-slate-50 text-slate-900 font-bold text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#00A859]"
                >
                  <option value="ALL">Todos los equipos</option>
                  {teamsForFilter.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as 'ALL' | 'APPROVED' | 'PENDING')}
                  className="bg-slate-50 text-slate-900 font-bold text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#00A859]"
                >
                  <option value="ALL">Todos los estados</option>
                  <option value="APPROVED">Aprobados</option>
                  <option value="PENDING">Pendientes</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 uppercase font-extrabold border-b">
                    <th className="p-3">#</th>
                    <th className="p-3">Nombre</th>
                    <th className="p-3 hidden sm:table-cell">Equipo</th>
                    <th className="p-3 hidden md:table-cell">Posición</th>
                    <th className="p-3 hidden md:table-cell">Afiliación</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visiblePlayers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400 font-semibold">
                        No hay jugadores para este filtro.
                      </td>
                    </tr>
                  )}
                  {visiblePlayers.map((p) => {
                    const team = teams.find((t) => t.id === p.teamId);
                    const status = p.approvalStatus || 'APPROVED';
                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="p-3 font-black text-slate-900">#{p.dorsal}</td>
                        <td className="p-3 font-bold text-slate-800">{p.name}</td>
                        <td className="p-3 text-slate-600 hidden sm:table-cell">{team?.name || p.teamId}</td>
                        <td className="p-3 font-bold text-emerald-700 hidden md:table-cell">{p.position}</td>
                        <td className="p-3 text-slate-700 font-semibold hidden md:table-cell">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            p.affiliation === 'Colegio de Abogados'
                              ? 'bg-emerald-100 text-[#00A859]'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {p.affiliation || 'Foro de Abogados'}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            status === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : status === 'PENDING'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {status === 'APPROVED' ? 'Aprobado' : status === 'PENDING' ? 'Pendiente' : 'Rechazado'}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {onUpdatePlayer && (
                              <button
                                onClick={() => setEditPlayer(p)}
                                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-bold inline-flex items-center gap-1 transition-colors"
                              >
                                <Pencil className="w-3 h-3 text-[#00A859]" /> Editar
                              </button>
                            )}
                            {(p.hasDoc || p.verificationDoc) && (
                              <button
                                onClick={() => openDoc(p)}
                                disabled={docLoading}
                                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-[10px] font-bold inline-flex items-center gap-1 transition-colors"
                              >
                                <Eye className="w-3 h-3 text-[#00A859]" />
                                <span>Ver Respaldo</span>
                              </button>
                            )}

                            {status === 'PENDING' && (
                              <>
                                <button
                                  onClick={() => handleApprove(p)}
                                  className="px-2.5 py-1 bg-[#00A859] hover:bg-emerald-700 text-white rounded-lg text-[10px] font-extrabold shadow-xs transition-colors"
                                >
                                  Aprobar
                                </button>
                                <button
                                  onClick={() => handleReject(p)}
                                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-extrabold shadow-xs transition-colors"
                                >
                                  Rechazar
                                </button>
                              </>
                            )}

                            {status !== 'PENDING' && onDeletePlayer && (
                              <button
                                onClick={() => handleDelete(p)}
                                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-bold inline-flex items-center gap-1 transition-colors"
                              >
                                <Trash2 className="w-3 h-3" /> Eliminar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal preview for player evidence document */}
      {selectedDocPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white p-6 rounded-3xl max-w-lg w-full relative space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center space-x-2 text-[#00A859] font-black text-sm">
                <FileText className="w-5 h-5" />
                <span>Respaldo ({selectedDocPlayer.affiliation}): {selectedDocPlayer.name}</span>
              </div>
              <button
                onClick={() => setSelectedDocPlayer(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-96 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-2 flex items-center justify-center">
              {selectedDocPlayer.verificationDoc?.startsWith('data:image') || selectedDocPlayer.verificationDoc?.startsWith('http') ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={selectedDocPlayer.verificationDoc}
                  alt="Respaldo de Afiliación"
                  className="max-w-full h-auto rounded-xl shadow-sm"
                />
              ) : (
                <div className="text-center p-6 text-slate-600 space-y-2">
                  <FileText className="w-12 h-12 text-[#00A859] mx-auto" />
                  <p className="text-xs font-bold">Documento adjunto en PDF / archivo</p>
                  {selectedDocPlayer.verificationDoc && (
                    <a
                      href={selectedDocPlayer.verificationDoc}
                      download={`Respaldo_${selectedDocPlayer.name}.pdf`}
                      className="inline-block px-4 py-2 bg-[#00A859] text-white text-xs font-bold rounded-xl"
                    >
                      Descargar Respaldo
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Approval Decision Bar */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleApprove(selectedDocPlayer)}
                  className="px-4 py-2 bg-[#00A859] hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-colors"
                >
                  ✓ Aprobar Jugador
                </button>
                <button
                  onClick={() => handleReject(selectedDocPlayer)}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl transition-colors"
                >
                  ✕ Rechazar
                </button>
              </div>

              <button
                onClick={() => setSelectedDocPlayer(null)}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: System Settings & Reset */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          {/* Card 1: Generate Fixture */}
          {onGenerateFixture && (
            <div className="glass-card rounded-3xl p-6 border border-slate-200 shadow-md space-y-4">
              <div className="space-y-1 border-b pb-4">
                <h3 className="font-black text-slate-900 text-lg flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-[#00A859]" /> Generador Automático de Calendario (Fixture)
                </h3>
                <p className="text-xs text-slate-500">
                  Mezcla aleatoriamente todos los equipos inscritos de cada categoría y genera el calendario completo de enfrentamientos todos contra todos (Round-Robin).
                </p>
              </div>

              {/* Descansos por categoría: marca los sábados en que cada categoría NO juega */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
                    Descansos por categoría
                  </span>
                  {totalBlocked > 0 && (
                    <button
                      onClick={() => setBlockedByCategory({})}
                      className="text-[11px] font-bold text-rose-600 hover:underline"
                    >
                      Limpiar ({totalBlocked})
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  Marca ✔ el sábado en que una categoría <strong>descansa</strong>. Al generar, esa
                  categoría salta esa fecha y corre sus partidos al siguiente sábado. Las demás siguen igual.
                </p>
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600 uppercase font-extrabold">
                        <th className="p-2 text-left sticky left-0 bg-slate-100">Sábado</th>
                        {CATEGORIES.map((c) => (
                          <th key={c} className="p-2 text-center whitespace-nowrap">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {weekends.map((d, i) => (
                        <tr key={d} className="hover:bg-slate-50">
                          <td className="p-2 font-bold text-slate-800 whitespace-nowrap sticky left-0 bg-white">
                            <span className="text-slate-400 mr-1">F{i + 1}</span> {fmtSat(d)}
                          </td>
                          {CATEGORIES.map((c) => (
                            <td key={c} className="p-2 text-center">
                              <input
                                type="checkbox"
                                checked={isBlocked(c, d)}
                                onChange={() => toggleBlock(c, d)}
                                className="w-4 h-4 accent-[#DC2626] cursor-pointer"
                                title={`${c} descansa el ${fmtSat(d)}`}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
                <div>
                  <span className="font-extrabold text-emerald-900 block">Sorteo Aleatorio Oficial</span>
                  <span className="text-emerald-700">
                    Asigna automáticamente fechas por semanas, horarios y canchas, respetando los descansos marcados.
                  </span>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm('¿Estás seguro de generar un nuevo calendario aleatorio de partidos para todas las categorías?')) {
                      onGenerateFixture(blockedByCategory);
                    }
                  }}
                  className="px-5 py-3 bg-[#00A859] hover:bg-emerald-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition-colors shrink-0 flex items-center justify-center gap-2"
                >
                  🎲 Generar Fixture Aleatorio
                </button>
              </div>
            </div>
          )}

          {/* Card: Backup & Restore */}
          <div className="glass-card rounded-3xl p-6 border border-slate-200 shadow-md space-y-4">
            <div className="space-y-1 border-b pb-4">
              <h3 className="font-black text-slate-900 text-lg flex items-center gap-2">
                <Download className="w-5 h-5 text-[#00A859]" /> Respaldo de Datos
              </h3>
              <p className="text-xs text-slate-500">
                Descargá un respaldo (JSON con todo el torneo) periódicamente y guardalo en un lugar seguro; podés restaurarlo cuando lo necesites.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={handleExportBackup}
                className="px-4 py-2.5 bg-[#00A859] hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow transition-colors flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" /> Descargar Respaldo
              </button>
              <button
                onClick={() => importInputRef.current?.click()}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-extrabold rounded-xl shadow transition-colors flex items-center justify-center gap-1.5"
              >
                <Upload className="w-4 h-4" /> Restaurar Respaldo
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleImportBackup}
                className="hidden"
              />
            </div>
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-xl">
              ⚠️ Restaurar un respaldo reemplaza todos los datos actuales (equipos, jugadores y partidos) por los del archivo.
            </p>
          </div>

          {/* Card 2: Reset System */}
          <div className="glass-card rounded-3xl p-6 border border-slate-200 shadow-md space-y-4">
            <div className="space-y-1 border-b pb-4">
              <h3 className="font-black text-slate-900 text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#DC2626]" /> Restablecer a Configuración Inicial
              </h3>
              <p className="text-xs text-slate-500">
                Deja el sistema en su estado base: los equipos y las cuentas de acceso, <strong>sin jugadores ni calendario</strong>. Úsalo solo para empezar el torneo desde cero.
              </p>
            </div>

            <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex items-center justify-between text-xs gap-4">
              <div>
                <span className="font-bold text-rose-900 block">⚠️ Acción destructiva</span>
                <span className="text-rose-700">Elimina TODOS los jugadores y el calendario actuales. Esta acción no se puede deshacer.</span>
              </div>
              <button
                onClick={() => {
                  if (window.confirm('¿Restablecer a configuración inicial? Se eliminarán TODOS los jugadores y el calendario. Esta acción no se puede deshacer.')) {
                    onResetData();
                  }
                }}
                className="px-4 py-2.5 bg-[#DC2626] hover:bg-rose-700 text-white font-extrabold rounded-xl shadow transition-colors flex items-center gap-1.5 shrink-0"
              >
                <RefreshCw className="w-4 h-4" /> Restablecer Todo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
