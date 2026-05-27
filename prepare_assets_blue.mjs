import { Jimp } from 'jimp';

async function generateAppIcons() {
  try {
    // La máscara transparente que creamos antes
    const inputPath = 'public/tito-logo-mask.png';
    const iconPath = 'assets/icon.png';
    const splashPath = 'assets/splash.png';

    const mask = await Jimp.read(inputPath);
    
    // Invertir la máscara para que sea BLANCA
    // Puesto que es negra con fondo transparente, podemos iterar y pintar de blanco lo que no es transparente
    mask.scan((x, y, idx) => {
      const alpha = mask.bitmap.data[idx + 3];
      if (alpha > 0) {
        mask.bitmap.data[idx + 0] = 255; // R
        mask.bitmap.data[idx + 1] = 255; // G
        mask.bitmap.data[idx + 2] = 255; // B
      }
    });

    mask.resize({ w: 800, h: 800 }); // Un tamaño adecuado para centrar en el icono de 1024x1024

    // 1. Crear el Icono de la App (1024x1024) con fondo Slate 900 (#0f172a -> R:15, G:23, B:42)
    const icon = new Jimp({ width: 1024, height: 1024, color: 0x0f172aff });
    // Centrar el logo blanco
    icon.composite(mask, (1024 - 800) / 2, (1024 - 800) / 2);
    await icon.write(iconPath);
    console.log('Created assets/icon.png (Dark Blue with White Logo)');

    // 2. Crear la pantalla de carga (Splash Screen) (2732x2732)
    const splash = new Jimp({ width: 2732, height: 2732, color: 0x0f172aff });
    const splashMask = mask.clone().resize({ w: 1000, h: 1000 });
    splash.composite(splashMask, (2732 - 1000) / 2, (2732 - 1000) / 2);
    await splash.write(splashPath);
    console.log('Created assets/splash.png (Dark Blue with White Logo)');

  } catch (error) {
    console.error('Error creating app assets:', error);
  }
}

generateAppIcons();
