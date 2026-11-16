// The page e2e/web/scan-hold-money.spec.ts bundles: a controlled money field and a controlled plain field under
// useBarcodeScanner's 'hold-money' policy, with no ScanHubProvider. Scans go onto `window.scans`.
import { createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useBarcodeScanner } from '../../../packages/pos/src/scanner/use-barcode-scanner';

declare global {
  interface Window { scans: string[]; keyLog: { key: string; at: number }[] }
}

window.scans = [];
window.keyLog = [];
// Registered before the hook's own capture listener (added in its effect, after the first render), so the spec can
// print the gaps the handler sees.
window.addEventListener('keydown', (e) => { window.keyLog.push({ key: e.key, at: Date.now() }); }, { capture: true });

function App() {
  const [money, setMoney] = useState('');
  const [note, setNote] = useState('');
  useBarcodeScanner({ fieldPolicy: 'hold-money', onScan: (code) => { window.scans.push(code); } });
  return createElement('div', null,
    createElement('input', {
      inputMode: 'decimal', 'data-testid': 'money', value: money,
      onChange: (e: { target: HTMLInputElement }) => setMoney(e.target.value),
    }),
    createElement('input', {
      'data-testid': 'note', value: note,
      onChange: (e: { target: HTMLInputElement }) => setNote(e.target.value),
    }));
}

createRoot(document.getElementById('root')!).render(createElement(App));
