import { Fragment, useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronLeftIcon } from '../ui/icon/chevron-left-icon';
import { ChevronRightIcon } from '../ui/icon/chevron-right-icon';

type Crumb = { label: string; onPress: () => void; testID?: string };

// Port of v2 packages/components/src/breadcrumb/index.tsx: at phone width only the last parent shows, as
// "‹ label", with no separators; labels wrap and are never truncated. The caller passes `phone`, as Catalogue
// already knows it. Not ported: v2's decodeHtml, TextClassContext, min-h-ctl and the children slot.
export function Breadcrumb({ parents, here, autoFocus, phone, testID }: {
  parents: readonly [Crumb, ...Crumb[]]; here?: string; autoFocus?: boolean; phone: boolean; testID?: string;
}) {
  const backRef = useRef<View>(null);
  // Focus is a mount action, never a response to later props. `preventScroll`, as v2: no scroll on focus.
  const focusOnMount = useRef(autoFocus);
  useEffect(() => {
    if (focusOnMount.current) {
      (backRef.current as unknown as { focus?: (options: { preventScroll: boolean }) => void } | null)
        ?.focus?.({ preventScroll: true });
    }
  }, []);
  let sep = 0;
  const separator = () => (
    <View aria-hidden testID={`${testID}-sep-${sep++}`} className="text-muted-foreground"><ChevronRightIcon size={14} /></View>
  );
  return (
    <View testID={testID} className="flex-row flex-wrap items-center gap-1 px-4 pt-2">
      {parents.map((parent, index) => phone && index < parents.length - 1 ? null : (
        <Fragment key={index}>
          {!phone && index > 0 && separator()}
          <Pressable ref={index === parents.length - 1 ? backRef : undefined} role="button" accessibilityLabel={parent.label}
            onPress={parent.onPress} testID={parent.testID ?? `${testID}-parent-${index}`}
            className="min-h-11 max-w-full justify-center rounded-md px-2">
            <View className="max-w-full flex-row items-center gap-1 text-foreground">
              {phone && <ChevronLeftIcon size={16} />}
              <Text className="shrink font-medium text-foreground">{parent.label}</Text>
            </View>
          </Pressable>
        </Fragment>
      ))}
      {here !== undefined && <>
        {!phone && separator()}
        <Text testID={`${testID}-here`} className="shrink px-1 font-semibold text-foreground">{here}</Text>
      </>}
    </View>
  );
}
