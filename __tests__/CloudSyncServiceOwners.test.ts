/**
 * The heartbeat loop belongs to the screens that use it: the kiosk screen can be mounted twice
 * in a row (an ADB config restarts the activity) and the first one's cleanup runs after the
 * second one's start. The loop must only stop with the last screen.
 */
export {};

const { NativeModules } = require('react-native');
NativeModules.HttpServerModule = {
  executeNativeCommand: jest.fn(),
  captureScreenshotBase64: jest.fn(),
};

const { CloudSyncService } = require('../src/utils/CloudSyncService');

describe('CloudSyncService owners', () => {
  let stop: jest.SpyInstance;

  beforeEach(() => {
    stop = jest.spyOn(CloudSyncService, 'stop').mockImplementation(() => {});
  });

  afterEach(() => {
    stop.mockRestore();
    // Leave the singleton as it was found
    while ((CloudSyncService as any).owners > 0) (CloudSyncService as any).owners -= 1;
  });

  it('does not stop the loop while another screen still relies on it', () => {
    CloudSyncService.retain(); // first mount
    CloudSyncService.retain(); // second mount, before the first one is cleaned up
    CloudSyncService.release(); // cleanup of the first
    expect(stop).not.toHaveBeenCalled();
  });

  it('stops the loop with the last screen', () => {
    CloudSyncService.retain();
    CloudSyncService.retain();
    CloudSyncService.release();
    CloudSyncService.release();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('still stops when a screen is cleaned up before the next one mounts', () => {
    CloudSyncService.retain();
    CloudSyncService.release();
    expect(stop).toHaveBeenCalledTimes(1);
    CloudSyncService.retain();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('never goes below zero', () => {
    CloudSyncService.release();
    CloudSyncService.release();
    CloudSyncService.retain();
    CloudSyncService.release();
    expect(stop).toHaveBeenCalledTimes(3);
  });
});
