-- =====================================================================
-- Copa Abogados — Semilla de PRODUCCIÓN
-- =====================================================================
-- Ejecútalo en Supabase: SQL Editor -> New query -> pegar todo -> Run.
-- Requisito previo: haber corrido schema.sql.
--
-- Qué hace:
--   1. Borra TODOS los jugadores y TODO el calendario (partidos).
--   2. Deja los 28 equipos (se insertan/actualizan).
--   3. Reemplaza los usuarios por las 4 cuentas oficiales (2 admin, 2 árbitros).
--
-- IMPORTANTE — CONTRASEÑAS: estas filas NO guardan contraseñas. Debes crear las
-- 4 cuentas en  Authentication -> Users -> Add user  con estos MISMOS emails y
-- la contraseña de cada una (marca "Auto Confirm User"):
--     cb@copa.com          (Carlos Bucheli - Admin)
--     admin@copa.com       (Administrador  - Admin)
--     arbitro1@copa.com    (Árbitro 1)
--     arbitro2@copa.com    (Árbitro 2)
-- =====================================================================

-- 1) Limpiar jugadores y calendario
delete from public.players;
delete from public.matches;

-- 2) Equipos (28) — se mantienen
insert into public.teams (id, data) values
  ('team-ab-1', '{"id":"team-ab-1","name":"Leones Q","shortName":"Leones Q","category":"Abierta Varones","logo":"shield","primaryColor":"#EA580C","secondaryColor":"#FFFFFF","delegate":"Dr. Santiago Morales","phone":"0991112233","clubId":"club-leonesq"}'::jsonb),
  ('team-ab-2', '{"id":"team-ab-2","name":"Futleg","shortName":"Futleg","category":"Abierta Varones","logo":"gavel","primaryColor":"#0284C7","secondaryColor":"#FFFFFF","delegate":"Ab. Mateo Benítez","phone":"0992223344","clubId":"club-futleg"}'::jsonb),
  ('team-ab-3', '{"id":"team-ab-3","name":"Abogadasos","shortName":"Abogadasos","category":"Abierta Varones","logo":"scale","primaryColor":"#00A859","secondaryColor":"#FFFFFF","delegate":"Dr. Fernando Salazar","phone":"0993334455"}'::jsonb),
  ('team-ab-4', '{"id":"team-ab-4","name":"AKD","shortName":"AKD Abierta","category":"Abierta Varones","logo":"crown","primaryColor":"#DC2626","secondaryColor":"#FBBF24","delegate":"Ab. Christian Medina","phone":"0994445566","clubId":"club-akd"}'::jsonb),
  ('team-ab-5', '{"id":"team-ab-5","name":"Camaradas","shortName":"Camaradas","category":"Abierta Varones","logo":"landmark","primaryColor":"#4F46E5","secondaryColor":"#FFFFFF","delegate":"Dr. Hugo Ramos","phone":"0995556677"}'::jsonb),
  ('team-ab-6', '{"id":"team-ab-6","name":"Sport Legal","shortName":"Sport Legal","category":"Abierta Varones","logo":"trophy","primaryColor":"#D97706","secondaryColor":"#FFFFFF","delegate":"Ab. Esteban Naranjo","phone":"0996667788"}'::jsonb),
  ('team-ab-7', '{"id":"team-ab-7","name":"Alianza Legal","shortName":"Alianza Legal","category":"Abierta Varones","logo":"book","primaryColor":"#1E3A8A","secondaryColor":"#93C5FD","delegate":"Dr. Byron López","phone":"0997778899","clubId":"club-alianza"}'::jsonb),
  ('team-ab-8', '{"id":"team-ab-8","name":"Boman Legal","shortName":"Boman Legal","category":"Abierta Varones","logo":"file-text","primaryColor":"#047857","secondaryColor":"#FFFFFF","delegate":"Ab. Andrés Sevilla","phone":"0998889900","clubId":"club-boman"}'::jsonb),
  ('team-ab-9', '{"id":"team-ab-9","name":"Club IDUS","shortName":"IDUS Abierta","category":"Abierta Varones","logo":"graduation","primaryColor":"#7C3AED","secondaryColor":"#FFFFFF","delegate":"Dr. Javier Villacís","phone":"0999990011","clubId":"club-idus"}'::jsonb),
  ('team-ab-10', '{"id":"team-ab-10","name":"Lex Pro FC","shortName":"Lex Pro","category":"Abierta Varones","logo":"award","primaryColor":"#059669","secondaryColor":"#FDE047","delegate":"Ab. Gabriel Soria","phone":"0990001122"}'::jsonb),
  ('team-ab-11', '{"id":"team-ab-11","name":"Lawyers","shortName":"Lawyers Abierta","category":"Abierta Varones","logo":"scale","primaryColor":"#2563EB","secondaryColor":"#FFFFFF","delegate":"Dr. Patricio Torres","phone":"0991113355","clubId":"club-lawyers"}'::jsonb),
  ('team-ab-12', '{"id":"team-ab-12","name":"Sanfra Legal","shortName":"Sanfra Abierta","category":"Abierta Varones","logo":"shield","primaryColor":"#15803D","secondaryColor":"#FFFFFF","delegate":"Ab. Carlos Benítez","phone":"0992224466","clubId":"club-sanfra"}'::jsonb),
  ('team-ab-13', '{"id":"team-ab-13","name":"Legal Sport","shortName":"Legal Sport","category":"Abierta Varones","logo":"trophy","primaryColor":"#0284C7","secondaryColor":"#FFFFFF","delegate":"Ab. Mateo Villacís","phone":"0993332211"}'::jsonb),
  ('team-40-1', '{"id":"team-40-1","name":"Leones Q (+40)","shortName":"Leones Q +40","category":"+40 Varones","logo":"shield","primaryColor":"#C2410C","secondaryColor":"#FFFFFF","delegate":"Dr. Santiago Morales","phone":"0991112233","clubId":"club-leonesq"}'::jsonb),
  ('team-40-2', '{"id":"team-40-2","name":"Futleg (+40)","shortName":"Futleg +40","category":"+40 Varones","logo":"gavel","primaryColor":"#0369A1","secondaryColor":"#FFFFFF","delegate":"Ab. Mateo Benítez","phone":"0992223344","clubId":"club-futleg"}'::jsonb),
  ('team-40-3', '{"id":"team-40-3","name":"AKD (+40)","shortName":"AKD +40","category":"+40 Varones","logo":"crown","primaryColor":"#B91C1C","secondaryColor":"#FDE047","delegate":"Dr. Leonardo Morales","phone":"0994445577","clubId":"club-akd"}'::jsonb),
  ('team-40-4', '{"id":"team-40-4","name":"Alianza Legal (+40)","shortName":"Alianza +40","category":"+40 Varones","logo":"book","primaryColor":"#1E40AF","secondaryColor":"#FFFFFF","delegate":"Dr. Byron López","phone":"0997778899","clubId":"club-alianza"}'::jsonb),
  ('team-40-5', '{"id":"team-40-5","name":"Boman Legal (+40)","shortName":"Boman +40","category":"+40 Varones","logo":"file-text","primaryColor":"#065F46","secondaryColor":"#FFFFFF","delegate":"Ab. Andrés Sevilla","phone":"0998889900","clubId":"club-boman"}'::jsonb),
  ('team-40-6', '{"id":"team-40-6","name":"Club IDUS (+40)","shortName":"IDUS +40","category":"+40 Varones","logo":"graduation","primaryColor":"#6D28D9","secondaryColor":"#FFFFFF","delegate":"Dr. Javier Villacís","phone":"0999990011","clubId":"club-idus"}'::jsonb),
  ('team-40-7', '{"id":"team-40-7","name":"Lawyers (+40)","shortName":"Lawyers +40","category":"+40 Varones","logo":"scale","primaryColor":"#1D4ED8","secondaryColor":"#FFFFFF","delegate":"Dr. Patricio Torres","phone":"0991113355","clubId":"club-lawyers"}'::jsonb),
  ('team-40-8', '{"id":"team-40-8","name":"Vodka Jr.","shortName":"Vodka Jr.","category":"+40 Varones","logo":"trophy","primaryColor":"#0369A1","secondaryColor":"#E0F2FE","delegate":"Ab. Rodrigo Cárdenas","phone":"0993335577"}'::jsonb),
  ('team-40-9', '{"id":"team-40-9","name":"Chamucos","shortName":"Chamucos","category":"+40 Varones","logo":"landmark","primaryColor":"#991B1B","secondaryColor":"#FEF2F2","delegate":"Dr. Gonzalo Holguín","phone":"0994446688"}'::jsonb),
  ('team-50-1', '{"id":"team-50-1","name":"AKD (+50)","shortName":"AKD +50","category":"+50 Varones","logo":"crown","primaryColor":"#991B1B","secondaryColor":"#FDE047","delegate":"Dr. Roberto Freire","phone":"0995557799","clubId":"club-akd"}'::jsonb),
  ('team-50-2', '{"id":"team-50-2","name":"Amigos del C.A.T.","shortName":"Amigos C.A.T.","category":"+50 Varones","logo":"landmark","primaryColor":"#00A859","secondaryColor":"#DC2626","delegate":"Dr. Luis Proaño","phone":"0996668800"}'::jsonb),
  ('team-da-1', '{"id":"team-da-1","name":"Elite Legal","shortName":"Elite Legal","category":"Damas","logo":"crown","primaryColor":"#DB2777","secondaryColor":"#FCE7F3","delegate":"Dra. María José Paredes","phone":"0997779911"}'::jsonb),
  ('team-da-2', '{"id":"team-da-2","name":"Bef","shortName":"Bef Damas","category":"Damas","logo":"shield","primaryColor":"#9333EA","secondaryColor":"#F3E8FF","delegate":"Dra. Andrea Carrillo","phone":"0998880022"}'::jsonb),
  ('team-da-3', '{"id":"team-da-3","name":"Sanfra","shortName":"Sanfra Damas","category":"Damas","logo":"scale","primaryColor":"#059669","secondaryColor":"#ECFDF5","delegate":"Dra. Carla Espín","phone":"0999991133","clubId":"club-sanfra"}'::jsonb),
  ('team-da-4', '{"id":"team-da-4","name":"Damas de la Justicia","shortName":"Justicia","category":"Damas","logo":"gavel","primaryColor":"#2563EB","secondaryColor":"#EFF6FF","delegate":"Dra. Sofia Holguín","phone":"0990002244"}'::jsonb)
on conflict (id) do update set data = excluded.data;

-- 3) Usuarios: reemplazar por las 4 cuentas oficiales
delete from public.users;
insert into public.users (id, data) values
  ('u-admin-cb', '{"id":"u-admin-cb","name":"Carlos Bucheli","username":"cbucheli","role":"ADMIN","email":"cb@copa.com"}'::jsonb),
  ('u-admin',    '{"id":"u-admin","name":"Administrador","username":"admin","role":"ADMIN","email":"admin@copa.com"}'::jsonb),
  ('u-ref-1',    '{"id":"u-ref-1","name":"Árbitro 1","username":"arbitro1","role":"REFEREE","refereeId":"ref-1","email":"arbitro1@copa.com"}'::jsonb),
  ('u-ref-2',    '{"id":"u-ref-2","name":"Árbitro 2","username":"arbitro2","role":"REFEREE","refereeId":"ref-2","email":"arbitro2@copa.com"}'::jsonb)
on conflict (id) do update set data = excluded.data;
