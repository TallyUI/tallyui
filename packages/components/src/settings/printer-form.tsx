import { useState, type JSX } from 'react';
import { View } from 'react-native';
import type { PrinterProfile } from '@tallyui/pos';
import { cn } from '@tallyui/theme';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Loader } from '../ui/loader';
import { Switch } from '../ui/switch';
import { Text } from '../ui/text';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';

/** What Save and Test Print hand over; the app assigns or keeps the id. */
export type PrinterFormDraft = Omit<PrinterProfile, 'id'>;

export interface PrinterFormProps {
  /** Given, edits this printer; absent, adds a new one. */
  printer?: PrinterProfile;
  /** Returns an inline refusal, or null once saved. A promise disables Save while pending. */
  onSave: (draft: PrinterFormDraft) => string | null | Promise<string | null>;
  onCancel: () => void;
  /** Given, a Test Print button passes the current draft. */
  onTest?: (draft: PrinterFormDraft) => void;
  className?: string;
}

export function PrinterForm({ printer, onSave, onCancel, onTest, className }: PrinterFormProps): JSX.Element {
  const [name, setName] = useState(printer?.name ?? '');
  const [connectionType, setConnectionType] = useState<PrinterProfile['connectionType']>(printer?.connectionType ?? 'network');
  const [vendor, setVendor] = useState(printer?.vendor ?? 'generic');
  const [address, setAddress] = useState(printer?.address ?? '');
  const [port, setPort] = useState(String(printer?.port ?? 9100));
  const [language, setLanguage] = useState(printer?.language ?? 'esc-pos');
  const [columns, setColumns] = useState(String(printer?.columns ?? 42));
  const [autoCut, setAutoCut] = useState(printer?.autoCut ?? true);
  const [autoOpenDrawer, setAutoOpenDrawer] = useState(printer?.autoOpenDrawer ?? false);
  const [drawerConnector, setDrawerConnector] = useState(printer?.drawerConnector ?? 'pin2');
  const [isDefault, setIsDefault] = useState(printer?.isDefault ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const draft = (): PrinterFormDraft | null => {
    const failure = !name.trim() ? 'Name is required'
      : connectionType === 'network' && !address.trim() ? 'Address is required'
      : connectionType === 'network' && (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535)
        ? 'Port must be 1 to 65535'
        : !Number.isInteger(Number(columns)) || Number(columns) < 1 ? 'Characters per line must be 1 or more' : null;
    setError(failure);
    if (failure) return null;
    return {
      name: name.trim(), connectionType, vendor, language, columns: Number(columns),
      autoCut, autoOpenDrawer, drawerConnector, isDefault,
      ...(connectionType !== 'system' ? { address: address.trim() } : {}),
      ...(connectionType === 'network' ? { port: Number(port) } : {}),
      ...(printer?.codePage !== undefined ? { codePage: printer.codePage } : {}),
      ...(printer?.isBuiltIn !== undefined ? { isBuiltIn: printer.isBuiltIn } : {}),
    };
  };
  const save = async () => {
    const value = draft();
    if (!value) return;
    const result = onSave(value);
    if (result instanceof Promise) {
      setSaving(true);
      try { setError(await result); }
      finally { setSaving(false); }
    } else setError(result);
  };

  return (
    <View testID="printer-form" className={cn('gap-3', className)}>
      <View className="gap-1">
        <Text>Name</Text>
        <Input><Input.Field testID="printer-form-name" accessibilityLabel="Name" value={name} onChangeText={setName} /></Input>
      </View>
      <View className="gap-1">
        <Text>Connection</Text>
        <ToggleGroup type="single" variant="outline" value={connectionType} aria-label="Connection" className="justify-start"
          onValueChange={(value) => { if (value) setConnectionType(value as PrinterProfile['connectionType']); }}>
          <ToggleGroupItem value="network" testID="printer-form-connection-network"><Text>Network</Text></ToggleGroupItem>
          <ToggleGroupItem value="system" testID="printer-form-connection-system"><Text>Print Dialog</Text></ToggleGroupItem>
          {(printer?.connectionType === 'bluetooth' || printer?.connectionType === 'usb') && (
            <ToggleGroupItem value={printer.connectionType} testID={`printer-form-connection-${printer.connectionType}`}>
              <Text>{printer.connectionType === 'bluetooth' ? 'Bluetooth' : 'USB'}</Text>
            </ToggleGroupItem>
          )}
        </ToggleGroup>
      </View>
      <View className="gap-1">
        <Text>Vendor</Text>
        <ToggleGroup type="single" variant="outline" value={vendor} aria-label="Vendor" className="justify-start"
          onValueChange={(value) => { if (value) setVendor(value as typeof vendor); }}>
          {([['epson', 'Epson'], ['star', 'Star'], ['generic', 'Generic']] as const).map(([value, label]) => (
            <ToggleGroupItem key={value} value={value} testID={`printer-form-vendor-${value}`}><Text>{label}</Text></ToggleGroupItem>
          ))}
        </ToggleGroup>
      </View>
      {connectionType !== 'system' && (
        <View className="gap-1">
          <Text>Address</Text>
          <Input><Input.Field testID="printer-form-address" accessibilityLabel="Address" value={address} onChangeText={setAddress} /></Input>
        </View>
      )}
      {connectionType === 'network' && (
        <View className="gap-1">
          <Text>Port</Text>
          <Input><Input.Field testID="printer-form-port" accessibilityLabel="Port" keyboardType="number-pad"
            value={port} onChangeText={(text) => setPort(text.replace(/\D/g, ''))} /></Input>
        </View>
      )}
      <View className="gap-1">
        <Text>Printer Language</Text>
        <ToggleGroup type="single" variant="outline" value={language} aria-label="Printer Language" className="justify-start"
          onValueChange={(value) => { if (value) setLanguage(value as typeof language); }}>
          {([['esc-pos', 'ESC/POS'], ['star-prnt', 'StarPRNT'], ['star-line', 'Star Line']] as const).map(([value, label]) => (
            <ToggleGroupItem key={value} value={value} testID={`printer-form-language-${value}`}><Text>{label}</Text></ToggleGroupItem>
          ))}
        </ToggleGroup>
      </View>
      <View className="gap-1">
        <Text>Characters per Line</Text>
        <Input><Input.Field testID="printer-form-columns" accessibilityLabel="Characters per Line" keyboardType="number-pad"
          value={columns} onChangeText={(text) => setColumns(text.replace(/\D/g, ''))} /></Input>
      </View>
      <View className="flex-row items-center justify-between">
        <Text>Auto Cut</Text>
        <Switch testID="printer-form-auto-cut" accessibilityLabel="Auto Cut" checked={autoCut} onCheckedChange={setAutoCut} />
      </View>
      <View className="flex-row items-center justify-between">
        <Text>Open Cash Drawer</Text>
        <Switch testID="printer-form-open-drawer" accessibilityLabel="Open Cash Drawer" checked={autoOpenDrawer} onCheckedChange={setAutoOpenDrawer} />
      </View>
      {autoOpenDrawer && (
        <View className="gap-1">
          <Text>Drawer Connector</Text>
          <ToggleGroup type="single" variant="outline" value={drawerConnector} aria-label="Drawer Connector" className="justify-start"
            onValueChange={(value) => { if (value) setDrawerConnector(value as typeof drawerConnector); }}>
            <ToggleGroupItem value="pin2" testID="printer-form-drawer-pin2"><Text>Pin 2</Text></ToggleGroupItem>
            <ToggleGroupItem value="pin5" testID="printer-form-drawer-pin5"><Text>Pin 5</Text></ToggleGroupItem>
          </ToggleGroup>
        </View>
      )}
      <View className="flex-row items-center justify-between">
        <Text>Set as Default</Text>
        <Switch testID="printer-form-default" accessibilityLabel="Set as Default" checked={isDefault} onCheckedChange={setIsDefault} />
      </View>
      {error !== null && <Text role="alert" testID="printer-form-error" className="text-destructive">{error}</Text>}
      <View className="flex-row justify-end gap-2">
        <Button variant="outline" testID="printer-form-cancel" onPress={onCancel}><Text>Cancel</Text></Button>
        {onTest && (
          <Button variant="outline" testID="printer-form-test" onPress={() => { const value = draft(); if (value) onTest(value); }}>
            <Text>Test Print</Text>
          </Button>
        )}
        <Button testID="printer-form-save" onPress={save} disabled={saving} aria-busy={saving}>
          {saving && <Loader size="sm" />}
          <Text>Save</Text>
        </Button>
      </View>
    </View>
  );
}
