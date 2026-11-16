import { Path } from 'react-native-svg';
import { createSvgIcon } from './svg-icon';

// Lucide sticky-note (ISC)
export const StickyNoteIcon = createSvgIcon('StickyNoteIcon', () => (
  <>
    <Path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z" />
    <Path d="M15 3v4a2 2 0 0 0 2 2h4" />
  </>
));
