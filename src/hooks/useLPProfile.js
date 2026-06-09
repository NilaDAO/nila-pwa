import { useState, useCallback } from 'react';

const LP_STORAGE_KEY = 'lp_profile';

function loadLocal() {
    try {
        const raw = localStorage.getItem(LP_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

export function saveLPLocal(data) {
    localStorage.setItem(LP_STORAGE_KEY, JSON.stringify(data));
}

export function removeLPLocal() {
    localStorage.removeItem(LP_STORAGE_KEY);
}

export function useLPProfile() {
    const [profile, setProfile] = useState(() => loadLocal());

    const refetch = useCallback(() => {
        setProfile(loadLocal());
    }, []);

    return { profile, loading: false, refetch };
}
