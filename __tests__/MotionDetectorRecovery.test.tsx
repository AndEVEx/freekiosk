/**
 * Always-on motion detection when another app takes the camera (#301).
 *
 * CameraX closes the session and never reopens it, so the detector has to cycle `isActive`
 * itself, and listen to `onStarted` (a cycle does not call `onInitialized` again).
 *   - nothing changes while the camera works
 *   - a lost camera (onError, or onStopped while it should be open) is reopened
 *   - only in the foreground, with growing delays, until the camera is back
 *   - turning detection off, or unmounting, cancels the retries
 */
// A module of its own so the helpers do not collide with another test file's
export {};

const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { AppState } = require('react-native');

let mockCameraProps: any = null;
const mockActiveHistory: boolean[] = [];

jest.mock('react-native-vision-camera', () => {
  const R = require('react');
  const { View } = require('react-native');
  // the real hook returns the same object while the device does not change
  const device = { supportsLowLightBoost: false };
  return {
    Camera: R.forwardRef((props: any, ref: any) => {
      mockCameraProps = props;
      mockActiveHistory.push(props.isActive);
      return R.createElement(View, { ref });
    }),
    useCameraDevice: () => device,
    useCameraPermission: () => ({ hasPermission: true }),
  };
});

const MotionDetector = require('../src/components/MotionDetector').default;

let appStateHandler: ((state: string) => void) | null = null;
const removeListener = jest.fn();

const setAppState = (state: string) => { (AppState as any).currentState = state; };

const statuses: string[] = [];
let renderer: any;

function mount(enabled = true) {
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(MotionDetector, {
        enabled,
        onMotionDetected: jest.fn(),
        sensitivity: 'medium',
        onStatusChange: (s: string) => statuses.push(s),
      }),
    );
  });
}

function setEnabled(enabled: boolean) {
  act(() => {
    renderer.update(
      React.createElement(MotionDetector, {
        enabled,
        onMotionDetected: jest.fn(),
        sensitivity: 'medium',
        onStatusChange: (s: string) => statuses.push(s),
      }),
    );
  });
}

const isActive = () => mockCameraProps?.isActive;
const advance = (ms: number) => act(() => { jest.advanceTimersByTime(ms); });

// The camera opened for the first time
function openCamera() {
  act(() => { mockCameraProps.onInitialized(); });
  act(() => { mockCameraProps.onStarted(); });
}

// One recovery attempt: close, then reopen
function expectCycle(waitMs: number) {
  advance(waitMs - 1);
  expect(isActive()).toBe(true);
  advance(1);
  expect(isActive()).toBe(false);
  advance(500);
  expect(isActive()).toBe(true);
}

