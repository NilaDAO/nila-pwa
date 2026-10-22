// The map stage's context (MapStage.jsx), in a file of its own so the Sheet (plan/ui.jsx) reads it without an import
// cycle through the plan screens.
import { createContext, useContext } from 'react';

export const StageCtx = createContext(null);
/** The stage's setter ({ set(props) }), or null outside the map-central shell. */
export const useStage = () => useContext(StageCtx);
