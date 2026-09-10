# Punto de Venta — Plásticos y Jarciería Tito

POS para una papelería/jarciería con **dos sucursales**: **Tito Centro** (principal) y **Tito Aviación**.

## Stack y despliegue
- **Frontend:** React + Vite + Tailwind. Componentes en `src/components/`.
- **Backend:** Supabase (PostgreSQL + Auth + RLS). Cliente en `src/lib/supabaseClient.js`.
- **Apps nativas:** Capacitor (iOS en `ios/`, Android en `android/`).
- **Web:** se despliega en Cloudflare. **`git push` a `main` auto-despliega la web.**
- **Build:** `npm run build` (Vite). El build NO corre ESLint; hay reglas estrictas de `react-hooks` que el código existente no cumple (CartContent en render, `Date.now` en render, etc.) — son preexistentes y no rompen el build.

## Base de datos / migraciones
- `database.sql` = esquema base (instalación fresca).
- `scripts/*.sql` = migraciones incrementales que se **pegan y ejecutan a mano en el SQL Editor de Supabase** (no hay migraciones automáticas).
  - `actualizacion_bd.sql` — precios de mayoreo, `delete_user()`.
  - `ventas_en_ruta.sql` — módulo de rutas.
  - `ventas_en_ruta_multisucursal.sql` — reconecta las rutas al stock por sucursal (`producto_stock`) en vez de la columna legacy; agrega `rutas.sucursal_id` y cambia la firma de `iniciar_ruta` a `(p_nombre, p_productos, p_sucursal)`. **Hay que ejecutarlo para que vuelvan a aparecer productos al armar una ruta.**
  - `totp_admin.sql` — código admin rotativo (TOTP).
  - `multisucursal.sql` — multi-sucursal (ver abajo).
  - `fix_handle_new_user_sucursal.sql` — arregla "Database error creating new user" al crear empleados. **Causa real:** el trigger `handle_new_user` insertaba en `usuarios_credenciales` (PIN), tabla que NO existe en producción → fallaba toda alta. El PIN está muerto (lo reemplazó el TOTP `verificar_codigo_admin`); se ELIMINA ese insert. También endurece la función: califica `public.sucursales` + `SET search_path = public, extensions` (el rol `supabase_auth_admin` que dispara el trigger no tiene `public` en su search_path).
  - `sangrias_y_transferencias.sql` — retiros/depósitos de caja y transferencias de stock.
- ⚠️ Al pegar SQL grande en Supabase puede corromperse (caracteres caídos). Si pasa, pegar en bloques más chicos.

## Roles y seguridad
- Roles `admin` / `empleado` en `usuarios_perfiles.rol`. RLS en todas las tablas; helper `public.es_admin()`.
- **PIN** por usuario (bcrypt) — `cambiar_pin`, `pin_necesita_cambio`.
- **Código admin rotativo (TOTP):** reemplaza al PIN fijo para autorizar acciones sensibles en el POS (p. ej. quitar un producto del ticket). El admin lo ve en Ajustes; cambia cada 30 s. Funciones `obtener_codigo_admin_actual`, `verificar_codigo_admin` (tabla `configuracion_seguridad`).

## Modelo multi-sucursal (clave)
- **Catálogo compartido + stock por sucursal.** `productos` tiene el catálogo (nombre, sku, precio — **mismo precio en todas las sucursales**); el stock vive en **`producto_stock (producto_id, sucursal_id, stock)`**.
- `productos.stock` quedó como **columna legacy** que se mantiene sincronizada con la sucursal principal vía `sincronizar_stock_legacy()` (red de seguridad; el código nuevo usa `producto_stock`).
- `sucursal_id` está en `usuarios_perfiles` (sucursal fija del empleado), `ventas`, `sesiones_caja`, `movimientos_inventario`, `pedidos_programados`.
- **Empleado:** opera (vende/recibe) solo en su sucursal; puede VER la otra en solo lectura. **Admin:** gestiona ambas (selector de sucursal en Inventario).
- RPCs centrales:
  - `productos_de_sucursal(p_sucursal)` → catálogo con `stock` de esa sucursal (forma `{...producto, stock}`; el front lo lee casi como antes).
  - `ajustar_stock(p_producto, p_sucursal, p_delta, p_tipo, p_notas)` → ÚNICO punto de cambio manual de stock (recepción/ajuste/inicial); valida que el empleado solo toque su sucursal; registra el movimiento.
  - `registrar_venta(...)` → descuenta del stock de la sucursal del vendedor (trigger `descontar_stock` lee `ventas.sucursal_id`).
  - `transferir_stock(p_producto, p_origen, p_destino, p_cantidad, p_notas)` → mueve stock entre sucursales (solo admin); registra `transferencia_salida`/`transferencia_entrada`.
- Migración: los datos existentes se asignaron a **Tito Centro**; **Tito Aviación** arrancó en 0.

## Caja
- `sesiones_caja`: apertura con fondo, corte con declarado vs esperado y diferencia, por usuario y sucursal.
- **Sangrías:** `movimientos_caja` (retiro/deposito) durante el turno vía `registrar_movimiento_caja`. El efectivo esperado = fondo + ventas efectivo + depósitos − retiros (en CajaModal y en Reportes).

