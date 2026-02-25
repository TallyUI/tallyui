import * as React from 'react';
import { View, Text } from 'react-native';
import { Slot } from '../slot';
import type {
  RootContext as RootContextType,
  RootProps,
  HeaderProps,
  HeaderRowProps,
  HeaderCellProps,
  BodyProps,
  RowProps,
  CellProps,
  FooterProps,
} from './types';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const RootContext = React.createContext<RootContextType | null>(null);

function useRootContext(): RootContextType {
  const context = React.useContext(RootContext);
  if (!context) {
    throw new Error(
      'Table compound components cannot be rendered outside the Table.Root component'
    );
  }
  return context;
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

const Root = React.forwardRef<View, RootProps<any>>(function Root(
  { asChild, table, ...props },
  ref
) {
  const Component = asChild ? Slot : View;

  return (
    <RootContext.Provider value={{ table }}>
      <Component ref={ref} role="table" {...props} />
    </RootContext.Provider>
  );
});

Root.displayName = 'TableRoot';

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

const Header = React.forwardRef<View, HeaderProps>(function Header(
  { asChild, ...props },
  ref
) {
  const Component = asChild ? Slot : View;

  return <Component ref={ref} role="rowgroup" {...props} />;
});

Header.displayName = 'TableHeader';

// ---------------------------------------------------------------------------
// HeaderRow
// ---------------------------------------------------------------------------

const HeaderRow = React.forwardRef<View, HeaderRowProps>(function HeaderRow(
  { asChild, ...props },
  ref
) {
  const Component = asChild ? Slot : View;

  return <Component ref={ref} role="row" {...props} />;
});

HeaderRow.displayName = 'TableHeaderRow';

// ---------------------------------------------------------------------------
// HeaderCell
// ---------------------------------------------------------------------------

const HeaderCell = React.forwardRef<Text, HeaderCellProps>(function HeaderCell(
  { asChild, ...props },
  ref
) {
  const Component = asChild ? Slot : Text;

  return <Component ref={ref} role="columnheader" {...props} />;
});

HeaderCell.displayName = 'TableHeaderCell';

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

const Body = React.forwardRef<View, BodyProps>(function Body(
  { asChild, ...props },
  ref
) {
  const Component = asChild ? Slot : View;

  return <Component ref={ref} role="rowgroup" {...props} />;
});

Body.displayName = 'TableBody';

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

const Row = React.forwardRef<View, RowProps>(function Row(
  { asChild, ...props },
  ref
) {
  const Component = asChild ? Slot : View;

  return <Component ref={ref} role="row" {...props} />;
});

Row.displayName = 'TableRow';

// ---------------------------------------------------------------------------
// Cell
// ---------------------------------------------------------------------------

const Cell = React.forwardRef<Text, CellProps>(function Cell(
  { asChild, ...props },
  ref
) {
  const Component = asChild ? Slot : Text;

  return <Component ref={ref} role="cell" {...props} />;
});

Cell.displayName = 'TableCell';

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

const Footer = React.forwardRef<View, FooterProps>(function Footer(
  { asChild, ...props },
  ref
) {
  const Component = asChild ? Slot : View;

  return <Component ref={ref} role="rowgroup" {...props} />;
});

Footer.displayName = 'TableFooter';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { Root, Header, HeaderRow, HeaderCell, Body, Row, Cell, Footer, useRootContext };
