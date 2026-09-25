import { Platform } from 'react-native';

// react-native-web supports dataSet; uniwind-env.d.ts already augments ViewProps with it (TV6a).

export function injectPrintStyle() {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || document.getElementById('pos-print-style')) return;
  const style = document.createElement('style');
  style.id = 'pos-print-style';
  style.textContent = '@media print { [data-print="hide"] { display: none !important } }';
  document.head.appendChild(style);
}
