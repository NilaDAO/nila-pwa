import { createContext, useContext } from 'react';
import useRegFlow from '../../../hooks/useRegFlow';

const FieldRegControllerContext = createContext(null);

export const FieldRegControllerProvider = ({ children }) => {
  const regFlow = useRegFlow();

  return (
    <FieldRegControllerContext.Provider value={{ regFlow }}>
      {children}
    </FieldRegControllerContext.Provider>
  );
};

export const useFieldRegController = () => {
  const ctx = useContext(FieldRegControllerContext);
  if (!ctx) {
    throw new Error('useFieldRegController must be used within FieldRegControllerProvider');
  }
  return ctx;
};
