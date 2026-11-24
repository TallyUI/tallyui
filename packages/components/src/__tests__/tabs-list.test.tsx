import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Text } from '../ui/text';

// react-native-web atomizes className into hashed classes, so copy it to a data attribute.
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) => <Base ref={ref} {...props} dataSet={{ class: props.className }} />);
  return { ...rn, View: withClass(rn.View), Text: withClass(rn.Text) };
});

afterEach(() => cleanup());

const renderList = (className?: string) =>
  render(
    <Tabs value="a" onValueChange={() => {}}>
      <TabsList className={className}>
        <TabsTrigger value="a"><Text>A</Text></TabsTrigger>
      </TabsList>
    </Tabs>
  );

describe('TabsList', () => {
  it('lays its triggers out in a row by default', () => {
    renderList();
    expect(screen.getByRole('tablist').getAttribute('data-class')).toContain('flex-row');
  });

  it('lets an app stack the triggers with flex-col', () => {
    renderList('flex-col');
    const classes = screen.getByRole('tablist').getAttribute('data-class');
    expect(classes).toContain('flex-col');
    expect(classes).not.toContain('flex-row');
  });
});
