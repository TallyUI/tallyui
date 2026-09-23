import { Circle, Line } from 'react-native-svg';
import { createSvgIcon } from './svg-icon';

export const SearchIcon = createSvgIcon('SearchIcon', () => (
  <>
    <Circle cx={11} cy={11} r={7} />
    <Line x1={16.5} y1={16.5} x2={21} y2={21} />
  </>
));
