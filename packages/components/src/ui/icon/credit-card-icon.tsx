import { Line, Rect } from 'react-native-svg';
import { createSvgIcon } from './svg-icon';

// Lucide's credit-card icon (ISC licence).
export const CreditCardIcon = createSvgIcon('CreditCardIcon', () => (
  <>
    <Rect x={2} y={5} width={20} height={14} rx={2} />
    <Line x1={2} y1={10} x2={22} y2={10} />
  </>
));
