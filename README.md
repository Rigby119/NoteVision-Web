# NoteVision (DAW Edition)

Aplicación web de reconocimiento óptico de música (OMR). Recortas un sistema de una partitura
(PDF o imagen), un modelo CRNN ya entrenado predice los símbolos, y la app los dibuja con VexFlow y los reproduce con audio sintetizado. Todo se procesa en memoria: no se guarda ningún archivo en el servidor.

## Requisitos

- Python 3.10 o superior (el modelo fue entrenado con TensorFlow 2.21.0 / Keras 3.13.2)
- Node.js 18 o superior
- Archivo de pesos entrenados: `best.weights.h5` y vocabulario: `vocab_agnostic.csv`

## Estructura

```text
notevision/
├── backend/
│   ├── models/              # best.weights.h5 y vocab_agnostic.csv
│   ├── main.py              # FastAPI, carga del modelo (lifespan) y endpoints
│   ├── omr.py               # modelo CRNN y predicción desde bytes
│   ├── score.py             # tokens -> eventos (tono, armadura, alteraciones, duraciones)
│   ├── audio.py             # eventos -> WAV en memoria -> base64
│   ├── test_score.py        # pruebas de la lógica musical (sin TensorFlow)
│   └── requirements.txt
└── frontend/                # React + Vite
    └── src/
        ├── components/      # Layout, DocumentViewer, MusicNotation, AudioPlayback
        ├── styles/theme.css # única fuente de colores (variables CSS)
        └── utils/           # API, parser, VexFlow, audio, MIDI
```

## Instalación

### Backend

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python test_score.py          # debe imprimir: OK: todas las pruebas pasaron
```

Copia `best.weights.h5` y `vocab_agnostic.csv` en `backend/models/`.

### Frontend (desde `frontend/`)

```powershell
npm install
```

## Ejecución

Dos terminales:

```powershell
# Terminal 1: backend (sin --reload, para no recargar TensorFlow en cada cambio)
cd backend
.venv\Scripts\activate
uvicorn main:app --port 8000

# Terminal 2: frontend
cd frontend
npm run dev
```

Abre http://localhost:5173. La píldora de la cabecera debe decir **API online**.

## Uso

1. **Importa:** *Upload PDF/Image* o arrastra un archivo al panel izquierdo (PDF multipágina, PNG o JPEG).
2. **Selecciona:** en *Select Region* dibuja una caja sobre **un solo sistema** (una línea de pentagrama).
   Muévela desde dentro y redimensiónala con los 8 manejadores. No se envía nada hasta confirmar.
3. **Reconoce:** pulsa **Recognize** (o `Enter`). `Esc` descarta los cambios de la caja.
4. **Refina:**
   - *Notation / Piano roll:* cambia la vista. Pasa el cursor por una nota para ver nombre, frecuencia y duración.
   - *Clef:* corrige la clave si se detectó mal. *Revert to prediction* vuelve a la predicha.
     Cambiar la clave o el tempo no vuelve a ejecutar el modelo.
5. **Reproduce:** `Espacio` = play/pausa. Stop, loop, tempo (20–300 bpm) y volumen en el transporte.
   Las teclas del piano (C2–C6) suenan al pulsarlas y se iluminan con la nota que suena.
6. **Historial:** cada región reconocida queda en el panel *History* (máximo 20, solo en memoria).
   Al hacer clic en una miniatura se restaura la notación, el audio, el tempo, la clave y la caja.
7. **Exporta:** *Export WAV* y *Export MIDI* (se generan en el navegador).

## API

- `GET /api/health`: estado del servidor y del modelo.
- `POST /api/process-segment`: imagen (`file`), `bpm` y `clef` opcional. Devuelve tokens, eventos, metadatos y audio en base64.
- `POST /api/render-tokens`: JSON con `tokens`, `bpm` y `clef`. Re-interpreta tokens ya predichos sin correr el modelo.

## Solución de problemas

| Síntoma | Causa probable |
|---|---|
| **API offline** | El backend no está corriendo, o el puerto no es el 8000. |
| **Model not loaded** | Faltan los archivos de `backend/models/` o las versiones de TF/Keras no coinciden. Revisa el detalle al pasar el cursor sobre la píldora. |
| Error de CORS en la consola | El frontend no corre en el puerto 5173. |
| Tonos incorrectos | Prueba otra clave en el selector *Clef*. |
| Compás con aviso *too long* o *incomplete* | El modelo omitió o sobró alguna figura. No se rellena con silencios: se dibuja tal cual. |
| `jq` no reconocido en pruebas con curl | Usa los equivalentes con `python -c` de las pruebas, o `Invoke-RestMethod` (powershell). |

## Limitaciones conocidas

- El audio es monofónico, con un solo timbre (sintetizador aditivo); los acordes sonarían en secuencia.
- La armadura solo se lee antes de la primera nota; un cambio a mitad de pieza se trata como alteraciones locales.
- Los compases se numeran dentro del recorte, no según la partitura original.
- Las ligaduras, tresillos, notas de adorno y fermatas se ignoran (aparecen en `ignored_tokens`).
- Lo mejor es recortar un solo sistema. Los recortes muy anchos pueden salir del rango de entrenamiento.
- El BPM se interpreta como negras por minuto, también en compases compuestos como 6/8.