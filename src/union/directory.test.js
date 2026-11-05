import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { UNIONS_CACHE_KEY, distanceKm, readCachedUnions, unionChoices, useUnions } from './directory';

const KNOWN = { name: 'Mother Theresa Union', rep: 'R', polygon: '0xF18E', location: [11.88, 78.96] };
const CFG = 'GCFGUNION';
const dir = (unions) => ({ updated_at: '2026-11-03T00:00:00Z', unions });
const A = { union: 'GA', name: 'Alpha', geohash: 'tf3', lat: 11.9, lon: 78.97, matches: true, admitted_hash: 'x' };
const B = { union: 'GB', name: 'Beta', geohash: 'tf4', lat: 12.5, lon: 79.5, matches: false, admitted_hash: 'y' };
const C = { union: CFG, name: 'Annai', geohash: 'tf2', lat: 11.0, lon: 78.0, matches: true, admitted_hash: 'z' };

describe('unionChoices', () => {
  test('no directory: the node union alone', () => {
    expect(unionChoices({ dir: undefined, cfgUnion: CFG, known: KNOWN })).toEqual([
      expect.objectContaining({ stellar: CFG, name: 'Mother Theresa Union', polygon: '0xF18E', fallback: true, matches: true }),
    ]);
  });
  test('empty directory: the node union alone', () => {
    expect(unionChoices({ dir: dir([]), cfgUnion: CFG, known: KNOWN }).map((u) => u.stellar)).toEqual([CFG]);
  });
  test('no directory and no node union: nothing', () => {
    expect(unionChoices({ dir: dir([]), cfgUnion: undefined, known: KNOWN })).toEqual([]);
  });
  test('nearest first from the phone position', () => {
    const out = unionChoices({ dir: dir([B, C, A]), cfgUnion: CFG, known: KNOWN, position: { lat: 11.88, lon: 78.96 } });
    expect(out.map((u) => u.name)).toEqual(['Alpha', 'Beta', 'Annai']);
    expect(out[0].distance_km).toBeLessThan(3);
  });
  test('without position: the anchor distance, then by name', () => {
    const out = unionChoices({ dir: dir([{ ...B, distance_km: 5 }, A, { ...C, distance_km: 1 }]), cfgUnion: CFG, known: KNOWN });
    expect(out.map((u) => u.name)).toEqual(['Annai', 'Beta', 'Alpha']);
  });
  test('changed details kept, flagged', () => {
    const out = unionChoices({ dir: dir([A, B]), cfgUnion: CFG, known: KNOWN });
    expect(out.find((u) => u.stellar === 'GB').matches).toBe(false);
  });
  test('the node union keeps its Polygon entry, others have none', () => {
    const out = unionChoices({ dir: dir([A, C]), cfgUnion: CFG, known: KNOWN });
    expect(out.find((u) => u.stellar === CFG)).toEqual(expect.objectContaining({ name: 'Annai', polygon: '0xF18E' }));
    expect(out.find((u) => u.stellar === 'GA').polygon).toBeUndefined();
  });
  test('distanceKm', () => {
    expect(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111.2, 0);
  });
});

describe('useUnions', () => {
  const wrap = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }) => createElement(QueryClientProvider, { client: qc }, children);
  };
  beforeEach(() => { localStorage.clear(); global.fetch = jest.fn(); });

  test('fetches near the position and keeps the list', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => dir([A]) });
    const { result } = renderHook(() => useUnions('https://anchor.test', { lat: 11.88, lon: 78.96 }), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch.mock.calls[0][0]).toBe('https://anchor.test/unions?limit=20&near=11.8800%2C78.9600');
    expect(readCachedUnions().unions[0].union).toBe('GA');
  });
  test('without position: no near', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => dir([A]) });
    const { result } = renderHook(() => useUnions('https://anchor.test/', null), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch.mock.calls[0][0]).toBe('https://anchor.test/unions?limit=20');
  });
  test('anchor down: the kept list', async () => {
    localStorage.setItem(UNIONS_CACHE_KEY, JSON.stringify(dir([B])));
    global.fetch.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useUnions('https://anchor.test', null), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.unions[0].union).toBe('GB');
  });
  test('anchor down, nothing kept: an error (R9 then offers the node union)', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    const { result } = renderHook(() => useUnions('https://anchor.test', null), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 4000 });
    expect(unionChoices({ dir: result.current.data, cfgUnion: CFG, known: KNOWN }).map((u) => u.stellar)).toEqual([CFG]);
  });
  test('no anchor url: not fetched', () => {
    const { result } = renderHook(() => useUnions(undefined, null), { wrapper: wrap() });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });
  test('an empty answer replaces the kept list', async () => {
    localStorage.setItem(UNIONS_CACHE_KEY, JSON.stringify(dir([B])));
    global.fetch.mockResolvedValue({ ok: true, json: async () => dir([]) });
    const { result } = renderHook(() => useUnions('https://anchor.test', null), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(result.current.data.unions).toEqual([]);
    expect(readCachedUnions().unions).toEqual([]);
  });
});
