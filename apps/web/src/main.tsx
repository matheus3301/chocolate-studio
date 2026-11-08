import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { database } from './storage.js';
import { initializeLanguage } from './i18n.js';
import './styles.css';

let locale: 'pt-BR' | 'en' = navigator.language.startsWith('pt') ? 'pt-BR' : 'en';
try {
  const preference = await database.preferences.get('locale');
  if (preference?.value === 'pt-BR' || preference?.value === 'en') locale = preference.value;
} catch {
  // The editor reports unavailable storage and keeps export usable.
}
await initializeLanguage(locale);
document.documentElement.lang = locale;
const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<StrictMode><App /></StrictMode>);
