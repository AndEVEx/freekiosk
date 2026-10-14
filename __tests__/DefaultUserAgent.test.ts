/**
 * The user agent a page sees when none is set. A phone one on a tablet or a phone, as it always
 * was; on a TV without the "Mobile" token, so sites serve a layout made for a wide screen.
 */
// A module of its own so the helpers do not collide with another test file's
export {};

const { NativeModules, Platform } = require('react-native');
NativeModules.HttpServerModule = {
  executeNativeCommand: jest.fn(),
  captureScreenshotBase64: jest.fn(),
};

const { defaultUserAgent } = require('../src/components/WebViewComponent');

describe('defaultUserAgent', () => {
  const original = Platform.isTV;
  const setTv = (value: boolean) => {
    Object.defineProperty(Platform, 'isTV', { configurable: true, get: () => value });
  };

  afterEach(() => {
    Object.defineProperty(Platform, 'isTV', { configurable: true, get: () => original });
  });

  it('is the mobile Chrome it always was on a tablet or a phone', () => {
    setTv(false);
    expect(defaultUserAgent()).toBe(
      'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    );
  });

  it('drops only the Mobile token on a TV', () => {
    setTv(true);
    expect(defaultUserAgent()).toBe(
      'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    );
    expect(defaultUserAgent()).not.toContain('Mobile');
  });
});
