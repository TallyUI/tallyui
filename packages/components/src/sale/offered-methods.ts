import { defaultPaymentMethods, wireMethodOf, type PaymentMethodDescriptor, type PaymentMethodKind } from '@tallyui/core';

/**
 * The methods the tender pane offers: the host's (else today's two defaults) whose capture is `manual`. Only manual
 * capture records a leg here, the cashier saying the money is taken; a device, gateway, webview, server or stored-value
 * method takes its money elsewhere, so recording its leg here would mark a sale paid that nobody has charged.
 */
export function offeredMethods(methods?: PaymentMethodDescriptor[]): PaymentMethodDescriptor[] {
  return (methods ?? defaultPaymentMethods()).filter((method) => method.capture.mode === 'manual');
}

/** The leg a descriptor records: its wire method (`wireMethodOf`), plus its own id as `methodId` when that differs. */
export function tenderOf(descriptor: PaymentMethodDescriptor): { method: PaymentMethodKind; methodId?: string } {
  const method = wireMethodOf(descriptor);
  return { method, ...(descriptor.id !== method ? { methodId: descriptor.id } : {}) };
}
