import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { FieldRegContext } from '../../utils/FieldRegContext';

jest.mock('axios', () => ({ post: jest.fn(), get: jest.fn() }));

const axios = require('axios');
const usePositionModule = require('../usePosition');
const usePosition = usePositionModule.default || usePositionModule;

const baseFieldReg = {
  tcAccept: false,
  verificationMode: true,
  polling: 0,
  remote: false,
  track: false,
  marker: false,
  panMode: null,
  apiOnline: true,
  flow: 0,
  positions: [],
  polygons: [],
  results: null,
  property: { name: '', shape: [] },
  approvedFields: [],
  altPolygons: [],
  sufficientGas: undefined,
  alts: [],
  neighbours: [],
  messages: 0,
};

const renderWithFieldReg = (fieldReg, updateFieldReg = jest.fn()) => {
  const wrapper = ({ children }) => (
    <FieldRegContext.Provider value={{ fieldReg: { ...baseFieldReg, ...fieldReg }, updateFieldReg }}>
      {children}
    </FieldRegContext.Provider>
  );
  return { wrapper, updateFieldReg };
};

describe('usePosition', () => {
  let watchSuccess;
  let watchError;

  beforeEach(() => {
    jest.clearAllMocks();
    watchSuccess = undefined;
    watchError = undefined;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: jest.fn((success, error) => {
          watchSuccess = success;
          watchError = error;
          return 42;
        }),
        clearWatch: jest.fn(),
        getCurrentPosition: jest.fn((success) =>
          success({ coords: { latitude: 5, longitude: 6, accuracy: 12 } })
        ),
      },
    });
  });

  test('starts watchPosition when tracking and cleans up on unmount', () => {
    const { wrapper } = renderWithFieldReg({ track: true, remote: false });
    const { unmount } = renderHook(() => usePosition(), { wrapper });
    expect(navigator.geolocation.watchPosition).toHaveBeenCalled();
    unmount();
    expect(navigator.geolocation.clearWatch).toHaveBeenCalled();
  });

  test('onChange appends a new position', () => {
    const updateFieldReg = jest.fn();
    const { wrapper } = renderWithFieldReg({ track: true, remote: false, positions: [] }, updateFieldReg);
    renderHook(() => usePosition(), { wrapper });
    act(() => {
      watchSuccess({ coords: { latitude: 1, longitude: 2, accuracy: 3 } });
    });
    const updateCall = updateFieldReg.mock.calls.find((call) => typeof call[0] === 'function');
    const next = updateCall[0]({ positions: [] });
    expect(next.positions[0]).toMatchObject({ lat: 1, lng: 2, acc: 3, manual: false });
  });

  test('getCurrentPosition adds a manual position', () => {
    const updateFieldReg = jest.fn();
    const { wrapper } = renderWithFieldReg({ track: false, remote: false, positions: [] }, updateFieldReg);
    const { result } = renderHook(() => usePosition(), { wrapper });
    act(() => {
      result.current.getCurrentPosition();
    });
    const updateCall = updateFieldReg.mock.calls.find((call) => typeof call[0] === 'function');
    const next = updateCall[0]({ positions: [] });
    expect(next.positions[0]).toMatchObject({ lat: 5, lng: 6, acc: 12, manual: true });
  });

  test('onError resets flow when no positions and not remote', () => {
    const updateFieldReg = jest.fn();
    const { wrapper } = renderWithFieldReg({ track: true, remote: false, positions: [] }, updateFieldReg);
    renderHook(() => usePosition(), { wrapper });
    act(() => {
      watchError(new Error('no signal'));
    });
    expect(updateFieldReg).toHaveBeenCalledWith({ track: false, flow: 1 });
  });

  test('hasOnlineAPI sets apiOnline true on success', async () => {
    const updateFieldReg = jest.fn();
    axios.get.mockResolvedValueOnce({ status: 200 });
    const { wrapper } = renderWithFieldReg({ track: false }, updateFieldReg);
    const { result } = renderHook(() => usePosition(), { wrapper });
    await act(async () => {
      result.current.hasOnlineAPI();
      await Promise.resolve();
    });
    expect(updateFieldReg).toHaveBeenCalledWith({ apiOnline: true });
  });

  test('hasOnlineAPI sets apiOnline false on failure', async () => {
    const updateFieldReg = jest.fn();
    axios.get.mockRejectedValueOnce(new Error('offline'));
    const { wrapper } = renderWithFieldReg({ track: false }, updateFieldReg);
    const { result } = renderHook(() => usePosition(), { wrapper });
    await act(async () => {
      result.current.hasOnlineAPI();
      await Promise.resolve();
    });
    expect(updateFieldReg).toHaveBeenCalledWith({ apiOnline: false });
  });
});
