import React from 'react';
import { render, screen, act } from '@testing-library/react';
import Maps from '../fieldRegMaps';
import { FieldRegContext } from '../../../../utils/FieldRegContext';
import { DataContext } from '../../../../utils/NavigationContext';

jest.mock('../../../../hooks/usePosition', () => jest.fn(() => ({ getCurrentPosition: jest.fn() })));

const mockMap = {
  setOptions: jest.fn(),
  addListener: jest.fn(),
  getCenter: jest.fn(() => ({ lat: () => 1, lng: () => 2 })),
  setCenter: jest.fn(),
  fitBounds: jest.fn(),
  panBy: jest.fn(),
};

jest.mock('@react-google-maps/api', () => {
  const React = require('react');
  return {
    GoogleMap: ({ children, onLoad }) => {
      React.useEffect(() => {
        if (onLoad) onLoad(mockMap);
      }, [onLoad]);
      return <div data-testid="google-map">{children}</div>;
    },
    useJsApiLoader: () => ({ isLoaded: true }),
    Polygon: ({ paths }) => <div data-testid="polygon" data-paths={JSON.stringify(paths)} />,
    InfoBox: ({ children }) => <div data-testid="infobox">{children}</div>,
  };
});

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

const renderWithProviders = (fieldReg, props = {}) => {
  const updateFieldReg = jest.fn();
  return {
    updateFieldReg,
    ...render(
      <DataContext.Provider value={{ db: { union: { location: [0, 0] } } }}>
        <FieldRegContext.Provider value={{ fieldReg: { ...baseFieldReg, ...fieldReg }, updateFieldReg }}>
          <Maps parentFlow={props.parentFlow ?? fieldReg.flow} />
        </FieldRegContext.Provider>
      </DataContext.Provider>
    ),
  };
};

describe('fieldRegMaps', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMap._dragEnd = undefined;
    mockMap.addListener.mockImplementation((event, cb) => {
      if (event === 'dragend') mockMap._dragEnd = cb;
      return 'listener-id';
    });
    window.google = {
      maps: {
        event: { removeListener: jest.fn() },
        Polyline: jest.fn().mockImplementation(() => ({
          setPath: jest.fn(),
          setMap: jest.fn(),
        })),
        LatLngBounds: jest.fn().mockImplementation(() => ({
          extend: jest.fn(),
        })),
        LatLng: jest.fn().mockImplementation((lat, lng) => ({ lat, lng })),
        marker: {
          AdvancedMarkerElement: jest.fn().mockImplementation(() => ({
            setMap: jest.fn(),
          })),
        },
      },
    };
  });

  test('renders approved field polygons when flow <= 10', () => {
    renderWithProviders({
      flow: 2,
      approvedFields: [{ name: 'Field 1', shape: [{ lat: 1, lng: 2 }] }],
    });
    expect(screen.getAllByTestId('polygon').length).toBe(1);
  });

  test('renders field labels when flow > 10', () => {
    renderWithProviders({
      flow: 11,
      property: { name: 'Prop', shape: [] },
      approvedFields: [{ name: 'My Field', shape: [{ lat: 1, lng: 2 }] }],
    });
    expect(screen.getByText(/my field/i)).toBeInTheDocument();
    expect(screen.getByTestId('infobox')).toBeInTheDocument();
  });

  test('renders alt polygon when alts are present and flow is 2 or 3', () => {
    const altShape = [[{ lat: 10, lng: 20 }]];
    renderWithProviders({
      flow: 2,
      alts: [0, altShape],
      approvedFields: [{ name: 'Field 1', shape: [{ lat: 1, lng: 2 }] }],
    });
    const polygons = screen.getAllByTestId('polygon');
    const hasAlt = polygons.some((node) => node.getAttribute('data-paths') === JSON.stringify(altShape));
    expect(hasAlt).toBe(true);
  });

  test('adds a position on dragend when in registration flow', async () => {
    jest.useFakeTimers();
    const { updateFieldReg } = renderWithProviders(
      { flow: 2, positions: [] },
      { parentFlow: 2 }
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockMap._dragEnd).toBeDefined();
    mockMap._dragEnd();
    jest.advanceTimersByTime(450);
    const updateCall = updateFieldReg.mock.calls.find((call) => typeof call[0] === 'function');
    expect(updateCall).toBeTruthy();
    const updater = updateCall[0];
    const next = updater({ positions: [], panMode: true });
    expect(next.positions.length).toBe(1);
    expect(next.panMode).toBe(false);
    jest.useRealTimers();
  });
});
