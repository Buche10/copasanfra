'use client';

import React, { useState } from 'react';
import { Category, Player, Team } from '@/types';
import { RegistrationView } from './RegistrationView';
import { ReinforcementForm } from './ReinforcementForm';
import { UserCheck, UserPlus } from 'lucide-react';

interface RegistrationHubProps {
  teams: Team[];
  players: Player[];
  categories: Category[];
  registrationsOpen?: boolean;
  reinforcementsOpen?: boolean;
  suspendedCategories?: Category[];
  pausedCategories?: Category[];
  onAddPlayer: (player: Player) => Promise<boolean> | void;
  onReinforcementAdded: (player: Player) => void;
  onCancel?: () => void;
}

export const RegistrationHub: React.FC<RegistrationHubProps> = ({
  teams,
  players,
  categories,
  registrationsOpen = true,
  reinforcementsOpen = true,
  suspendedCategories = [],
  pausedCategories = [],
  onAddPlayer,
  onReinforcementAdded,
  onCancel,
}) => {
  const [activeTab, setActiveTab] = useState<'register' | 'reinforcement'>('register');

  return (
    <div className="w-full">
      <div className="flex justify-center mb-4">
        <div className="inline-flex p-1 bg-slate-100 rounded-2xl border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('register')}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'register'
                ? 'bg-[#00A859] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Inscribir jugador</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('reinforcement')}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'reinforcement'
                ? 'bg-[#00A859] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Habilitar refuerzo +40</span>
          </button>
        </div>
      </div>

      {activeTab === 'register' ? (
        <RegistrationView
          teams={teams}
          players={players}
          categories={categories}
          registrationsOpen={registrationsOpen}
          onAddPlayer={onAddPlayer}
          onCancel={onCancel}
        />
      ) : (
        <ReinforcementForm
          teams={teams}
          players={players}
          reinforcementsOpen={reinforcementsOpen}
          suspendedCategories={suspendedCategories}
          pausedCategories={pausedCategories}
          onReinforcementAdded={onReinforcementAdded}
          onCancel={onCancel}
        />
      )}
    </div>
  );
};
