import { useEffect, useRef, useState, memo } from "react";

function CountdownCircleBase({
  remainingSec,
  timerRef,
  onDone,
  size,
  label = "Countdown",
}) {
  const [remaining, setRemaining] = useState(() => Math.max(0, remainingSec));
  const doneCalled = useRef(false);

  useEffect(() => {
    doneCalled.current = false;
    setRemaining(Math.max(0, remainingSec));
  }, [remainingSec]);

  useEffect(() => {
    const start = Math.floor(Date.now() / 1000);
    const startRemaining = Math.max(0, remainingSec);
    const tick = () => {
      const elapsed = Math.floor(Date.now() / 1000) - start;
      const rem = Math.max(0, startRemaining - elapsed);
      setRemaining(rem);
      if (timerRef) timerRef.current = rem;
      if (rem === 0 && onDone && !doneCalled.current) {
        doneCalled.current = true;
        onDone();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [remainingSec, onDone, timerRef]);

  const days    = Math.floor(remaining / 86400);
  const hours   = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  const pad = (n) => n.toString().padStart(2, "0");
  const text = days > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)} sec`;

  return (
    <div
      aria-label={label}
      role="timer"
      style={{ width: size, height: size }}
      className="flex flex-col rounded-full bg-white text-black font-bold items-center justify-center select-none"
    >
      <span className="text-xs">{days} days</span>
      <span className="text-xs">{text}</span>
    </div>
  );
}

export const CountdownCircleWithdraw = memo(CountdownCircleBase, (a, b) =>
  a.remainingSec === b.remainingSec && a.size === b.size && a.label === b.label
);

export function CountdownCircle({
  endTs,
  durationSec = 0,
  timerRef,
  onDone,
  size,
  label = "Countdown",
  }) {
    const targetSec = (() => {
      if (endTs instanceof Date) return Math.floor(endTs.getTime() / 1000);
      if (typeof endTs === "bigint") return Number(endTs);
      if (typeof endTs === "number") return endTs;
      return Math.floor(Date.now() / 1000) + Math.max(0, Math.floor(durationSec));
    })();

    const [remaining, setRemaining] = useState(() =>
      Math.max(0, targetSec - Math.floor(Date.now() / 1000))
    );
    const doneCalled = useRef(false);

    useEffect(() => {
      const tick = () => {
        const now = Math.floor(Date.now() / 1000);
        const rem = Math.max(0, targetSec - now);
        setRemaining(rem);
        if (timerRef) timerRef.current = rem;
        if (rem === 0 && onDone && !doneCalled.current) {
          doneCalled.current = true;
          onDone();
        }
      };
      tick();
      const id = setInterval(tick, 1000);
      return () => clearInterval(id);
    }, [targetSec, onDone, timerRef]);

    const dd = Math.floor(remaining / 86400);
    const hh = Math.floor((remaining % 86400) / 3600);
    const mm = Math.floor((remaining % 3600) / 60);
    const ss = remaining % 60;
    const pad = (n) => n.toString().padStart(2, "0");
    const text = hh > 0 ? `${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)} sec`;

    return (
      <div
        aria-label={label}
        role="timer"
        style={{ width: size, height: size }}
        className="flex flex-col rounded-full bg-white text-black font-bold flex items-center justify-center select-none"
      >
        <span>{dd} days</span>
        <span className='text-xs' >{text}</span>
      </div>
    );
}


export function TimerCircle({ timerRef }) {
  const [seconds, setSeconds] = useState(timerRef.current || 0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds(prev => {
        const newSeconds = prev + 1;
        timerRef.current = newSeconds;
        return newSeconds;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const minutes = Math.floor(seconds / 60);
  const sec = seconds % 60;
  const formatted = `${minutes}:${sec < 10 ? '0' + sec : sec} sec`;

  return (
    <div style={{
      width: '80px',
      height: '80px',
      color: 'black',
      fontStyle: 'bold',
      backgroundColor: 'white',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {formatted}
    </div>
  );
}
