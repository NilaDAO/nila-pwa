import React from 'react';
import { render, screen } from '@testing-library/react';
import FieldRegNav from '../fieldRegNav';
import { FieldRegContext } from '../../../../utils/FieldRegContext';

jest.mock('../FieldRegController', () => ({ useFieldRegController: jest.fn() }));
jest.mock('../fieldRegMaps', () => () => <div data-testid="maps" />);
jest.mock('../fieldRegRemoteCookie', () => ({
  useHandleOffsiteTrackingCookie: () => jest.fn(),
}));

import { useFieldRegController } from '../FieldRegController';

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

const renderWithFieldReg = (fieldReg) => {
  const updateFieldReg = jest.fn();
  return render(
    <FieldRegContext.Provider value={{ fieldReg: { ...baseFieldReg, ...fieldReg }, updateFieldReg }}>
      <FieldRegNav />
    </FieldRegContext.Provider>
  );
};

describe('FieldRegNav', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    useFieldRegController.mockReturnValue({ regFlow: { getCurrentPosition: jest.fn() } });
  });

  test('renders initiate registration when flow=0, apiOnline and geoPerm true', () => {
    useFieldRegController.mockReturnValue({ regFlow: { handleDeleteApprovedFields: jest.fn(), timerRef: { current: 0 }, geoPerm: true, getCurrentPosition: jest.fn() } });
    renderWithFieldReg({ flow: 0, apiOnline: true, approvedFields: [] });
    expect(screen.getByText(/tab to start/i)).toBeInTheDocument();
  });

  test('renders API offline message when apiOnline is false', () => {
    useFieldRegController.mockReturnValue({ regFlow: { handleDeleteApprovedFields: jest.fn(), timerRef: { current: 0 }, geoPerm: true, getCurrentPosition: jest.fn() } });
    renderWithFieldReg({ flow: 0, apiOnline: false });
    expect(screen.getByText(/api offline/i)).toBeInTheDocument();
  });

  test('renders allow location access when geoPerm is false', () => {
    useFieldRegController.mockReturnValue({ regFlow: { handleDeleteApprovedFields: jest.fn(), timerRef: { current: 0 }, geoPerm: false, getCurrentPosition: jest.fn() } });
    renderWithFieldReg({ flow: 0, apiOnline: true });
    expect(screen.getByText(/permit location sharing/i)).toBeInTheDocument();
  });

  test('renders geolocation access state when no gps data', () => {
    useFieldRegController.mockReturnValue({ regFlow: { handleDeleteApprovedFields: jest.fn(), timerRef: { current: 0 }, geoPerm: true, getCurrentPosition: jest.fn() } });
    renderWithFieldReg({ flow: 1, positions: [] });
    expect(screen.getByText(/location unavailable/i)).toBeInTheDocument();
  });

  test('renders gps data available when positions exist', () => {
    useFieldRegController.mockReturnValue({ regFlow: { handleDeleteApprovedFields: jest.fn(), timerRef: { current: 0 }, geoPerm: true, getCurrentPosition: jest.fn() } });
    renderWithFieldReg({ flow: 1, positions: [{ lat: 1, lng: 2, acc: 10 }], track: false });
    expect(screen.getByText(/enable remote bordering/i)).toBeInTheDocument();
  });

  test('renders object verification when flow=11', () => {
    useFieldRegController.mockReturnValue({ regFlow: { handleDeleteApprovedFields: jest.fn(), timerRef: { current: 0 }, geoPerm: true, getCurrentPosition: jest.fn() } });
    renderWithFieldReg({ flow: 11 });
    expect(screen.getByText(/place a plastic sheet/i)).toBeInTheDocument();
  });

  test('renders maps when flow>=2 and online', () => {
    useFieldRegController.mockReturnValue({ regFlow: { handleDeleteApprovedFields: jest.fn(), timerRef: { current: 0 }, geoPerm: true, getCurrentPosition: jest.fn() } });
    renderWithFieldReg({ flow: 2 });
    expect(screen.getByTestId('maps')).toBeInTheDocument();
  });
});
