import type { Table as TanStackTable } from '@tanstack/react-table';
import type { SlottableViewProps, SlottableTextProps } from '../types';

interface RootProps<TData> extends SlottableViewProps {
  table: TanStackTable<TData>;
}

interface HeaderProps extends SlottableViewProps {}
interface HeaderRowProps extends SlottableViewProps {}
interface HeaderCellProps extends SlottableTextProps {}
interface BodyProps extends SlottableViewProps {}
interface RowProps extends SlottableViewProps {}
interface CellProps extends SlottableTextProps {}
interface FooterProps extends SlottableViewProps {}

interface RootContext<TData = unknown> {
  table: TanStackTable<TData>;
}

export type {
  RootProps,
  HeaderProps,
  HeaderRowProps,
  HeaderCellProps,
  BodyProps,
  RowProps,
  CellProps,
  FooterProps,
  RootContext,
};
