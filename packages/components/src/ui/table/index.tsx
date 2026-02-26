import * as React from 'react';
import { View, Text, Pressable, type ViewProps, type TextProps } from 'react-native';
import { TextClassContext } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';

const Table = React.forwardRef<View, ViewProps>(function Table({ className, ...props }, ref) {
  return <View ref={ref} role="table" className={cn('w-full', className)} {...props} />;
});
Table.displayName = 'Table';

const TableHeader = React.forwardRef<View, ViewProps>(function TableHeader({ className, ...props }, ref) {
  return <View ref={ref} role="rowgroup" className={cn('border-b border-border', className)} {...props} />;
});
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<View, ViewProps>(function TableBody({ className, ...props }, ref) {
  return <View ref={ref} role="rowgroup" className={cn('[&>*:last-child]:border-0', className)} {...props} />;
});
TableBody.displayName = 'TableBody';

const TableFooter = React.forwardRef<View, ViewProps>(function TableFooter({ className, ...props }, ref) {
  return <View ref={ref} role="rowgroup" className={cn('border-t border-border bg-muted/50 font-medium', className)} {...props} />;
});
TableFooter.displayName = 'TableFooter';

const TableRow = React.forwardRef<View, ViewProps>(function TableRow({ className, ...props }, ref) {
  return (
    <View
      ref={ref}
      role="row"
      className={cn('flex flex-row border-b border-border web:transition-colors web:hover:bg-muted/50', className)}
      {...props}
    />
  );
});
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<View, ViewProps>(function TableHead({ className, ...props }, ref) {
  return (
    <TextClassContext.Provider value="text-muted-foreground text-xs uppercase text-left font-medium">
      <View
        ref={ref}
        role="columnheader"
        className={cn('flex-1 px-4 py-3 text-left font-medium text-muted-foreground', className)}
        {...props}
      />
    </TextClassContext.Provider>
  );
});
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<View, ViewProps>(function TableCell({ className, ...props }, ref) {
  return (
    <View ref={ref} role="cell" className={cn('flex-1 px-4 py-4', className)} {...props} />
  );
});
TableCell.displayName = 'TableCell';

export { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell };
