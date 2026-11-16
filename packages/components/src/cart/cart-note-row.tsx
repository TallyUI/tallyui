// Port of WCPOS v2 packages/core/src/screens/main/pos/cart/note-row.tsx (monorepo 7a475d8), MIT, WCPOS.
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { cn } from '@tallyui/theme';
import { usePointer } from '../scale';
import { PencilIcon } from '../ui/icon/pencil-icon';
import { StickyNoteIcon } from '../ui/icon/sticky-note-icon';
import { Text } from '../ui/text';

export function CartNoteRow({ text, onPress }: { text: string; onPress: () => void }) {
  const [active, setActive] = useState(false);
  const coarse = usePointer() === 'coarse';
  if (text.trim() === '') return null;

  return (
    <View className="border-t border-border pt-2">
      <Pressable testID="cart-note-row" accessibilityRole="button" accessibilityLabel={`Edit note: ${text}`}
        hitSlop={{ top: 4, bottom: 4 }} onPress={onPress}
        onHoverIn={() => setActive(true)} onHoverOut={() => setActive(false)}
        onFocus={() => setActive(true)} onBlur={() => setActive(false)}
        className={cn('min-h-9 flex-row items-center gap-2 rounded-md px-2', active && 'bg-accent')}>
        <View className={active ? 'text-foreground' : 'text-muted-foreground'}><StickyNoteIcon size={16} /></View>
        <Text numberOfLines={1} className={cn('flex-1 text-sm', active ? 'text-foreground' : 'text-muted-foreground')}>{text}</Text>
        <View testID="cart-note-edit" className={cn('text-foreground web:transition-opacity', active || coarse ? 'opacity-100' : 'opacity-0')}>
          <PencilIcon size={14} />
        </View>
      </Pressable>
    </View>
  );
}
