# Brief 21: Código (PIN) por equipo para habilitar refuerzos y correcciones de la auditoría del Brief 20

## Contexto
Proyecto: Copa Abogados (marca del cliente, NO Ualdo). Stack: Next.js 16.3, React 19, TypeScript, Supabase (tablas JSONB `{ id, data }` con RLS), Vitest. Antes de tocar código de Next lee la guía que corresponda en `node_modules/next/dist/docs/` (ver `AGENTS.md`).

El Brief 20 (sin commitear) permite que delegados sin sesión habiliten refuerzos de +40/+50 desde Inscripción > "Habilitar refuerzo +40":
- función SQL `public.register_reinforcement(p_cedula text, p_team_id text, p_dorsal int, p_position text)` en `supabase/migracion-refuerzos.sql`, copiada al final de `supabase/schema.sql`;
- cliente `registerReinforcement` en `src/lib/store.ts` (líneas ~143-171);
- lógica en `src/lib/reinforcement.ts`;
- formulario `src/components/ReinforcementForm.tsx`;
- pestañas en `src/components/RegistrationHub.tsx`;
- interruptor "Refuerzos +40/+50" en `src/components/AdminModal.tsx` (pestaña `settings`, línea ~1110).

La auditoría encontró dos riesgos MEDIUM que el cliente decide cerrar con un **código (PIN) por equipo**:
1. **Sabotaje:** cualquiera que conozca la cédula de un jugador de +40 puede registrarlo como refuerzo de un equipo ajeno. Ese registro PENDING bloquea la habilitación real (`ALREADY_IN_CATEGORY`) y ocupa dorsal y cupo hasta que el Admin lo rechace.
2. **Enumeración:** probando cédulas sin límite de intentos se obtiene el nombre asociado a una cédula, cuando la Fase 3 ocultó la cédula del público (vista `players_public`).

Y cuatro LOW:
3. **Carrera:** dos llamadas simultáneas con la misma cédula a equipos distintos de la misma categoría pueden pasar las dos, porque el bloqueo es solo del equipo destino.
4. **Rechazados en el dorsal:** la función cuenta jugadores REJECTED al comprobar el dorsal, y el cliente no (`reinforcement.ts` líneas ~66-68).
5. **Dorsal no numérico:** `(p.data->>'dorsal')::int` (`migracion-refuerzos.sql` línea ~166) falla si algún dorsal guardado no es numérico.
6. **Búsqueda sin índice:** `normalize_cedula(data->>'cedula')` se aplica a todas las filas de `players` en cada llamada.

Además:
7. LOW: el carnet que se muestra al terminar sale con la cédula "---", porque la función no la devuelve (`ReinforcementForm.tsx` línea ~132).

Datos del sistema que importan:
- La tabla `teams` es de **lectura pública** (`teams_read using (true)`, `schema.sql` línea ~77), así que el PIN **no puede guardarse en `teams.data`**.
- Ya existe `public.is_admin()` (`schema.sql` líneas ~226-241), que comprueba si el usuario autenticado es ADMIN.
- Supabase trae la extensión `pgcrypto` en el esquema `extensions` (funciones `extensions.crypt`, `extensions.gen_salt` y `extensions.gen_random_bytes`).

## Objetivo
Para habilitar un refuerzo, el delegado debe escribir el código de 6 dígitos de su equipo. El Admin genera o regenera ese código desde el panel y lo ve una sola vez para entregarlo. Los códigos se guardan cifrados (hash bcrypt) en una tabla sin acceso público. Tras 5 intentos fallidos el equipo queda bloqueado 15 minutos. El código se comprueba antes de buscar ninguna cédula, así que sin código válido no se puede ni sabotear ni averiguar nada. Quedan corregidos los puntos LOW.

## Decisiones de negocio (aplicarlas tal cual)
- **Código:** 6 dígitos numéricos, generado en el servidor con `gen_random_bytes`, uno por equipo. Solo se pide en "Habilitar refuerzo"; la inscripción normal de jugadores no cambia.
- **Visibilidad:** el Admin ve el código **solo en el momento de generarlo**. Después solo ve si el equipo tiene código y desde cuándo. Si se pierde, se regenera, y al regenerarlo deja de valer el anterior.
- **Bloqueo:** 5 intentos fallidos seguidos bloquean el equipo 15 minutos. Un acierto pone el contador a 0, y regenerar el código también lo reinicia y quita el bloqueo.
- **Equipo sin código:** devuelve `NO_PIN` y el mensaje "Tu equipo aún no tiene código de habilitación. Solicítalo a la organización."
- **Dónde se generan códigos:** solo los equipos de las categorías destino de refuerzos (Abierta y +40) necesitan código. El panel los lista todos, ordenados por categoría y nombre.

