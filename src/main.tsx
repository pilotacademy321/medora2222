import { createRoot, type Root } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const container = document.getElementById('root')!;
const win = window as Window & { __medoraAppRoot?: Root };
if (!win.__medoraAppRoot) {
  win.__medoraAppRoot = createRoot(container);
}
win.__medoraAppRoot.render(<App />);

