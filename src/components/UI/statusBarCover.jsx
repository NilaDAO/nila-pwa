export default function StatusBarCover({ bg, opacity = 0.75, capPx = 20 }) {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const m = ua.match(/Android\s([0-9]+)/i);
  const androidMajor = m ? parseInt(m[1], 10) : undefined;
  const isA10 = androidMajor === 10;

  const height = `calc(env(safe-area-inset-top) + ${capPx}px)`;
  const styleBg = bg
    ? {
        backgroundImage: `linear-gradient(rgba(0,0,0,${opacity}), rgba(0,0,0,${opacity})), url("${bg}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }
    : { backgroundColor: `rgba(0,0,0,${opacity})` };

  if (isA10) {
    // ANDROID 10: render BOTH the fixed overlay (visible above header)
    // and an in-flow spacer (push content down so it doesn't sit under the overlay)
    return (
      <>
        <div
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0,
            height,
            zIndex: 9999,
            pointerEvents: "none",
            ...styleBg,
          }}
        />
        <div
          className="statusbar-spacer"
          style={{ height, ...styleBg }}
        />
      </>
    );
  }

  // Android 11+ can use just the fixed overlay
  return (
    <div
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0,
        height,
        zIndex: 9999,
        pointerEvents: "none",
        ...styleBg,
      }}
    />
  );
}