## Mapa de componentes (admin salvo nota)
- `Terminal.jsx` — POS/cobro (empleado+admin). Escáner = teclado; búsqueda por SKU **case-insensitive**.
- `Inventario.jsx` — catálogo, recepción, historial; stock por sucursal; selector de sucursal; transferencias; etiquetas de código de barras (Code128, `EtiquetaModal.jsx`); alta/edición (`ProductModal.jsx`).
- `Dashboard.jsx` — KPIs, tendencias, rankings, flujo de caja; sub-pestaña **Sucursales** = comparativo (ventas 30d, tickets, ticket prom., unidades vendidas, valor de inventario a precio de venta, stock). Filtro por sucursal.
- `Reportes.jsx` — asistencias y cortes de caja; filtro por periodo y sucursal.
- `Pedidos.jsx` — historial de ventas con métricas; filtro por sucursal (admin).
- `PedidosProgramados.jsx` — agenda de pedidos por sucursal.
- `Equipo.jsx` — alta de empleados, gafetes QR, **asignación a sucursal**.
- `CajaModal.jsx`, `RelojChecador.jsx` (asistencia), `Ajustes.jsx`, `VentasEnRuta.jsx`.

## Notificaciones push (admin)
Avisos para el admin en 4 eventos: **stock bajo/agotado, asistencia (entrada/salida), corte de caja, pedidos del día**.
- **SQL:** `scripts/notificaciones_push.sql` (idempotente). Crea `push_tokens` (+ RPC `guardar_push_token`), `notificaciones` (centro de avisos, RLS solo admin, en publicación realtime) y los triggers. La función `notif_pedidos_hoy()` se programa con pg_cron (línea comentada al final del script).
- **App (lado cliente):**
  - `src/lib/push.js` → `initPush()`: pide permiso, registra el dispositivo y guarda el token con `guardar_push_token`. Solo corre en nativo; se llama desde `App.jsx` cuando el perfil es admin.
  - `src/components/NotificacionesCenter.jsx` → campana con badge de no leídas + lista en realtime; montada en el header (sidebar desktop y top bar móvil) solo para admin.
- **Firebase:** proyecto `punto-venta-tito` (FCM). Apps `com.plasticos.pos` Android/iOS. Configs en `android/app/google-services.json` y `ios/App/App/GoogleService-Info.plist`. Android Gradle ya aplica el plugin `google-services`.
- **Entrega del push:** Edge Function `supabase/functions/enviar-push` (FCM HTTP v1). Se dispara con un **Database Webhook** en INSERT de `notificaciones`; lee los tokens de los admins y envía. Requiere secret `FCM_SERVICE_ACCOUNT` (JSON de cuenta de servicio de Firebase). `verify_jwt=false` en `supabase/config.toml`.
- **Pendiente para que el push llegue de verdad:**
  1. Desplegar la función: `supabase login` → `supabase functions deploy enviar-push --project-ref gtkymvjadgcwhdmpyhoc`.
  2. Subir el secret: `supabase secrets set FCM_SERVICE_ACCOUNT="$(cat clave.json)"` (clave generada en Firebase Console → Configuración → Cuentas de servicio → Generar nueva clave privada).
  3. Crear el Database Webhook (Dashboard → Database → Webhooks) en `notificaciones` INSERT → POST a `https://gtkymvjadgcwhdmpyhoc.supabase.co/functions/v1/enviar-push`.
  4. **iOS:** en Xcode agregar `GoogleService-Info.plist` al target, capability **Push Notifications** + **Background Modes → Remote notifications**; en Apple Developer habilitar Push para el App ID y generar **APNs Auth Key (.p8)**, subirla a Firebase → Cloud Messaging.

## Estado App Store / iOS (última sesión: 2026-06-11)
- **App:** "Plásticos y Jarciaría Tito" — versión **1.0.0**.
- **Rechazo original:** Guideline **3.2.0** (app de un solo negocio).
- **Vía aprobada:** **Unlisted App Distribution** aprobada por Developer Support (Rafael) el 2026-06-11. **Case #102907102404**. La unlisted aprueba la cuenta, NO el build: hay que lograr que App Review apruebe la app; se distribuye por **enlace directo** (en *Pricing and Availability*), no aparece en búsquedas.
- **Builds:** el **build 2** (subido 8-jun desde esta Mac) quedó **viejo** (no incluía el trabajo del 10-jun: SKU TIT-000X, modo oscuro, inventario atómico, terminal en vivo, mayoreo). Por eso se compiló el **build 3** (`CURRENT_PROJECT_VERSION = 3`, `npm run build` + `npx cap copy ios` el 11-jun) y se subió a TestFlight.
- **Acción hecha 11-jun:** se respondió a App Review en Resolution Center citando la aprobación de unlisted; se hizo **Remove** del item con build 2 del envío y se **reenvió con el build 3**. Esperando veredicto de App Review.
- **OJO para subir builds nuevos:** subir `CURRENT_PROJECT_VERSION` en `ios/App/App.xcodeproj/project.pbxproj` (Debug+Release), `npm run build`, `npx cap copy ios`, Archive en Xcode. El bundle web vive en `ios/App/App/public/` — verificar su fecha tras `cap copy` para confirmar que lleva el código actual.

