# Brief 23: Corrección del script de prueba de refuerzos y detección de la IP real

## Contexto
Proyecto: Copa Abogados (marca del cliente, NO Ualdo). Stack: Next.js 16.3 estático, Supabase (PostgREST detrás de Cloudflare), Vitest. Antes de tocar código de Next lee la guía que corresponda en `node_modules/next/dist/docs/` (ver `AGENTS.md`).

El Brief 22 (sin commitear) está aprobado con observaciones. La auditoría del 2026-10-03 encontró:

1. **MEDIUM, script de prueba con dos resultados falsos.** `docs/consultas/prueba-refuerzos.sql`:
   - El caso 4 (línea ~223) habilita la cédula `0911111111` en `t-test-lock`, que es de Abierta Varones, y la deja PENDING.
   - Después, el caso 6 (línea ~239, mismo equipo) y el caso 7.1 (línea ~247, `t-test-abierta`, también Abierta) usan la misma cédula y devuelven `ALREADY_IN_CATEGORY` en vez de `OK`.
2. **MEDIUM, IP real sin verificar.** `request_client_hash` (`supabase/migracion-pin-por-conexion.sql` líneas ~67-71) usa `cf-connecting-ip` y, si no llega, el primer valor de `x-forwarded-for`, que el cliente puede falsificar. No se sabe si en producción PostgREST recibe `cf-connecting-ip`. Si no lo recibe, el bloqueo por conexión se puede eludir. Además, `coalesce` no salta una cabecera vacía (`''`).
3. **LOW, permisos de más.** `revoke all ... from public` no quita los permisos que Supabase concede por defecto a `anon` y `authenticated` sobre funciones nuevas de `public`. Por eso anon puede llamar a `request_client_hash` (impacto casi nulo, pero no debería).
4. **LOW, índice para la limpieza.** La limpieza `delete ... where failed_at < now() - interval '24 hours'` no tiene índice que empiece por `failed_at`.
5. **LOW, documentación.** El bloqueo por conexión es de ventana deslizante: cuando el fallo más antiguo de los 5 cumple 15 minutos, la conexión recupera un intento (unos 20 intentos por hora como máximo). Se acepta así y se documenta.

Recuerda: las cuatro copias SQL (`supabase/schema.sql`, `migracion-refuerzos.sql`, `migracion-pin-refuerzos.sql`, `migracion-pin-por-conexion.sql`) deben seguir con el bloque de refuerzos **idéntico**.

## Objetivo
`prueba-refuerzos.sql` da `pasa = true` en todas las filas. El Admin ve en el panel de códigos si la protección por conexión funciona en producción, es decir, si llega la IP real de Cloudflare. Quedan corregidos los permisos, el índice y la documentación.

## Requerimientos
1. **Script de prueba** (`docs/consultas/prueba-refuerzos.sql`):
   - Crear dos jugadores de origen más, aprobados en `t-test-plus40`, con cédulas ficticias `0955555555` y `0966666666`.
   - El caso 6 usa `0955555555` y el caso 7.1 usa `0966666666`, con dorsales libres en sus equipos.
   - Revisar la secuencia completa de principio a fin y comprobar, caso por caso, que el estado acumulado (inscripciones PENDING, fallos registrados, cédulas usadas) no altera los casos siguientes. Deja un comentario breve en cada caso que dependa de otro anterior.
   - Mantener una sola llamada por caso y `begin` ... `rollback`.
2. **Cabeceras** en `request_client_hash`: usar `nullif(btrim(v_headers->>'cf-connecting-ip'), '')` y `nullif(btrim(split_part(v_headers->>'x-forwarded-for', ',', 1)), '')` dentro del `coalesce`, para que una cabecera vacía pase a la siguiente.
3. **Diagnóstico de IP para el Admin:**
   - Nueva función `public.admin_client_ip_source() returns text`, `security definer`, `set search_path = public`. Si `not public.is_admin()`, `raise exception 'forbidden'`. Lee las cabeceras igual que `request_client_hash` y devuelve **solo el origen**, nunca la IP: `'cloudflare'` si llega `cf-connecting-ip` no vacío, `'forwarded'` si solo llega `x-forwarded-for` y `'desconocida'` si no llega ninguna. Permiso de ejecución solo para `authenticated`.
   - `src/lib/store.ts`: `adminClientIpSource(): Promise<'cloudflare' | 'forwarded' | 'desconocida'>`, con error genérico.
   - `src/components/AdminTeamPins.tsx`: al cargar, una línea de estado:
     - `cloudflare`: "Protección por conexión: activa (IP real detectada)." en verde;
     - `forwarded`: "Protección por conexión: limitada (no llega la IP real de Cloudflare). Solo rige el tope de 30 fallos por hora del equipo." en ámbar;
     - `desconocida` o error: "Protección por conexión: no verificada." en gris.

     Pon la decisión del texto y el color en una función pura de `src/lib/teamPins.ts` (por ejemplo `ipSourceStatus(source)`) y testéala.
