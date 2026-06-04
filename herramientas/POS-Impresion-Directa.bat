@echo off
REM ============================================================
REM  Punto de Venta - Plasticos y Jarcieria Tito
REM  Abre el POS en Chrome con IMPRESION DIRECTA al rollo
REM  (sin el cuadro de "Imprimir" en cada ticket).
REM
REM  PASOS:
REM   1) Edita la linea  set "URL=..."  de abajo con la
REM      direccion real del punto de venta.
REM   2) Conecta la impresora termica y ponla como
REM      PREDETERMINADA en Windows (Configuracion > Impresoras).
REM      Configura el tamano de papel a 80mm / rollo.
REM   3) Doble clic en este archivo para abrir la caja.
REM ============================================================

REM >>>>>> EDITA ESTA LINEA CON LA URL REAL DEL POS <<<<<<
set "URL=https://punto-de-venta-car.pages.dev"

REM Perfil de Chrome propio del POS (no se mezcla con tu navegacion).
set "PERFIL=%LOCALAPPDATA%\POS-Tito-Chrome"

REM Busca Chrome en las rutas tipicas.
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if not exist "%CHROME%" (
  echo No se encontro Google Chrome. Instalalo o corrige la ruta en este archivo.
  pause
  exit /b 1
)

start "" "%CHROME%" --kiosk-printing --start-maximized --user-data-dir="%PERFIL%" "%URL%"