## Impresora térmica (PC de caja)

- **Modelo:** POS-80, driver 11.3.0.1, USB001, resolución 203 DPI, modo gráfico (Print as image).
- **Área imprimible real:** 72 mm (papel 80 mm total — el driver lo reporta como `80(72)`).
- **Sin cajón de dinero** — configurar en Propiedades → Configuración del dispositivo → Cash Drawer → **None**. Si no se hace, la impresora genera un error silencioso antes de cada impresión.
- **Ticket (`src/components/TicketModal.jsx`):**
  - CSS: `@page { margin:0; size:80mm auto }` al top-level (fuera de `@media print`).
  - `body { width:70mm; padding:3mm 4mm 8mm; font-family:'Lucida Console',Consolas,monospace; font-weight:400; }` — 70 mm deja un buffer de 2 mm respecto al área imprimible para evitar cortes en el borde derecho.
  - Texto en negrita: `.bold { font-weight:700 }` — encabezados, totales y precios. El weight 400 base es suficiente para texto corriente a 203 DPI con Lucida Console.
  - `handlePrint` usa un `<iframe>` invisible; dispara `window.print()` tras 150 ms en `load` y limpia el iframe con `afterprint` (no con `setTimeout`).
- **Impresión sin diálogo de Chrome:**
  - Script `C:\Proyectos\punto-de-venta.bat`: cierra Chrome y lo relanza con `--kiosk-printing --app="https://punto-de-venta-car.pages.dev/"`.
  - El acceso directo del escritorio apunta al `.bat` con ventana minimizada.
  - La primera impresión en una PC nueva sí muestra el diálogo; hay que seleccionar POS-80, Márgenes: Ninguno, sin encabezados — Chrome lo recuerda para esa impresora.
- **Checklist para PC nueva:** (1) instalar driver POS-80, (2) deshabilitar Cash Drawer, (3) copiar/crear `punto-de-venta.bat`, (4) crear acceso directo apuntando al `.bat` con ventana minimizada, (5) primera impresión manual para fijar ajustes en Chrome.

## Sesión 2026-07-31 — limpieza previa al arranque real + realtime + auditoría
El negocio **empieza a usar el POS de verdad el 2026-08-01**. El proyecto de Supabase había quedado **pausado** y se reactivó.

**Limpieza de datos (hecha, vía API REST con service_role).** Todo lo que había era de pruebas del 16–23 de junio. Se borró: 10 ventas + detalles, 3 sesiones de caja, 1 movimiento de caja, 3 asistencias, 15 movimientos de inventario, 1 pedido programado + partida, 1 ruta + carga, notificaciones y push_tokens; stock a 0 (en `producto_stock` **y** en la columna legacy `productos.stock`); se eliminaron los 3 empleados de prueba (`ejemplo@`, `d@`, `e1@plasticos.com`). **Quedan solo** el admin `admin@plasticos.com` (Carlos Carbajal) y los 215 productos del catálogo. Poner stock a 0 dispara el trigger de aviso de stock agotado — hubo que limpiar `notificaciones` otra vez al final.

**Verificado en vivo:** las 14 RPCs que usa el front existen en la BD con la firma correcta (se comparó contra el esquema OpenAPI de PostgREST, no adivinando); `productos_de_sucursal` sigue devolviendo mayoreo; las Edge Functions `crear-empleado` y `enviar-push` están desplegadas; el alta de empleado funciona de punta a punta (crear usuario → el trigger `handle_new_user` genera perfil + gafete QR → asignar sucursal → borrar limpia en cascada).

**Los dos scripts de esta sesión YA ESTÁN APLICADOS** (`scripts/fix_registrar_venta_mayoreo.sql` y `scripts/realtime_y_sucursal_caja.sql`). Verificado en la BD el 2026-08-19: `registrar_venta` ya contempla `precio_mayoreo` y hay 11 tablas en la publicación `supabase_realtime`. (Este párrafo decía que faltaban; era una nota que quedó desactualizada.)

**Credenciales para correr SQL:** el token de la CLI en el llavero es de OTRA cuenta de Supabase (Befitlab/CARPERfit/Santuario). Este proyecto vive en una TERCERA cuenta, así que hay que pedirle al usuario un Personal Access Token y usar la API de management:
`POST https://api.supabase.com/v1/projects/gtkymvjadgcwhdmpyhoc/database/query` con `Authorization: Bearer $TOKEN`, mandando el SQL como JSON (`jq -Rs '{query: .}' archivo.sql`). Con **curl**, no con python-urllib (Cloudflare lo bloquea). Pedirle al usuario que revoque el token al terminar.

**Duda abierta para el dueño: el admin no puede cobrar.** La BD sí lo contempla (`registrar_venta` deja vender sin caja si el rol es admin), pero la UI nunca muestra la Terminal al admin: el ítem del sidebar está detrás de `canOperateTerminal = isEmpleado && isClockedIn && isCajaOpen`. Con cero empleados dados de alta, nadie puede vender. Si el dueño atiende el mostrador, hay que exponerle la Terminal (y decidir si abre caja o vende sin ella).

