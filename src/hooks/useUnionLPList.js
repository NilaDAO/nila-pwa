import { useState, useEffect, useCallback } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

export function useUnionLPList(unionAddr) {
    const [lps, setLps] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetch_ = useCallback(async () => {
        if (!unionAddr) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/lp/sync?union=${unionAddr}`);
            if (res.ok) {
                const data = await res.json();
                setLps(data.lps ?? []);
            }
        } catch { /* network error — keep stale */ }
        finally { setLoading(false); }
    }, [unionAddr]);

    useEffect(() => { fetch_(); }, [fetch_]);

    return { lps, loading, refetch: fetch_ };
}

export async function addLPToSync(union_addr, lp_addr) {
    return fetch(`${API_BASE_URL}/lp/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ union_addr, lp_addr }),
    });
}
