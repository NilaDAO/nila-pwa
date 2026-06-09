import React, { createContext, useContext, useState } from 'react';

export const FieldRegContext = createContext();

export const useFieldRegContext = () => useContext(FieldRegContext)

export const FieldRegProvider = ({ children }) => {
  const [ fieldReg , setFieldReg ] = useState({
    'tcAccept': false, // terms and conditions accepted
    'verificationMode': true, // verification mode is not active
    'polling': 0,
    'remote': false,
    'track': false,
    'marker': false,
    'panMode': null, // is null or a number
    'apiOnline': false,
    'flow': 0,
    'positions': [],
    'polygons': [],
    'results': null,
    'property': { 'name': '', 'shape': [] },
    'approvedFields': [],
    'altPolygons': [],
    'sufficientGas': undefined,
    'alts': [],
    'neighbours': [],
    'messages': 0,
    'suppressPolygonUntil': 0,
    'rectStrength': 0.5,
    'cornerStrength': 0
  }) // field registration flow  

  const updateFieldReg = (updates) => {
    setFieldReg(prev =>
      typeof updates === 'function' ? updates(prev) : { ...prev, ...updates }
    );
  };

  return (
    <FieldRegContext.Provider value={{ fieldReg, updateFieldReg }}>
      {children}
    </FieldRegContext.Provider> 
  );
}