### Bugs corregidos
- **🔴 `registrar_venta` ignoraba el precio de MAYOREO** (`scripts/fix_registrar_venta_mayoreo.sql`, **falta correrlo**). El front manda solo `{id, cantidad}` y la función recalcula el total con los precios de la BD — correcto para que nadie manipule el importe — pero lo hacía siempre con `productos.precio`, sin mirar nunca `precio_mayoreo`/`cantidad_mayoreo`. La Terminal **sí** aplica el mayoreo, así que el cajero cobraba mayoreo y la BD guardaba menudeo: `ventas.total` inflado, sin cuadrar contra `pago_efectivo+tarjeta+transferencia`, y `venta_detalles.precio_unitario` con un precio que nadie pagó. **213 de 215 productos tienen mayoreo desde 3 piezas**, así que casi cualquier venta de 3+ del mismo artículo caía en esto. Se ve en los datos de prueba del 16-jun (TIT-0202, $50/$40 desde 3): venta de 4 piezas → total guardado $200, cobrado $160. El fix aplica la misma regla que `Terminal.getItemPrice` y calcula el precio **una sola vez** por partida para el total y el detalle, así no pueden volver a divergir.
- **`sesiones_caja.sucursal_id` siempre en NULL.** `CajaModal` insertaba la apertura sin la sucursal. Como Reportes → "Cortes de caja" y Dashboard → "Cajas abiertas"/"Flujo" filtran con `sucursal_id = ...`, al elegir una sucursal **no aparecía ningún corte**. Los retiros/depósitos heredaban el NULL desde `registrar_movimiento_caja`. Arreglado en la app **y** con trigger `completar_sucursal_caja` en la BD (red de seguridad para apps viejas de iOS/Android).
- **El historial de ventas estaba capado a 50 filas.** `App.fetchVentas` traía "las últimas 50 ventas" sin filtro de fecha. Con dos sucursales cobrando, 50 tickets se acaban en unas horas y el Dashboard y Pedidos mostraban **números incompletos del propio día, sin avisar**. Ahora se trae por ventana de fechas (`DIAS_HISTORIAL = 45`, tope 3000). Nota: el selector de fecha de Pedidos solo alcanza dentro de esa ventana.
- **El empleado veía el movimiento de la otra sucursal** (ventas y pedidos programados). Las ventas ahora se piden filtradas por su `sucursal_id` y la agenda se acota igual. Ojo: la RLS de `ventas` sigue abierta (`FOR ALL USING (authenticated)`), esto es alcance de UI, no de seguridad.
- **Dashboard → Análisis usaba `productos.stock`** (columna legacy que solo sigue a la sucursal principal): al filtrar por Aviación mostraba las existencias de Centro. Ahora agrega desde `producto_stock` según el filtro.
- **Resumen del turno por sesión.** `CajaModal` sumaba "ventas de este usuario desde tal hora"; ahora usa `sesion_caja_id`, que es la relación exacta que ya guarda `registrar_venta` y no depende del reloj.
- **Código muerto:** en `Terminal.requireAdminAction` las dos ramas del `if` de bloqueo hacían lo mismo; y el Dashboard tenía un botón **"Filtrar"** en Transacciones Recientes que no hacía nada (se quitó).

### Realtime
Antes solo `NotificacionesCenter` estaba suscrito. Se agregó el hook **`src/lib/useRealtime.js`** (agrupa los eventos con 400 ms de espera, porque una venta dispara cambios en cuatro tablas) y se conectó en:
`App` (ventas; y caja/asistencia del empleado) · `Terminal` (stock de su sucursal, refresco silencioso para no parpadear al cobrar) · `Inventario` (catálogo, stock e historial) · `Dashboard` (cajas abiertas, flujo, análisis y comparativo) · `Reportes` (asistencias y cortes) · `PedidosProgramados` · `Equipo`.

## Sesión 2026-08-19 — dos pedidos del dueño + hallazgo de arranque

### 🔴 Hallazgo: el POS está listo pero el negocio NO lo está usando
Al revisar la BD (19 días después del arranque real del 1-ago): **0 ventas, 0 movimientos de inventario, stock en 0 en los 215 productos de ambas sucursales**. Hay 4 cuentas (Carlos admin + Brenda, Empleado, Encargado Jony, dados de alta el 7-ago, todos en Centro; nadie en Aviación) y sólo 2 sesiones de caja: una abierta el 7-ago que quedó abierta **12 días** y se cerró el 19-ago, y otra el mismo 19-ago que duró 54 segundos. La checada de Jony del 7-ago sigue en estado `trabajando`.

**El bloqueador no es una función faltante: nunca cargaron el inventario inicial.** Con stock en 0 no se puede cobrar. Capturar 215 productos a mano en la pantalla de recepción es la fricción que tiene parado el arranque → lo que hace falta es **carga masiva de stock inicial** (importar CSV/Excel + pantalla de conteo físico rápido). PENDIENTE, ya planteado al usuario.

