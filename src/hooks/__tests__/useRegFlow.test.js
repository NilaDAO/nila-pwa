import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { FieldRegContext } from '../../utils/FieldRegContext';
import { ViewModeContext } from '../../utils/NavigationContext';

jest.mock('axios', () => ({ post: jest.fn(), get: jest.fn() }));
jest.mock('../usePosition', () => jest.fn());
jest.mock('../useVerifyFlow', () => jest.fn());
jest.mock('../UsePollingApi', () => jest.fn());

const axios = require('axios');
const useRegFlowModule = require('../useRegFlow');
const useRegFlow = useRegFlowModule.default || useRegFlowModule;
const { isPointInPolygon } = useRegFlowModule;
const usePosition = require('../usePosition');
const useVerifyFlow = require('../useVerifyFlow');
const usePollingApi = require('../UsePollingApi');

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

const renderWithProviders = (fieldReg, updateFieldReg = jest.fn()) => {
  const wrapper = ({ children }) => (
    <ViewModeContext.Provider value={{ navRef: { current: {} }, cardView: 'default', setCardView: jest.fn() }}>
      <FieldRegContext.Provider value={{ fieldReg: { ...baseFieldReg, ...fieldReg }, updateFieldReg }}>
        {children}
      </FieldRegContext.Provider>
    </ViewModeContext.Provider>
  );
  return { wrapper, updateFieldReg };
};

