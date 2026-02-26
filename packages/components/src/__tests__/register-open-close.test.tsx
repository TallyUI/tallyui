import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Text } from 'react-native';
import { RegisterOpenClose } from '../register/register-open-close';

describe('RegisterOpenClose', () => {
  it('renders "Open Register" when closed', () => {
    render(<RegisterOpenClose isOpen={false} />);
    const matches = screen.getAllByText('Open Register');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders "Close Register" when open', () => {
    render(<RegisterOpenClose isOpen={true} />);
    const matches = screen.getAllByText('Close Register');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders cash count slot when open', () => {
    render(
      <RegisterOpenClose isOpen={true} cashCountSlot={<Text>Cash Count</Text>} />,
    );
    expect(screen.getByText('Cash Count')).toBeDefined();
  });

  it('calls onOpen when open button is pressed', () => {
    const onOpen = vi.fn();
    render(<RegisterOpenClose isOpen={false} onOpen={onOpen} />);
    const buttons = screen.getAllByText('Open Register');
    fireEvent.click(buttons[buttons.length - 1]); // button is after the title
    expect(onOpen).toHaveBeenCalled();
  });

  it('calls onClose when close button is pressed', () => {
    const onClose = vi.fn();
    render(<RegisterOpenClose isOpen={true} onClose={onClose} />);
    const buttons = screen.getAllByText('Close Register');
    fireEvent.click(buttons[buttons.length - 1]); // button is after the title
    expect(onClose).toHaveBeenCalled();
  });
});