## Requerimientos
1. **Migración SQL** nueva `supabase/migracion-pin-refuerzos.sql`, idempotente y con la cabecera habitual ("Ejecútalo UNA vez en Supabase..."). Copia su contenido al final de `supabase/schema.sql` y deja sincronizada también `supabase/migracion-refuerzos.sql`: la versión final de `register_reinforcement` debe ser la misma en los tres archivos.
   - `create extension if not exists pgcrypto with schema extensions;`
   - Tabla `public.team_pins`:
     - `team_id text primary key references public.teams(id) on delete cascade`;
     - `pin_hash text not null`;
     - `failed_attempts int not null default 0`;
     - `locked_until timestamptz`;
     - `updated_at timestamptz not null default now()`.

     `alter table ... enable row level security;` y **ninguna política**, para que ni anon ni authenticated la lean ni la escriban directamente. Solo la usan las funciones `security definer`.
   - Función `public.admin_set_team_pin(p_team_id text) returns text`, `security definer`, `set search_path = public`:
     - si `not public.is_admin()`, `raise exception 'forbidden'`;
     - si el equipo no existe, `raise exception 'not_found'`;
     - genera 6 dígitos con `extensions.gen_random_bytes` (por ejemplo, a partir de 4 bytes convertidos a entero, módulo 1000000, rellenado con `lpad`);
     - hace upsert en `team_pins` con `pin_hash = extensions.crypt(pin, extensions.gen_salt('bf'))`, `failed_attempts = 0`, `locked_until = null` y `updated_at = now()`;
     - devuelve el código en claro.

     `grant execute` solo a `authenticated`.
   - Función `public.admin_list_team_pins() returns table(team_id text, updated_at timestamptz, locked boolean)`, `security definer`. Si `not is_admin()`, `raise exception 'forbidden'`. Nunca devuelve el hash. `grant execute` solo a `authenticated`.
   - **Reemplazar `register_reinforcement`:**
     - primero `drop function if exists public.register_reinforcement(text, text, int, text);` (si no, la versión vieja sin PIN seguiría disponible);
     - después crear `public.register_reinforcement(p_pin text, p_cedula text, p_team_id text, p_dorsal int, p_position text default null) returns jsonb`, `security definer`, `set search_path = public`.

     Orden de los pasos:
     1. Validar entradas como hoy, más el PIN: `p_pin ~ '^\d{6}$'`. Si no cumple: `INVALID`.
     2. Bloquear el equipo destino (`for update`) y comprobar que su categoría es destino válido (como hoy).
     3. Comprobar los ajustes (`CLOSED`), como hoy.
     4. **Comprobar el código antes de tocar ninguna cédula:**
        - leer `team_pins` con `for update`;
        - si no hay fila: `NO_PIN`;
        - si `locked_until > now()`: `LOCKED`;
        - si `extensions.crypt(p_pin, pin_hash) <> pin_hash`: sumar 1 a `failed_attempts`; si llega a 5, poner `locked_until = now() + interval '15 minutes'` y `failed_attempts = 0`; devolver `BAD_PIN`;
        - si acierta: `failed_attempts = 0` y `locked_until = null`.

        Importante: estas actualizaciones deben quedar guardadas aunque la función devuelva un estado de error. No uses `raise` en esos casos, sino `return`.
     5. `perform pg_advisory_xact_lock(hashtext('refuerzo:' || v_norm_cedula));` antes de buscar la cédula (corrige la carrera, punto 3).
     6. Pasos de origen, `ALREADY_IN_CATEGORY`, cupo y dorsal como hoy, con estos cambios:
        - **dorsal:** excluir jugadores `REJECTED` y comparar solo dorsales numéricos: `p.data->>'dorsal' ~ '^\d+$' and (p.data->>'dorsal')::int = p_dorsal`;
        - **cupo:** se sigue contando como en el resto de la app (todos los registros del equipo), sin cambios.
     7. Insertar y devolver como hoy, sin cédula.
   - `grant execute` de la nueva `register_reinforcement` a `anon, authenticated`; `revoke all ... from public` en todas las funciones nuevas.
   - **Índice** (punto 6): `create index if not exists players_norm_cedula_idx on public.players ((public.normalize_cedula(data->>'cedula')));`. `normalize_cedula` ya es `immutable`, así que vale para un índice de expresión.
