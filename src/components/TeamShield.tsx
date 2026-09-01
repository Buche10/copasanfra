'use client';

import React from 'react';
import { Scale, Landmark, FileText, Shield, BookOpen, GraduationCap, Gavel, Crown } from 'lucide-react';

interface TeamShieldProps {
  logoKey?: string;
  name: string;
  shortName?: string;
  primaryColor?: string;
  secondaryColor?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const TeamShield: React.FC<TeamShieldProps> = ({
  logoKey = 'scale',
  name,
  primaryColor = '#00A859',
  secondaryColor = '#FFFFFF',
  size = 'md',
}) => {
  const getIcon = () => {
    switch (logoKey) {
      case 'landmark':
        return <Landmark className="w-[50%] h-[50%]" />;
      case 'file-text':
        return <FileText className="w-[50%] h-[50%]" />;
      case 'shield':
        return <Shield className="w-[50%] h-[50%]" />;
      case 'book':
        return <BookOpen className="w-[50%] h-[50%]" />;
      case 'graduation':
        return <GraduationCap className="w-[50%] h-[50%]" />;
      case 'gavel':
        return <Gavel className="w-[50%] h-[50%]" />;
      case 'crown':
        return <Crown className="w-[50%] h-[50%]" />;
      case 'scale':
      default:
        return <Scale className="w-[50%] h-[50%]" />;
    }
  };

  // Dimensions based on size prop
  const sizeClasses = {
    sm: 'w-7 h-7 text-xs rounded-lg',
    md: 'w-10 h-10 text-sm rounded-xl',
    lg: 'w-14 h-14 text-base rounded-2xl',
    xl: 'w-20 h-20 text-xl rounded-3xl',
  };

  return (
    <div 
      className={`relative flex items-center justify-center font-black shadow-sm shrink-0 border border-slate-200/80 ${sizeClasses[size]}`}
      style={{
        backgroundColor: primaryColor,
        color: secondaryColor,
      }}
      title={name}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-black/20 rounded-[inherit] pointer-events-none" />
      <div className="relative z-10 flex items-center justify-center w-full h-full">
        {getIcon()}
      </div>
    </div>
  );
};