4. **Permisos:** en las funciones que no deben estar disponibles para anon o authenticated, usar `revoke all on function ... from public, anon, authenticated;` y luego conceder solo lo necesario:
   - `request_client_hash` y `check_team_pin` (si existe): ninguno;
   - `normalize_cedula` y `max_players_for_category`: ninguno, si solo las usan otras funciones `security definer`. Comprueba que el índice de expresión sobre `normalize_cedula` sigue funcionando: los índices no necesitan permiso de ejecución del usuario;
   - `register_reinforcement`: `anon, authenticated`;
   - funciones de Admin: `authenticated`.
5. **Índice:** `create index if not exists team_pin_failures_failed_at_idx on public.team_pin_failures (failed_at);`.
6. **Documentación:** comentario en SQL, junto al bloqueo por conexión, que explique la ventana deslizante de 15 minutos (unos 20 intentos por hora por conexión como máximo). Lo mismo en una línea del encabezado del script de prueba.
7. Aplicar los cambios 2, 3, 4 y 5 en las **cuatro** copias SQL y dejarlas idénticas.

## Restricciones técnicas
- CERO EMOJIS, sin excepción: ni en interfaz, textos, código, comentarios, logs, consola, commits, docs, tests, datos semilla o nombres de archivo.
- Marca: NO aplicar la marca Ualdo.
- **Seguridad:** `admin_client_ip_source` nunca devuelve la IP, solo el origen. Comprueba `is_admin()` en el servidor. Ninguna IP en logs ni en la interfaz. `set search_path = public` y nombres calificados. Sin SQL dinámico.
- No cambies la lógica de `register_reinforcement` más allá de lo indicado, ni las políticas RLS existentes.
- Archivos nuevos o modificados: funciones <50 líneas; `AdminTeamPins.tsx` por debajo de 300 líneas.
- No añadas dependencias. No toques `tasks/`, `watch_tasks.*`, `.gitignore` ni archivos fuera del alcance.

## Tests
- `src/lib/teamPins.test.ts`: `ipSourceStatus` para `cloudflare`, `forwarded` y `desconocida` (texto y tono).
- Cobertura >= 80% de `teamPins.ts`.

## Verificación final (PowerShell, en `C:\laragon\www\Copa Abogados`)
1. `npm test` (solo puede fallar el test de equidad conocido del Brief 13)
2. `npm run lint`
3. `npm run build`
4. En Supabase (lo hace el usuario), en orden: `migracion-refuerzos.sql`, `migracion-pin-refuerzos.sql`, `migracion-pin-por-conexion.sql` y `docs/consultas/prueba-refuerzos.sql`. Todas las filas deben dar `pasa = true`.
5. Con la app desplegada y sesión de Admin: en Ajustes > códigos de equipo, la línea de protección por conexión debe decir "activa (IP real detectada)". Si dice "limitada", avisar antes de repartir códigos.

## Criterios de aceptación
- [ ] `prueba-refuerzos.sql` da `pasa = true` en todas las filas, con una sola llamada por caso.
- [ ] Las cabeceras vacías pasan a la siguiente opción.
- [ ] El Admin ve si la protección por conexión está activa en producción, sin que se muestre ninguna IP.
- [ ] `request_client_hash` y las funciones auxiliares no se pueden llamar como anon ni como authenticated.
- [ ] Índice por `failed_at` creado; ventana deslizante documentada.
- [ ] Las cuatro copias SQL son idénticas.
- [ ] Tests en verde, cobertura >= 80%; lint y build sin errores; cero emojis.
