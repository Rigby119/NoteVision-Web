import { useEffect, useState } from 'react';
import { getHealth } from './api';

const POLL_MS = 10000;

// Consulta /api/health periódicamente: online | degraded (sin modelo) | offline | checking
export function useApiHealth() {
    const [health, setHealth] = useState({ state: 'checking', error: null });

    useEffect(() => {
        const ctrl = new AbortController();
        let timer;

        const check = async () => {
            try {
                const h = await getHealth(ctrl.signal);
                setHealth(h.model_loaded ? { state: 'online', error: null } : { state: 'degraded', error: h.error });
            } catch (err) {
                if (ctrl.signal.aborted) return;
                setHealth({ state: 'offline', error: err.message });
            }
            if (!ctrl.signal.aborted) timer = setTimeout(check, POLL_MS);
        };

        check();
        return () => {
            ctrl.abort();
            clearTimeout(timer);
        };
    }, []);

    return health;
}