### Pedido 1: quitar el código de autorización al corregir el ticket
El dueño pidió quitar el código que se exigía para sacar un producto del ticket cuando se escanea algo por error. Se quitó de los **cuatro** puntos que lo usaban: quitar producto, bajar cantidad, F2 y el botón "Limpiar" — dejarlo sólo en los últimos dos lo volvía teatro, porque se vacía el carrito quitando artículo por artículo. Se fueron con él el modal de PIN, el bloqueo por 3 intentos y la llamada a `verificar_codigo_admin` (−167 líneas en `Terminal.jsx`), más la sección "Código de Autorización" de `Ajustes.jsx` (−90), que quedó sin propósito.
**Nota de control interno:** ese código evitaba que un cajero sacara un artículo ya escaneado y se quedara con el efectivo. Es decisión del dueño. Si algún día quiere el control sin la fricción, la vía es dejar quitar libremente pero **registrar en bitácora** qué se quitó y quién.
Las funciones `verificar_codigo_admin` y `obtener_codigo_admin_actual` siguen vivas en la BD (ya sin uso en el front); se pueden borrar si no se van a reactivar.

### Pedido 2: no se podía eliminar la cuenta de un empleado
Síntoma (foto del dueño, Ajustes → Zona Peligrosa): `update or delete on table "usuarios_perfiles" violates foreign key constraint "sesiones_caja_usuario_id_fkey"`.
Causa: **cinco** FKs sin `ON DELETE` (no sólo la del error) → arreglar una sola daba el siguiente error en cadena. Script **`scripts/fix_borrar_cuenta_fks.sql`, YA APLICADO Y VERIFICADO** en prod:
- `sesiones_caja`, `pedidos_programados`, `movimientos_caja`, `rutas` → **SET NULL** (+ `DROP NOT NULL`). El historial de dinero NO se borra por dar de baja a alguien.
- `registro_asistencia` → **CASCADE** (dato personal del empleado; se va con la cuenta). `push_tokens` ya estaba en CASCADE.
- **Snapshot de nombre:** columna `usuario_nombre` en `ventas`, `sesiones_caja`, `movimientos_caja` y `movimientos_inventario` + trigger `trg_congelar_nombre_usuario` (BEFORE DELETE en `usuarios_perfiles`, se dispara también en el borrado en cascada desde `auth.users`). Así el corte sigue diciendo "Corte de Brenda" y no "Desconocido". `Reportes.jsx` ya hace el fallback a esa columna.
- **RPC `eliminar_empleado(p_usuario)`** (SECURITY DEFINER): sólo admin, no permite borrarse a sí mismo (para eso está Ajustes) ni borrar a otro admin. Botón **"Dar de baja"** en cada tarjeta de `Equipo.jsx` con modal de confirmación que dice qué se conserva y qué se borra.
- ⚠️ **`ventas.user_id` NO lleva FK a propósito.** En producción nunca tuvo una (sólo existen `ventas_sesion_caja_id_fkey` y `ventas_sucursal_id_fkey`), así que no bloqueaba nada; crearla ahora sólo añadiría un modo de falla nuevo **al cobro**. El historial de ventas se protege con el snapshot de nombre, no con la FK. **No agregarla.**

**Cómo se aplicó (repetible):** ensayo con `sed 's/^COMMIT;$/ROLLBACK;/'` antes de aplicar en firme — atrapó un error de tipos (`array_agg(att.attname)` da `name[]` vs `text[]`, hay que castear a `::text`) que habría fallado a media migración. Después se probó el borrado real de la cuenta de Jony dentro de `BEGIN … ROLLBACK`: cuenta eliminada, sus 2 cortes conservados con nombre, checada borrada; y los guards del RPC con `SET LOCAL request.jwt.claims` (empleado → rechazado, admin sobre sí mismo → rechazado). BD intacta al terminar.

## Sesión 2026-08-20 — el gafete QR no dejaba checar entrada

Reporte del dueño: los empleados no pueden entrar con el QR para abrir caja. **Dos causas distintas, ambas vigentes:**

1. **Gafetes impresos huérfanos (no es bug).** El dueño estrenó el botón "Dar de baja": borró a Brenda, Empleado y Encargado Jony, y creó una cuenta nueva **"EMPLEADO"** (`GAF-91df93b7`). Los gafetes impresos que traían eran de las cuentas borradas, así que ya no corresponden a nadie. **Solución operativa: reimprimir desde Equipo → tarjeta → "Imprimir gafete".** Consecuencia general: cada baja+alta cambia el código, hay que reimprimir.
2. **Bug real de mayúsculas (corregido, commit `cbe1625`).** El trigger genera el gafete como `'GAF-' || substring(uuid,1,8)` → trae **hex en minúsculas**; `RelojChecador.jsx` comparaba con `!==` estricto, así que el Caps Lock o un lector configurado en mayúsculas dejaba fuera al empleado. **La Terminal, con el MISMO lector, ya normalizaba con `toLowerCase()` para el SKU** — el escáner estaba bien tratado en una pantalla y mal en la otra. Ahora se normaliza (minúsculas + sin espacios) y el mensaje de error muestra el código leído en vez del inútil "no coincide con tu perfil actual"; también se distingue el caso de cuenta sin gafete asignado.
   - ⚠️ **Ojo con los dos formatos de gafete:** el trigger produce `GAF-<8 hex>` (con letras minúsculas) y el botón "Generar código" de `Equipo.jsx` produce `GAF-<6 dígitos>`. Sólo el primero era vulnerable al problema de mayúsculas.

