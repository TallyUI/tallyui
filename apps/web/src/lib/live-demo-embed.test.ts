import { describe, expect, it } from 'vitest';
import { ExpoSnack } from '../components/expo-snack';
import { liveDemoEmbed } from './live-demo-embed';

describe('liveDemoEmbed', () => {
  it('opens the embedded Snack view with the preview on', () => {
    const element = ExpoSnack({ code: 'x', ...liveDemoEmbed });

    expect(element.type).toBe('iframe');
    expect(element.props.src).toMatch(/^https:\/\/snack\.expo\.dev\/embedded\?/);
    expect(new URL(element.props.src).searchParams.get('preview')).toBe('true');
  });

  it('keeps the embed at least as wide as Snack shows its preview', () => {
    const { props } = ExpoSnack({ code: 'x', ...liveDemoEmbed });

    expect(props.style.minWidth).toBe(liveDemoEmbed.minWidth);
    expect(parseInt(liveDemoEmbed.minWidth, 10)).toBeGreaterThanOrEqual(600);
  });

  it('leaves other snacks on the full editor with no min width', () => {
    const { props } = ExpoSnack({ code: 'x' });

    expect(props.src).toMatch(/^https:\/\/snack\.expo\.dev\/\?/);
    expect(props.style.minWidth).toBeUndefined();
  });
});
