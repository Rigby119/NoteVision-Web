import { useActiveMidi } from '../../utils/usePlayerStore.js';
import { playPreview } from '../../utils/audioUtils.js';

const LOW = 36; // C2
const HIGH = 84; // C6
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK = new Set([1, 3, 6, 8, 10]);

// Teclas C2..C6; "slot" = cuántas teclas blancas hay antes (posición horizontal)
const LAYOUT = (() => {
    const keys = [];
    let whites = 0;
    for (let m = LOW; m <= HIGH; m += 1) {
        const black = BLACK.has(m % 12);
        keys.push({ midi: m, black, slot: whites, name: `${NAMES[m % 12]}${Math.floor(m / 12) - 1}` });
        if (!black) whites += 1;
    }
    return { keys, whites };
})();

/** Teclado de 4 octavas. Resalta la nota que suena y la que está bajo el cursor en la notación. */
export default function InteractivePiano({ store, events, hoverMidi }) {
    const active = useActiveMidi(store, events);
    const outside = active != null && (active < LOW || active > HIGH);
    const w = 100 / LAYOUT.whites;
    const bw = w * 0.62;

    return (
        <div className="piano-wrap">
            <div className="piano" role="group" aria-label="Piano keyboard, C2 to C6">
                {outside && <span className="badge piano__oor">Note outside C2–C6</span>}
                {LAYOUT.keys.map((k) => {
                    const state = k.midi === active ? 'active' : k.midi === hoverMidi ? 'hover' : 'idle';
                    const style = k.black
                        ? { left: `${k.slot * w - bw / 2}%`, width: `${bw}%` }
                        : { left: `${k.slot * w}%`, width: `${w}%` };
                    return (
                        <button
                            key={k.midi}
                            type="button"
                            className={`piano__key piano__key--${k.black ? 'black' : 'white'}`}
                            data-state={state}
                            style={style}
                            aria-label={k.name}
                            aria-pressed={state === 'active'}
                            onPointerDown={() => playPreview(k.midi, store.getGain())}
                        >
                            {!k.black && k.name.startsWith('C') && <span className="piano__label mono">{k.name}</span>}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}