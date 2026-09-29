# Brief 04: Corrección del reporte de multas (Brief 02)

## Contexto
Proyecto: Copa Abogados. Stack: Next.js 16.3 (ver `AGENTS.md`), React 19, TypeScript, Tailwind 4, Supabase (tablas `{ id, data jsonb }`), Vitest (`npm test`). El Brief 02 (pestaña Admin > Multas, tabla `fine_payments`, `src/lib/finesReport.ts`, `src/components/AdminFinesReportView.tsx`, `src/components/FinePaymentForm.tsx`, `supabase/migracion-multas.sql`) está construido. Sus tests, el lint y el build pasan, pero la auditoría encontró dos fallos HIGH y algunos MEDIUM que este brief corrige. No añade funciones nuevas.

### HIGH 1: cualquier usuario autenticado puede hacerse ADMIN
`public.is_admin()` (en `supabase/migracion-multas.sql` y `supabase/schema.sql`) decide el rol leyendo `public.users`. Pero la política `users_write` (`supabase/schema.sql:202`) permite a CUALQUIER autenticado escribir en `users`. Un árbitro puede cambiar su propia fila a `"role": "ADMIN"` y con eso leer y escribir `fine_payments` (y ver el panel Admin). Eso anula la protección pedida en el Brief 02.

Hay que tener cuidado con un efecto secundario. En `src/lib/store.ts`, `resetAllDataToDefault` (línea ~294) e `importAllData` (línea ~359) hacen `deleteAllRows(TABLES.USERS)` y luego `upsertRows(TABLES.USERS, ...)`. Si `users_write` exige `is_admin()`, tras borrar todas las filas el admin deja de serlo y el insert falla: la tabla `users` queda vacía y nadie puede entrar. Por eso esas dos funciones deben cambiar a "upsert primero, borrar sobrantes después".

### HIGH 2: la fecha por defecto del pago falla por la noche
`FinePaymentForm.tsx:19` calcula `todayStr` con `new Date().toISOString().slice(0, 10)`, que es la fecha en UTC. En cambio, `validateFinePayment` (`finesReport.ts`) compara con la fecha LOCAL. En Ecuador (UTC-5), desde las 19:00 la fecha UTC ya es la de mañana. El formulario propone esa fecha y la validación la rechaza con "La fecha de pago no puede ser futura", así que registrar un pago con los valores por defecto falla cada noche. El atributo `max` del input también usa UTC. El nombre del CSV (`AdminFinesReportView.tsx`, `handleExportCsv`) tiene el mismo problema.

### MEDIUM
- `AdminFinesReportView.tsx` tiene 458 líneas. El brief pedía menos de 400 y extraer componentes.
- Textos visibles sin tildes ni signos de apertura, a diferencia del resto de la app: "Categoria", "Metodo", "invalido", "Expulsion", "seleccion", "Deseas anular este pago de multa?", "numero", "maximo", "Fecha calendario invalida", "A favor / Al dia", etc.
- `buildFinesReport` (`finesReport.ts:74-90`) muta los acumuladores (`existing.yellows += ...`, `existing.details.push(...)`) y hace `rows.sort(...)` en sitio. La regla del proyecto es la inmutabilidad.

### LOW (corregir de paso)
- `key={idx}` en la lista de detalle de tarjetas.
- `payments.filter(...)` por cada fila en el render: agrupar una vez con un mapa por `teamId`.
- `validateFinePayment` acepta `1e-7`, porque el control de decimales usa `toString().split('.')`. Validar con `Math.round(amount * 100) === amount * 100` (o con una tolerancia equivalente).

## Objetivo
Solo un ADMIN real puede modificar la tabla `users` (y por tanto leer y escribir `fine_payments`), sin romper el reinicio ni la importación de datos. Registrar un pago con la fecha por defecto funciona a cualquier hora. La vista queda por debajo de 400 líneas, con textos correctos en español y lógica inmutable.

