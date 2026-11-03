import { useSyncExternalStore } from 'react';

// Puntos de corte de la especificación: >=1440 wide, 1024-1439 medium, <1024 small
const WIDE = '(min-width: 1440px)';
const MEDIUM = '(min-width: 1024px)';

function subscribe(callback) {
    const queries = [window.matchMedia(WIDE), window.matchMedia(MEDIUM)];
    queries.forEach((q) => q.addEventListener('change', callback));
    return () => queries.forEach((q) => q.removeEventListener('change', callback));
}

function getSnapshot() {
    if (window.matchMedia(WIDE).matches) return 'wide';
    if (window.matchMedia(MEDIUM).matches) return 'medium';
    return 'small';
}

export function useLayoutMode() {
    return useSyncExternalStore(subscribe, getSnapshot);
}