import { useEffect, useRef } from 'react';
import { useFieldRegContext } from '../../utils/FieldRegContext';
import { useDataContext } from '../../utils/NavigationContext';
import { setDBitem } from '../../utils/db'
import axios from 'axios';
import TC from "../../misc/tc.json";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL

function is3D(arr) {
  return (
    Array.isArray(arr) &&
    arr.length > 0 &&
    Array.isArray(arr[0]) &&
    arr[0].length > 0
  );
}

export const FetchThumb = async (LAND) => {
  const land_v2 = LAND?.metadata?.hasOwnProperty('fields') ? true : false
  const outline = land_v2 ? LAND?.metadata?.outline : LAND
  const url = `${API_BASE_URL}/map_thumb/`;
  // if a outline consist of multiple polygons =3D, we only send the first..
  const _outline = is3D(outline) ? outline[0] : outline
  const to_list = _outline.map(p => [p.lat, p.lng])
  const data = {
    coordinates: to_list,
    screen_width: window.screen.width
  };
  try {
    const ThumbResponse = await axios.post(url, data, {
      responseType: "blob",
      headers: {
        'Content-Type': 'application/json',
      }
    });
    await setDBitem('thumb', ThumbResponse.data, 'FarmData')
    return ThumbResponse.data
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
  }
}

const FarmNameForm = ({ LAND }) => {
  const { fieldReg, updateFieldReg } = useFieldRegContext()
  const { flow, property, tcAccept } = fieldReg
  const { setDb } = useDataContext()

  const lastSavedNameRef = useRef('')
  const savingRef = useRef(false)

  const TermsConditions = ({ TC }) => (
    <div key="info">
      <p className='text-sm px-4 py-4'><i>{TC.title}</i></p>
      {!tcAccept &&
        <div className='flex h-64 overflow-y-scroll flex-col my-6'>
          <p className='text-sm font-bold px-4'>{TC.p1_title}</p>
          <p className='text-sm px-4'>{TC.p1}</p>
          <p className='text-sm font-bold px-4 pt-4'>{TC.p2_title}</p>
          <p className='text-sm px-4'>{TC.p2}</p>
          <p className='text-sm font-bold px-4 pt-4'>{TC.p3_title}</p>
          <p className='text-sm px-4'>{TC.p3}</p>
          <p className='text-sm font-bold px-4 pt-4'>{TC.p4_title}</p>
          <p className='text-sm px-4'>{TC.p4}</p>
          <p className='text-sm px-4 pt-4'>{TC.last}</p>
        </div>
      }
    </div>
  )

  const handleStoreNameCheckThumb = async (nameOverride) => {
    const name = String(nameOverride ?? property?.name ?? '').trim()
    if (!name || savingRef.current || lastSavedNameRef.current === name) return

    savingRef.current = true
    try {
      const thumbInput = LAND?.current?.LAND ?? LAND?.LAND ?? LAND
      if (thumbInput) {
        const res = await FetchThumb(thumbInput)
        if (res) setDb('thumb', res, 'FarmData')
      }
      await setDBitem('farmname', name, 'Init')
      lastSavedNameRef.current = name
    } finally {
      savingRef.current = false
    }
  }

  useEffect(() => {
    if (flow >= 10) return
    const name = String(property?.name ?? '').trim()
    if (!name) return
    handleStoreNameCheckThumb(name)
  }, [property?.name, flow])

  return (
    <div className="p-4">
      <div className="flex flex-row text-black items-center px-4">
        <span className="dark:text-white">Farm name:</span>
        <input
          id="farmname"
          type="text"
          placeholder='add farm name'
          value={property?.name || ''}
          onChange={(e) =>
            updateFieldReg(prev => ({
              ...prev,
              property: { ...prev.property, name: e.target.value, named: false }
            }))
          }
          className="h-9 text-sm px-3 mx-3 font-bold text-gray-900 bg-slate-100 dark:text-white dark:bg-slate-700 border border-slate-400 rounded-lg"
        />
      </div>
      <span className="flex flex-row text-gray-800 dark:text-slate-400 px-4 my-6">
        The farm name is part of your property asset and can NOT be changed afterwards.
      </span>
      {(flow === 10 || flow === 13) &&
        <>
          <TermsConditions TC={TC} />
          <div className="flex p-8">
            <input
              checked={!!tcAccept}
              type="checkbox"
              onChange={(e) =>
                updateFieldReg(prev => ({
                  ...prev,
                  tcAccept: e.target.checked
                }))
              }
              className="w-6 h-6 accent-black border-gray-300 rounded" />
            <div className="flex font-bold px-3">Accept</div>
          </div>
        </>
      }
    </div>
  );
};

export default FarmNameForm
