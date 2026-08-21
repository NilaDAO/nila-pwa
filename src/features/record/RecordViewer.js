// RecordViewer.js — standalone page that fetches a satellite record.json from
// Pinata IPFS (by on-chain report/record hash) and renders it as an HTML
// presentation, mirroring NilaSensingAgent's compute/fencing/inspect.py
// report builder (Leaflet zone map + Chart.js NDVI charts + tables), but
// sourced entirely from the public record.json rather than the raster cubes
// only the compute pipeline has access to.
//
// Route: /record/:hash — a standalone route outside App's boot/auth flow
// (see Layout.js, same pattern as /diag), since the record itself is public,
// content-addressed IPFS data and this page may be opened via target="_blank"
// from inside an installed (standalone-display) PWA, which hands off to the
// system browser rather than opening an in-app tab.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchRecordFromIPFS, deriveCIDv1RawSha256 } from '../../utils/ipfsCid.ts';
import { cropColor, zoneColor, normalizeCropType } from '../../utils/cropColors';
import { HEALTH_COLOR, HEALTH_LABEL, STAGE_LABELS } from '../../utils/loanIssues.js';

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const CHARTJS_JS  = 'https://cdn.jsdelivr.net/npm/chart.js@4';
const CHARTJS_DATE_ADAPTER_JS = 'https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3';

function loadCss(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  document.head.appendChild(l);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === '1') return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(`failed to load ${src}`)));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => { s.dataset.loaded = '1'; resolve(); };
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

const fmtDate = (d) => {
  if (!d) return '--';
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return String(d); }
};
const fmtPct = (x) => (x == null ? '--' : `${Math.round(x * 100)}%`);
const fmtNum = (x, opts) => (x == null ? '--' : Number(x).toLocaleString('en-IN', opts));

