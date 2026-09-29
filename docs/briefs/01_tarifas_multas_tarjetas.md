# Brief 01: Nuevas tarifas de multas por tarjeta (amarilla $2, roja $4)

## Contexto
Proyecto: Copa Abogados (torneo de fútbol). Stack: Next.js 16.3 (App Router, ver `AGENTS.md`: esta versión tiene cambios respecto a versiones anteriores; consulta `node_modules/next/dist/docs/` antes de usar APIs de Next), React 19, TypeScript, Tailwind 4, Supabase (tablas `{ id, data jsonb }`). No hay framework de tests todavía. Todo es cliente (`'use client'`).

Hoy las multas por tarjeta están duplicadas y con valores viejos:
- `src/components/AdminActasView.tsx` líneas 14-19: constantes locales `YELLOW_FINE = 1` y `RED_FINE = 2`, y la función `calc` (línea ~43) cuenta cada evento `YELLOW_CARD` / `RED_CARD` de todos los partidos sin importar su estado.
- `src/components/FinancialReportModal.tsx` líneas 41-42: defaults `?? 1` y `?? 2` (componente sin uso actual, pero debe quedar coherente).
- `src/types/index.ts` líneas 138-148 (`MatchFinancials`): comentarios "$1 por amarilla, $2 por roja".

Nuevas reglas de negocio (definidas por el cliente):
- Amarilla: $2. Roja: $4.
- Doble amarilla en el mismo partido se cobra COMO UNA ROJA ($4), no como dos amarillas. Si además el árbitro registró la roja resultante, no se cobra aparte.
- Regla exacta, por jugador y por partido: si tiene al menos 1 roja o 2 o más amarillas, se cobra UNA expulsión ($4); si no, y tiene exactamente 1 amarilla, se cobra $2; si no tiene tarjetas, $0.
- Solo cuentan partidos con estado `IN_PROGRESS` o `FINISHED` (mismo criterio que `calculateSanctions` en `src/lib/store.ts:568`).

Este brief es la base de los briefs 02 (reporte de deuda) y 03 (corrección de planilla), que reutilizan el módulo creado aquí.

## Objetivo
Toda la app calcula las multas desde un único módulo `src/lib/cardFines.ts` con amarilla $2, roja $4 y doble amarilla = una roja, cubierto por tests unitarios con Vitest.

## Requerimientos
1. Instalar Vitest como devDependency: `npm i -D vitest @vitest/coverage-v8`. Añadir a `package.json` los scripts `"test": "vitest run"` y `"test:coverage": "vitest run --coverage"`.
2. Crear `vitest.config.ts` en la raíz con `environment: 'node'`, alias `@` -> `./src` (mismo que `tsconfig.json`), `include: ['src/**/*.test.ts']` y cobertura v8 sobre `src/lib/**`.
3. Crear `src/lib/cardFines.ts` (funciones puras, sin React ni Supabase):
   - `export const YELLOW_CARD_FINE = 2;` y `export const RED_CARD_FINE = 4;`
   - Tipo `PlayerFine { matchId; round; category; teamId; playerId; kind: 'YELLOW' | 'EXPULSION'; amount; }`.
   - Tipo `TeamMatchFines { teamId; yellows: number; expulsions: number; amount: number; }` (yellows = amarillas COBRADAS, es decir sin contar las que se convirtieron en expulsión).
   - `isChargeable(match: Match): boolean` -> `status === 'IN_PROGRESS' || status === 'FINISHED'`.
   - `playerFinesForMatch(match: Match): PlayerFine[]`: agrupa eventos de tarjeta por `teamId + playerId` y aplica la regla exacta del Contexto. Devuelve `[]` si el partido no es cobrable.
   - `teamFinesForMatch(match: Match, teamId: string): TeamMatchFines`.
   - `matchFinesTotal(match: Match): { yellows; expulsions; amount }` (ambos equipos).
   - Sin mutaciones: usar `reduce`/`map` y objetos nuevos.
