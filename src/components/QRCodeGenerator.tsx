'use client';

import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface QRCodeProps {
  value: string;
  size?: number;
  bgColor?: string;
  fgColor?: string;
  className?: string;
}

// Real, scannable QR code (ISO/IEC 18004) rendered as SVG.
// A quiet-zone margin is included so phone cameras can lock on reliably.
export const QRCodeGenerator: React.FC<QRCodeProps> = ({
  value,
  size = 160,
  bgColor = '#FFFFFF',
  fgColor = '#0F172A',
  className = '',
}) => {
  return (
    <QRCodeSVG
      value={value}
      size={size}
      bgColor={bgColor}
      fgColor={fgColor}
      level="M"
      marginSize={2}
      className={`rounded-lg ${className}`}
    />
  );
};
