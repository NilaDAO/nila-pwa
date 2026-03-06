import React from 'react';
import { render, screen } from '@testing-library/react';
import FieldRegCards from '../fieldRegCards';
import { FieldRegContext } from '../../../../utils/FieldRegContext';
import { DataContext, NavContext } from '../../../../utils/NavigationContext';

jest.mock('../FieldRegController', () => ({ useFieldRegController: jest.fn() }));
jest.mock('../../../../hooks/useVerifyFlow', () => jest.fn());
jest.mock('../../../../hooks/useMintLandTitle.ts', () => ({
  useBurnLandTitle: () => ({ burnLandTitle: jest.fn() }),
}));
jest.mock('../fieldRegRemoteCookie', () => ({
  useHandleOffsiteTrackingCookie: () => jest.fn(),
}));

import { useFieldRegController } from '../FieldRegController';
import useVerifyFlow from '../../../../hooks/useVerifyFlow';

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

const renderWithProviders = (fieldReg) => {
  const updateFieldReg = jest.fn();
  const dataValue = { db: { chain: '0x1', address: '0xabc' } };
  const navValue = { setIx: jest.fn(), setCardIx: jest.fn(), cardIx: null, prevIx: { current: null } };

  return render(
    <DataContext.Provider value={dataValue}>
      <NavContext.Provider value={navValue}>
        <FieldRegContext.Provider value={{ fieldReg: { ...baseFieldReg, ...fieldReg }, updateFieldReg }}>
          <FieldRegCards />
        </FieldRegContext.Provider>
      </NavContext.Provider>
    </DataContext.Provider>
  );
};

describe('FieldRegCards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.Notification = { permission: 'default' };
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    useFieldRegController.mockReturnValue({
      regFlow: {
        handleTryAgain: jest.fn(),
        handleCorrect: jest.fn(),
        handleDeleteApprovedFields: jest.fn(),
        geoPerm: true,
      },
    });
    useVerifyFlow.mockReturnValue({
      handleVerify: jest.fn(),
      handleGenerateLandTitle: jest.fn(),
      handleObjectPlaced: jest.fn(),
      handleBackToBordering: jest.fn(),
    });
  });

  test('renders intro when flow=0 and no approved fields', () => {
    renderWithProviders({ flow: 0, approvedFields: [] });
    expect(screen.getByText(/walk to your first field/i)).toBeInTheDocument();
  });

  test('renders gps accuracy when flow=1 and geoPerm true', () => {
    renderWithProviders({ flow: 1, positions: [{ lat: 1, lng: 2, acc: 12 }] });
    expect(screen.getByText(/accuracy: 12 meter/i)).toBeInTheDocument();
  });

  test('renders message text when flow>=2', () => {
    renderWithProviders({ flow: 2, messages: 4 });
    expect(screen.getByText(/all set, we found you/i)).toBeInTheDocument();
  });

  test('renders try again / looks good when alts exist', () => {
    renderWithProviders({ flow: 5, alts: [0, [[{ lat: 1, lng: 2 }]]], approvedFields: [{ name: 'f1', shape: [] }] });
    expect(screen.getByText(/try again/i)).toBeInTheDocument();
    expect(screen.getByText(/looks good/i)).toBeInTheDocument();
  });

  test('renders object verification content at flow=11', () => {
    renderWithProviders({ flow: 11, remote: true, approvedFields: [{ name: 'f1', shape: [] }] });
    expect(screen.getByText(/remote bordering requires additional proof/i)).toBeInTheDocument();
    expect(screen.getByText(/remove all fields/i)).toBeInTheDocument();
  });

  test('renders input list when approved fields exist', () => {
    renderWithProviders({
      flow: 2,
      approvedFields: [{ name: 'Field A', shape: [{ lat: 1, lng: 2 }] }],
    });
    expect(screen.getByText(/fields:/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/field a/i)).toBeInTheDocument();
  });
});
