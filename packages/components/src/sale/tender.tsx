import { useReducer, type JSX } from 'react';
import type { PaymentMethodDescriptor } from '@tallyui/core';
import { initTenderState, tenderReducer, type useSale } from '@tallyui/pos';
import { TenderPane } from './tender-pane';

type Sale = ReturnType<typeof useSale>;

function HostedPane({ sale, method, methods }: { sale: Sale; method: string; methods?: PaymentMethodDescriptor[] }) {
  const [state, dispatch] = useReducer(tenderReducer, { methodId: method, balanceMinor: sale.order.balanceDueMinor }, initTenderState);
  return <TenderPane sale={sale} state={state} dispatch={dispatch} methods={methods} />;
}

/** The tender pane with its own reducer, opened on the method `startTender` chose. Renders nothing outside the tender stage. */
export function Tender({ sale, methods }: { sale: Sale; methods?: PaymentMethodDescriptor[] }): JSX.Element | null {
  return sale.stage.kind === 'tender' ? <HostedPane sale={sale} method={sale.stage.method} methods={methods} /> : null;
}

/** Split payments are legs on the one tender pane: kept as a name for `Tender`. */
export const SplitTender = Tender;
