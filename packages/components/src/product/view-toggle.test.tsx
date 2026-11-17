import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ViewToggle } from './view-toggle';

afterEach(() => cleanup());

describe('ViewToggle', () => {
  it('renders Grid then Table radios with the controlled checked value', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ViewToggle value="grid" onChange={onChange} />);
    expect(screen.getByRole('radiogroup').getAttribute('aria-label')).toBe('View');
    expect(screen.getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['Grid', 'Table']);
    expect(screen.getByTestId('view-toggle-grid').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('view-toggle-table').getAttribute('aria-checked')).toBe('false');
    rerender(<ViewToggle value="table" onChange={onChange} />);
    expect(screen.getByTestId('view-toggle-grid').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('view-toggle-table').getAttribute('aria-checked')).toBe('true');
  });
  it('reports the other option and ignores the current option', () => {
    const onChange = vi.fn();
    render(<ViewToggle value="grid" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Grid' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: 'Table' }));
    expect(onChange.mock.calls).toEqual([['table']]);
  });
  it('uses custom visible and accessible labels', () => {
    render(<ViewToggle value="grid" onChange={vi.fn()} labels={{ grid: 'Tiles', table: 'Rows' }} />);
    expect(screen.getByRole('radio', { name: 'Tiles' }).textContent).toBe('Tiles');
    expect(screen.getByRole('radio', { name: 'Rows' }).textContent).toBe('Rows');
  });
});

describe('ViewToggle variant="icon"', () => {
  it('draws one button that switches to the other view', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ViewToggle variant="icon" value="grid" onChange={onChange} />);
    expect(screen.getByTestId('view-toggle')).toBeTruthy();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByRole('button', { name: 'Switch to table view' })).toBe(screen.getByTestId('view-toggle-table'));
    expect(screen.queryByTestId('view-toggle-grid')).toBeNull();
    fireEvent.click(screen.getByTestId('view-toggle-table'));
    expect(onChange.mock.calls).toEqual([['table']]);
    onChange.mockClear();
    rerender(<ViewToggle variant="icon" value="table" onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Switch to grid view' })).toBe(screen.getByTestId('view-toggle-grid'));
    expect(screen.queryByTestId('view-toggle-table')).toBeNull();
    fireEvent.click(screen.getByTestId('view-toggle-grid'));
    expect(onChange.mock.calls).toEqual([['grid']]);
  });
  it('uses the label of the view it switches to', () => {
    render(<ViewToggle variant="icon" value="grid" onChange={vi.fn()} labels={{ table: 'Rows' }} />);
    expect(screen.getByRole('button', { name: 'Rows' })).toBeTruthy();
  });
});