## Requerimientos
1. SQL. Crear `supabase/migracion-users-admin.sql` (idempotente, comentado como `migracion-arbitraje.sql`) y reflejar el mismo cambio en `supabase/schema.sql` (reemplazar la política `users_write` de la línea ~202; la definición de `is_admin()` debe quedar ANTES de esa política en el archivo):
   - `drop policy if exists "users_write" on public.users;`
   - `create policy "users_write" on public.users for all to authenticated using (public.is_admin()) with check (public.is_admin());`
   - La política `users_read` no cambia.
   - Añadir un comentario que indique que el primer ADMIN se crea desde el SQL Editor de Supabase (que ignora RLS), como ya describe `supabase/seed.sql`.
2. `src/lib/store.ts`: nueva función privada `replaceUsers(users: User[], currentEmail: string | null)`:
   - Si `currentEmail` es null o no existe en `users` un usuario con ese email (sin distinguir mayúsculas) y `role === 'ADMIN'`, lanzar `Error('La lista de usuarios debe incluir tu cuenta de administrador; de lo contrario perderías el acceso.')` SIN tocar la base.
   - `upsertRows(TABLES.USERS, users)`, y después borrar solo las filas cuyo `id` no está en la lista nueva (`supabase.from(TABLES.USERS).delete().not('id', 'in', '(...)')`, con los ids escapados correctamente, o un `delete().in('id', sobrantes)` calculado a partir de `selectAll`).
   - Usarla en `resetAllDataToDefault` y en `importAllData` en lugar de `deleteAllRows(TABLES.USERS)` + `upsertRows(...)`. Obtener `currentEmail` con `getCurrentSessionEmail()` de `src/lib/auth.ts`.
   - En `importAllData`, si `replaceUsers` lanza el error, devolver ese mensaje como string (la función ya devuelve `string | null`) y no continuar con los usuarios. Mejor todavía: validar antes de borrar equipos, jugadores y partidos, para no dejar una importación a medias.
3. Fecha local. En `src/lib/finesReport.ts` exportar `localDateString(date: Date = new Date()): string`, que devuelve `YYYY-MM-DD` con `getFullYear/getMonth/getDate`. Usarla en:
   - `validateFinePayment` (en lugar del cálculo actual de `todayStr`).
   - `FinePaymentForm.tsx` para el valor por defecto de `paidAt`, para el `max` del input y al reiniciar el formulario tras guardar.
   - `AdminFinesReportView.tsx` para el nombre del archivo CSV.
4. Inmutabilidad en `buildFinesReport`: construir los acumuladores con objetos nuevos (`{ ...prev, yellows: prev.yellows + ..., details: [...prev.details, fine] }`) y ordenar una copia (`[...rows].sort(...)`). El resultado debe ser idéntico al actual (los tests existentes siguen pasando sin cambios).
5. Extraer de `AdminFinesReportView.tsx`:
   - `src/components/FinesTeamDetail.tsx`: el contenido de la fila expandida (detalle de tarjetas e historial de pagos con "Anular"). Keys estables: `${fine.matchId}-${fine.playerId}` para las multas y `p.id` para los pagos.
   - Opcional: `src/components/FinesSummaryCards.tsx` para las tres tarjetas de resumen.
   - Agrupar los pagos por equipo una sola vez con `useMemo` (`Map<teamId, CardFinePayment[]>`).
   - `AdminFinesReportView.tsx` debe quedar por debajo de 400 líneas.
6. Textos en español correcto (tildes y signos de apertura) en `AdminFinesReportView.tsx`, `FinePaymentForm.tsx`, los componentes extraídos y los mensajes de `validateFinePayment`. Por ejemplo: "Categoría", "Todas las categorías", "Método", "Expulsión", "Expulsión (doble amarilla)" en lugar de "Doble Amarilla", "No hay equipos con multas o pagos registrados en esta selección.", "¿Deseas anular este pago de multa?", "El monto debe ser un número válido", "El monto puede tener máximo 2 decimales", "Método de pago inválido", "Fecha inválida (formato AAAA-MM-DD)", "Equipo inexistente o no válido", "A favor / Al día". Si algún test compara un mensaje, actualiza el test para el nuevo texto.
7. `validateFinePayment`: rechazar montos con más de 2 decimales aunque vengan en notación científica (`1e-7`, `0.001`).

