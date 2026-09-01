import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Copa Sanfra 2026 | Sistema de Control y Estadísticas',
  description: 'Sistema oficial de gestión del campeonato de fútbol Copa Sanfra 2026. Tabla de posiciones, goleadores, juego limpio y planilla digital de arbitraje.',
  keywords: ['Copa Sanfra', 'Fútbol', 'Estadísticas de Fútbol', 'Planilla Digital de Arbitraje', 'Goleadores', 'Tabla de Posiciones'],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased selection:bg-[#00A859] selection:text-white">
        {children}
      </body>
    </html>
  );
}