2. **Cliente** (`src/lib/store.ts`):
   - `registerReinforcement` recibe también `pin: string` y lo pasa como `p_pin`.
   - Nuevas funciones `adminSetTeamPin(teamId: string): Promise<string>` y `adminListTeamPins(): Promise<{ teamId: string; updatedAt: string; locked: boolean }[]>`, con errores genéricos y sin detalles internos.
3. **Lógica** (`src/lib/reinforcement.ts`):
   - Añadir a `ReinforcementStatus` los estados `'NO_PIN' | 'BAD_PIN' | 'LOCKED'`, con sus mensajes:
     - `BAD_PIN`: "El código del equipo no es correcto.";
     - `LOCKED`: "Demasiados intentos fallidos. Espera 15 minutos o solicita un nuevo código a la organización.";
     - `NO_PIN`: el texto de las decisiones de negocio.
   - `validateReinforcementInput` valida también el PIN (6 dígitos; si no, `INVALID`).
   - En la comprobación de dorsal ya excluye `REJECTED`, como la base.
4. **Formulario** (`src/components/ReinforcementForm.tsx`):
   - Campo "Código del equipo": `type="password"`, `inputMode="numeric"`, `maxLength={6}`, `autoComplete="off"`. Ayuda: "Lo entrega la organización al delegado del equipo."
   - Al terminar con éxito, mostrar el carnet con la cédula que escribió el delegado: `{ ...player, cedula: normalizeCedula(cedula), photo }` (punto 7). La cédula de otros jugadores sigue sin mostrarse nunca.
   - Vaciar el campo del código después de cada envío, sea cual sea el resultado.
   - Mantener el componente por debajo de 300 líneas. Si se pasa, extrae el bloque del carnet de éxito a un componente pequeño.
5. **Panel Admin:** componente nuevo `src/components/AdminTeamPins.tsx` (menos de 250 líneas), renderizado en la pestaña `settings` de `AdminModal.tsx`, bajo el interruptor de refuerzos. En `AdminModal.tsx` solo se añade la línea que lo renderiza y lo que haga falta pasarle (`teams`).
   - Carga `adminListTeamPins()` al montarse y muestra los equipos de Abierta y +40, ordenados por categoría y nombre, con su estado: "Sin código", "Código desde <fecha>" o "Bloqueado".
   - Botón "Generar código" o "Regenerar código". Si ya hay código, pide confirmación: "Se invalidará el código actual de <equipo>. ¿Continuar?".
   - Tras generarlo, muestra el código en grande junto al equipo, con el texto "Entrégalo al delegado. No se volverá a mostrar.". Botón "Copiar" (`navigator.clipboard.writeText`, con manejo de error). El código se borra de la memoria del componente al cerrar ese aviso o al cambiar de pestaña.
   - Errores en un aviso simple, sin detalles internos.
6. **Pruebas SQL:** actualiza `docs/consultas/prueba-refuerzos.sql`, dentro de la misma transacción con `rollback`, para cubrir estos casos:
   - `NO_PIN` (equipo sin código);
   - `BAD_PIN` cinco veces y `LOCKED` desde el sexto intento (comportamiento documentado en el Brief 22);
   - que tras el bloqueo un código correcto también da `LOCKED`;
   - acierto (`OK`) que pone el contador a 0;
   - la llamada vieja de 4 parámetros ya no existe (debe dar error de "function does not exist"; documéntalo como comentario, porque rompería la transacción si se ejecuta);
   - `admin_set_team_pin` sin ser admin da `forbidden` (documéntalo igual, como comentario, si no se puede simular el rol en el editor);
   - el resto de casos del Brief 20 siguen dando lo mismo.

   Para insertar códigos de prueba usa directamente `extensions.crypt('123456', extensions.gen_salt('bf'))` en `team_pins`.

