import { describe, expectTypeOf, it } from 'vitest';
import type { WebBluetoothDevice } from './bluetooth-sink';
import type { WebUsbDevice } from './usb-sink';

// These are written from the WebUSB and Web Bluetooth IDL, because TypeScript's DOM lib has neither. FrozenArray is readonly.
// The `Missing` parameter covers the IDL's `null` and DefinitelyTyped's `undefined`.
type USBDirection = 'in' | 'out';
declare class USBEndpoint { readonly endpointNumber: number; readonly direction: USBDirection; readonly type: 'bulk' | 'interrupt' | 'isochronous'; readonly packetSize: number; }
declare class USBAlternateInterface { readonly alternateSetting: number; readonly interfaceClass: number; readonly interfaceSubclass: number; readonly interfaceProtocol: number; readonly interfaceName?: string | null; readonly endpoints: readonly USBEndpoint[]; }
declare class USBInterface { readonly interfaceNumber: number; readonly alternate: USBAlternateInterface; readonly alternates: readonly USBAlternateInterface[]; readonly claimed: boolean; }
declare class USBConfiguration { readonly configurationValue: number; readonly interfaces: readonly USBInterface[]; }
declare class USBOutTransferResult { readonly bytesWritten: number; readonly status: 'ok' | 'stall' | 'babble'; }
declare class USBDevice<Missing extends null | undefined> {
  readonly productName: string | Missing;
  readonly configuration: USBConfiguration | Missing;
  readonly opened: boolean;
  open(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  clearHalt(direction: USBDirection, endpointNumber: number): Promise<void>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>;
}

declare class BluetoothCharacteristicProperties {
  readonly broadcast: boolean; readonly read: boolean; readonly writeWithoutResponse: boolean; readonly write: boolean;
  readonly notify: boolean; readonly indicate: boolean; readonly authenticatedSignedWrites: boolean;
  readonly reliableWrite: boolean; readonly writableAuxiliaries: boolean;
}
declare class BluetoothRemoteGATTCharacteristic extends EventTarget {
  readonly service: BluetoothRemoteGATTService; readonly uuid: string;
  readonly properties: BluetoothCharacteristicProperties; readonly value?: DataView;
  readValue(): Promise<DataView>;
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithResponse(value: BufferSource): Promise<void>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
}
declare class BluetoothRemoteGATTService extends EventTarget {
  readonly uuid: string; readonly isPrimary: boolean;
  getCharacteristic(characteristic: number | string): Promise<BluetoothRemoteGATTCharacteristic>;
  getCharacteristics(characteristic?: number | string): Promise<BluetoothRemoteGATTCharacteristic[]>;
}
declare class BluetoothRemoteGATTServer {
  readonly connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: number | string): Promise<BluetoothRemoteGATTService>;
  getPrimaryServices(service?: number | string): Promise<BluetoothRemoteGATTService[]>;
}
declare class BluetoothDevice<Missing extends null | undefined> extends EventTarget {
  readonly id: string;
  readonly name: string | Missing;
  readonly gatt: BluetoothRemoteGATTServer | Missing;
}

type SinkGatt = NonNullable<WebBluetoothDevice['gatt']>;
type SinkService = Awaited<ReturnType<SinkGatt['getPrimaryService']>>;
type SinkCharacteristic = Awaited<ReturnType<SinkService['getCharacteristic']>>;

describe('ESC/POS sink device types', () => {
  it('a WebUSB device with null fields fits WebUsbDevice', () => expectTypeOf<USBDevice<null>>().toExtend<WebUsbDevice>());
  it('a WebUSB device with undefined fields fits WebUsbDevice', () => expectTypeOf<USBDevice<undefined>>().toExtend<WebUsbDevice>());
  it('a Web Bluetooth device with null fields fits WebBluetoothDevice', () => expectTypeOf<BluetoothDevice<null>>().toExtend<WebBluetoothDevice>());
  it('a Web Bluetooth device with undefined fields fits WebBluetoothDevice', () => expectTypeOf<BluetoothDevice<undefined>>().toExtend<WebBluetoothDevice>());
});

describe('ESC/POS sink calls fit the real device methods', () => {
  it('open', () => expectTypeOf<Parameters<WebUsbDevice['open']>>().toExtend<Parameters<USBDevice<null>['open']>>());
  it('selectConfiguration', () => expectTypeOf<Parameters<WebUsbDevice['selectConfiguration']>>().toExtend<Parameters<USBDevice<null>['selectConfiguration']>>());
  it('claimInterface', () => expectTypeOf<Parameters<WebUsbDevice['claimInterface']>>().toExtend<Parameters<USBDevice<null>['claimInterface']>>());
  it('clearHalt', () => expectTypeOf<Parameters<WebUsbDevice['clearHalt']>>().toExtend<Parameters<USBDevice<null>['clearHalt']>>());
  it('transferOut', () => expectTypeOf<Parameters<WebUsbDevice['transferOut']>>().toExtend<Parameters<USBDevice<null>['transferOut']>>());
  it('connect', () => expectTypeOf<Parameters<SinkGatt['connect']>>().toExtend<Parameters<BluetoothRemoteGATTServer['connect']>>());
  it('getPrimaryService', () => expectTypeOf<Parameters<SinkGatt['getPrimaryService']>>().toExtend<Parameters<BluetoothRemoteGATTServer['getPrimaryService']>>());
  it('getCharacteristic', () => expectTypeOf<Parameters<SinkService['getCharacteristic']>>().toExtend<Parameters<BluetoothRemoteGATTService['getCharacteristic']>>());
  it('writeValueWithResponse', () => expectTypeOf<Parameters<SinkCharacteristic['writeValueWithResponse']>>().toExtend<Parameters<BluetoothRemoteGATTCharacteristic['writeValueWithResponse']>>());
  it('writeValueWithoutResponse', () => expectTypeOf<Parameters<SinkCharacteristic['writeValueWithoutResponse']>>().toExtend<Parameters<BluetoothRemoteGATTCharacteristic['writeValueWithoutResponse']>>());
});
