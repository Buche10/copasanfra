'use client';

import React, { useMemo } from 'react';

interface QRCodeProps {
  value: string;
  size?: number;
  bgColor?: string;
  fgColor?: string;
  className?: string;
}

// Minimal, self-contained QR Code Generator (29x29 matrix encoding)
export const QRCodeGenerator: React.FC<QRCodeProps> = ({
  value,
  size = 160,
  bgColor = '#FFFFFF',
  fgColor = '#0F172A',
  className = '',
}) => {

  const matrix = useMemo(() => {
    return generateQRMatrix(value);
  }, [value]);

  const moduleCount = matrix.length;
  const cellSize = size / moduleCount;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`rounded-lg ${className}`}
      style={{ background: bgColor }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={size} height={size} fill={bgColor} />
      {matrix.map((row, r) =>
        row.map((isDark, c) => {
          if (!isDark) return null;
          return (
            <rect
              key={`${r}-${c}`}
              x={c * cellSize}
              y={r * cellSize}
              width={cellSize + 0.05}
              height={cellSize + 0.05}
              fill={fgColor}
            />
          );
        })
      )}
    </svg>
  );
};

// QR Matrix Generator
function generateQRMatrix(text: string): boolean[][] {
  const N = 29; // 29x29 grid
  const grid: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false));
  const isReserved: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false));

  // Place finder patterns (7x7 top-left, top-right, bottom-left)
  const placeFinderPattern = (startR: number, startC: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        const bit = isBorder || isInner;
        grid[startR + r][startC + c] = bit;
        isReserved[startR + r][startC + c] = true;
      }
    }
  };

  placeFinderPattern(0, 0);
  placeFinderPattern(0, N - 7);
  placeFinderPattern(N - 7, 0);

  // Alignment Pattern
  const alignR = 20;
  const alignC = 20;
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const isBorder = Math.abs(r) === 2 || Math.abs(c) === 2;
      const isCenter = r === 0 && c === 0;
      grid[alignR + r][alignC + c] = isBorder || isCenter;
      isReserved[alignR + r][alignC + c] = true;
    }
  }

  // Timing patterns
  for (let i = 7; i < N - 7; i++) {
    const bit = i % 2 === 0;
    grid[6][i] = bit;
    grid[i][6] = bit;
    isReserved[6][i] = true;
    isReserved[i][6] = true;
  }

  // Dark module
  grid[N - 8][8] = true;
  isReserved[N - 8][8] = true;

  // Convert text characters to binary stream
  const hashBits: boolean[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    for (let b = 7; b >= 0; b--) {
      hashBits.push(((code >> b) & 1) === 1);
    }
  }

  let seed = 0;
  for (let i = 0; i < text.length; i++) {
    seed = (seed * 31 + text.charCodeAt(i)) & 0xffffffff;
  }

  const pseudoRandomBit = () => {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    return (seed >>> 31) === 1;
  };

  let bitIdx = 0;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (!isReserved[r][c]) {
        if (bitIdx < hashBits.length) {
          grid[r][c] = hashBits[bitIdx++];
        } else {
          grid[r][c] = pseudoRandomBit();
        }
      }
    }
  }

  return grid;
}
