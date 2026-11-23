import {Capacitor} from '@capacitor/core';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
  document.documentElement.classList.add('native-android');
}

createRoot(document.getElementById('root')!).render(<App />);
