# Brief 02: Reporte de deuda por tarjetas por equipo, con registro de pagos

## Contexto
Proyecto: Copa Abogados. Stack: Next.js 16.3 (ver `AGENTS.md`: consulta `node_modules/next/dist/docs/` antes de usar APIs de Next), React 19, TypeScript, Tailwind 4, Supabase. Todo el acceso a datos está en `src/lib/store.ts`; cada tabla es `{ id text pk, data jsonb, updated_at }` y se usa con los helpers `selectAll`, `upsertRows`, `insertRows` (líneas 35-75). Nombres de tabla en `TABLES` de `src/lib/supabase.ts`. El esquema SQL está en `supabase/schema.sql` y las migraciones sueltas en `supabase/migracion-*.sql` (ver `supabase/migracion-arbitraje.sql` como modelo: idempotente, comentada, para pegar en el SQL Editor de Supabase).

Requisito previo: el Brief 01 ya está construido. Existe `src/lib/cardFines.ts` con `YELLOW_CARD_FINE = 2`, `RED_CARD_FINE = 4`, `playerFinesForMatch(match)`, `teamFinesForMatch(match, teamId)` e `isChargeable(match)`, y Vitest configurado (`npm test`).

Panel de administración: `src/components/AdminModal.tsx`. Las pestañas se definen en el estado `activeTab` (línea ~74) y los botones de pestaña están alrededor de las líneas 300-345; cada vista vive en su propio componente (`AdminActasView`, `AdminSanctionsView`, etc.) y se renderiza hacia la línea ~880. `AdminModal` se monta en `src/app/page.tsx` (buscar `<AdminModal`), donde existe `currentUser` (`User` con `name` y `role`).

Por qué: el organizador necesita saber cuánto debe cada equipo SOLO por tarjetas (sin arbitraje ni vocalía), y registrar lo que cada equipo va pagando para ver el saldo pendiente.

Seguridad actual a tener en cuenta: las tablas existentes permiten escritura a cualquier usuario autenticado (árbitros incluidos). Para la nueva tabla de pagos de multas se exige rol ADMIN a nivel de base de datos.

## Objetivo
En Admin existe una pestaña "Multas" que muestra, por equipo, lo generado por tarjetas, lo pagado y el saldo pendiente (filtrable por categoría y hasta una fecha), permite registrar y anular pagos de multas guardados en Supabase solo por administradores, e imprimir o exportar el reporte a CSV.

## Requerimientos
1. Tipo en `src/types/index.ts`:
   ```ts
   export interface CardFinePayment {
     id: string;
     teamId: string;
     category: Category;
     amount: number;          // > 0, máximo 2 decimales
     method: PaymentMethod;   // 'EFECTIVO' | 'TRANSFERENCIA'
     paidAt: string;          // YYYY-MM-DD
     note?: string;           // máximo 200 caracteres
     registeredBy: string;    // nombre del admin
     createdAt: string;       // ISO
   }
   ```
2. Migración `supabase/migracion-multas.sql` (idempotente, comentada como `migracion-arbitraje.sql`), y replicar lo mismo al final de `supabase/schema.sql`:
   - Función `public.is_admin()` `returns boolean language sql stable security definer set search_path = public` que devuelve `exists (select 1 from public.users u where lower(u.data->>'email') = lower(auth.jwt()->>'email') and u.data->>'role' = 'ADMIN')`.
   - Tabla `public.fine_payments (id text primary key, data jsonb not null, updated_at timestamptz not null default now())` con RLS habilitado.
   - Políticas: `fine_payments_admin_read` (select, to authenticated, using `public.is_admin()`) y `fine_payments_admin_write` (all, to authenticated, using y with check `public.is_admin()`). Sin acceso anónimo.
   - Índice: `create index if not exists fine_payments_team_idx on public.fine_payments ((data->>'teamId'));`
