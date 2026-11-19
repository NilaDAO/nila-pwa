// A land-title read that failed (SCF T2 row 25, 19 Nov): said at once with a retry, never taken as "no title" (which
// would open registration for a title holder). TEXT TO APPROVE: "Could not load your land title…", "Try again".
import RegFrame from './RegFrame';

export default function TitleFailed({ titleCount }) {
  const where = titleCount.failed.length === 1 && titleCount.failed[0] === 'polygon' ? ' on Polygon' : '';
  return (
    <RegFrame>
      <div role="alert" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <p style={{ margin: 0, textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>
          Could not load your land title{where}. Check your internet.
        </p>
        <button type="button" onClick={titleCount.retry} style={{ height: 44, padding: '0 24px', borderRadius: 22, border: 0,
          background: '#2A2A2A', color: '#F5F5F5', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Try again</button>
      </div>
    </RegFrame>
  );
}
