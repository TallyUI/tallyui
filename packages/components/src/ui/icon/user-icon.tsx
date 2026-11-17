import { Circle, Path } from 'react-native-svg';
import { createSvgIcon } from './svg-icon';

export const UserIcon = createSvgIcon('UserIcon', () => (<><Circle cx={12} cy={8} r={5} /><Path d="M20 21a8 8 0 0 0-16 0" /></>));
