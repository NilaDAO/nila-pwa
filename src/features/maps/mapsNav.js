import React, { memo } from 'react'
import StaticMapNav from './FieldView/staticNav';
import FieldRegNav from './FieldRegistration/fieldRegNav';

const MapNav = ({ LAND, onFeatureClick, cardView }) => {
  const hasLand = Boolean(LAND?.current?.hasLand);
  const hasPendingMint = Boolean(LAND?.current?.pendingMint);
  const hasPendingMetadata = Boolean(LAND?.current?.metadata || LAND?.current?.LAND?.metadata);
  const showFieldRegNav = !hasLand && !hasPendingMint && !hasPendingMetadata;
  const showStaticNav = hasLand || hasPendingMint || hasPendingMetadata;

  return (
    /**
     * Load map object if no offline map stored locally
     */
    <>
      <div className="pointer-events-none inset-0 bg-gradient-to-b from-white to-slate-100" />
      {/* Nav (clickable) sits *above* the gradient, but still below the card */}
      {showStaticNav ? (
        <StaticMapNav LAND={LAND} onFeatureClick={onFeatureClick} cardView={cardView} className="absolute inset-0 z-30" />
      ) : showFieldRegNav ? (
        <FieldRegNav className="absolute inset-0 z-30" />
      ) : null}
    </>
  );
}

export default memo(MapNav);