**✅ CONFIRMADO EN VIVO por el usuario (20-ago):** creó una cuenta "Prueba", tecleó su gafete y **ya lo deja checar entrada**. El deploy se verificó buscando el texto del mensaje nuevo dentro del bundle servido por Cloudflare (`curl` a `/assets/index-*.js`) — vale la pena repetir ese truco para confirmar despliegues. Recordar siempre **Ctrl+Shift+R** en la PC de la tienda: es PWA y el service worker sirve la versión vieja.

**Verificado de paso:** la baja de ayer funcionó como se diseñó — las 2 sesiones de caja de Jony sobrevivieron con `usuario_id = NULL` y `usuario_nombre = 'Encargado Jony'`, y sus checadas se borraron en cascada. Lo mismo con la cuenta "Prueba": al darla de baja, su checada se borró sola.

**⚠️ Efecto secundario a tener en cuenta al probar:** si la cuenta de prueba **abre caja**, esa `sesiones_caja` **sobrevive a la baja** (por diseño, es el snapshot de nombre) y queda **abierta para siempre**: el usuario ya no existe, así que nadie puede hacerle el corte desde la UI y el Dashboard la seguirá contando como "caja abierta". Quedó una así del 2026-08-20 20:54 UTC a nombre de "Prueba"; **ya se borró** (DELETE por REST con `service_role`, es DML — no hacía falta PAT) tras confirmar que no tenía ventas ni movimientos ligados. La BD quedó en **0 cajas abiertas**. Para futuras pruebas: quedarse en la checada de entrada y NO abrir caja, salvo que se vaya a limpiar después.

**⚠️ Quedó UNA SOLA cuenta de empleado compartida ("EMPLEADO").** Con eso, todos los cortes, checadas y ventas salen a ese mismo nombre: no se puede saber quién abrió caja, quién cobró ni a quién atribuir un faltante. Ya se le señaló al usuario; si es intencional, respetarlo, pero la trazabilidad se pierde.

## Sesión 2026-08-27 — auditoría del arranque real + no se podía vender sin existencia

### ✅ El negocio YA está usando el POS
Cambió todo respecto al 19-ago: **32 ventas ($4,674)**, **1,032 movimientos de inventario**, **264 de 736 renglones de `producto_stock` con existencia**, catálogo de **215 → 368 productos**. Cargaron el inventario **a mano**, en tandas (20, 21, 23 y 26 de ago; el 26 metieron 475 movimientos en un día). La cuenta compartida "EMPLEADO" ya no está; ahora es **"Equipo Centro"** (creada el 26-ago) — sigue siendo una sola cuenta compartida, con la misma pérdida de trazabilidad ya señalada.

### Auditoría: todo lo registrado cuadra
Se bajaron los datos por REST con `service_role` y se cruzaron en local (scripts efímeros, no versionados). **Ni un peso mal calculado:**
- 32/32 ventas cuadran por tres caminos (total = suma de partidas = suma de pagos).
- 117/117 partidas con el precio correcto; **3 cayeron en mayoreo** → el fix del 31-jul ya trabajó en ventas reales.
- 736/736 renglones de stock explicados por su propio historial de movimientos; **0 negativos**.
- 82/82 productos con descuento de stock exacto contra lo vendido.
- 9/9 cortes de caja cuadrados (uno con −$6, anotado por el propio cajero).
- Catálogo: 0 sin precio, 0 sin SKU, 0 duplicados, columna legacy sincronizada. 0 checadas colgadas.

### 🔴 Hallazgo: $53,005 de mercancía salió sin ticket
Junto a las 32 ventas hay **631 ajustes de inventario a la baja** ("Ajuste manual"), 2,180 piezas, **todos desde la cuenta del admin (Carlos)**. Valuados a precio de venta: **$53,005**, contra $4,674 cobrados en la Terminal.

**No es un conteo físico, son ventas de mostrador.** El 26-ago corren de 10:20 a 18:59 con 14 s de separación mediana; 117 de los 177 productos tocados ese día se ajustaron más de una vez (ATOMIZADOR 250 ML bajó −1 a las 10:41:40 y −2 **siete segundos después**); los deltas son −1 (×420), −2 (×106), −3, −5, −12. El sábado 22 el bloque va de 22:59 a 23:38 — poniéndose al corriente ya cerrada la tienda.

**Causa: el admin no tiene cómo cobrar.** Es exactamente la duda abierta del 31-jul que quedó sin resolver. `canOperateTerminal = isEmpleado && isClockedIn && isCajaOpen` (`App.jsx:309`) → el admin nunca ve el botón de Terminal. Pero `App.jsx:473` ya renderiza la Terminal con `canOperate` (que **sí** incluye al admin) y `registrar_venta` deja explícitamente que el admin venda sin caja. **Falta el botón, no el módulo.** Lo que Carlos hacía en su lugar: abrir la ficha de cada producto en Inventario y bajarle el número a mano (`Inventario.jsx:873`, de ahí la nota "Ajuste manual").

**PENDIENTE — decisión del dueño**, porque cambia lo que ve el Dashboard:
- **(A)** botón siempre visible, cobra sin caja → ventas con ticket pero `sesion_caja_id` NULL, fuera de todo corte.
- **(B)** el admin también checa entrada y abre caja → un paso más al día, pero su efectivo cuadra contra fondo y corte. Recomendado si atiende a diario.

