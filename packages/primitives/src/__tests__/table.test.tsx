import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { View } from 'react-native';
import {
  useReactTable,
  getCoreRowModel,
  createColumnHelper,
  flexRender,
} from '@tanstack/react-table';
import * as Table from '../table';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface Person {
  name: string;
  age: number;
}

const testData: Person[] = [
  { name: 'Alice', age: 30 },
  { name: 'Bob', age: 25 },
];

const columnHelper = createColumnHelper<Person>();

const testColumns = [
  columnHelper.accessor('name', { header: 'Name', cell: (info) => info.getValue() }),
  columnHelper.accessor('age', { header: 'Age', cell: (info) => info.getValue() }),
];

/**
 * A test wrapper component that creates a TanStack table instance and renders
 * it using the Table primitive compound components.
 */
function TestTable({ testID = 'table' }: { testID?: string }) {
  const table = useReactTable({
    data: testData,
    columns: testColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Table.Root table={table} testID={testID}>
      <Table.Header testID="header">
        {table.getHeaderGroups().map((hg) => (
          <Table.HeaderRow key={hg.id} testID={`header-row-${hg.id}`}>
            {hg.headers.map((h) => (
              <Table.HeaderCell key={h.id} testID={`header-cell-${h.id}`}>
                {flexRender(h.column.columnDef.header, h.getContext())}
              </Table.HeaderCell>
            ))}
          </Table.HeaderRow>
        ))}
      </Table.Header>
      <Table.Body testID="body">
        {table.getRowModel().rows.map((row) => (
          <Table.Row key={row.id} testID={`row-${row.id}`}>
            {row.getVisibleCells().map((cell) => (
              <Table.Cell key={cell.id} testID={`cell-${cell.id}`}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </Table.Cell>
            ))}
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Table', () => {
  it('Root has role="table"', () => {
    render(<TestTable />);
    expect(screen.getByTestId('table').getAttribute('role')).toBe('table');
  });

  it('Header has role="rowgroup"', () => {
    render(<TestTable />);
    expect(screen.getByTestId('header').getAttribute('role')).toBe('rowgroup');
  });

  it('HeaderRow has role="row"', () => {
    render(<TestTable />);
    expect(screen.getByTestId('header-row-0').getAttribute('role')).toBe('row');
  });

  it('HeaderCell has role="columnheader"', () => {
    render(<TestTable />);
    expect(screen.getByTestId('header-cell-name').getAttribute('role')).toBe('columnheader');
    expect(screen.getByTestId('header-cell-age').getAttribute('role')).toBe('columnheader');
  });

  it('Body has role="rowgroup"', () => {
    render(<TestTable />);
    expect(screen.getByTestId('body').getAttribute('role')).toBe('rowgroup');
  });

  it('Row has role="row"', () => {
    render(<TestTable />);
    expect(screen.getByTestId('row-0').getAttribute('role')).toBe('row');
    expect(screen.getByTestId('row-1').getAttribute('role')).toBe('row');
  });

  it('Cell has role="cell"', () => {
    render(<TestTable />);
    expect(screen.getByTestId('cell-0_name').getAttribute('role')).toBe('cell');
    expect(screen.getByTestId('cell-0_age').getAttribute('role')).toBe('cell');
  });

  it('renders data from TanStack table', () => {
    render(<TestTable />);
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Age')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('30')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('25')).toBeTruthy();
  });

  it('context provides the table instance', () => {
    function Consumer() {
      const ctx = Table.useRootContext();
      const rowCount = ctx.table.getRowModel().rows.length;
      return <View testID="consumer" accessibilityLabel={String(rowCount)} />;
    }

    function ContextTestTable() {
      const table = useReactTable({
        data: testData,
        columns: testColumns,
        getCoreRowModel: getCoreRowModel(),
      });

      return (
        <Table.Root table={table}>
          <Consumer />
        </Table.Root>
      );
    }

    render(<ContextTestTable />);
    const consumer = screen.getByTestId('consumer');
    expect(
      consumer.getAttribute('aria-label') || consumer.getAttribute('accessibilityLabel')
    ).toBe('2');
  });

  it('asChild works on Root', () => {
    function AsChildTestTable() {
      const table = useReactTable({
        data: testData,
        columns: testColumns,
        getCoreRowModel: getCoreRowModel(),
      });

      return (
        <Table.Root asChild table={table}>
          <View testID="custom-root" />
        </Table.Root>
      );
    }

    render(<AsChildTestTable />);
    const customRoot = screen.getByTestId('custom-root');
    expect(customRoot.getAttribute('role')).toBe('table');
  });
});
