import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { CustomerForm } from '../customer/customer-form';
import { I18nProvider } from '../i18n';

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

describe('CustomerForm addresses, company, email error and labels', { timeout: 20_000 }, () => {
  const values = { firstName: 'Jane', lastName: 'Smith', email: 'jane@test.com', phone: '', address: '', company: 'Initial' };
  afterEach(() => cleanup());

  it('CF1 addresses with onChangeAddresses render AddressEditor in place of the free-text address', () => {
    const onChangeAddresses = vi.fn();
    render(<CustomerForm values={values} onChangeField={() => {}} addresses={{}} onChangeAddresses={onChangeAddresses} />);
    expect(screen.getByTestId('customer-form-addresses-billing-add')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Street address')).toBeNull();
    fireEvent.click(screen.getByTestId('customer-form-addresses-billing-add'));
    expect(onChangeAddresses).toHaveBeenCalledTimes(1);
    expect(onChangeAddresses.mock.calls[0][0].billing).toStrictEqual({});
  });

  it('CF2 addresses without onChangeAddresses keep the free-text address field', () => {
    render(<CustomerForm values={values} onChangeField={() => {}} addresses={{}} />);
    expect(screen.getByText('Address')).toBeDefined();
    expect(screen.getByPlaceholderText('Street address')).toBeDefined();
    expect(screen.queryByTestId('customer-form-addresses-billing-add')).toBeNull();
  });

  it('CF3 showCompany shows a Company field bound to values.company', () => {
    const onChangeField = vi.fn();
    const { rerender } = render(<CustomerForm values={values} onChangeField={onChangeField} />);
    expect(screen.queryByText('Company')).toBeNull();
    rerender(<CustomerForm values={values} onChangeField={onChangeField} showCompany />);
    expect(screen.getByText('Company')).toBeDefined();
    fireEvent.change(screen.getByDisplayValue('Initial'), { target: { value: 'Acme' } });
    expect(onChangeField).toHaveBeenCalledWith('company', 'Acme');
  });

  it('CF4 emailError shows an alert under the Email input', () => {
    const { rerender } = render(<CustomerForm values={values} onChangeField={() => {}} />);
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(<CustomerForm values={values} onChangeField={() => {}} emailError="Enter a valid email address" />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Enter a valid email address');
    expect(alert.getAttribute('data-testid')).toBe('customer-form-email-error');
    const position = screen.getByDisplayValue('jane@test.com').compareDocumentPosition(alert);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('CF5 labels come from the catalogue', () => {
    render(<I18nProvider locale="fr" resources={{ fr: { 'common.email': 'Courriel' } }}>
      <CustomerForm values={values} onChangeField={() => {}} />
    </I18nProvider>);
    expect(screen.getByText('Courriel')).toBeDefined();
    expect(screen.queryByText('Email')).toBeNull();
  });

  it('CF6 defaultCountry starts a new billing address in that country', () => {
    const onChangeAddresses = vi.fn();
    render(<CustomerForm values={values} onChangeField={() => {}} addresses={{}} onChangeAddresses={onChangeAddresses} defaultCountry="DE" />);
    fireEvent.click(screen.getByTestId('customer-form-addresses-billing-add'));
    expect(onChangeAddresses.mock.calls.at(-1)?.[0]).toStrictEqual({ billing: { country: 'DE' } });
  });
});