Reporte para el dueño publicado como Artifact: https://claude.ai/code/artifact/6ecf4356-0d2a-4845-b9b0-af0bab11e772

### Pedido del dueño: se podían vender productos sin existencia (commit `0afbbb3`)
Reporte: "se pueden agregar productos al POS para venta aunque no haya en tienda".

**La BD sí lo bloqueaba** — el trigger `descontar_stock` (versión multisucursal, verificada viva en prod porque los `salida_venta` traen `sucursal_id` y cuadran contra `producto_stock`) lanza `Stock insuficiente para el producto X (Disponible: N, Requerido: M)`, y `registrar_venta` lo devuelve como `{ok:false, error:...}`. Nunca hubo sobreventa: **0 existencias en negativo**.

**El problema era dónde y cómo fallaba.** La Terminal no miraba el stock en ningún punto: ni al escanear, ni al subir cantidad, ni en la tarjeta del producto (no mostraba existencia). El cajero armaba el ticket completo, cobraba, y hasta ese momento saltaba un `alert` genérico ("uno o más productos") que **no decía cuál** — y se perdía la venta entera.

Ahora el corte está al escanear, con el cliente enfrente:
- **Tarjeta de producto:** muestra existencia de la sucursal; en cero sale "Sin existencia" y queda `disabled`. Umbrales alineados con Inventario (≤5 crítico, ≤20 bajo).
- **`addToCart` / botón `+`:** bloquean y topan en lo disponible ("Sólo quedan 3 pz de X").
- **Partida del ticket:** si el stock cae con el ticket abierto (otra caja, transferencia), se marca en rojo y **COBRAR se bloquea** nombrando el producto. `sinExistencia` se recalcula en cada render y el realtime de `producto_stock` ya refresca `productos`.
- **Al cobrar se RELEE el stock de la BD** (`fetchProductos` ahora devuelve los datos), no el de la pantalla: un ticket puede llevar minutos abierto.
- **Toast con tipo** (`ok` 2 s / `error` 4 s en rojo).
- **`App.handleRegisterSale`** deja pasar el mensaje real de la BD, que sí nombra producto y piezas.

⚠️ **Efecto operativo esperado:** los **103 productos que nunca se capturaron** quedan visibles pero no vendibles. No se pierde ninguna venta que antes funcionara (la BD ya las rechazaba), pero el hueco se vuelve visible en la pantalla de cobro — es la señal para que los capturen.

⚠️ **NO se probó en la app corriendo:** entrar a la Terminal exige checar entrada y abrir caja, y hacerlo habría dejado una `sesiones_caja` y una checada reales en producción con la tienda vendiendo. Verificado con build limpio y revisión de código.

## Sesión 2026-09-09 — tres pedidos del dueño (ticket de mayoreo, el scroll y el buscador)

### 🔴 El ticket impreso mentía: renglones a MENUDEO con TOTAL de mayoreo
Reporte: "en el ticket impreso no sale que la compra fue de mayoreo".

Era más grave que la etiqueta. `TicketModal` imprimía cada renglón con `item.precio`
(el de catálogo) mientras el TOTAL venía de `Terminal.getItemPrice()`, que sí aplicaba
mayoreo: **los renglones no sumaban el total**. En una venta de 3 cubetas ($50 / $45
desde 3) el papel decía "3 x $50.00 = $150.00" y abajo "TOTAL $135.00", sin explicar
los $15 de diferencia. Se cobraba bien (la BD y la pantalla de cobro siempre
estuvieron correctas) — lo que estaba mal era el papel que se lleva el cliente.

**La causa de fondo:** la regla del mayoreo estaba copiada en tres lados (Terminal,
TicketModal y `registrar_venta`) y se desincronizó. Ahora hay **una sola fuente de
verdad**: `src/lib/precios.js`, con la MISMA condición que la BD
(`precio_mayoreo > 0 AND cantidad_mayoreo > 0 AND cantidad >= cantidad_mayoreo`).
Terminal, el ticket en pantalla y el ticket impreso pasan todos por ahí.

El papel ahora dice, en el renglón: `3 x $45.00 MAYOREO … $135.00` +
`Normal $50.00 c/u · ahorra $15.00`, y al pie `AHORRO POR MAYOREO -$45.00`.

Detalle fino: **TIT-0178** (mayoreo capturado igual al menudeo) NO se etiqueta como
mayoreo, porque anunciar "ahorra $0.00" solo confunde. El precio **cobrado** no se
tocó: sigue saliendo de la misma regla que `registrar_venta`, aunque la captura esté
al revés.

La plantilla del papel se sacó a `src/lib/ticketImpreso.js` (sin JSX) para poder
generarla y revisarla sin levantar la app.

### El carrito "se subía de golpe a los primeros"
`CartContent` se declaraba **dentro** del render de Terminal. En cada render nacía
una función nueva → para React era un componente DISTINTO → desmontaba y volvía a
montar todo el carrito → la lista es un `<div>` nuevo y **el scroll vuelve a cero**.
Pasaba al agregar un producto, al teclear en el buscador y hasta cuando se iba solo
el aviso flotante; solo se notaba con el ticket largo, que es cuando hay scroll.

