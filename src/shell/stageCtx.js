// The map stage's context (MapStage.jsx), in a file of its own so the Sheet (plan/ui.jsx) reads it without an import
// cycle through the plan screens.
import { createContext, useContext } from 'react';

export const StageCtx = createContext(null);
/** The stage's setter ({ set(props) }), or null outside the map-central shell. */
export const useStage = () => useContext(StageCtx);

/** The map's labels on or off (25 Oct, a toggle above the card): { off, toggle }, kept on the phone. */
export const LabelsCtx = createContext({ off: false, toggle: () => {} });

/** Whether the open sheet is lowered (24 Oct): a fixed info note (NoteBar) goes down with the card. */
export const SheetLowCtx = createContext(false);
