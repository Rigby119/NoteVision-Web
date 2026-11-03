import { useSyncExternalStore } from 'react';

// Store mínimo con el tiempo de reproducción. Los componentes se suscriben solo a lo que necesitan,
// así el resto de la app no se vuelve a renderizar en cada frame.
export function createPlayerStore() {
    let time = 0;
    let gain = 0.5;
    let seeker = null;
    const subs = new Set();
    return {
        get: () => time,
        set(t) {
            if (t === time) return;
            time = t;
            subs.forEach((f) => f());
        },
        subscribe(f) {
            subs.add(f);
            return () => subs.delete(f);
        },
        setSeeker(fn) {
            seeker = fn;
        },
        seek(t) {
            seeker?.(t);
        },
        getGain: () => gain,
        setGain(g) {
            gain = g;
        },
    };
}

// Evento que suena en el instante t (eventos ordenados por inicio). null si hay un hueco.
export function findActive(events, t) {
    let lo = 0;
    let hi = events.length - 1;
    let found = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (events[mid].start <= t) {
            found = mid;
            lo = mid + 1;
        } else hi = mid - 1;
    }
    if (found < 0) return null;
    const ev = events[found];
    return t < ev.start + ev.duration ? ev : null;
}

export const useTime = (store) => useSyncExternalStore(store.subscribe, store.get);

// Devuelven primitivos: el componente solo se renderiza cuando cambia la nota activa
export const useActiveIndex = (store, events) =>
    useSyncExternalStore(store.subscribe, () => findActive(events, store.get())?.index ?? null);

export const useActiveMidi = (store, events) =>
    useSyncExternalStore(store.subscribe, () => findActive(events, store.get())?.midi ?? null);