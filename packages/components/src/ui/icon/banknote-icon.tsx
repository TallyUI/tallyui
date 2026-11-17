import { Circle, Path, Rect } from 'react-native-svg';
import { createSvgIcon } from './svg-icon';

// Lucide's banknote icon (ISC licence).
export const BanknoteIcon = createSvgIcon('BanknoteIcon', () => (
  <>
    <Rect x={2} y={6} width={20} height={12} rx={2} />
    <Circle cx={12} cy={12} r={2} />
    <Path d="M6 12h.01M18 12h.01" />
  </>
));