## Restricciones técnicas
- CERO EMOJIS, sin excepción: ni en interfaz, textos, código, comentarios, logs, consola, commits, docs, tests, datos semilla o nombres de archivo. Iconos solo con `lucide-react` (SVG).
- Repo de un cliente con marca propia: NO aplicar la marca Ualdo. Mantener el estilo visual actual.
- Sigue las convenciones existentes del repo.
- Seguridad: la protección de rol debe estar en la base (RLS), no solo en la interfaz. Nunca dejar la tabla `users` vacía. Errores sin datos sensibles.
- Diseño: SOLID, DRY, KISS, funciones <50 líneas, archivos <800 líneas (vista <400), sin anidación >4 niveles, inmutabilidad, manejo de errores explícito.
- No cambies el formato del backup ni el comportamiento del reporte (mismas cifras).
- No añadas dependencias.
- No toques archivos fuera del alcance indicado. No toques `tasks/`, `watch_tasks.*` ni `.gitignore`.

## Tests
En `src/lib/finesReport.test.ts` añadir:
- `localDateString`: con `new Date(2026, 8, 29, 23, 30)` devuelve `2026-09-29` (no el día siguiente).
- `validateFinePayment`: con `vi.useFakeTimers()` y `vi.setSystemTime(new Date(2026, 8, 29, 21, 0))`, la fecha `2026-09-29` es válida y `2026-09-30` es futura. Restaurar con `vi.useRealTimers()`.
- `validateFinePayment` rechaza `1e-7` y `0.001`, y acepta `0.01` y `12.5`.
- `buildFinesReport` no muta sus entradas: congelar `teams`, `matches` y `payments` con `Object.freeze` (profundo en los arrays) y comprobar que no lanza y que el resultado es el esperado.

Nuevo `src/lib/usersReplace.test.ts` (o dentro de un test de store con Supabase simulado mediante `vi.mock('./supabase')`):
- Si la lista nueva no incluye al admin actual, `replaceUsers` lanza el error y no llama ni a `upsert` ni a `delete`.
- Con una lista válida, llama a `upsert` antes que a `delete`, y `delete` solo recibe los ids sobrantes.
(Para poder testearla, exporta `replaceUsers` desde un módulo pequeño, por ejemplo `src/lib/usersSync.ts`, que reciba como parámetros las funciones `upsert`, `listIds` y `deleteIds`, y úsalo desde `store.ts`).

Cobertura >=80% en `src/lib/finesReport.ts` y en el módulo nuevo. Comandos: `npm test`, `npm run test:coverage`.

Verificación manual:
1. Ejecutar `migracion-users-admin.sql` en Supabase.
2. Iniciar sesión como árbitro e intentar actualizar su fila de `users` desde la consola del navegador (`supabase.from('users').update(...)`): debe afectar 0 filas o dar error. Admin > Multas no muestra pagos.
3. Como admin, pasadas las 19:00 hora local, registrar un pago dejando la fecha por defecto: se guarda.
4. Como admin, "Configuración > Importar" con un backup que incluya tu usuario: funciona. Con uno que no lo incluya: muestra el error y `users` sigue intacta.

## Verificación final
1. `npm test`
2. `npm run test:coverage`
3. `npm run lint`
4. `npx tsc --noEmit`
5. `npm run build`

## Criterios de aceptación
- [ ] `users_write` exige `public.is_admin()` en la migración nueva y en `schema.sql`.
- [ ] Reiniciar e importar datos nunca dejan `users` vacía y no borran al admin actual.
- [ ] La fecha por defecto del pago es la fecha local; registrar un pago de noche funciona.
- [ ] `buildFinesReport` no muta sus entradas ni sus acumuladores; las cifras del reporte no cambian.
- [ ] `AdminFinesReportView.tsx` tiene menos de 400 líneas; las keys de las listas son estables; los pagos se agrupan una sola vez.
- [ ] Los textos visibles llevan tildes y signos de apertura correctos.
- [ ] `validateFinePayment` rechaza `1e-7` y `0.001`.
- [ ] Todos los tests pasan; cobertura >=80% en el código nuevo; build, lint y `tsc` sin errores.
- [ ] Cero emojis en el diff.
