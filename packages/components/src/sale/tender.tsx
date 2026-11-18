import { useReducer, type JSX } from 'react';
import { wireMethodOf, type PaymentMethodDescriptor } from '@tallyui/core';
import { initTenderState, tenderReducer, type useSale } from '@tallyui/pos';
import { offeredMethods } from './offered-methods';
import { TenderPane } from './tender-pane';

type Sale = ReturnType<typeof useSale>;

/** The offered method `startTender`'s wire method opens on: that id when offered, else the first offered method recording it, else the method itself. */
function openingMethodId(method: string, methods?: PaymentMethodDescriptor[]): string {
  const offered = offeredMethods(methods);
  if (offered.some(({ id }) => id === method)) return method;
  return offered.find((descriptor) => wireMethodOf(descriptor) === method)?.id ?? method;
}

function HostedPane({ sale, method, methods, ledger }: { sale: Sale; method: string; methods?: PaymentMethodDescriptor[]; ledger?: boolean }) {
  const [state, dispatch] = useReducer(tenderReducer, { methodId: openingMethodId(method, methods), balanceMinor: sale.order.balanceDueMinor }, initTenderState);
  return <TenderPane sale={sale} state={state} dispatch={dispatch} methods={methods} ledger={ledger} />;
}

type TenderProps = { sale: Sale; methods?: PaymentMethodDescriptor[]; /** Passed to TenderPane: `false` leaves the ledger to Cart's `tenderLedger`. Default `true`. */ ledger?: boolean };

/** The tender pane with its own reducer, opened on the method `startTender` chose. Renders nothing outside the tender stage. */
export function Tender({ sale, methods, ledger }: TenderProps): JSX.Element | null {
  return sale.stage.kind === 'tender' ? <HostedPane sale={sale} method={sale.stage.method} methods={methods} ledger={ledger} /> : null;
}

/** @deprecated Use Tender: the pane now handles split payments. */
export function SplitTender(props: TenderProps): JSX.Element {
  return <Tender {...props} />;
}
