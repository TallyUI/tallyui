import { Line, Path } from 'react-native-svg';
import { createSvgIcon } from './svg-icon';

/** A scan frame (four corners) with a centre line. */
export const ScanIcon = createSvgIcon('ScanIcon', () => (
  <>
    <Path d="M3 7V5a2 2 0 0 1 2-2h2" />
    <Path d="M17 3h2a2 2 0 0 1 2 2v2" />
    <Path d="M21 17v2a2 2 0 0 1-2 2h-2" />
    <Path d="M7 21H5a2 2 0 0 1-2-2v-2" />
    <Line x1={7} y1={12} x2={17} y2={12} />
  </>
));
