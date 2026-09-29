# Brief 05: Corrección de la planilla arbitral (Brief 03)

## Contexto
Proyecto: Copa Abogados. Stack: Next.js 16.3 (ver `AGENTS.md`), React 19, TypeScript, Tailwind 4, Supabase, Vitest (`npm test`). El Brief 03 (modo corrección de la planilla por el administrador) está construido. Sus 63 tests, el lint y el build pasan, y `MatchSheetModal.tsx` quedó en 769 líneas. La auditoría encontró dos fallos HIGH que este brief corrige. No añade funciones nuevas.

Archivos implicados: `src/components/MatchSheetModal.tsx`, `src/app/page.tsx` (función `handleUpdateMatch`, líneas ~215-262), `src/lib/matchSheet.ts`.

### HIGH 1: si falla el guardado de una corrección, se pierde el borrador
`handleSaveCorrection` (`MatchSheetModal.tsx`, cerca de la línea 250) hace `await onUpdateMatch(finalMatch)` dentro de un `try/catch` y, si no hay excepción, descarta el borrador. Pero `handleUpdateMatch` en `page.tsx` captura el error de `upsertMatch`, muestra un `alert` y termina con `return` normal, sin lanzar ni devolver nada. Resultado: si Supabase falla (red, permisos), la corrección no se guarda y aun así el borrador y el motivo se borran. El administrador pierde todo lo que había corregido. El Brief 03 exigía mantener el borrador en ese caso.

### HIGH 2: las observaciones de un partido aparecen en otro y se pueden guardar en él
El textarea de observaciones muestra `refNotes || sheet.refereeNotes`, y el estado `refNotes` nunca se reinicia. Esto provoca dos problemas:
- **Árbitro** (el fallo ya existía antes del Brief 03): escribe observaciones en el partido A, cambia al partido B sin finalizar A y pulsa "Finalizar y Firmar" en B. `handleFinishMatch` guarda en B las observaciones escritas para A (`refereeNotes: refNotes || currentMatch.refereeNotes`).
- **Administrador**: si edita las observaciones en modo corrección y pulsa "Descartar", o guarda y cambia de partido, el textarea sigue mostrando el texto anterior en un partido bloqueado, como si estuviera guardado.

### LOW (corregir de paso)
- `goalDelta` (`matchSheet.ts`, cerca de la línea 12) compara `(ev.type as string) === 'PENALTY_GOAL'`, un tipo que no existe en `EventType`. Los penales son `type: 'GOAL'` con `goalType: 'PENALTY'`. Quitar esa comparación y el cast.
- `calculateChangeCount` (`MatchSheetModal.tsx`, cerca de la línea 51) usa un contador mutable con `count++`. Reescribirla sumando resultados parciales (por ejemplo, un array de comparaciones con `filter(Boolean).length` más los conteos de diferencias de nómina y eventos) y moverla a `src/lib/matchSheet.ts` como `countSheetChanges(original, draft)`, con tests.

## Objetivo
Si guardar una corrección falla, el borrador y el motivo se conservan. Las observaciones mostradas y guardadas son siempre las del partido seleccionado, tanto para el árbitro como para el administrador.

## Requerimientos
1. `src/app/page.tsx`, `handleUpdateMatch`: que devuelva `Promise<boolean>`. Devuelve `true` si guardó, y `false` si el usuario canceló el intercambio de horario o si `upsertMatch` falló. Mantener los `alert` actuales. En el `alert` de conflicto de horario (línea ~233) quitar el emoji `⚠️` del texto.
2. `src/components/MatchSheetModal.tsx`:
   - Cambiar el tipo de la prop a `onUpdateMatch: (updatedMatch: Match) => void | boolean | Promise<void | boolean>`.
   - En `handleSaveCorrection`: `const saved = await onUpdateMatch(finalMatch);`. Solo si `saved !== false` limpiar `draft`, `correctionReason` y `editingEvent`. Si `saved === false` o hay excepción, mantener el borrador (no mostrar un segundo `alert` si `page.tsx` ya mostró uno cuando devuelve `false`).
