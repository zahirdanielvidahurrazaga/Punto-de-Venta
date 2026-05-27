import { Jimp } from 'jimp';

async function generateAppIcons() {
  try {
    // We use the monochrome logo with the white background generated previously
    const inputPath = 'C:\\Users\\zahir\\.gemini\\antigravity-ide\\brain\\5a133e05-1d52-4b1b-aabf-ac597c9cbbbb\\tito_monochrome_logo_1779839907565.png';
    const iconPath = 'assets/icon.png';
    const splashPath = 'assets/splash.png';

    const image = await Jimp.read(inputPath);
    
    // For iOS/Android icons, a minimum of 1024x1024 is recommended.
    // The generated image should be large enough, let's just resize it to 1024x1024 just in case.
    image.resize({ w: 1024, h: 1024 });
    await image.write(iconPath);
    console.log('Created assets/icon.png');

    // Splash screen should be 2732x2732. We can create a solid white background and place the logo in the center.
    const splash = new Jimp({ width: 2732, height: 2732, color: 0xFFFFFFFF }); // White background
    const logoForSplash = image.clone().resize({ w: 800, h: 800 });
    
    splash.composite(logoForSplash, (2732 - 800) / 2, (2732 - 800) / 2);
    await splash.write(splashPath);
    console.log('Created assets/splash.png');

  } catch (error) {
    console.error('Error creating app assets:', error);
  }
}

generateAppIcons();