4. `src/components/AdminActasView.tsx`:
   - Eliminar `YELLOW_FINE` y `RED_FINE` locales; importar desde `@/lib/cardFines`.
   - `calc(m)` usa `matchFinesTotal(m)` para `fines`, `yellows` (cobradas) y `reds` (renombrar a `expulsions`).
   - En la lista de sanciones del acta, en vez de un monto por evento, mostrar una línea por `PlayerFine` (nombre, equipo, "Amarilla" o "Expulsión", monto). Si una expulsión viene de doble amarilla, mostrar la etiqueta "Expulsión (doble amarilla)".
   - Actualizar los textos de la tabla de cuentas: "Amarillas (n)" y "Expulsiones (n)" con los nuevos montos.
   - Mantener `TEAM_FEE`, `REFEREE_FEE`, `CANCHA_FEE` como están.
5. `src/components/FinancialReportModal.tsx`: reemplazar los defaults `?? 1` / `?? 2` por `YELLOW_CARD_FINE` / `RED_CARD_FINE` y calcular multas por equipo con `teamFinesForMatch`.
6. `src/types/index.ts`: corregir los comentarios de `MatchFinancials` ("$2 por amarilla, $4 por roja; doble amarilla = roja").
7. Crear `src/lib/cardFines.test.ts` (ver Tests).

## Restricciones técnicas
- CERO EMOJIS, sin excepción: ni en interfaz, textos, código, comentarios, logs, consola, commits, docs, tests, datos semilla o nombres de archivo. Iconos solo con `lucide-react` (SVG). Si tocas una línea que ya tiene emoji, quítalo.
- Este repo es de un cliente con marca propia: NO aplicar la marca Ualdo. Mantener el estilo visual existente (verde `#00A859`, slate, Tailwind).
- Sigue las convenciones existentes del repo (comentarios en español, componentes `React.FC`, nombres en inglés para código).
- Seguridad: sin secretos en código; no introducir `dangerouslySetInnerHTML`.
- Diseño: SOLID, DRY, KISS, funciones <50 líneas, archivos <800 líneas, sin anidación >4 niveles, inmutabilidad, manejo de errores explícito.
- Dependencias nuevas permitidas: solo `vitest` y `@vitest/coverage-v8` (justificación: el repo no tiene tests y la lógica de dinero requiere cobertura).
- No toques archivos fuera del alcance indicado. No toques `tasks/`, `watch_tasks.*` ni `.gitignore`.

## Tests
Archivo `src/lib/cardFines.test.ts`, con un helper local que construya `Match` mínimos. Casos obligatorios:
- 1 amarilla -> $2, `yellows: 1`, `expulsions: 0`.
- 1 roja directa -> $4, `expulsions: 1`.
- 2 amarillas mismo jugador mismo partido -> $4 (no $8 ni $4+$4), `yellows: 0`, `expulsions: 1`.
- 2 amarillas + 1 roja mismo jugador -> $4.
- 1 amarilla + 1 roja directa mismo jugador -> $4.
- 2 amarillas de jugadores distintos del mismo equipo -> $4, `yellows: 2`.
- Amarillas del mismo jugador en partidos distintos -> $2 en cada partido.
- Partido `SCHEDULED` o `SUSPENDED` con tarjetas -> $0.
- `teamFinesForMatch` separa correctamente local y visitante.
- Eventos `GOAL` y `SUBSTITUTION` se ignoran.

Comandos: `npm test` y `npm run test:coverage` (cobertura >=80% en `src/lib/cardFines.ts`).

## Verificación final
1. `npm test`
2. `npm run test:coverage`
3. `npm run lint`
4. `npx tsc --noEmit`
5. `npm run build`

## Criterios de aceptación
- [ ] No quedan constantes de multa duplicadas: `grep -rn "YELLOW_FINE\|RED_FINE\|?? 1;\|?? 2;" src` no devuelve cálculos de multas fuera de `src/lib/cardFines.ts`.
- [ ] En Admin > Actas, un partido con una amarilla suma $2 y con una roja $4; una doble amarilla del mismo jugador suma $4 y se etiqueta "Expulsión (doble amarilla)".
- [ ] Partidos programados no generan multas en Actas.
- [ ] Cobertura >=80% en `src/lib/cardFines.ts`.
- [ ] Todos los tests pasan; build, lint y `tsc` sin errores.
- [ ] Cero emojis en el diff.
