// The map stage's context (MapStage.jsx), in a file of its own so the Sheet (plan/ui.jsx) reads it without an import
// cycle through the plan screens.
import { createContext, useContext, useEffect } from 'react';

export const StageCtx = createContext(null);
/** The stage's setter ({ set(props) }), or null outside the map-central shell. */
export const useStage = () => useContext(StageCtx);

/** The map's labels on or off (25 Oct, a toggle above the card): { off, toggle }, kept on the phone. */
export const LabelsCtx = createContext({ off: false, toggle: () => {} });

/** Whether the open sheet is lowered (24 Oct): a fixed info note (NoteBar) goes down with the card. */
export const SheetLowCtx = createContext(false);

/** How the shell under a screen looks (28 Oct; replaces screens editing the shell's DOM): a screen asks for
 *  { flush: no padding under its card (the card clears the tab bar itself), clear: the shell's gradient off so the
 *  map shows, through: the shell lets taps through to the map }. The shell merges every open screen's look. */
export const ShellLookCtx = createContext(null);
export function useShellLook({ flush = false, clear = false, through = false } = {}, on = true) {
  const ctx = useContext(ShellLookCtx);
  const k = on ? `${flush}:${clear}:${through}` : '';
  useEffect(() => {
    if (!ctx || !k || k === 'false:false:false') return undefined;
    const id = {};
    ctx.add(id, { flush, clear, through });
    return () => ctx.remove(id);
  }, [ctx, k]); // eslint-disable-line react-hooks/exhaustive-deps
}
