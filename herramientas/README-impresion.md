# Impresión de tickets en la computadora (Windows)

El POS imprime el ticket usando el navegador, a **80mm**. Para que el ticket
salga **directo al rollo sin el cuadro de "Imprimir"** cada venta, se usa Chrome
con la bandera `--kiosk-printing`, que ya viene en el archivo
`POS-Impresion-Directa.bat`.

## Instalación (una sola vez)

1. **Conecta la impresora térmica por USB** e instala su driver (el que viene en
   el disco/CD o el de la página del fabricante: Epson, Star, EC Line, 3nStar…).
2. En **Configuración → Bluetooth y dispositivos → Impresoras y escáneres**:
   - Pon la impresora térmica como **predeterminada**.
   - En sus **Preferencias de impresión**, selecciona el papel de **80mm / rollo**
     (a veces aparece como "80 x 297mm" o "Roll Paper 80mm").
3. Abre `POS-Impresion-Directa.bat` con el Bloc de notas y cambia la línea:
   ```
   set "URL=https://TU-DIRECCION-DEL-POS"
   ```
   por la dirección real del punto de venta.
4. (Opcional) Clic derecho al `.bat` → **Crear acceso directo** → arrastra el
   acceso directo al **Escritorio** y renómbralo "Punto de Venta". Si quieres,
   en sus Propiedades puedes cambiarle el ícono.

## Uso diario

- Abre la caja **siempre** con ese acceso directo (no con el Chrome normal),
  porque la impresión directa solo funciona con la bandera `--kiosk-printing`.
- Al cobrar, presiona **Imprimir ticket** y el papel sale solo.

## Notas

- `--kiosk-printing` imprime a la **impresora predeterminada de Windows** sin
  preguntar. Por eso es importante el paso 2 (ponerla como predeterminada).
- Usa un **perfil de Chrome separado** (`POS-Tito-Chrome`) para no mezclar con la
  navegación personal ni perder la configuración del POS.
- Si algún día el ticket sale cortado o con márgenes raros, revisa el tamaño de
  papel en las preferencias de la impresora (debe ser 80mm / rollo, márgenes 0).
- Los textos del ticket (nombre, dirección, teléfono, pie) se editan en
  `src/config/tienda.js` dentro del proyecto.