Ahora `CartPanel` vive fuera del componente y recibe props. Además la partida que se
acaba de tocar se **resalta 1.5 s y se trae a la vista** (`scrollIntoView`), que era
el otro problema: al agregar, el renglón nuevo caía fuera de la pantalla.

### Buscador que aguanta cómo escribe la gente (`src/lib/buscar.js`)
Antes era un `includes` sobre el texto crudo: exigía el nombre TAL CUAL y EN ORDEN.
Con el catálogo escrito a mano, "cubeta 19" o "grande escoba" no devolvían nada.
Ahora: sin acentos, `ñ`→`n`, **palabras en cualquier orden**, número y unidad pegados
("19lts" = "19 LTS"), errores de dedo ("cubta", "escova") como **último recurso** —
y cuando el resultado sale de ese rescate se avisa en pantalla para que el cajero
confirme que es el producto. Busca también por SKU y por categoría. El catálogo se
indexa una vez por carga, no en cada tecla.

### Extras para el mostrador (pedidos como "hazlo fácil, son de pueblo")
- **Mayoreo a la vista** en la tarjeta del producto: `3+ pz a $45.00`, para poder
  ofrecerlo sin acordarse de cuáles bajan.
- **Empujón de venta** en el carrito: "Con 1 pieza más baja a $45.00 c/u" (solo si
  hay existencia para surtirlo).
- **Aviso al alcanzar el mayoreo** al escanear: "ya es MAYOREO a $45.00 c/u".
- **Ahorro por mayoreo** visible en el carrito, no solo en el ticket.
- **Escáner con código desconocido**: antes no decía NADA y el cajero volvía a
  escanear creyendo que no había leído; ahora avisa.
- Botón de **borrar la búsqueda** en el buscador.

### Verificación — SÍ se probó la app corriendo
`npm run build` limpio; los `src/lib/*.js` nuevos pasan ESLint sin nada (el proyecto
bajó de 10 a 8 problemas preexistentes). Node: 18 casos de búsqueda y 8 de precios.

Para probar sin credenciales ni tocar producción se montó un **banco de pruebas
temporal** (`verify.html` + `src/verify-harness.jsx`, ya borrados): monta la Terminal
REAL con un catálogo falso y `supabase.rpc/channel` sustituidos, así no hay red ni
hace falta checar entrada ni abrir caja. Si hay que volver a probar, se rehace igual.

Comprobado en el navegador: **el bug del scroll se REPRODUJO con el código viejo**
(scroll 800 → 0 al teclear una letra en el buscador y al agregar un producto, con el
`<div>` de la lista sustituido en el DOM) y **queda en 800 → 800 con el nuevo**, con
la partida nueva resaltada y traída a la vista. Además: mayoreo en carrito y ticket
(renglones suman el TOTAL, $515.00 en la prueba), aviso "con 1 pieza más…" y su
reverso al bajar la cantidad, 13 búsquedas incluidas cruzadas/acentos/errores de dedo,
tope por existencia (2 pz → el 3.º rebota), escáner con código desconocido, F2/F4,
cobro completo → ticket → nueva venta, vista móvil con el carrito en modal, y la
**reimpresión desde Pedidos** (marca MAYOREO, no anuncia ahorro, renglones cuadran).
Cero errores y cero warnings de React en consola.

Lo único NO probado: la **impresora térmica física** (el `window.print()` real).

## Pendientes / fuera de alcance
- **🔴 EXPONERLE LA TERMINAL AL ADMIN** — falta que el dueño elija (A) o (B); ver sesión 2026-08-27. Mientras no exista, cada venta que atienda Carlos sigue saliendo por "Ajuste manual", sin ticket ni ingreso registrado.
- **🟡 CARGA MASIVA DE INVENTARIO INICIAL** — ya no bloquea el arranque (cargaron 264 renglones a mano), pero faltan **103 productos en cero en Centro** y **Tito Aviación entera** (0 de 368). Sigue faltando importar CSV/Excel + pantalla de conteo rápido; también sirve para los reabastos.
- **TIT-0178 BASTON CON ROSCA** tiene precio de mayoreo igual al de menudeo ($15 desde 12 pzas). Error de captura, no cobra de más; desde el 9-sep el ticket ya no lo anuncia como mayoreo, pero **el dato sigue mal en el catálogo**.
- **Android (pendiente, OTRA PC):** todo el flujo de Android Studio / generación del AAB se hace en la otra PC; este equipo (Mac) solo cubre iOS. Falta empaquetar/subir la versión con el código del 10-jun para Google Play.
- **iOS 1.0.2 (build 5)** preparado desde el 31-jul: falta Archive + Upload en Xcode y crear la versión en App Store Connect.
- **Basura pendiente:** `usuarios_perfiles.pin_seguridad` del admin sigue guardado en **texto plano** (`"1234"`); es residuo del PIN muerto que reemplazó el TOTP y no se usa para nada. No hay forma de cerrar una checada colgada desde la UI (la de Jony lleva días abierta). La RLS de `ventas` sigue abierta (`FOR ALL USING (authenticated)`). El folio del ticket sigue siendo aleatorio, no el id real de la venta.
- **Costos y gastos**: el dueño los maneja por fuera; por eso el sistema mide ingresos, no utilidad. La valuación de inventario es a **precio de venta**.
