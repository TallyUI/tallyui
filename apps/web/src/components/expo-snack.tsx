'use client';

interface ExpoSnackProps {
  /** Code for a single-file snack (App.js) */
  code?: string;
  /** Multi-file snack as JSON object */
  files?: Record<string, { type: 'CODE'; contents: string }>;
  /** Comma-separated npm dependencies */
  dependencies?: string;
  /** Snack name */
  name?: string;
  /** Preview platform */
  platform?: 'web' | 'ios' | 'android';
  /** Show preview pane */
  preview?: boolean;
  /** Theme */
  theme?: 'light' | 'dark';
  /** iframe height */
  height?: string;
}

/**
 * Embeds an Expo Snack playground inline.
 * Code is passed via URL parameters — no separate hosting needed.
 */
export function ExpoSnack({
  code,
  files,
  dependencies = '',
  name = 'Tally UI Example',
  platform = 'web',
  preview = true,
  theme = 'light',
  height = '500px',
}: ExpoSnackProps) {
  const params = new URLSearchParams();

  if (files) {
    params.append('files', JSON.stringify(files));
  } else if (code) {
    params.append('code', code);
  }

  if (dependencies) params.append('dependencies', dependencies);
  params.append('platform', platform);
  params.append('preview', String(preview));
  params.append('name', name);
  params.append('theme', theme);

  const url = `https://snack.expo.dev/?${params.toString()}`;

  return (
    <iframe
      src={url}
      style={{
        overflow: 'hidden',
        background: 'transparent',
        border: '1px solid var(--fd-border)',
        borderRadius: '8px',
        height,
        width: '100%',
      }}
      allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
      sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
    />
  );
}
