// DEVIATION (executive decision 22 Oct, map-central trial): History (A12), Settings (A11, LS) and the wallet QR (A1a)
// are map cards on the shared map stage. Opened, the card takes the full screen height (rising from where A1's card
// stands) and covers the map; dragged down it shows the map like the other cards; back returns to A1. Outside the
// map-central shell the screen is drawn as before (ScreenHeader on the gradient).
import { useEffect } from 'react';
import { Sheet } from '../plan/ui';
import { useStage } from './stageCtx';
import { homeTop, useHomeMap } from './MapStage';
import { HeaderRow, ScreenHeader } from './ListRow';

const openShare = (t) => { window.location.hash = `#/cropshare/${t}`; };

/** header: ScreenHeader's props (title, onBack, onSettings, settings), or head: a header row of its own (G1: A1L's).
 *  map: a map of its own instead of her land (G1: the union's properties). full: false leaves her map in view above the
 *  card (G2). style: the screen's own wrapper style. */
export default function MapCard({ header, head, map, full = true, style, children }) {
  const stage = useStage();
  const home = useHomeMap(openShare, window.innerHeight - homeTop() + 32);
  useEffect(() => { if (stage) window.scrollTo(0, 0); }, [stage]);   // a card opens at its top, not where A1 was scrolled
  if (!stage) return <div style={style}>{head || <ScreenHeader {...header} />}{children}</div>;
  // The screen's own cards keep their 8 px gutter: the sheet's 22 px padding is taken back.
  const { padding, ...rest } = style || {};
  return (
    <Sheet map={map || home.map || <span />} full={full} top={full ? undefined : Math.round(window.innerHeight * 0.4)} head={head || <HeaderRow {...header} />}>
      <div style={{ ...rest, margin: '0 -14px', minHeight: undefined }}>{children}</div>
    </Sheet>
  );
}