3. `src/lib/supabase.ts`: añadir `FINE_PAYMENTS: 'fine_payments'` a `TABLES`.
4. `src/lib/store.ts`: `getFinePayments()`, `upsertFinePayment(p)`, `deleteFinePayment(id)` siguiendo el patrón de `getPayments` / `upsertPayment` / `deletePayment` (líneas 229-250), con mensajes de error en español sin datos sensibles. Añadir `TABLES.FINE_PAYMENTS` a `resetAllDataToDefault` (borrado). No cambiar el formato de backup.
5. Crear `src/lib/finesReport.ts` (puro, sin React ni Supabase):
   - `FinesReportFilters { category: Category | 'ALL'; upToRound: number | null; }`
   - `TeamFinesRow { teamId; teamName; shortName; category; yellows; expulsions; generated; paid; balance; details: PlayerFine[] }`
   - `buildFinesReport(teams, matches, payments, filters): { rows: TeamFinesRow[]; totals: { generated; paid; balance } }`
     - `generated`: suma de `playerFinesForMatch` de partidos cobrables de la categoría, con `round <= upToRound` si se indica.
     - `paid`: suma de TODOS los pagos del equipo (los pagos no se filtran por fecha).
     - `balance = generated - paid` (negativo = saldo a favor).
     - Filas ordenadas por `balance` descendente y luego por nombre. Redondear montos a 2 decimales al final (evitar errores de coma flotante).
     - Construir mapas por `teamId` una sola vez (evitar recorrer todos los partidos por cada equipo: O(partidos + pagos), no O(equipos x partidos)).
   - `validateFinePayment(input): { ok: true; value } | { ok: false; error: string }`: `teamId` existente, `amount` número finito > 0 y <= 1000 con máximo 2 decimales, `method` válido, `paidAt` formato `YYYY-MM-DD` válido y no futura, `note` recortada y <= 200 caracteres.
   - `toFinesCsv(rows, totals): string`: separador `;`, cabecera `Equipo;Categoria;Amarillas;Expulsiones;Generado;Pagado;Saldo`, comillas dobles escapadas, y protección contra inyección de fórmulas (si una celda de texto empieza con `=`, `+`, `-`, `@`, tabulador o retorno de carro, anteponer `'`).
6. Componente nuevo `src/components/AdminFinesReportView.tsx` (<400 líneas; si crece, extraer `FinePaymentForm.tsx`):
   - Props: `teams`, `matches`, `adminName: string`.
   - Al montar carga `getFinePayments()` en estado local con indicador de carga y mensaje de error visible si falla (con botón "Reintentar").
   - Encabezado con el mismo estilo que `AdminActasView` (degradado slate, icono lucide `Receipt` o `Wallet`), título "Multas por Tarjetas", subtítulo con las tarifas tomadas de las constantes (nunca escritas a mano): "Amarilla $2 · Roja o doble amarilla $4".
   - Filtros: categoría (Todas + `CATEGORIES`), "Hasta la fecha" (Todas + fechas existentes), casilla "Mostrar equipos sin deuda" (por defecto oculta los que tienen `generated === 0` y `paid === 0`).
   - Tarjetas de resumen: Generado, Pagado, Saldo pendiente.
   - Tabla por equipo: escudo (`TeamShield`), equipo, categoría, amarillas, expulsiones, generado, pagado, saldo (rojo si > 0, verde si <= 0). Cada fila es expandible y muestra: detalle de multas (fecha, rival, jugador con dorsal, tipo, monto) y la lista de pagos del equipo con botón "Anular" (confirmación `window.confirm`).
   - Formulario "Registrar pago": equipo (select), monto, método (Efectivo/Transferencia), fecha (por defecto hoy), nota. Validar con `validateFinePayment`, mostrar el error junto al formulario. Al guardar: id `fp-${crypto.randomUUID()}`, `registeredBy = adminName`, `createdAt = new Date().toISOString()`, `category` = la del equipo. Actualización optimista con reversión y mensaje si Supabase falla. Deshabilitar el botón mientras guarda (evitar doble envío).
   - Botón "Exportar CSV": genera un `Blob` con `toFinesCsv` (con BOM UTF-8 para Excel) y descarga `multas-tarjetas-YYYY-MM-DD.csv`.
   - Botón "Imprimir": `window.print()`; añadir clases `print:hidden` a filtros, formulario y botones para que la impresión muestre solo resumen y tabla.
