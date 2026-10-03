# Brief 24: Corrección del Brief 23 (permiso de normalize_cedula, textos del panel y resultados de la prueba)

## Contexto
Proyecto: Copa Abogados (marca del cliente, NO Ualdo). Stack: Next.js 16.3 estático, Supabase (PostgREST), Vitest. Antes de tocar código de Next lee la guía que corresponda en `node_modules/next/dist/docs/` (ver `AGENTS.md`).

Los Briefs 20 a 23 están construidos y sin commitear. La auditoría del Brief 23 encontró:

1. **HIGH, la inscripción y las ediciones de jugadores pueden fallar.** El Brief 23 pidió quitar el permiso de ejecución de `public.normalize_cedula(text)` a `anon` y `authenticated`. Así quedó en `supabase/migracion-refuerzos.sql` (línea ~19) y en `supabase/schema.sql` (línea ~324). Pero sobre esa función hay un índice de expresión, `players_norm_cedula_idx`. Al INSERTAR o ACTUALIZAR en `players`, PostgreSQL evalúa la expresión del índice comprobando el permiso EXECUTE del rol que escribe. Afecta a dos vías:
   - la inscripción pública, que inserta como `anon` (política `players_public_insert`);
   - las ediciones del Admin, que escriben como `authenticated` (política `players_write`).

   Las dos pueden fallar con `permission denied for function normalize_cedula`. La premisa del Brief 23 ("los índices no necesitan permiso de ejecución") solo vale para crear el índice, no para escribir en la tabla.
2. **MEDIUM, textos del panel.** `ipSourceStatus` (`src/lib/teamPins.ts` líneas ~85-101) no usa los textos pedidos, y el de `forwarded` no menciona el tope de 30 fallos por hora.
3. **LOW, error confundido con falta de cabecera.** `adminClientIpSource` (`src/lib/store.ts` líneas ~192-194) convierte cualquier error en `'desconocida'`.
4. **LOW, orden de ejecución sin documentar.** `migracion-pin-refuerzos.sql` y `migracion-pin-por-conexion.sql` usan `normalize_cedula` y `max_players_for_category` sin definirlas, así que dependen de que antes se ejecute `migracion-refuerzos.sql`. No lo indican.
5. **LOW, resultados de la prueba no visibles.** `docs/consultas/prueba-refuerzos.sql` termina en `rollback`. El SQL Editor de Supabase muestra solo el resultado de la última sentencia, así que la tabla de resultados puede no verse.

## Objetivo
La inscripción pública y las ediciones del Admin funcionan con el índice por cédula. El panel muestra exactamente los textos acordados. Un error de diagnóstico se ve como "no verificada". Las migraciones avisan de su orden. El script de prueba muestra su resultado en el editor de Supabase y siempre revierte todo.

## Requerimientos
1. **Permiso de `normalize_cedula`**, en las **cuatro** copias SQL (`schema.sql`, `migracion-refuerzos.sql`, `migracion-pin-refuerzos.sql`, `migracion-pin-por-conexion.sql`; en las dos últimas solo si contienen la definición o los permisos de la función):
   - Mantener `revoke all on function public.normalize_cedula(text) from public;`.
   - Añadir `grant execute on function public.normalize_cedula(text) to anon, authenticated;`.
   - Comentario: "Necesario: el índice players_norm_cedula_idx evalúa esta función al insertar o actualizar jugadores con el rol de quien escribe. Es pura y no expone datos.".
   - `max_players_for_category` sigue sin permisos para anon y authenticated (solo la usa `register_reinforcement`).
   - Las cuatro copias deben seguir con el bloque idéntico.
2. **Textos exactos** en `ipSourceStatus` (`src/lib/teamPins.ts`):
   - `cloudflare`: "Protección por conexión: activa (IP real detectada).", tono verde;
   - `forwarded`: "Protección por conexión: limitada (no llega la IP real de Cloudflare). Solo rige el tope de 30 fallos por hora del equipo.", tono ámbar;
   - `desconocida`, nulo o error: "Protección por conexión: no verificada.", tono gris.

   Ajusta `src/lib/teamPins.test.ts` para que compruebe esos textos literales.
