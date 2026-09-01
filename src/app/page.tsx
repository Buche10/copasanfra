'use client';

import React, { useState, useEffect } from 'react';
import { 
  Team, 
  Player, 
  Match, 
  User, 
  TeamStanding, 
  PlayerScorer, 
  PlayerSanction,
  GoalkeeperStat,
  Category,
  MAX_PLAYERS_PER_TEAM
} from '@/types';
import {
  getTeams,
  getPlayers,
  getPlayersFull,
  getMatches,
  getUsers,
  upsertTeam,
  upsertPlayer,
  insertPlayer,
  upsertMatch,
  replaceMatches,
  calculateStandings,
  calculateScorers,
  calculateSanctions,
  calculateGoalkeepers,
  resetAllDataToDefault
} from '@/lib/store';
import { signIn, signOut, getCurrentSessionEmail } from '@/lib/auth';
import { recomputePlayoffs, changedPlayoffMatches } from '@/lib/playoffs';
import { generateRandomFixture } from '@/lib/fixtureGenerator';
import { Header, TabType } from '@/components/Header';
import { CategorySelector } from '@/components/CategorySelector';
import { StandingsTable } from '@/components/StandingsTable';
import { ScorersTable } from '@/components/ScorersTable';
import { BestGoalkeeperTable } from '@/components/BestGoalkeeperTable';
import { SanctionsTable } from '@/components/SanctionsTable';
import { FixtureView } from '@/components/FixtureView';
import { MatchSheetModal } from '@/components/MatchSheetModal';
import { AdminModal } from '@/components/AdminModal';
import { LoginModal } from '@/components/LoginModal';
import { TeamProfileModal } from '@/components/TeamProfileModal';
import { PlayerProfileModal } from '@/components/PlayerProfileModal';
import { RegistrationView } from '@/components/RegistrationView';
import { QRScannerModal } from '@/components/QRScannerModal';

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('standings');
  const [selectedCategory, setSelectedCategory] = useState<Category>('Abierta Varones');
  const [currentUser, setUser] = useState<User | null>(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Selected Profiles Modals State
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const errMsg = (err: unknown) => (err instanceof Error ? err.message : 'Error inesperado.');

  // Persiste en la base los partidos de play off cuyos equipos cambiaron al
  // recalcular el cuadro (siembra desde posiciones / ganadores).
  const persistPlayoffs = async (before: Match[], after: Match[]) => {
    for (const m of changedPlayoffMatches(before, after)) {
      try {
        await upsertMatch(m);
      } catch {
        /* ignore: se reintenta en la próxima recomputación */
      }
    }
  };

  // Load public data on mount, and restore the auth session.
  // The `users` table (which holds staff emails) is readable only when
  // authenticated, so it is fetched only after confirming a session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [t, p, m] = await Promise.all([getTeams(), getPlayers(), getMatches()]);
        if (cancelled) return;
        setTeams(t);
        setPlayers(p);
        // Sembrar el cuadro de play offs según la tabla / ganadores.
        const reconciled = recomputePlayoffs(m, t);
        setMatches(reconciled);
        persistPlayoffs(m, reconciled);

        // Restore who is logged in (Supabase persists the session).
        const email = await getCurrentSessionEmail();
        if (cancelled || !email) return;
        const list = await getUsers();
        if (cancelled) return;
        const sessionUser = list.find((x) => x.email?.toLowerCase() === email.toLowerCase()) ?? null;
        setUser(sessionUser);
        // Authenticated staff see full player records (cedula, documents).
        if (sessionUser) {
          const full = await getPlayersFull();
          if (!cancelled) setPlayers(full);
        }
      } catch (err) {
        if (!cancelled) setLoadError(errMsg(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Update Match and persist. If the match's slot (fecha+hora+cancha) changed
  // and lands on a slot already used by another match, warn and SWAP: the other
  // match takes this match's original slot.
  const handleUpdateMatch = async (updatedMatch: Match) => {
    const old = matches.find((m) => m.id === updatedMatch.id);
    const slotChanged =
      !!old &&
      (old.time !== updatedMatch.time || old.stadium !== updatedMatch.stadium || old.date !== updatedMatch.date);
    const conflict = slotChanged
      ? matches.find(
          (m) =>
            m.id !== updatedMatch.id &&
            m.date === updatedMatch.date &&
            m.time === updatedMatch.time &&
            m.stadium === updatedMatch.stadium
        )
      : undefined;

    // Construir el arreglo con el cambio del usuario (y el intercambio si aplica).
    let nextRaw: Match[];
    if (conflict && old) {
      const ok = window.confirm(
        `⚠️ Ese horario (${updatedMatch.date} ${updatedMatch.time} · ${updatedMatch.stadium}) ya está ocupado por otro partido.\n\n` +
          `Se intercambiarán los horarios: ese partido pasará al horario original de este (${old.time} · ${old.stadium}).\n\n¿Continuar?`
      );
      if (!ok) return;
      const swapped: Match = { ...conflict, date: old.date, time: old.time, stadium: old.stadium };
      nextRaw = matches.map((m) => (m.id === updatedMatch.id ? updatedMatch : m.id === conflict.id ? swapped : m));
      try {
        await upsertMatch(updatedMatch);
        await upsertMatch(swapped);
      } catch (err) {
        alert(`No se pudo guardar el intercambio de horarios: ${errMsg(err)}`);
        return;
      }
    } else {
      nextRaw = matches.map((m) => (m.id === updatedMatch.id ? updatedMatch : m));
      try {
        await upsertMatch(updatedMatch);
      } catch (err) {
        alert(`No se pudo guardar el partido: ${errMsg(err)}`);
        return;
      }
    }

    // Recalcular el cuadro de play offs (avanzar ganadores, re-sembrar) y
    // persistir los partidos del cuadro que hayan cambiado.
    const reconciled = recomputePlayoffs(nextRaw, teams);
    setMatches(reconciled);
    persistPlayoffs(nextRaw, reconciled);
  };

  // Add Team
  const handleAddTeam = async (newTeam: Team) => {
    setTeams((prev) => [...prev, newTeam]);
    try {
      await upsertTeam(newTeam);
    } catch (err) {
      alert(`No se pudo guardar el equipo: ${errMsg(err)}`);
    }
  };

  // Add Player. Persists FIRST, then updates local state only on success, and
  // returns whether it saved (so the registration UI doesn't show a false
  // "success"). Enforces the 20-per-team cap as a safety net.
  const handleAddPlayer = async (newPlayer: Player): Promise<boolean> => {
    const teamCount = players.filter((p) => p.teamId === newPlayer.teamId).length;
    if (teamCount >= MAX_PLAYERS_PER_TEAM) {
      alert(`Este equipo ya alcanzó el máximo de ${MAX_PLAYERS_PER_TEAM} jugadores. No se puede agregar más.`);
      return false;
    }
    try {
      await insertPlayer(newPlayer);
    } catch (err) {
      alert(`No se pudo guardar el jugador: ${errMsg(err)}`);
      return false;
    }
    setPlayers((prev) => [...prev, newPlayer]);
    return true;
  };

  // Update Player
  const handleUpdatePlayer = async (updatedPlayer: Player) => {
    setPlayers((prev) => prev.map((p) => (p.id === updatedPlayer.id ? updatedPlayer : p)));
    try {
      await upsertPlayer(updatedPlayer);
    } catch (err) {
      alert(`No se pudo actualizar el jugador: ${errMsg(err)}`);
    }
  };

  // Reset Data
  const handleResetData = async () => {
    try {
      await resetAllDataToDefault();
      const [t, p, m] = await Promise.all([getTeams(), getPlayers(), getMatches()]);
      setTeams(t);
      setPlayers(p);
      const reconciled = recomputePlayoffs(m, t);
      setMatches(reconciled);
      persistPlayoffs(m, reconciled);
    } catch (err) {
      alert(`No se pudieron restablecer los datos: ${errMsg(err)}`);
    }
  };

  // Generate Random Fixture
  const handleGenerateFixture = async () => {
    const newMatches = recomputePlayoffs(generateRandomFixture(teams), teams);
    setMatches(newMatches);
    try {
      await replaceMatches(newMatches);
    } catch (err) {
      alert(`No se pudo generar el calendario: ${errMsg(err)}`);
    }
  };

  // Auth Handlers. Returns an error message on failure, or null on success.
  const handleAuthenticate = async (email: string, password: string): Promise<string | null> => {
    let appUser;
    try {
      await signIn(email, password);
      // users is readable now that we are authenticated.
      const list = await getUsers();
      appUser = list.find((x) => x.email?.toLowerCase() === email.trim().toLowerCase());
    } catch (err) {
      return errMsg(err);
    }
    if (!appUser) {
      await signOut();
      return 'Tu cuenta no tiene un perfil asignado en el sistema. Contacta al administrador.';
    }
    setUser(appUser);
    // Load full player records (with sensitive fields) now that we're staff.
    try {
      setPlayers(await getPlayersFull());
    } catch {
      /* keep public players if the full fetch fails */
    }
    if (appUser.role === 'REFEREE') setActiveTab('sheet');
    if (appUser.role === 'ADMIN') setActiveTab('admin');
    return null;
  };

  const handleLogout = async () => {
    await signOut();
    setUser(null);
    setActiveTab('standings');
    // Drop the sensitive fields from memory: revert to the public player list.
    try {
      setPlayers(await getPlayers());
    } catch {
      /* ignore */
    }
  };

  // Only admins/referees can edit results; the DB (RLS) enforces this too.
  const canManageMatches = currentUser?.role === 'ADMIN' || currentUser?.role === 'REFEREE';

  // Derived Stats filtered by active category
  const filteredMatches = matches.filter((m) => m.category === selectedCategory);

  const standings: TeamStanding[] = calculateStandings(teams, matches, selectedCategory);
  const scorers: PlayerScorer[] = calculateScorers(players, teams, matches, selectedCategory);
  const goalkeepers: GoalkeeperStat[] = calculateGoalkeepers(players, teams, matches, selectedCategory);
  const sanctions: PlayerSanction[] = calculateSanctions(players, teams, matches, selectedCategory);

  const selectedTeamStanding = standings.find((s) => s.teamId === selectedTeam?.id);

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-6">
        <div className="max-w-md w-full bg-white rounded-3xl border border-rose-200 shadow-md p-8 text-center space-y-3">
          <h2 className="text-lg font-black text-rose-600">No se pudieron cargar los datos</h2>
          <p className="text-sm text-slate-600 break-words">{loadError}</p>
          <p className="text-xs text-slate-400">
            Verifica la conexión y que las variables de Supabase estén configuradas correctamente.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-slate-200 border-t-[#00A859] animate-spin" />
          <span className="text-sm font-bold text-slate-500">Cargando datos del torneo…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      
      {/* Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onOpenLogin={() => setIsLoginOpen(true)}
        onOpenScanner={() => setIsScannerOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Category Selector */}
        <CategorySelector
          selectedCategory={selectedCategory}
          onSelectCategory={(cat) => setSelectedCategory(cat)}
          teams={teams}
        />

        {/* Dynamic Tab Views */}
        {activeTab === 'standings' && (
          <StandingsTable
            standings={standings}
            teams={teams}
            onSelectTeam={(t) => setSelectedTeam(t)}
          />
        )}
        {activeTab === 'scorers' && (
          <ScorersTable
            scorers={scorers}
            players={players}
            teams={teams}
            onSelectPlayer={(p) => setSelectedPlayer(p)}
            onSelectTeam={(t) => setSelectedTeam(t)}
          />
        )}
        {activeTab === 'goalkeepers' && (
          <BestGoalkeeperTable
            goalkeepers={goalkeepers}
            teams={teams}
            onSelectTeam={(t) => setSelectedTeam(t)}
          />
        )}
        {activeTab === 'sanctions' && (
          <SanctionsTable
            sanctions={sanctions}
            players={players}
            teams={teams}
            onSelectPlayer={(p) => setSelectedPlayer(p)}
            onSelectTeam={(t) => setSelectedTeam(t)}
          />
        )}
        {activeTab === 'fixture' && (
          <FixtureView
            matches={filteredMatches}
            teams={teams}
            players={players}
            onSelectTeam={(t) => setSelectedTeam(t)}
            onGenerateFixture={currentUser?.role === 'ADMIN' ? handleGenerateFixture : undefined}
            onUpdateMatch={canManageMatches ? handleUpdateMatch : undefined}
          />
        )}
        {activeTab === 'sheet' && (
          <MatchSheetModal
            matches={filteredMatches}
            teams={teams}
            players={players}
            onUpdateMatch={handleUpdateMatch}
          />
        )}
        {activeTab === 'admin' && (
          <AdminModal
            teams={teams}
            players={players}
            onAddTeam={handleAddTeam}
            onAddPlayer={handleAddPlayer}
            onUpdatePlayer={handleUpdatePlayer}
            onResetData={handleResetData}
            onGenerateFixture={handleGenerateFixture}
          />
        )}
        {activeTab === 'registration' && (
          <RegistrationView
            teams={teams}
            players={players}
            onAddPlayer={handleAddPlayer}
            onCancel={() => setActiveTab('standings')}
          />
        )}

      </main>

      {/* Team Profile Modal */}
      {selectedTeam && (
        <TeamProfileModal
          team={selectedTeam}
          standing={selectedTeamStanding}
          players={players}
          matches={matches}
          onSelectPlayer={(p) => setSelectedPlayer(p)}
          onClose={() => setSelectedTeam(null)}
        />
      )}

      {/* Player Profile Modal */}
      {selectedPlayer && (
        <PlayerProfileModal
          player={selectedPlayer}
          teams={teams}
          matches={matches}
          currentUser={currentUser}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      {/* Login Modal */}
      {isLoginOpen && (
        <LoginModal
          onAuthenticate={handleAuthenticate}
          onClose={() => setIsLoginOpen(false)}
        />
      )}

      {/* QR Scanner Modal */}
      {isScannerOpen && (
        <QRScannerModal
          players={players}
          teams={teams}
          matches={matches}
          onClose={() => setIsScannerOpen(false)}
        />
      )}

      {/* Footer */}
      <footer className="bg-slate-900 text-white border-t border-slate-800 mt-12 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center space-x-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src="/colegio-abogados-tungurahua.jpg" 
              alt="Colegio de Abogados de Tungurahua" 
              className="w-8 h-8 rounded-full border border-slate-700 object-cover"
            />
            <div>
              <span className="font-bold text-white block text-sm">Colegio de Abogados de Tungurahua</span>
              <span className="text-slate-400">Ambato - Ecuador • Campeonato Oficial 2026</span>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
