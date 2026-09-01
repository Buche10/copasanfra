'use client';

import React from 'react';
import { Category, CATEGORIES, Team } from '@/types';
import { Trophy, Shield, Users, Sparkles, Layers } from 'lucide-react';

interface CategorySelectorProps {
  selectedCategory: Category;
  onSelectCategory: (category: Category) => void;
  teams: Team[];
}

export const CategorySelector: React.FC<CategorySelectorProps> = ({
  selectedCategory,
  onSelectCategory,
  teams,
}) => {
  const getTeamCount = (cat: Category) => {
    return teams.filter((t) => t.category === cat).length;
  };

  const getCategoryIcon = (cat: Category) => {
    switch (cat) {
      case 'Abierta Varones':
        return <Users className="w-4 h-4" />;
      case '+40 Varones':
        return <Shield className="w-4 h-4" />;
      case '+50 Varones':
        return <Trophy className="w-4 h-4" />;
      case 'Damas':
        return <Sparkles className="w-4 h-4" />;
      default:
        return <Layers className="w-4 h-4" />;
    }
  };

  const options: Category[] = CATEGORIES;

  return (
    <div className="bg-white p-2 rounded-3xl border border-slate-200 shadow-sm space-y-2">
      <div className="flex items-center justify-between px-3 pt-1 pb-2 border-b border-slate-100">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-[#00A859]" />
          <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
            Categorías del Campeonato
          </span>
        </div>
        <span className="text-xs font-semibold text-slate-400">
          {teams.length} Equipos inscritos
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {options.map((cat) => {
          const isSelected = selectedCategory === cat;
          const count = getTeamCount(cat);

          return (
            <button
              key={cat}
              onClick={() => onSelectCategory(cat)}
              className={`flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold transition-all duration-200 ${
                isSelected
                  ? 'bg-slate-900 text-white shadow-md scale-[1.02]'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/60'
              }`}
            >
              <div className="flex items-center space-x-2 truncate">
                <span className={isSelected ? 'text-[#00A859]' : 'text-slate-500'}>
                  {getCategoryIcon(cat)}
                </span>
                <span className="truncate">{cat}</span>
              </div>
              <span
                className={`ml-1.5 px-2 py-0.5 rounded-full text-[11px] font-extrabold shrink-0 ${
                  isSelected
                    ? 'bg-[#00A859] text-white'
                    : 'bg-slate-200/70 text-slate-600'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
