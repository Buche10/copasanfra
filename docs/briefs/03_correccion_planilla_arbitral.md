# Brief 03: Corrección de la planilla arbitral por el administrador

## Contexto
Proyecto: Copa Abogados. Stack: Next.js 16.3 (ver `AGENTS.md`: consulta `node_modules/next/dist/docs/` antes de usar APIs de Next), React 19, TypeScript, Tailwind 4, Supabase. Requisito previo: Briefs 01, 02 y 04 construidos (Vitest configurado, `npm test`; ya existen `src/lib/cardFines.ts`, `src/lib/finesReport.ts` y la pestaña Admin > Multas).

La planilla arbitral es `src/components/MatchSheetModal.tsx` (988 líneas, ya supera el máximo de 800). Se muestra en la pestaña `'sheet'` de `src/app/page.tsx` (buscar `<MatchSheetModal`) tanto para árbitros como para administradores, y guarda cada cambio al instante con `onUpdateMatch` (-> `handleUpdateMatch` en `page.tsx` -> `upsertMatch`).

Problema: cuando el árbitro pulsa "Finalizar y Firmar" (`handleFinishMatch`, línea ~331) el partido pasa a `FINISHED` y TODO queda bloqueado. Los bloqueos están dispersos en checks `currentMatch.status === 'FINISHED'` / `!== 'FINISHED'`:
- `handleTogglePlayerLineup` (línea ~222) y `handleChangeGoalkeeper` (línea ~260).
- Selects de arqueros (líneas ~520 y ~540), buscador QR (~585, ~593).
- Formulario de eventos (`{currentMatch.status !== 'FINISHED' && (` línea ~749).
- Botón eliminar evento (línea ~922) y textarea de observaciones (línea ~953).

El marcador se lleva de forma incremental en `handleAddEvent` / `handleDeleteEvent` (líneas ~254-325): cada gol suma o resta (el autogol suma al rival). OJO: hay partidos cuyo marcador se cargó desde Admin > Resultados sin eventos de gol, así que NO se puede recalcular siempre el marcador desde los eventos.

Los árbitros se equivocan (jugador equivocado, tarjeta de más o de menos, gol mal atribuido, nómina incompleta). El administrador necesita corregir la planilla ya firmada. Las estadísticas, sanciones, tabla y multas (Briefs 01-02) se derivan de `match.events`, así que se actualizan solas al guardar.

## Objetivo
Un usuario ADMIN puede abrir una planilla FINALIZADA en "modo corrección", editar nómina, arqueros, eventos (agregar, editar, eliminar), marcador y observaciones sobre un borrador, y guardar todo junto indicando un motivo, quedando registro de quién y cuándo corrigió. Los árbitros siguen sin poder modificar planillas firmadas.

## Requerimientos
1. Tipos en `src/types/index.ts`:
   ```ts
   export interface SheetCorrection {
     at: string;      // ISO
     by: string;      // nombre del admin
     reason: string;  // 5 a 300 caracteres
   }
   ```
   y en `Match` el campo opcional `corrections?: SheetCorrection[];`.
2. Crear `src/lib/matchSheet.ts` (funciones puras e inmutables):
   - `goalDelta(match, ev): { home: number; away: number }` (efecto de un gol en el marcador; autogol suma al rival; no-gol -> 0/0).
   - `addEvent(match, ev): Match`, `removeEvent(match, eventId): Match`, `replaceEvent(match, updated): Match`: actualizan `events` y ajustan el marcador restando el efecto del evento viejo y sumando el nuevo, sin bajar de 0.
   - `scoreFromGoals(match): { homeScore; awayScore }` (para el botón opcional "Recalcular desde goles").
   - `applyCorrection(original, draft, correction): Match`: devuelve `draft` con `corrections: [...(original.corrections ?? []), correction]`, manteniendo `status`, `refereeSigned` y `signedAt` del original.
   - `validateCorrectionReason(text): string | null` (error o null; recorta; 5-300 caracteres).
   - `validateScore(value: string): number | null` (entero 0-99).
