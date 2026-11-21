import { useCSSVariable } from 'uniwind';

/**
 * Stack screenOptions in the active theme's colours, so the header strip follows dark mode:
 * the header draws --color-background and its title and back button --color-foreground
 * (packages/theme/src/tokens.css). A variable that cannot be read falls back to the light value.
 */
export function useStackScreenOptions() {
  const [background, foreground] = useCSSVariable(['--color-background', '--color-foreground']);
  return {
    headerStyle: { backgroundColor: typeof background === 'string' ? background : '#f8f9fa' },
    headerTintColor: typeof foreground === 'string' ? foreground : '#111827',
    headerTitleStyle: { fontWeight: '600' as const },
  };
}