describe('useRegFlow', () => {
  let positionMocks;
  let pollingMocks;
  let verifyMocks;

  beforeEach(() => {
    jest.clearAllMocks();
    document.cookie = 'offsite=; Max-Age=0; path=/;';
    positionMocks = {
      hasOnlineAPI: jest.fn(),
      forceStopTracking: jest.fn(),
      getCurrentPosition: jest.fn(),
    };
    pollingMocks = {
      startPolling: jest.fn(),
      forceStopPolling: jest.fn(),
      isPolling: false,
    };
    verifyMocks = {
      handleVerificationMode: jest.fn(),
    };
    usePosition.mockReturnValue(positionMocks);
    useVerifyFlow.mockReturnValue(verifyMocks);
    usePollingApi.mockReturnValue(pollingMocks);
  });

  test('flow=1 with offsite cookie enables remote flow', () => {
    document.cookie = 'offsite=1; path=/;';
    const updateFieldReg = jest.fn();
    const { wrapper } = renderWithProviders({ flow: 1, apiOnline: true }, updateFieldReg);
    renderHook(() => useRegFlow(), { wrapper });
    expect(positionMocks.getCurrentPosition).toHaveBeenCalled();
    const objectCalls = updateFieldReg.mock.calls.filter((call) => typeof call[0] === 'object');
    expect(objectCalls.some((call) => call[0].remote === true && call[0].flow === 2)).toBe(true);
  });

  test('flow=1 without offsite cookie enables tracking', () => {
    const updateFieldReg = jest.fn();
    const { wrapper } = renderWithProviders({ flow: 1, apiOnline: true }, updateFieldReg);
    renderHook(() => useRegFlow(), { wrapper });
    expect(positionMocks.getCurrentPosition).toHaveBeenCalled();
    const objectCalls = updateFieldReg.mock.calls.filter((call) => typeof call[0] === 'object');
    expect(objectCalls.some((call) => call[0].track === true && call[0].flow === 2)).toBe(true);
  });

  test('point is inside primary candidate polygon', () => {
    const primary = {
      geometry: {
        coordinates: [
          [
            [0, 0],
            [0, 2],
            [2, 2],
            [2, 0],
            [0, 0],
          ],
        ],
      },
    };
    const pointInside = [1, 1]; // [lng, lat]
    expect(isPointInPolygon(pointInside, primary.geometry.coordinates[0])).toBe(true);
  });

  test('flow=2 triggers verification mode when apiOnline', () => {
    const updateFieldReg = jest.fn();
    const { wrapper } = renderWithProviders({ flow: 2, apiOnline: true }, updateFieldReg);
    renderHook(() => useRegFlow(), { wrapper });
    expect(verifyMocks.handleVerificationMode).toHaveBeenCalled();
  });

  test('flow=3 requests borders and starts polling', async () => {
    axios.post.mockResolvedValueOnce({ data: { task_id: 't1' } });
    const updateFieldReg = jest.fn();
    const { wrapper } = renderWithProviders(
      { flow: 3, positions: [{ lat: 10, lng: 20, acc: 5 }] },
      updateFieldReg
    );
    renderHook(() => useRegFlow(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(axios.post).toHaveBeenCalled();
    expect(pollingMocks.startPolling).toHaveBeenCalled();
    const objectCalls = updateFieldReg.mock.calls.filter((call) => typeof call[0] === 'object');
    expect(objectCalls.some((call) => call[0].flow === 4 && call[0].messages === 4)).toBe(true);
  });

  test('flow=4 with results updates polygons and flow', () => {
    const results = {
      principal: { geometry: { coordinates: [[[1, 2], [3, 4]]] } },
      alternatives: [],
    };
    const updateFieldReg = jest.fn();
    const { wrapper } = renderWithProviders({ flow: 4, results }, updateFieldReg);
    renderHook(() => useRegFlow(), { wrapper });
    const fnCalls = updateFieldReg.mock.calls.filter((call) => typeof call[0] === 'function');
    const nextStates = fnCalls.map((call) => call[0]({ neighbours: [] }));
    const target = nextStates.find((state) => state.flow === 5);
    expect(target).toBeTruthy();
    expect(target.messages).toBe(8);
    expect(target.polygons).toEqual([{ lat: 2, lng: 1 }, { lat: 4, lng: 3 }]);
  });

  test('handleTryAgain clears alts and resets flow', () => {
    const updateFieldReg = jest.fn();
    const { wrapper } = renderWithProviders(
      { flow: 5, alts: [1, [[{ lat: 1, lng: 2 }]]], neighbours: [1, 2, 3] },
      updateFieldReg
    );
    const { result } = renderHook(() => useRegFlow(), { wrapper });
    const callsBefore = updateFieldReg.mock.calls.length;
    act(() => {
      result.current.handleTryAgain();
    });
    const newCalls = updateFieldReg.mock.calls.slice(callsBefore);
    const fnCall = newCalls.find((call) => typeof call[0] === 'function');
    const next = fnCall[0]({ neighbours: [1, 2, 3] });
    expect(next.alts).toEqual([]);
    expect(next.flow).toBe(2);
    expect(next.track).toBe(true);
  });

  test('handleCorrect appends approved field', () => {
    const updateFieldReg = jest.fn();
    const { wrapper } = renderWithProviders(
      { flow: 5, polygons: [{ lat: 1, lng: 2 }], approvedFields: [{ name: 'field 1', shape: [] }] },
      updateFieldReg
    );
    const { result } = renderHook(() => useRegFlow(), { wrapper });
    const callsBefore = updateFieldReg.mock.calls.length;
    act(() => {
      result.current.handleCorrect();
    });
    const newCalls = updateFieldReg.mock.calls.slice(callsBefore);
    const fnCall = newCalls.find((call) => typeof call[0] === 'function');
    const next = fnCall[0]({ approvedFields: [{ name: 'field 1', shape: [] }] });
    expect(next.approvedFields.length).toBe(2);
    expect(next.flow).toBe(2);
    expect(next.polygons).toEqual([]);
  });

  test('handleDeleteApprovedFields clears state and storage', () => {
    const updateFieldReg = jest.fn();
    const removeItemSpy = jest.spyOn(Storage.prototype, 'removeItem');
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const { wrapper } = renderWithProviders({ flow: 5, approvedFields: [{ name: 'f1', shape: [] }] }, updateFieldReg);
    const { result } = renderHook(() => useRegFlow(), { wrapper });
    act(() => {
      result.current.handleDeleteApprovedFields();
    });
    expect(updateFieldReg).toHaveBeenCalledWith({ flow: 0, positions: [], approvedFields: [] });
    expect(removeItemSpy).toHaveBeenCalledWith('fields');
    expect(removeItemSpy).toHaveBeenCalledWith('positions');
    removeItemSpy.mockRestore();
  });
});
