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

## Pendientes / fuera de alcance
- **Android (pendiente, OTRA PC):** todo el flujo de Android Studio / generación del AAB se hace en la otra PC; este equipo (Mac) solo cubre iOS. Falta empaquetar/subir la versión con el código del 10-jun para Google Play.
- **Costos y gastos**: el dueño los maneja por fuera; por eso el sistema mide ingresos, no utilidad. La valuación de inventario es a **precio de venta**.