beforeEach(() => {
  jest.useFakeTimers();
  mockCameraProps = null;
  mockActiveHistory.length = 0;
  statuses.length = 0;
  setAppState('active');
  appStateHandler = null;
  removeListener.mockClear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, handler: any) => {
    appStateHandler = handler;
    return { remove: removeListener };
  }) as any);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => { renderer?.unmount(); });
  renderer = null;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('MotionDetector camera recovery', () => {
  it('leaves a working camera alone', () => {
    mount();
    openCamera();
    act(() => { mockCameraProps.onStarted(); }); // a second start with nothing lost
    const rendersBefore = mockActiveHistory.length;
    advance(120000);
    expect(isActive()).toBe(true);
    expect(mockActiveHistory.slice(mockActiveHistory.indexOf(true)).every(a => a === true)).toBe(true);
    expect(mockActiveHistory.length).toBe(rendersBefore); // not even a re-render
    expect(statuses).toEqual(['active']);
  });

  it('reopens the camera after an error and resumes on onStarted', () => {
    mount();
    openCamera();
    act(() => { mockCameraProps.onError(new Error('device/camera-disconnected')); });
    expect(statuses).toEqual(['active', 'error']);

    expectCycle(2000);
    // reopening does not call onInitialized again: onStarted is what brings it back
    act(() => { mockCameraProps.onStarted(); });
    expect(statuses).toEqual(['active', 'error', 'active']);

    advance(120000); // recovered: no more cycles
    expect(isActive()).toBe(true);
  });

  it('treats a stop while the camera should be open as a loss', () => {
    mount();
    openCamera();
    act(() => { mockCameraProps.onStopped(); });
    expect(statuses).toEqual(['active', 'error']);
    expectCycle(2000);
    act(() => { mockCameraProps.onStarted(); });
    expect(statuses[statuses.length - 1]).toBe('active');
  });

  it('keeps trying with growing delays until the camera is back', () => {
    mount();
    openCamera();
    act(() => { mockCameraProps.onError(new Error('in use')); });
    expectCycle(2000);
    expectCycle(5000);
    expectCycle(15000);
    expectCycle(30000);
    expectCycle(60000);
    expectCycle(60000); // the last delay repeats
    act(() => { mockCameraProps.onStarted(); });
    advance(120000);
    expect(isActive()).toBe(true);
  });

  it('does not touch the camera in the background, and retries as soon as it is back', () => {
    mount();
    openCamera();
    setAppState('background');
    act(() => { appStateHandler!('background'); });
    act(() => { mockCameraProps.onStopped(); }); // another app took it
    advance(120000);
    expect(isActive()).toBe(true); // no attempt from the background

    setAppState('active');
    act(() => { appStateHandler!('active'); });
    advance(499);
    expect(isActive()).toBe(true);
    advance(1);
    expect(isActive()).toBe(false);
    advance(500);
    expect(isActive()).toBe(true);
    act(() => { mockCameraProps.onStarted(); });
    expect(statuses[statuses.length - 1]).toBe('active');
  });

  it('cancels a pending retry when the app goes to the background', () => {
    mount();
    openCamera();
    act(() => { mockCameraProps.onError(new Error('in use')); });
    advance(1000);
    setAppState('background');
    act(() => { appStateHandler!('background'); });
    advance(120000);
    expect(mockActiveHistory.slice(mockActiveHistory.indexOf(true)).includes(false)).toBe(false);
  });

  it('coming back to the foreground with a working camera does nothing', () => {
    mount();
    openCamera();
    act(() => { appStateHandler!('background'); });
    act(() => { appStateHandler!('active'); });
    advance(120000);
    expect(mockActiveHistory.slice(mockActiveHistory.indexOf(true)).every(a => a === true)).toBe(true);
  });

  it('stops retrying when detection is turned off', () => {
    mount();
    openCamera();
    act(() => { mockCameraProps.onError(new Error('in use')); });
    advance(1000);
    setEnabled(false);
    expect(jest.getTimerCount()).toBe(0);
    expect(renderer.toJSON()).toBeNull(); // the camera is unmounted, nothing reopens it
    advance(120000);
    expect(renderer.toJSON()).toBeNull();
  });

  it('ignores the stop that follows turning detection off', () => {
    mount();
    openCamera();
    const props = mockCameraProps;
    setEnabled(false);
    act(() => { props.onStopped(); });
    advance(120000);
    expect(statuses).toEqual(['active', 'idle']); // no 'error', no retry
    expect(jest.getTimerCount()).toBe(0);
  });

  it('cancels the retries when unmounted', () => {
    mount();
    openCamera();
    act(() => { mockCameraProps.onError(new Error('in use')); });
    act(() => { renderer.unmount(); });
    expect(removeListener).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('starts clean when detection is turned back on after a loss', () => {
    mount();
    openCamera();
    act(() => { mockCameraProps.onError(new Error('in use')); });
    setEnabled(false);
    setEnabled(true);
    expect(isActive()).toBe(true);
    openCamera();
    advance(120000);
    expect(isActive()).toBe(true);
  });
});
