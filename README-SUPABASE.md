# Configuración de Supabase + Despliegue en Netlify

La app guarda todos los datos (equipos, jugadores, partidos, sanciones) en
**Supabase** (base de datos Postgres en la nube). Así los datos son
**compartidos**: lo que carga el árbitro lo ve el público en cualquier dispositivo.

La sesión de inicio de sesión (quién está logueado) sigue siendo local por
dispositivo — eso es correcto.

---

## 1. Crear el proyecto en Supabase (gratis)

1. Entra a <https://supabase.com> y crea una cuenta (puedes usar GitHub/Google).
2. **New project** → nombre `copa-abogados`, elige una contraseña de base de
   datos (guárdala) y la región más cercana (ej. *East US*).
3. Espera ~1 minuto a que se aprovisione.

## 2. Crear las tablas

1. En el proyecto: menú lateral → **SQL Editor** → **New query**.
2. Abre el archivo [`supabase/schema.sql`](supabase/schema.sql) de este repo,
   copia **todo** su contenido, pégalo y presiona **Run**.
3. Deberías ver "Success". Esto crea las tablas `teams`, `players`, `matches`,
   `users` y sus políticas de acceso (**lectura pública, escritura solo para
   usuarios autenticados**).

## 2b. Crear las cuentas de acceso (autenticación)

La app usa **Supabase Auth** (email + contraseña). Solo quien inicie sesión
puede editar; el público solo lee.

1. Menú lateral → **Authentication** → **Users** → **Add user** →
   **Create new user**. Crea las **4 cuentas**, cada una con su contraseña y
   marcando **Auto Confirm User** (para que no pidan verificación por email):

   | Email | Rol | Contraseña |
   |-------|-----|-----------|
   | `cb@copa.com` | Admin (Carlos Bucheli) | la que definiste |
   | `admin@copa.com` | Admin | la que definiste |
   | `arbitro1@copa.com` | Árbitro | la que definiste |
   | `arbitro2@copa.com` | Árbitro | la que definiste |

   > Las contraseñas viven **solo** en Supabase Auth. El código y el SQL nunca
   > las contienen. Usa contraseñas de al menos 6 caracteres.

2. Menú lateral → **SQL Editor** → pega y ejecuta
   [`supabase/seed.sql`](supabase/seed.sql). Esto **borra jugadores y
   calendario**, deja los 28 equipos y registra el **rol** (ADMIN / ÁRBITRO) de
   cada uno de esos 4 emails.

   > Si cambias algún email, edita `seed.sql` para que coincida con el de
   > Authentication.

## 3. Obtener las credenciales

1. Menú lateral → **Project Settings** (el engranaje) → **API**.
2. Copia:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 4. Configurar en local

Edita el archivo `.env.local` (ya existe en la raíz) y pega tus valores:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Luego arranca:

```bash
npm run dev
```

**Primer uso (ya en producción):** tras correr `seed.sql`, la base tiene los 28
equipos y las 4 cuentas, **sin jugadores ni calendario**. Flujo:

1. Inicia sesión (p. ej. `cb@copa.com`).
2. Registra los jugadores (pestaña **Inscripción**, o Admin → Jugadores) y
   apruébalos en **Admin → Jugadores**.
3. Cuando los equipos estén listos, genera el calendario en vivo desde
   **Admin → Configuración → Generar Calendario**.

## 5. Desplegar en Netlify

1. Sube el proyecto a un repositorio de GitHub.
2. En <https://app.netlify.com> → **Add new site** → **Import an existing
   project** → elige tu repo.
3. Netlify detecta la configuración de [`netlify.toml`](netlify.toml)
   (build `npm run build`, publish `out`).
4. **Importante:** antes de desplegar, ve a **Site settings → Environment
   variables** y agrega las dos variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. **Deploy**. Listo: tu torneo queda online con datos compartidos.

---

## Respaldo de datos

En la app: **Admin → Configuración → Respaldo de Datos**.

- **Descargar Respaldo**: baja un `.json` con todo el torneo.
- **Restaurar Respaldo**: reemplaza los datos actuales por los del archivo.

Hazlo periódicamente durante el campeonato.

---

## 🔒 Seguridad (implementada)

- **Lectura pública**: cualquiera puede ver posiciones, goleadores, fixture, etc.
- **Escritura protegida**: crear/editar equipos, jugadores y partidos requiere
  iniciar sesión (Supabase Auth). Las políticas RLS de `schema.sql` bloquean
  toda escritura anónima. (Excepción intencional: la inscripción pública puede
  crear jugadores en estado *Pendiente*.)
- **Datos sensibles protegidos (PII)**: la **cédula** y el **documento de
  respaldo** de cada jugador NO son públicos. El público lee la vista
  `players_public` (sin esos campos); solo el admin/árbitro autenticado ve los
  datos completos (p. ej. para revisar el documento al aprobar).
- El **rol** (ADMIN vs ÁRBITRO) controla qué pestañas ve cada quien; ambos
  pueden escribir en la base.

Para agregar más árbitros: créalos en **Authentication → Users** y añade su fila
de rol en la tabla `users` (mismo formato que `seed.sql`, con su `email`).

### ¿Dónde apruebo las inscripciones?

**Panel de Admin → pestaña “Jugadores”.** Cada jugador muestra su **Estado**
(*Pendiente / Aprobado / Rechazado*). En los pendientes verás los botones
**Ver Respaldo** (abre el documento subido), **Aprobar** y **Rechazar**.

---

## Programación de horarios por dueño

Varios clubes tienen equipos en más de una categoría (mismo dueño). El
generador de calendario garantiza que **los equipos del mismo dueño no jueguen
a la misma hora y jueguen en horarios seguidos** (ej. Abierta 08:00 → +40 09:15
→ +50 10:30).

- El vínculo se define con el campo **`clubId`** del equipo. Los equipos con el
  mismo `clubId` pertenecen al mismo dueño.
- Al **crear un equipo** en Admin, completa el campo *Dueño / Club* con el mismo
  valor para todos los equipos de ese propietario (ej. `club-akd`).
- Los datos de demostración ya vienen agrupados (AKD, Leones Q, Futleg, Alianza,
  Boman, IDUS, Lawyers, Sanfra).
