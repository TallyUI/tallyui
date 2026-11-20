import { useEffect, useReducer, useRef } from 'react';
import { wireMethodOf, type PaymentMethodDescriptor } from '@tallyui/core';
import { heldUnitsByLine, initialTenderState, initTenderState, pickedUnitsMinor, splitUnitLines, tenderReducer, unpaidUnitsByLine, type TenderAction, type TenderState, type useSale } from '@tallyui/pos';
import { offeredMethods } from './offered-methods';

type Sale = ReturnType<typeof useSale>;
export type TenderPicker = { picked: Readonly<Record<string, number>>; paid: Readonly<Record<string, number>>;
  unitMinor: (lineId: string, units: number) => number; onPick: (lineId: string, units: number) => void };

/** The offered method `startTender`'s wire method opens on: that id when offered, else the first offered method recording it, else the method itself. */
export function openingMethodId(method: string, methods?: PaymentMethodDescriptor[]): string {
  const offered = offeredMethods(methods);
  if (offered.some(({ id }) => id === method)) return method;
  return offered.find((descriptor) => wireMethodOf(descriptor) === method)?.id ?? method;
}

/** The picks that still stand on the order (unknown lines dropped, each clamped to unpaid) and their money; `null` when none. Never throws. */
export function pickFigure(order: Sale['order'], picked: Readonly<Record<string, number>>): { picks: Record<string, number>; minor: number } | null {
  const lines = splitUnitLines(order), paid = heldUnitsByLine(order.payments);
  const unpaid = unpaidUnitsByLine(lines, paid);
  const picks: Record<string, number> = {};
  for (const [id, n] of Object.entries(picked)) {
    if (!Object.hasOwn(unpaid, id)) continue;
    const units = Math.min(Math.floor(n), unpaid[id]);
    if (units >= 1) picks[id] = units;
  }
  return Object.keys(picks).length ? { picks, minor: pickedUnitsMinor(lines, picks, paid) } : null;
}

/** One tender reducer above both columns, so Cart's `picker` and Tender share this payment's picks. */
export function useTender(sale: Sale, methods?: PaymentMethodDescriptor[]): { state: TenderState; dispatch: (action: TenderAction) => void; picker: TenderPicker | undefined } {
  const { order, stage } = sale;
  const [state, dispatch] = useReducer((state: TenderState, action: TenderAction | { type: 'init'; state: TenderState }) =>
    action.type === 'init' ? action.state : tenderReducer(state, action), undefined, () => stage.kind === 'tender'
    ? initTenderState({ methodId: openingMethodId(stage.method, methods), balanceMinor: order.balanceDueMinor, payments: order.payments }) : initialTenderState);
  const previousStage = useRef(stage.kind);
  useEffect(() => {
    if (previousStage.current === stage.kind) return;
    previousStage.current = stage.kind;
    dispatch({ type: 'init', state: stage.kind === 'tender'
      ? initTenderState({ methodId: openingMethodId(stage.method, methods), balanceMinor: order.balanceDueMinor, payments: order.payments }) : initialTenderState });
  }, [stage, methods, order.balanceDueMinor, order.payments]);
  const lines = splitUnitLines(order), paid = heldUnitsByLine(order.payments);
  const unpaid = unpaidUnitsByLine(lines, paid);
  useEffect(() => {
    if (Object.keys(state.pickedUnits).length === 0) return;
    const picks = state.plan ? undefined : pickFigure(order, state.pickedUnits)?.picks;
    for (const [lineId, n] of Object.entries(state.pickedUnits)) {
      const units = picks?.[lineId] ?? 0;
      if (n !== units) dispatch({ type: 'set-split-units', lineId, units, unpaidUnits: unpaid[lineId] ?? 0 });
    }
  });
  const picker: TenderPicker | undefined = stage.kind === 'tender' && state.plan === null && (state.splitView || Object.keys(state.pickedUnits).length > 0) ? {
    picked: state.pickedUnits, paid,
    unitMinor: (id, n) => {
      if (!Object.hasOwn(unpaid, id)) return 0;
      const units = Math.min(Math.floor(n), unpaid[id]);
      return units >= 1 ? pickedUnitsMinor(lines, { [id]: units }, paid) : 0;
    },
    onPick: (lineId, units) => dispatch({ type: 'set-split-units', lineId, units, unpaidUnits: unpaid[lineId] ?? 0 }),
  } : undefined;
  return { state, dispatch, picker };
}
