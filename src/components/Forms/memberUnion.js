import { useState, useEffect } from 'react';
import { useViewModeContext } from '../../utils/NavigationContext';
import { useIsLeader } from '../../hooks/useLoadFunds.ts';
import { ClaimButton } from '../UI/buttons';
import { setDBitem } from '../../utils/db'

const MemberUnion = ({handleSetNotifications, address, chain}) => {
    const { setCardView }                    = useViewModeContext() 
    const [ unions, setUnions ]              = useState([])
    const [ selectedUnion, setSelectedUnion] = useState(null);
    const { isLeader }                       = useIsLeader({ address, chain })
    
    useEffect(() => {
        setCardView('transactionview')
        // fetch unions in the area "அன்னை தெரசா சகோதர வாழ்வு நாணய சங்கம்"
        const rpc = process.env.REACT_APP_RPC || '';
        const isLocal = rpc.includes('127.0.0.1') || rpc.includes('localhost');
        const rows = isLocal ? [
            { name: "Local Test Union", rep: "Hardhat account[2]", address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', location: [11.878671,78.964561], chain: 31337, transfers: true },
        ] : [
            { name: "Mother Theresa Union", rep: "Mrs. Rosalie Susairaj", address: '0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070', location: [11.878671,78.964561], chain: 137, transfers: true },
        ]
        setUnions(rows)
    },[])

    const handleAreaLookup = async () => {
        // trigger location granting// Check geolocation permission
        if (navigator.permissions) {
        navigator.permissions.query({ name: 'geolocation' }).then(result => {
            navigator.geolocation.getCurrentPosition((position) => {
                const { latitude, longitude } = position.coords;
                console.log('Current position:', latitude, longitude)
                // update the union list based on the location
            })
        })}
    }

    const handleSetUnion = async () => {
        console.log('set selected union', selectedUnion)
        // call genericFUnd roles to see if this user is a leader.
        const { transfers, address, rep, name,chain, location } = selectedUnion;
        try {
            console.log('address to probe for leadership:', address)
            const userIsLeader = await isLeader(address)
            console.log('set userIsLeader', userIsLeader)
            const values = { leader: userIsLeader, transfer: transfers, address, rep, name, chain, location }
            await setDBitem('union',values,'Init')
            console.log('set notification')
            // reset union query, call local state
            handleSetNotifications(name);
        } catch (e){
            console.log('err', e)
            const values = {  leader: undefined, transfer: transfers, address, rep, name, chain, location }
            await setDBitem('union',values,'Init')
            console.log('set notification')
            // reset union query, call local state
            handleSetNotifications(name);
        }

    }
    
    const UnionTable = ({unions}) => (
        <table className="w-full my-3 table-auto border-collapse">
        <thead>
            <tr>
            <th className="px-4 py-2 text-left dark:text-slate-400">Name</th>
            <th className="px-4 py-2 text-left dark:text-slate-400">Representative</th>
            </tr>
        </thead>
        <tbody>
            {unions.map((row, index) => (
            <tr
                key={index}
                onClick={() => setSelectedUnion(row)}
                className={`cursor-pointer ${
                selectedUnion === row ? "bg-gray-200 dark:bg-slate-800" : "hover:bg-gray-100 dark:hover:bg-slate-700"
                }`}
            >
                <td className="border border-gray-300 dark:text-white p-4 py-2">{row.name}</td>
                <td className="border border-gray-300 dark:text-white p-4 py-2">{row.rep}</td>
            </tr>
            ))}
        </tbody>
        </table>
    )
    
    return (
        <div className="flex flex-col items-center mx-12 my-6 justify-center">
            <p className="flex font-bold dark:text-white">Select a Union</p>
            <UnionTable unions={unions} />
            <div className='flex flex-row w-full my-6 justify-evenly'>
                <ClaimButton disabled={true} handleClick={handleAreaLookup} title={'Filter on my region'} color={'white'}/>   
                <ClaimButton disabled={selectedUnion ? false : true} handleClick={handleSetUnion} title={'Save'} />   
            </div>
        </div>
    )
}

export default MemberUnion
