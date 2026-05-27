import { Jimp } from 'jimp';

async function processLogo() {
  try {
    const inputPath = 'C:\\Users\\zahir\\.gemini\\antigravity-ide\\brain\\5a133e05-1d52-4b1b-aabf-ac597c9cbbbb\\tito_monochrome_logo_1779839907565.png';
    const outputPath = 'public/tito-logo-mask.png';

    const image = await Jimp.read(inputPath);
    
    image.scan((x, y, idx) => {
      // The image is black and white. 
      // We want black lines (r=0) to be OPAQUE (alpha=255)
      // and white background (r=255) to be TRANSPARENT (alpha=0).
      // We can map luminosity to alpha inverted.
      
      const r = image.bitmap.data[idx + 0];
      const g = image.bitmap.data[idx + 1];
      const b = image.bitmap.data[idx + 2];
      
      const luminosity = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      
      // alpha should be 255 for black, 0 for white
      const alpha = 255 - luminosity;

      // Set color to solid black, and let alpha handle the shape
      image.bitmap.data[idx + 0] = 0;
      image.bitmap.data[idx + 1] = 0;
      image.bitmap.data[idx + 2] = 0;
      image.bitmap.data[idx + 3] = alpha;
    });

    await image.write(outputPath);
    console.log('Successfully created transparent logo mask at', outputPath);
  } catch (error) {
    console.error('Error processing image:', error);
  }
}

processLogo();