7. `src/components/AdminModal.tsx`: nueva pestaña `'multas'` con botón "Multas" junto a "Actas" (mismo estilo), que renderiza `AdminFinesReportView`. Nueva prop opcional `adminName?: string` (default `'Administrador'`).
8. `src/app/page.tsx`: pasar `adminName={currentUser?.name}` a `AdminModal`.

## Restricciones técnicas
- CERO EMOJIS, sin excepción: ni en interfaz, textos, código, comentarios, logs, consola, commits, docs, tests, datos semilla o nombres de archivo. Iconos solo con `lucide-react` (SVG).
- Repo de un cliente con marca propia: NO aplicar la marca Ualdo. Mantener el estilo visual existente del panel Admin.
- Sigue las convenciones existentes del repo.
- Seguridad: valida toda entrada (cliente con `validateFinePayment`; servidor con RLS solo-admin), sin secretos en código, sin `dangerouslySetInnerHTML`, CSV protegido contra inyección de fórmulas, errores sin datos sensibles. Los montos se calculan siempre desde los partidos, nunca se guardan totales.
- Diseño: SOLID, DRY, KISS, funciones <50 líneas, archivos <800 líneas (`AdminModal.tsx` ya tiene ~1200: solo añade la pestaña, no más lógica ahí), sin anidación >4 niveles, inmutabilidad, manejo de errores explícito.
- Rendimiento: `useMemo` para el reporte; cálculo en una pasada con mapas.
- No añadas dependencias.
- No toques archivos fuera del alcance indicado. No toques `tasks/`, `watch_tasks.*` ni `.gitignore`.

## Tests
Archivo `src/lib/finesReport.test.ts`:
- `buildFinesReport`: dos equipos con tarjetas en varias fechas; generado correcto; pagos restan; saldo negativo cuando pagó de más; filtro por categoría; filtro `upToRound` excluye fechas posteriores pero no filtra pagos; partidos `SCHEDULED` no suman; orden por saldo; totales; redondeo (p. ej. pagos 0.1 + 0.2).
- `validateFinePayment`: acepta un pago válido; rechaza monto 0, negativo, NaN, >1000, con 3 decimales; método inválido; fecha mal formada o futura; equipo inexistente; nota de 201 caracteres; recorta espacios de la nota.
- `toFinesCsv`: cabecera correcta; escapa comillas; antepone `'` a un nombre de equipo que empieza con `=`.

Cobertura >=80% en `src/lib/finesReport.ts`. Comandos: `npm test`, `npm run test:coverage`.

Verificación manual (no hay E2E en el repo): ejecutar `migracion-multas.sql` en Supabase; con usuario ADMIN registrar y anular un pago; con usuario árbitro comprobar que `getFinePayments()` devuelve vacío y que insertar falla (RLS).

## Verificación final
1. `npm test`
2. `npm run test:coverage`
3. `npm run lint`
4. `npx tsc --noEmit`
5. `npm run build`

## Criterios de aceptación
- [ ] Admin > Multas muestra por equipo amarillas, expulsiones, generado, pagado y saldo, usando las tarifas de `src/lib/cardFines.ts`.
- [ ] Filtros de categoría y "hasta la fecha" funcionan; los equipos sin movimientos se ocultan por defecto.
- [ ] Registrar un pago lo guarda en `fine_payments`, reduce el saldo y persiste al recargar; anular lo elimina tras confirmar.
- [ ] Un usuario no ADMIN no puede leer ni escribir `fine_payments` (RLS con `public.is_admin()`).
- [ ] Exportar CSV descarga un archivo que abre bien en Excel con acentos y sin fórmulas ejecutables.
- [ ] Imprimir muestra solo resumen y tabla.
- [ ] Cobertura >=80% en `src/lib/finesReport.ts`; todos los tests pasan; build, lint y `tsc` sin errores.
- [ ] Cero emojis en el diff.
