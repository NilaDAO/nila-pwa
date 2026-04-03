import { useState, useEffect, useCallback } from 'react';
import { useDataContext } from '../utils/NavigationContext';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

export function useLPProfile({ enabled = true } = {}) {
    const { db } = useDataContext();
    const address = db?.address;
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(false);

    const fetch_ = useCallback(async () => {
        if (!address || !enabled) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/lp/profile?addr=${address}`);
            if (res.ok) setProfile(await res.json());
            else if (res.status === 404) setProfile(null);
        } catch (_) {
            // network error — leave profile null
        } finally {
            setLoading(false);
        }
    }, [address, enabled]);

    useEffect(() => { fetch_(); }, [fetch_]);

    return { profile, loading, refetch: fetch_ };
}
