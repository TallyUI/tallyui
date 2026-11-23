import { useReducer, type JSX } from 'react';
import { type PaymentMethodDescriptor } from '@tallyui/core';
import { initTenderState, tenderReducer, type useSale } from '@tallyui/pos';
import { openingMethodId, type useTender } from './use-tender';
import { TenderPane, type TenderPaneProps } from './tender-pane';

type Sale = ReturnType<typeof useSale>;

function HostedPane({ sale, method, methods, ledger, back, confirmVoid, beforeVoid, tender }: TenderProps & { method: string }) {
  const [state, dispatch] = useReducer(tenderReducer, { methodId: openingMethodId(method, methods), balanceMinor: sale.order.balanceDueMinor, payments: sale.order.payments }, initTenderState);
  return <TenderPane sale={sale} state={tender ? tender.state : state} dispatch={tender ? tender.dispatch : dispatch} methods={methods} ledger={ledger} back={back} confirmVoid={confirmVoid} beforeVoid={beforeVoid} />;
}

type TenderProps = { sale: Sale; methods?: PaymentMethodDescriptor[]; /** Passed to TenderPane: `false` leaves the ledger to Cart's `tenderLedger`. Default `true`. */ ledger?: boolean; /** Passed to TenderPane: `false` hides Back (v2's phone checkout). Default `true`. */ back?: boolean;
  /** Passed to TenderPane's ledger: v2's "Cancel this payment?" before a leg is voided. Default `false`. */ confirmVoid?: boolean;
  /** Passed to TenderPane's ledger: runs before Cancel payment voids a leg; the void waits for it. */ beforeVoid?: TenderPaneProps['beforeVoid'];
  /** One reducer shared with Cart's `picker` (useTender). Without it, Tender keeps its own reducer, as before. */ tender?: ReturnType<typeof useTender> };

/** The tender pane with its own reducer, opened on the method `startTender` chose. Renders nothing outside the tender stage. */
export function Tender({ sale, methods, ledger, back, confirmVoid, beforeVoid, tender }: TenderProps): JSX.Element | null {
  return sale.stage.kind === 'tender' ? <HostedPane sale={sale} method={sale.stage.method} methods={methods} ledger={ledger} back={back} confirmVoid={confirmVoid} beforeVoid={beforeVoid} tender={tender} /> : null;
}

/** @deprecated Use Tender: the pane now handles split payments. */
export function SplitTender(props: TenderProps): JSX.Element {
  return <Tender {...props} />;
}