3. Refactor de `src/components/MatchSheetModal.tsx` para reutilizar `src/lib/matchSheet.ts` en `handleAddEvent` y `handleDeleteEvent` (misma conducta que hoy para el árbitro) y para bajar de 800 líneas extrayendo:
   - `src/components/MatchEventForm.tsx` (formulario de eventos; admite modo "editar evento" con valores iniciales y botón "Guardar cambio" / "Cancelar").
   - `src/components/MatchEventsList.tsx` (lista de eventos; recibe `canEdit`, `onEdit(ev)`, `onDelete(id)`).
   - `src/components/SheetCorrectionBar.tsx` (barra del modo corrección, ver punto 5).
4. Nuevas props de `MatchSheetModal`: `isAdmin?: boolean` (default `false`) y `editorName?: string`. En `src/app/page.tsx` pasar `isAdmin={currentUser?.role === 'ADMIN'}` y `editorName={currentUser?.name}`.
5. Modo corrección dentro de `MatchSheetModal`:
   - Estado `draft: Match | null`. `const sheet = draft ?? currentMatch;` y `const locked = sheet.status === 'FINISHED' && draft === null;`. Reemplazar TODOS los checks de bloqueo listados en Contexto por `locked`, y todas las lecturas de `currentMatch` en el render y handlers por `sheet`.
   - Función `commit(next: Match)`: si hay `draft`, `setDraft(next)`; si no, `onUpdateMatch(next)`. Todos los handlers usan `commit`.
   - Si `isAdmin && currentMatch.status === 'FINISHED' && !draft`: botón "Corregir planilla" (icono lucide `PencilLine`) junto al sello "Planilla Firmada Oficialmente". Al pulsar: `setDraft(currentMatch)`.
   - Con `draft` activo, `SheetCorrectionBar` fija arriba de la planilla (fondo ámbar suave) con: texto "Modo corrección: los cambios no se guardan hasta confirmar", campo "Motivo de la corrección" (obligatorio), inputs de marcador local/visitante (validados con `validateScore`), botón "Recalcular desde goles", botón "Descartar" (confirma si hay cambios) y botón "Guardar corrección" (deshabilitado si el motivo no es válido o no hay cambios; `window.confirm` con resumen "Se guardarán N cambios en el partido X vs Y").
   - Guardar: `onUpdateMatch(applyCorrection(currentMatch, draft, { at: new Date().toISOString(), by: editorName || 'Administrador', reason }))`, luego `setDraft(null)`. Si `onUpdateMatch` devuelve una promesa y falla, mantener el borrador y mostrar el error.
   - Cambiar de fecha o de partido con un borrador abierto pide confirmación y descarta el borrador.
   - En modo corrección, cada evento de la lista tiene "Editar" (carga el evento en `MatchEventForm`) y "Eliminar".
   - En modo corrección, al agregar a la nómina un jugador que HOY figura como sancionado, NO bloquear: mostrar `window.confirm` avisando la sanción (la sanción puede ser posterior al partido). Para el árbitro el bloqueo actual se mantiene igual.
   - No mostrar confetti en modo corrección.
   - Con `draft` activo, el botón "Finalizar y Firmar" no se muestra (el estado sigue `FINISHED`).
6. Trazabilidad visible: si `sheet.corrections?.length`, mostrar bajo el sello de firma "Corregida N vez/veces. Última: <nombre>, <fecha local>: <motivo>" (texto plano, React escapa el contenido).
7. En `src/components/MatchDetailModal.tsx` (detalle público del partido) NO mostrar motivos ni nombres de correcciones.