export default function RecordViewer() {
  const { hash } = useParams();
  const [record, setRecord] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRecord(null);
    (async () => {
      try {
        const rec = await fetchRecordFromIPFS(hash);
        if (!cancelled) setRecord(rec);
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hash]);

  const gateway = process.env.REACT_APP_PINATA_GATEWAY || 'gateway.pinata.cloud';
  const rawUrl = useMemo(() => {
    try { return `https://${gateway}/ipfs/${deriveCIDv1RawSha256(hash)}`; } catch { return null; }
  }, [hash, gateway]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white">
      <div className="max-w-3xl mx-auto px-4 py-5 flex flex-col gap-4">
        <Header hash={hash} rawUrl={rawUrl} record={record} />

        {loading && (
          <div className="flex items-center justify-center py-16 text-sm text-gray-500 dark:text-slate-400">
            Fetching record from IPFS…
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-red/30 bg-red/5 dark:bg-red-900/20 p-4">
            <p className="text-sm font-semibold text-red dark:text-red">Could not load this record</p>
            <p className="text-xs mt-1 text-gray-600 dark:text-slate-300 break-all">{error}</p>
            {rawUrl && (
              <a href={rawUrl} target="_blank" rel="noreferrer" className="text-xs underline text-blue-500 dark:text-blue-400 mt-2 inline-block">
                Try opening the raw JSON directly
              </a>
            )}
          </div>
        )}

        {!loading && !error && record && (
          <>
            <MetaCard record={record} />
            <ScorecardCard record={record} />
            <ZoneMapCard record={record} />
            <ZonesTableCard record={record} />
            <CurrentSeasonCard record={record} />
            <NdviChartCard record={record} />
            <CycleTimelineCard record={record} />

            <div className="rounded-lg bg-white dark:bg-slate-700 p-3">
              <button
                onClick={() => setShowRaw((v) => !v)}
                className="text-xs font-semibold text-blue-500 dark:text-blue-400"
              >
                {showRaw ? 'Hide raw JSON' : 'Show raw JSON'}
              </button>
              {showRaw && (
                <pre className="mt-2 text-[10px] overflow-x-auto whitespace-pre-wrap break-all bg-gray-100 dark:bg-slate-800 rounded p-2 max-h-96 overflow-y-auto">
                  {JSON.stringify(record, null, 2)}
                </pre>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Header({ hash, rawUrl, record }) {
  const landId = record?.land_id ?? record?.meta?.region_id ?? null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        Satellite Record{landId != null ? ` · Land #${landId}` : ''}
      </p>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold truncate" title={hash}>
          {hash ? `${hash.slice(0, 10)}…${hash.slice(-8)}` : 'Record'}
        </h1>
        {rawUrl && (
          <a href={rawUrl} target="_blank" rel="noreferrer" className="text-[10px] underline text-blue-500 dark:text-blue-400 whitespace-nowrap">
            Open raw JSON
          </a>
        )}
      </div>
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <div className="rounded-lg bg-white dark:bg-slate-700 p-3 flex flex-col gap-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">{title}</p>
      {children}
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[11px] text-gray-500 dark:text-slate-400">{label}</span>
      <span className="text-[11px] font-mono text-right">{value}</span>
    </div>
  );
}

function MetaCard({ record }) {
  const meta = record?.meta ?? {};
  const hasAny = meta.region_id != null || meta.parcel_area_m2 != null || meta.initialized_at || meta.last_scene_date || meta.last_updated;
  if (!hasAny) return null;
  return (
    <SectionCard title="Property">
      <DetailRow label="Region" value={meta.region_id ?? '--'} />
      <DetailRow label="Area" value={meta.parcel_area_m2 != null ? `${fmtNum(meta.parcel_area_m2, { maximumFractionDigits: 0 })} m²` : '--'} />
      <DetailRow label="Initialized" value={fmtDate(meta.initialized_at)} />
      <DetailRow label="Last scene" value={fmtDate(meta.last_scene_date)} />
      <DetailRow label="Updated" value={fmtDate(meta.last_updated)} />
    </SectionCard>
  );
}

function ScorecardCard({ record }) {
  const sc = record?.scorecard;
  if (!sc) return null;
  return (
    <SectionCard title="Scorecard">
      <div className="flex items-center gap-2 mb-1">
        <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-black dark:bg-white text-white dark:text-gray-800 text-lg font-bold">
          {sc.farmer_score ?? '--'}
        </span>
        <span className="text-[11px] text-gray-500 dark:text-slate-400">Farmer score</span>
      </div>
      <DetailRow label="Total cycles" value={sc.total_cycles ?? '--'} />
      <DetailRow label="Rotation pattern" value={sc.rotation_pattern ?? '--'} />
      <DetailRow label="Yield trend" value={sc.yield_trend ?? '--'} />
      <DetailRow label="Timing consistency" value={sc.timing_consistency ?? '--'} />
    </SectionCard>
  );
}

function ZonesTableCard({ record }) {
  const zones = Array.isArray(record?.zones) ? record.zones : [];
  if (!zones.length) return null;
  return (
    <SectionCard title={`Zones (${zones.length})`}>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-gray-500 dark:text-slate-400">
              <th className="font-semibold pb-1 pr-2">Zone</th>
              <th className="font-semibold pb-1 pr-2">Category</th>
              <th className="font-semibold pb-1 pr-2 text-right">Area</th>
              <th className="font-semibold pb-1 text-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {zones.map((z, i) => (
              <tr key={z.zone_id ?? i} className="border-t border-gray-100 dark:border-slate-600">
                <td className="py-1 pr-2">
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: zoneColor(z.zone_id) }} />
                    {z.zone_id ?? '--'}
                  </span>
                </td>
                <td className="py-1 pr-2">
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cropColor(z.category) }} />
                    {z.category ?? '--'}
                  </span>
                </td>
                <td className="py-1 pr-2 text-right font-mono">{z.area_m2 != null ? `${fmtNum(z.area_m2, { maximumFractionDigits: 0 })} m²` : '--'}</td>
                <td className="py-1 text-right font-mono">{fmtPct(z.area_fraction)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function CurrentSeasonCard({ record }) {
  const cur = Array.isArray(record?.current_cycle) ? record.current_cycle : [];
  if (!cur.length) return null;
  return (
    <SectionCard title="Current Season Forecast">
      <div className="flex flex-col gap-2">
        {cur.map((cc, i) => {
          const health = cc.health ?? null;
          const stage = cc.stage ?? null;
          const eos = cc.predicted_eos ?? cc.projected_eos_date ?? null;
          const yieldEst = cc.expected_yield_kg_acre ?? cc.yield_kg_per_acre ?? null;
          const summary = cc.stage_summary ?? cc.stage_description ?? null;
          const healthSummary = cc.health_summary ?? cc.health_description ?? null;
          return (
            <div key={cc.cluster_id ?? cc.zone_id ?? i} className="rounded-md bg-gray-50 dark:bg-slate-600 p-2 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold inline-flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: zoneColor(cc.cluster_id ?? cc.zone_id) }} />
                  {(cc.cluster_id ?? cc.zone_id) ?? 'Zone'}
                  {cc.crop_type && (
                    <span className="font-normal text-gray-500 dark:text-slate-400">· {normalizeCropType(cc.crop_type)}</span>
                  )}
                </span>
                {health && (
                  <span className={`text-[10px] font-semibold ${HEALTH_COLOR[health] ?? 'text-gray-500 dark:text-slate-300'}`}>
                    {HEALTH_LABEL[health] ?? health}
                  </span>
                )}
              </div>
              <DetailRow label="Stage" value={STAGE_LABELS[stage] ?? stage ?? '--'} />
              <DetailRow label="Projected harvest" value={fmtDate(eos)} />
              {yieldEst != null && <DetailRow label="Expected yield" value={`${fmtNum(yieldEst)} kg/acre`} />}
              {(summary || healthSummary) && (
                <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-1">{summary || healthSummary}</p>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function CycleTimelineCard({ record }) {
  const cycles = Array.isArray(record?.cycles) ? record.cycles : [];
  if (!cycles.length) return null;
  const sorted = [...cycles].sort((a, b) => new Date(b.sos || 0) - new Date(a.sos || 0));
  return (
    <SectionCard title={`Cycle Timeline (${cycles.length})`}>
      <div className="flex flex-col gap-1">
        {sorted.map((c, i) => (
          <div key={i} className="flex items-center justify-between gap-2 py-1 border-t border-gray-100 dark:border-slate-600 first:border-t-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cropColor(c.crop_type) }} />
              <span className="text-[11px] truncate">
                {c.crop_type ? normalizeCropType(c.crop_type) : 'Unclassified'}
                {c.zone_id != null ? ` · ${c.zone_id}` : ''}
              </span>
              {c.is_open && (
                <span className="text-[9px] font-bold uppercase text-blue-500 dark:text-blue-400 flex-shrink-0">open</span>
              )}
            </div>
            <span className="text-[10px] font-mono text-gray-500 dark:text-slate-400 whitespace-nowrap">
              {fmtDate(c.sos)} → {c.eos ? fmtDate(c.eos) : (c.projection?.projected_eos_date ? `~${fmtDate(c.projection.projected_eos_date)}` : '--')}
            </span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function ZoneMapCard({ record }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const zones = useMemo(
    () => (Array.isArray(record?.zones) ? record.zones.filter((z) => z.geometry) : []),
    [record]
  );

  useEffect(() => {
    if (!zones.length) return;
    let cancelled = false;
    loadCss(LEAFLET_CSS);
    loadScript(LEAFLET_JS).then(() => { if (!cancelled) setReady(true); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [zones]);

  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;
    const L = window.L;
    if (!L) { setFailed(true); return; }
    const map = L.map(containerRef.current, { scrollWheelZoom: false });
    mapRef.current = map;
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Esri World Imagery',
      maxZoom: 20,
    }).addTo(map);

    const features = zones.map((z) => ({
      type: 'Feature',
      properties: z,
      geometry: z.geometry,
    }));
    const layer = L.geoJSON(features, {
      style: (feature) => ({
        color: zoneColor(feature.properties.zone_id),
        weight: 2,
        fillColor: cropColor(feature.properties.category),
        fillOpacity: 0.35,
      }),
      onEachFeature: (feature, lyr) => {
        const z = feature.properties;
        lyr.bindPopup(`<b>${z.zone_id ?? ''}</b><br/>${z.category ?? ''}${z.area_m2 ? `<br/>${Math.round(z.area_m2)} m²` : ''}`);
      },
    }).addTo(map);

    try {
      map.fitBounds(layer.getBounds(), { padding: [16, 16] });
    } catch {
      map.setView([0, 0], 2);
    }

    return () => { map.remove(); mapRef.current = null; };
  }, [ready, zones]);

  if (!zones.length || failed) return null;

  return (
    <SectionCard title="Zone Map">
      <div ref={containerRef} className="w-full rounded-md overflow-hidden" style={{ height: 260 }} />
    </SectionCard>
  );
}

function NdviChartCard({ record }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [activeZone, setActiveZone] = useState(null);

  // Two possible shapes: record.timeseries keyed by zone id -> {dates, ndvi},
  // or per-cycle record.cycles[].series (fallback when there's no top-level
  // per-zone series). Normalized into a single { zoneKey -> {dates, ndvi} } map.
  const series = useMemo(() => {
    const out = {};
    const ts = record?.timeseries;
    if (ts && typeof ts === 'object') {
      for (const [zoneKey, val] of Object.entries(ts)) {
        if (zoneKey === 'weather') continue;
        if (val?.dates?.length && val?.ndvi?.length) out[zoneKey] = { dates: val.dates, ndvi: val.ndvi };
      }
    }
    if (!Object.keys(out).length && Array.isArray(record?.cycles)) {
      for (const c of record.cycles) {
        if (c.series?.dates?.length && c.series?.ndvi?.length) {
          const key = c.zone_id ?? `cycle_${c.sos ?? ''}`;
          out[key] = { dates: c.series.dates, ndvi: c.series.ndvi };
        }
      }
    }
    return out;
  }, [record]);

  const zoneKeys = Object.keys(series);

  useEffect(() => {
    if (!zoneKeys.length) return;
    if (!activeZone) setActiveZone(zoneKeys[0]);
    let cancelled = false;
    loadScript(CHARTJS_JS)
      .then(() => loadScript(CHARTJS_DATE_ADAPTER_JS))
      .then(() => { if (!cancelled) setReady(true); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneKeys.length]);

  useEffect(() => {
    if (!ready || !canvasRef.current || !activeZone || !series[activeZone]) return;
    const Chart = window.Chart;
    if (!Chart) return;
    const { dates, ndvi } = series[activeZone];
    const data = dates.map((d, i) => ({ x: d, y: ndvi[i] }));

    if (chartRef.current) {
      chartRef.current.data.datasets[0].data = data;
      chartRef.current.data.datasets[0].borderColor = zoneColor(activeZone);
      chartRef.current.update();
      return;
    }
    chartRef.current = new Chart(canvasRef.current.getContext('2d'), {
      type: 'line',
      data: { datasets: [{ label: `NDVI · ${activeZone}`, data, borderColor: zoneColor(activeZone), borderWidth: 1.5, pointRadius: 0, tension: 0.15 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { type: 'time', time: { unit: 'month' }, ticks: { font: { size: 9 } } },
          y: { min: 0, max: 1, ticks: { font: { size: 9 } } },
        },
        plugins: { legend: { display: false } },
      },
    });
  }, [ready, activeZone, series]);

  useEffect(() => () => { chartRef.current?.destroy(); chartRef.current = null; }, []);

  if (!zoneKeys.length) return null;

  return (
    <SectionCard title="NDVI Overview">
      {zoneKeys.length > 1 && (
        <div className="flex gap-1 flex-wrap">
          {zoneKeys.map((zk) => (
            <button
              key={zk}
              onClick={() => setActiveZone(zk)}
              className={`text-[10px] px-2 py-0.5 rounded-full border ${
                activeZone === zk
                  ? 'bg-black dark:bg-white text-white dark:text-gray-800 border-black dark:border-white'
                  : 'border-gray-300 dark:border-slate-500 text-gray-500 dark:text-slate-400'
              }`}
            >
              {zk}
            </button>
          ))}
        </div>
      )}
      <div style={{ height: 220 }}>
        <canvas ref={canvasRef} />
      </div>
    </SectionCard>
  );
}
