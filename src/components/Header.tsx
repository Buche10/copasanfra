import React from 'react';
import { User } from '@/types';
import { 
  Trophy, 
  Calendar, 
  Award, 
  ShieldAlert, 
  ClipboardList, 
  Settings, 
  LogIn, 
  LogOut, 
  UserCheck,
  Shield,
  UserPlus,
  QrCode
} from 'lucide-react';

export type TabType = 'standings' | 'scorers' | 'goalkeepers' | 'sanctions' | 'fixture' | 'sheet' | 'admin' | 'registration';

interface HeaderProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  currentUser: User | null;
  onOpenLogin: () => void;
  onOpenScanner?: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  onOpenLogin,
  onOpenScanner,
  onLogout,
}) => {
  const getTabClass = (tab: TabType) =>
    `flex items-center space-x-1.5 px-3 py-1.5 text-xs lg:text-sm font-extrabold rounded-xl transition-all whitespace-nowrap ${
      activeTab === tab
        ? 'bg-[#00A859] text-white shadow-sm'
        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 border border-slate-200/60'
    }`;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          
          {/* Logo & Brand Title */}
          <div 
            onClick={() => setActiveTab('standings')}
            className="flex items-center space-x-3 cursor-pointer group shrink-0"
          >
            <div className="w-10 h-10 rounded-full overflow-hidden p-0.5 border-2 border-[#00A859] shadow-sm group-hover:scale-105 transition-transform shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src="/colegio-abogados-tungurahua.jpg" 
                alt="Copa Sanfra" 
                className="w-full h-full object-cover rounded-full"
              />
            </div>
            <div className="whitespace-nowrap">
              <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-none">
                Copa Sanfra <span className="text-[#00A859]">2026</span>
              </h1>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden lg:flex items-center space-x-1 p-1 overflow-x-auto scrollbar-none">
            <button onClick={() => setActiveTab('standings')} className={getTabClass('standings')}>
              <Trophy className="w-4 h-4 shrink-0" />
              <span>Posiciones</span>
            </button>

            <button onClick={() => setActiveTab('scorers')} className={getTabClass('scorers')}>
              <Award className="w-4 h-4 shrink-0" />
              <span>Goleadores</span>
            </button>

            <button onClick={() => setActiveTab('goalkeepers')} className={getTabClass('goalkeepers')}>
              <Shield className="w-4 h-4 shrink-0" />
              <span>Mejor Arquero</span>
            </button>

            <button onClick={() => setActiveTab('sanctions')} className={getTabClass('sanctions')}>
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Sanciones</span>
            </button>

            <button onClick={() => setActiveTab('fixture')} className={getTabClass('fixture')}>
              <Calendar className="w-4 h-4 shrink-0" />
              <span>Calendario</span>
            </button>

            <button onClick={() => setActiveTab('registration')} className={getTabClass('registration')}>
              <UserPlus className="w-4 h-4 shrink-0" />
              <span>Inscripción</span>
            </button>

            {(currentUser?.role === 'REFEREE' || currentUser?.role === 'ADMIN') && (
              <button onClick={() => setActiveTab('sheet')} className={getTabClass('sheet')}>
                <ClipboardList className="w-4 h-4 shrink-0" />
                <span>Hoja de Control</span>
              </button>
            )}

            {currentUser?.role === 'ADMIN' && (
              <button onClick={() => setActiveTab('admin')} className={getTabClass('admin')}>
                <Settings className="w-4 h-4 shrink-0" />
                <span>Admin</span>
              </button>
            )}
          </nav>

          {/* User Auth & QR Scanner Buttons (QR scanner ONLY for Admin and Referee) */}
          <div className="flex items-center space-x-2 shrink-0">
            {onOpenScanner && (currentUser?.role === 'ADMIN' || currentUser?.role === 'REFEREE') && (
              <button
                onClick={onOpenScanner}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-xs font-black rounded-xl transition-all shadow-xs"
                title="Lector de QR para Árbitros"
              >
                <QrCode className="w-4 h-4 text-[#00A859]" />
                <span className="hidden sm:inline">Escáner QR</span>
              </button>
            )}

            {currentUser ? (
              <div className="flex items-center space-x-2">
                <div className="hidden xl:flex flex-col items-end text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {currentUser.role === 'ADMIN' ? 'Administrador' : 'Árbitro Oficial'}
                  </span>
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-[#00A859]" />
                    {currentUser.name}
                  </span>
                </div>
                <button
                  onClick={onLogout}
                  className="p-2 text-slate-500 hover:text-[#DC2626] hover:bg-rose-50 rounded-xl transition-colors"
                  title="Cerrar Sesión"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenLogin}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors shadow-xs"
              >
                <LogIn className="w-4 h-4 text-[#00A859]" />
                <span className="whitespace-nowrap sm:hidden">Acceso</span>
                <span className="whitespace-nowrap hidden sm:inline">Acceso Árbitros / Admin</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile / Tablet Navigation Row (below lg, where the desktop nav is hidden) */}
        <div className="flex lg:hidden items-center justify-between py-2 border-t border-slate-100 overflow-x-auto gap-2 scrollbar-none">
          <button
            onClick={() => setActiveTab('standings')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap ${
              activeTab === 'standings' ? 'bg-[#00A859] text-white shadow-sm' : 'bg-slate-100 text-slate-700'
            }`}
          >
            Posiciones
          </button>
          <button
            onClick={() => setActiveTab('scorers')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap ${
              activeTab === 'scorers' ? 'bg-[#00A859] text-white shadow-sm' : 'bg-slate-100 text-slate-700'
            }`}
          >
            Goleadores
          </button>
          <button
            onClick={() => setActiveTab('goalkeepers')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap ${
              activeTab === 'goalkeepers' ? 'bg-[#00A859] text-white shadow-sm' : 'bg-slate-100 text-slate-700'
            }`}
          >
            Mejor Arquero
          </button>
          <button
            onClick={() => setActiveTab('sanctions')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap ${
              activeTab === 'sanctions' ? 'bg-[#00A859] text-white shadow-sm' : 'bg-slate-100 text-slate-700'
            }`}
          >
            Sanciones
          </button>
          <button
            onClick={() => setActiveTab('fixture')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap ${
              activeTab === 'fixture' ? 'bg-[#00A859] text-white shadow-sm' : 'bg-slate-100 text-slate-700'
            }`}
          >
            Calendario
          </button>
          <button
            onClick={() => setActiveTab('registration')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap ${
              activeTab === 'registration' ? 'bg-[#00A859] text-white shadow-sm' : 'bg-slate-100 text-slate-700'
            }`}
          >
            Inscripción
          </button>
          {(currentUser?.role === 'REFEREE' || currentUser?.role === 'ADMIN') && (
            <button
              onClick={() => setActiveTab('sheet')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap ${
                activeTab === 'sheet' ? 'bg-[#00A859] text-white shadow-sm' : 'bg-slate-100 text-slate-700'
              }`}
            >
              Planilla Arbitral
            </button>
          )}
          {currentUser?.role === 'ADMIN' && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap ${
                activeTab === 'admin' ? 'bg-[#DC2626] text-white shadow-sm' : 'bg-slate-100 text-slate-700'
              }`}
            >
              Admin
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
