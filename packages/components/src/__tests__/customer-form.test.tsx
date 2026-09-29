import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CustomerForm } from '../customer/customer-form';

describe('CustomerForm', () => {
  const values = { firstName: 'Jane', lastName: 'Smith', email: 'jane@test.com', phone: '', address: '' };

  it('hides the address field with showAddress false', () => {
    const { rerender } = render(<CustomerForm values={values} onChangeField={() => {}} />);
    expect(screen.getByText('Address')).toBeDefined();
    expect(screen.getByPlaceholderText('Street address')).toBeDefined();
    rerender(<CustomerForm values={values} onChangeField={() => {}} showAddress={false} />);
    expect(screen.queryByText('Address')).toBeNull();
    expect(screen.queryByPlaceholderText('Street address')).toBeNull();
    expect(screen.getByDisplayValue('jane@test.com')).toBeDefined();
  });

  it('renders form fields with values', () => {
    render(<CustomerForm values={values} onChangeField={() => {}} />);
    expect(screen.getByDisplayValue('Jane')).toBeDefined();
    expect(screen.getByDisplayValue('Smith')).toBeDefined();
    expect(screen.getByDisplayValue('jane@test.com')).toBeDefined();
  });

  it('renders submit button', () => {
    render(<CustomerForm values={values} onChangeField={() => {}} onSubmit={() => {}} />);
    expect(screen.getByText('Save Customer')).toBeDefined();
  });

  it('calls onSubmit when submit button pressed', () => {
    const onSubmit = vi.fn();
    render(<CustomerForm values={values} onChangeField={() => {}} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText('Save Customer'));
    expect(onSubmit).toHaveBeenCalled();
  });
});
