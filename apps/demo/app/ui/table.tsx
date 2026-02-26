import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import {
  Table, TableHeader, TableBody, TableFooter,
  TableRow, TableHead, TableCell,
  Text, VStack,
} from '@tallyui/components';

const invoices = [
  { id: 'INV-001', client: 'Acme Corp', status: 'Paid', amount: 250.0 },
  { id: 'INV-002', client: 'Globex Inc', status: 'Pending', amount: 150.0 },
  { id: 'INV-003', client: 'Initech', status: 'Paid', amount: 350.0 },
  { id: 'INV-004', client: 'Umbrella Co', status: 'Overdue', amount: 420.0 },
  { id: 'INV-005', client: 'Stark Industries', status: 'Paid', amount: 180.0 },
];

const products = [
  { sku: 'WDG-001', name: 'Widget A', qty: 120, price: 9.99 },
  { sku: 'WDG-002', name: 'Widget B', qty: 85, price: 14.99 },
  { sku: 'WDG-003', name: 'Gadget Pro', qty: 42, price: 29.99 },
  { sku: 'WDG-004', name: 'Gizmo Lite', qty: 200, price: 4.99 },
];

export default function TableScreen() {
  const invoiceTotal = invoices.reduce((sum, inv) => sum + inv.amount, 0);

  return (
    <>
      <Stack.Screen options={{ title: 'Table' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Invoice Table</Text>
          <Text className="text-sm text-muted-foreground">
            A data table with header, body, and footer sections.
          </Text>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><Text>Invoice</Text></TableHead>
                <TableHead><Text>Client</Text></TableHead>
                <TableHead><Text>Status</Text></TableHead>
                <TableHead><Text>Amount</Text></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell>
                    <Text className="font-medium">{inv.id}</Text>
                  </TableCell>
                  <TableCell>
                    <Text>{inv.client}</Text>
                  </TableCell>
                  <TableCell>
                    <Text>{inv.status}</Text>
                  </TableCell>
                  <TableCell>
                    <Text>${inv.amount.toFixed(2)}</Text>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>
                  <Text className="font-bold">Total</Text>
                </TableCell>
                <TableCell />
                <TableCell />
                <TableCell>
                  <Text className="font-bold">${invoiceTotal.toFixed(2)}</Text>
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Product Inventory</Text>
          <Text className="text-sm text-muted-foreground">
            Custom column widths and striped rows.
          </Text>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="flex-none w-24"><Text>SKU</Text></TableHead>
                <TableHead className="flex-[2]"><Text>Product</Text></TableHead>
                <TableHead className="flex-none w-16"><Text>Qty</Text></TableHead>
                <TableHead className="flex-none w-20"><Text>Price</Text></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p, i) => (
                <TableRow key={p.sku} className={i % 2 === 1 ? 'bg-muted/30' : ''}>
                  <TableCell className="flex-none w-24">
                    <Text className="font-mono text-xs">{p.sku}</Text>
                  </TableCell>
                  <TableCell className="flex-[2]">
                    <Text>{p.name}</Text>
                  </TableCell>
                  <TableCell className="flex-none w-16">
                    <Text>{p.qty}</Text>
                  </TableCell>
                  <TableCell className="flex-none w-20">
                    <Text>${p.price.toFixed(2)}</Text>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Minimal Table</Text>
          <Text className="text-sm text-muted-foreground">
            A simple two-column key/value layout.
          </Text>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell><Text className="font-medium text-muted-foreground">Name</Text></TableCell>
                <TableCell><Text>TallyUI</Text></TableCell>
              </TableRow>
              <TableRow>
                <TableCell><Text className="font-medium text-muted-foreground">Version</Text></TableCell>
                <TableCell><Text>1.0.0</Text></TableCell>
              </TableRow>
              <TableRow>
                <TableCell><Text className="font-medium text-muted-foreground">License</Text></TableCell>
                <TableCell><Text>MIT</Text></TableCell>
              </TableRow>
              <TableRow>
                <TableCell><Text className="font-medium text-muted-foreground">Platform</Text></TableCell>
                <TableCell><Text>Web + Native</Text></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </VStack>
      </ScrollView>
    </>
  );
}