3. Observaciones:
   - Con borrador activo, el textarea muestra y edita solo `draft.refereeNotes`; no uses `refNotes`.
   - Sin borrador, `refNotes` debe pertenecer al partido seleccionado. Opción recomendada: guardar el borrador de observaciones del árbitro por partido (`Record<matchId, string>`, actualizado de forma inmutable) y leer `notesDraft[currentMatch.id] ?? currentMatch.refereeNotes ?? ''`.
   - `handleFinishMatch` usa solo las observaciones del partido que se está finalizando.
   - Al descartar o guardar una corrección, y al cambiar de fecha o de partido, el textarea muestra las observaciones guardadas del partido seleccionado.
4. `src/lib/matchSheet.ts`: aplicar los dos LOW (quitar `PENALTY_GOAL` y el cast; añadir `countSheetChanges` pura e inmutable) y usar `countSheetChanges` desde `MatchSheetModal.tsx`.

## Restricciones técnicas
- CERO EMOJIS, sin excepción: ni en interfaz, textos, código, comentarios, logs, consola, commits, docs, tests, datos semilla o nombres de archivo. Iconos solo con `lucide-react` (SVG).
- Repo de un cliente con marca propia: NO aplicar la marca Ualdo. Mantener el estilo visual actual.
- Sigue las convenciones existentes del repo.
- No cambies la conducta del árbitro salvo en lo que corrige el HIGH 2.
- Seguridad: errores sin datos sensibles.
- Diseño: SOLID, DRY, KISS, funciones <50 líneas, archivos <800 líneas, sin anidación >4 niveles, inmutabilidad, manejo de errores explícito.
- No añadas dependencias.
- No toques archivos fuera del alcance indicado. No toques `tasks/`, `watch_tasks.*` ni `.gitignore`.

## Tests
En `src/lib/matchSheet.test.ts` añadir:
- `countSheetChanges`: 0 si no hay cambios; cuenta el cambio de marcador, de arquero, de observaciones, un jugador añadido o quitado de la nómina, un evento añadido, uno quitado y uno editado. No muta sus entradas (usar `Object.freeze`).
- `goalDelta`: un gol de penal (`type: 'GOAL'`, `goalType: 'PENALTY'`) suma al equipo que lo marca.

Cobertura >=80% en `src/lib/matchSheet.ts`. Comandos: `npm test`, `npm run test:coverage`.

Verificación manual:
1. Como admin, abrir un partido finalizado, "Corregir planilla", hacer cambios, escribir el motivo, desactivar la red en DevTools (Network > Offline) y pulsar "Guardar corrección". Aparece el aviso de error y el borrador y el motivo siguen ahí. Reactivar la red y guardar: funciona.
2. Como árbitro, escribir observaciones en el partido A (sin finalizar), cambiar al partido B: el textarea de B no muestra el texto de A. Volver a A: el texto sigue ahí. Finalizar B: B no recibe las observaciones de A.
3. Como admin, en modo corrección editar las observaciones y pulsar "Descartar": el textarea vuelve al texto guardado.

## Verificación final
1. `npm test`
2. `npm run test:coverage`
3. `npm run lint`
4. `npx tsc --noEmit`
5. `npm run build`

## Criterios de aceptación
- [ ] `handleUpdateMatch` devuelve `true` o `false`; si falla el guardado de una corrección, el borrador y el motivo se conservan.
- [ ] Las observaciones nunca pasan de un partido a otro, ni al mostrarlas ni al finalizar.
- [ ] Tras descartar o guardar una corrección, el textarea muestra las observaciones guardadas.
- [ ] `goalDelta` ya no usa `PENALTY_GOAL` ni el cast; `countSheetChanges` es pura, está en `matchSheet.ts` y tiene tests.
- [ ] Todos los tests pasan; cobertura >=80%; build, lint y `tsc` sin errores.
- [ ] Cero emojis en el diff (incluido el `⚠️` retirado de `page.tsx`).