3. **Errores del diagnóstico:**
   - `adminClientIpSource` (`src/lib/store.ts`) lanza `new Error('No se pudo verificar la protección por conexión.')` si falla la llamada, en vez de devolver `'desconocida'`.
   - `AdminTeamPins.tsx` captura el error y muestra el estado "no verificada" con `ipSourceStatus(null)`.
4. **Orden de ejecución:** en la cabecera de `migracion-pin-refuerzos.sql` y de `migracion-pin-por-conexion.sql`, añade la línea "Requiere haber ejecutado antes supabase/migracion-refuerzos.sql.".
5. **Resultados visibles en la prueba** (`docs/consultas/prueba-refuerzos.sql`):
   - Quitar `begin;` y el `rollback;` final.
   - Como última sentencia, poner un bloque `do $$ ... $$` que haga `raise exception` con un resumen:
     - si todas pasan: `'FIN DE LA PRUEBA (todo se revierte): N de N casos pasan.'`;
     - si alguna falla: `'FIN DE LA PRUEBA (todo se revierte): fallan los casos: ' || <lista de casos con esperado y obtenido>`.
   - Al terminar con error, el editor revierte todo el script, porque se ejecuta como una sola transacción, y muestra el mensaje.
   - Explica en la cabecera:
     - que el script siempre termina con un "error" a propósito, para revertir los datos de prueba y mostrar el resultado;
     - que el mensaje esperado es "N de N casos pasan".
   - Si el SQL Editor no ejecuta el script como una sola transacción, la alternativa es envolverlo en un único `do $$ begin ... end $$` con tablas temporales. Elige la opción que garantice que nunca quedan datos guardados y explícala en la cabecera.
   - Las tablas temporales del script siguen siendo `on commit drop` o se crean dentro del mismo bloque.

## Restricciones técnicas
- CERO EMOJIS, sin excepción: ni en interfaz, textos, código, comentarios, logs, consola, commits, docs, tests, datos semilla o nombres de archivo.
- Marca: NO aplicar la marca Ualdo.
- Seguridad: no conceder permisos a anon/authenticated en ninguna otra función auxiliar; no mostrar IPs; errores genéricos.
- No cambies la lógica de `register_reinforcement`, las funciones de Admin ni las políticas RLS.
- No añadas dependencias. No toques `tasks/`, `watch_tasks.*`, `.gitignore` ni archivos fuera del alcance.

## Tests
- `src/lib/teamPins.test.ts`: textos literales y tonos de los tres estados, más el caso `null`.
- Cobertura >= 80% de `teamPins.ts`.

## Verificación final (PowerShell, en `C:\laragon\www\Copa Abogados`)
1. `npm test` (solo puede fallar el test de equidad conocido del Brief 13)
2. `npm run lint`
3. `npm run build`
4. En Supabase (lo hace el usuario):
   - ejecutar `migracion-refuerzos.sql`, `migracion-pin-refuerzos.sql` y `migracion-pin-por-conexion.sql`;
   - luego `prueba-refuerzos.sql`: el mensaje final debe decir "N de N casos pasan";
   - comprobar que no quedan datos de prueba: `select count(*) from public.teams where id like 't-test-%';` debe dar 0.
5. Con la app desplegada:
   - sin sesión, completar una inscripción pública normal: debe guardarse sin error;
   - como Admin, editar un jugador y guardar: sin error.

   Esta prueba valida el arreglo HIGH.

## Criterios de aceptación
- [ ] `normalize_cedula` tiene permiso de ejecución para anon y authenticated en las cuatro copias, con el comentario explicativo.
- [ ] La inscripción pública y la edición de jugadores funcionan tras ejecutar las migraciones.
- [ ] El panel muestra los tres textos exactos; un error se ve como "no verificada".
- [ ] Las migraciones del PIN indican que requieren `migracion-refuerzos.sql` antes.
- [ ] El script de prueba muestra "N de N casos pasan" y no deja datos.
- [ ] Tests en verde, cobertura >= 80%; lint y build sin errores; cero emojis.
