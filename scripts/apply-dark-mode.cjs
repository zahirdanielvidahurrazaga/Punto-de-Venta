const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../src/components');

const replacements = [
  // Backgrounds
  { regex: /\bbg-white\b(?!\/)/g, replacement: 'bg-white dark:bg-slate-900' },
  { regex: /\bbg-slate-50\b(?!\/)/g, replacement: 'bg-slate-50 dark:bg-slate-900/50' },
  { regex: /\bbg-slate-100\b(?!\/)/g, replacement: 'bg-slate-100 dark:bg-slate-800' },
  { regex: /\bhover:bg-slate-50\b(?!\/)/g, replacement: 'hover:bg-slate-50 dark:hover:bg-slate-800' },
  { regex: /\bhover:bg-slate-100\b(?!\/)/g, replacement: 'hover:bg-slate-100 dark:hover:bg-slate-700' },
  
  // Text
  { regex: /\btext-slate-900\b(?!\/)/g, replacement: 'text-slate-900 dark:text-white' },
  { regex: /\btext-slate-800\b(?!\/)/g, replacement: 'text-slate-800 dark:text-slate-200' },
  { regex: /\btext-slate-700\b(?!\/)/g, replacement: 'text-slate-700 dark:text-slate-300' },
  { regex: /\btext-slate-600\b(?!\/)/g, replacement: 'text-slate-600 dark:text-slate-400' },
  { regex: /\btext-slate-500\b(?!\/)/g, replacement: 'text-slate-500 dark:text-slate-400' },
  { regex: /\btext-slate-400\b(?!\/)/g, replacement: 'text-slate-400 dark:text-slate-500' },
  
  // Borders
  { regex: /\bborder-slate-200\b(?!\/)/g, replacement: 'border-slate-200 dark:border-slate-800' },
  { regex: /\bborder-slate-100\b(?!\/)/g, replacement: 'border-slate-100 dark:border-slate-800' },
  { regex: /\bborder-slate-300\b(?!\/)/g, replacement: 'border-slate-300 dark:border-slate-700' },
  
  // Dividers
  { regex: /\bdivide-slate-100\b(?!\/)/g, replacement: 'divide-slate-100 dark:divide-slate-800' },
  { regex: /\bdivide-slate-200\b(?!\/)/g, replacement: 'divide-slate-200 dark:divide-slate-800' },
  
  // Specific Opacity ones used in project
  { regex: /\bbg-white\/70\b/g, replacement: 'bg-white/70 dark:bg-slate-900/70' },
  { regex: /\bbg-white\/60\b/g, replacement: 'bg-white/60 dark:bg-slate-900/60' },
  { regex: /\bbg-white\/90\b/g, replacement: 'bg-white/90 dark:bg-slate-900/90' }
];

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Evitar duplicar las clases si el script se corre dos veces por error
  replacements.forEach(({ regex, replacement }) => {
    // Para cada regex, buscamos y solo reemplazamos si no está seguido ya por la version dark
    // Una manera sencilla es aplicar el reemplazo y luego limpiar los duplicados
    content = content.replace(regex, replacement);
  });
  
  // Cleanup duplicates caused by previous manual additions or double runs
  content = content.replace(/bg-white dark:bg-slate-900 dark:bg-slate-900/g, 'bg-white dark:bg-slate-900');
  content = content.replace(/text-slate-900 dark:text-white dark:text-white/g, 'text-slate-900 dark:text-white');
  content = content.replace(/border-slate-200 dark:border-slate-800 dark:border-slate-800/g, 'border-slate-200 dark:border-slate-800');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated: ' + path.basename(filePath));
  }
}

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (fullPath.endsWith('.jsx')) {
      processFile(fullPath);
    }
  }
}

// También procesar App.jsx
processFile(path.join(__dirname, '../src/App.jsx'));
walk(dir);
console.log('Terminado!');