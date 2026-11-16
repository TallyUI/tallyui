import { Component, createContext, Suspense, useContext, useMemo, useSyncExternalStore } from 'react';
import type { JSX, ReactNode } from 'react';
import type { Capability, ExtensionHost, ExtensionTargetProps, ReadView, TargetBlockProps, TargetEntry, TargetId, TargetSources } from './types';
const HostContext = createContext<ExtensionHost | null>(null);
const blockProps: { [T in TargetId]: (sources: TargetSources[T], caps: ReadonlySet<Capability>) => TargetBlockProps[T] } = {
  'pos.cart.after-subtotal': ({ sale }, caps) => ({
    view: caps.has('sale.read') ? { sale: sale.view } : {},
    api: caps.has('sale.coupons') ? { sale: sale.actions } : {},
  }),
};
export function ExtensionHostProvider({ host, children }: { host: ExtensionHost; children?: ReactNode }): JSX.Element {
  return <HostContext.Provider value={host}>{children}</HostContext.Provider>;
}
export function useExtensionHost(): ExtensionHost | null { return useContext(HostContext); }
export function useReadView<T>(view: ReadView<T>): T { return useSyncExternalStore(view.subscribe, () => view.value, () => view.value); }
class EntryBoundary extends Component<{ extensionId: string; target: TargetId; log: (message: string) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  private logged = false;
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) {
    if (this.logged) return;
    this.logged = true;
    this.props.log(`[@tallyui/extensions] ${this.props.extensionId} failed in ${this.props.target}: ${String(error)}`);
  }
  render() { return this.state.failed ? null : this.props.children; }
}
function Entry<T extends TargetId>({ id, sale, entry }: ExtensionTargetProps<T> & { entry: TargetEntry<T> }) {
  const props = useMemo(() => blockProps[id]({ sale }, entry.capabilities), [id, sale, entry]);
  const log = (entry as TargetEntry<T> & { log: (message: string) => void }).log;
  return <EntryBoundary extensionId={entry.extensionId} target={id} log={log}>
    <Suspense fallback={null}><entry.Block {...props} /></Suspense>
  </EntryBoundary>;
}
export function ExtensionTarget<T extends TargetId>(props: ExtensionTargetProps<T>): JSX.Element | null {
  const host = useExtensionHost(), entries = host?.entries(props.id);
  if (!entries?.length) return null;
  return <>{entries.map(entry => <Entry key={entry.extensionId} {...props} entry={entry} />)}</>;
}