## Restricciones técnicas
- CERO EMOJIS, sin excepción: ni en interfaz, textos, código, comentarios, logs, consola, commits, docs, tests, datos semilla o nombres de archivo. Iconos solo en SVG (`lucide-react`).
- Marca: NO aplicar la marca Ualdo. Mantén los estilos actuales.
- **Seguridad:**
  - el PIN nunca se guarda en claro ni en `teams.data`, nunca se escribe en logs y nunca se devuelve salvo en `admin_set_team_pin`;
  - `team_pins` sin políticas RLS (acceso solo vía funciones);
  - todas las funciones `security definer` con `set search_path = public` y nombres calificados (`public.`, `extensions.`);
  - sin SQL dinámico;
  - las funciones de Admin comprueban `is_admin()` en el servidor (no basta con ocultar el botón);
  - errores sin datos internos.
- No cambies la inscripción normal (`RegistrationView.tsx`) ni las políticas RLS existentes.
- `AdminModal.tsx` (más de 1.250 líneas): añade como máximo ~10 líneas.
- Funciones <50 líneas; archivos nuevos <300 líneas; sin anidación >4 niveles; inmutabilidad.
- No añadas dependencias. No toques `tasks/`, `watch_tasks.*`, `.gitignore` ni archivos fuera del alcance.

## Tests
- `src/lib/reinforcement.test.ts`:
  - PIN válido e inválido (`'12345'`, `'1234567'`, `'abcdef'`, vacío);
  - mensajes de `NO_PIN`, `BAD_PIN` y `LOCKED`;
  - un dorsal ocupado por un jugador `REJECTED` ya no da `DORSAL_TAKEN`.
- Si extraes lógica pura del panel de códigos (por ejemplo, el orden y el filtrado de equipos o el texto de estado), ponla en `src/lib/teamPins.ts` con su test, y añádela a `coverage.include`.
- Cobertura >= 80% de `reinforcement.ts` (y de `teamPins.ts` si existe).

## Verificación final (PowerShell, en `C:\laragon\www\Copa Abogados`)
1. `npm test` (solo puede fallar el test de equidad conocido del Brief 13)
2. `npm run lint`
3. `npm run build`
4. En Supabase (lo hace el usuario):
   - ejecutar `supabase/migracion-refuerzos.sql` (si no se ejecutó aún) y luego `supabase/migracion-pin-refuerzos.sql`;
   - ejecutar `docs/consultas/prueba-refuerzos.sql`: todos los casos dan el código esperado y el `rollback` no deja datos;
   - comprobar con `select * from public.team_pins;` desde el cliente anónimo (o con la API REST y la clave anon) que no devuelve filas ni permite insertar.
5. Prueba manual con `npm run dev`:
   - Como Admin: en Ajustes, generar el código de un equipo de Abierta. Se ve una sola vez; al recargar solo aparece "Código desde ...".
   - Sin sesión: habilitar un refuerzo con el código correcto funciona y el carnet muestra la cédula. Con un código incorrecto sale "El código del equipo no es correcto."; a los 5 fallos, el aviso de bloqueo.
   - Regenerar el código como Admin: el anterior deja de funcionar y el bloqueo se levanta.

## Criterios de aceptación
- [ ] Habilitar un refuerzo exige el código de 6 dígitos del equipo destino; sin código válido no se busca ninguna cédula.
- [ ] Los códigos se guardan cifrados en `team_pins`, que no es accesible ni para anónimos ni para autenticados fuera de las funciones.
- [ ] El Admin genera o regenera códigos y los ve una sola vez; las funciones de Admin rechazan a quien no es Admin en el servidor.
- [ ] 5 fallos seguidos bloquean el equipo 15 minutos; un acierto o una regeneración reinician el contador.
- [ ] La versión vieja de `register_reinforcement` (4 parámetros) ya no existe.
- [ ] Corregidos: carrera por cédula (bloqueo por cédula), dorsal sin `REJECTED` en ambos lados, dorsal no numérico, índice por cédula normalizada y carnet con cédula.
- [ ] Tests en verde, cobertura >= 80%; lint y build sin errores; cero emojis.
