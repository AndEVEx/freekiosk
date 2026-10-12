/**
 * #268: the "allow the USB debugging prompt in Lock Mode" setting is opt-in (off by default),
 * survives the config export/import round trip, and is reset by clearAll.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageService } from '../src/utils/storage';

describe('allow USB debugging prompt in Lock Mode (#268)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('is off by default', async () => {
    expect(await StorageService.getAllowUsbDebugDialog()).toBe(false);
  });

  it('is saved under the key the native side reads', async () => {
    await StorageService.saveAllowUsbDebugDialog(true);

    expect(await AsyncStorage.getItem('@kiosk_allow_usb_debug_dialog')).toBe('true');
    expect(await StorageService.getAllowUsbDebugDialog()).toBe(true);
  });

  it('goes through the config export and import', async () => {
    await StorageService.saveAllowUsbDebugDialog(true);
    const exported: any = await StorageService.exportConfig();
    expect(exported.security.allowUsbDebugDialog).toBe(true);

    await AsyncStorage.clear();
    expect(await StorageService.getAllowUsbDebugDialog()).toBe(false);

    await StorageService.importConfig(exported);
    expect(await StorageService.getAllowUsbDebugDialog()).toBe(true);
  });

  it('is not imported when an older export does not carry it', async () => {
    await StorageService.saveAllowUsbDebugDialog(true);
    const exported: any = await StorageService.exportConfig();
    delete exported.security.allowUsbDebugDialog;

    await StorageService.importConfig(exported);

    expect(await StorageService.getAllowUsbDebugDialog()).toBe(true);
  });

  it('is cleared by clearAll', async () => {
    await StorageService.saveAllowUsbDebugDialog(true);

    await StorageService.clearAll();

    expect(await StorageService.getAllowUsbDebugDialog()).toBe(false);
  });
});