## Restricciones técnicas
- CERO EMOJIS, sin excepción: ni en interfaz, textos, código, comentarios, logs, consola, commits, docs, tests, datos semilla o nombres de archivo. Iconos solo con `lucide-react` (SVG). Los mensajes de `MatchSheetModal` y `MatchEditModal` que hoy contienen emojis y que toques o muevas al extraer componentes deben quedar sin emojis.
- Repo de un cliente con marca propia: NO aplicar la marca Ualdo. Mantener el estilo visual existente.
- Sigue las convenciones existentes del repo.
- Seguridad: el modo corrección solo se muestra con `isAdmin`; valida motivo y marcador; sin `dangerouslySetInnerHTML`; errores sin datos sensibles. Nota: la política RLS actual de `matches` permite escribir a cualquier autenticado; cambiarla está FUERA de alcance de este brief (no la toques).
- Diseño: SOLID, DRY, KISS, funciones <50 líneas, archivos <800 líneas (`MatchSheetModal.tsx` debe quedar por debajo de 800), sin anidación >4 niveles, inmutabilidad, manejo de errores explícito.
- No cambies la conducta del árbitro en partidos no finalizados.
- No añadas dependencias.
- No toques archivos fuera del alcance indicado. No toques `tasks/`, `watch_tasks.*` ni `.gitignore`.

## Tests
Archivo `src/lib/matchSheet.test.ts`:
- `addEvent`: gol local suma al local; autogol del local suma al visitante; tarjeta no cambia marcador; no muta el original.
- `removeEvent`: resta el gol; nunca baja de 0; id inexistente devuelve el partido igual.
- `replaceEvent`: gol de local cambiado a visitante mueve el punto; gol cambiado a tarjeta resta; tarjeta cambiada de jugador no toca marcador.
- `scoreFromGoals`: con goles normales, penales y autogoles.
- `applyCorrection`: agrega la corrección al historial existente, conserva `status`, `refereeSigned`, `signedAt`; no muta ni original ni draft.
- `validateCorrectionReason` y `validateScore`: límites (4, 5, 300, 301 caracteres; -1, 0, 99, 100, "abc", "2.5").

Cobertura >=80% en `src/lib/matchSheet.ts`. Comandos: `npm test`, `npm run test:coverage`.

Verificación manual (no hay E2E en el repo):
1. Como árbitro: finalizar un partido; comprobar que queda bloqueado y no aparece "Corregir planilla".
2. Como admin: abrir ese partido, "Corregir planilla", cambiar una amarilla de jugador, eliminar una tarjeta, editar un gol al otro equipo, añadir un jugador a la nómina, escribir motivo y guardar. Recargar: los cambios persisten, aparece la línea "Corregida 1 vez", y Estadísticas > Sanciones, la tabla de posiciones y Admin > Multas reflejan los cambios.
3. Como admin: entrar en modo corrección, hacer cambios y "Descartar": nada cambia en la base.

## Verificación final
1. `npm test`
2. `npm run test:coverage`
3. `npm run lint`
4. `npx tsc --noEmit`
5. `npm run build`

## Criterios de aceptación
- [ ] Solo ADMIN ve "Corregir planilla" en partidos finalizados; el árbitro sigue bloqueado.
- [ ] En modo corrección se pueden editar nómina, arqueros, eventos (agregar, editar, eliminar), marcador y observaciones; nada se guarda hasta "Guardar corrección".
- [ ] Guardar exige motivo válido y deja el registro en `match.corrections` con nombre, fecha y motivo; `status`, `refereeSigned` y `signedAt` se conservan.
- [ ] "Descartar" y cambiar de partido con borrador piden confirmación y no escriben en la base.
- [ ] Sanciones, tabla y multas reflejan la corrección tras guardar.
- [ ] `MatchSheetModal.tsx` queda por debajo de 800 líneas.
- [ ] Cobertura >=80% en `src/lib/matchSheet.ts`; todos los tests pasan; build, lint y `tsc` sin errores.
- [ ] Cero emojis en el diff.
