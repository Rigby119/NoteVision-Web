"""NoteVision API (FastAPI). El modelo se carga una sola vez; nada se persiste en disco."""

import logging
import os
from contextlib import asynccontextmanager
from typing import Annotated, Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, StringConstraints

import audio
import omr
import score

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("notevision.api")

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_AUDIO_SECONDS = 600
ALLOWED_TYPES = {"image/png", "image/jpeg", "image/jpg"}
CORS_ORIGINS = [o.strip() for o in os.environ.get(
    "NOTEVISION_CORS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.model, app.state.vocab, app.state.model_error = None, None, None
    try:
        app.state.model, app.state.vocab = omr.load_model()
    except Exception as exc:  # el servidor arranca igualmente; /api/health muestra el motivo
        log.exception("No se pudo cargar el modelo")
        app.state.model_error = str(exc)
    yield
    app.state.model = None


app = FastAPI(title="NoteVision API", version="1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=False,
                   allow_methods=["*"], allow_headers=["*"])


def build_payload(tokens, bpm, clef, extra_warnings=None, extra_meta=None):
    """tokens -> eventos + audio. Compartido por ambos endpoints."""
    try:
        result = score.interpret(tokens, bpm=bpm, clef_override=clef)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    meta = result["metadata"]
    if meta["duration_sec"] > MAX_AUDIO_SECONDS:
        raise HTTPException(status_code=422, detail="The resulting sequence is too long.")
    meta["warnings"].extend(extra_warnings or [])
    meta.update(extra_meta or {})

    wav = audio.synthesize_wav(result["events"])
    return {
        "status": "success",
        "raw_tokens": tokens,
        "audio_b64": audio.to_data_uri(wav) if wav else None,
        "metadata": meta,
        "events": result["events"],
    }


@app.get("/api/health")
def health(request: Request):
    st = request.app.state
    return {"status": "ok" if st.model is not None else "degraded",
            "model_loaded": st.model is not None, "error": st.model_error}


@app.post("/api/process-segment")
def process_segment(
    request: Request,
    file: UploadFile = File(...),
    bpm: int = Form(120, ge=20, le=300),
    clef: Optional[str] = Form(None),
):
    """Imagen recortada (un sistema) -> tokens + eventos + audio base64."""
    st = request.app.state
    if st.model is None:
        raise HTTPException(status_code=503, detail=f"Model not available: {st.model_error}")
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Only PNG or JPEG images are supported.")

    data = file.file.read(MAX_UPLOAD_BYTES + 1)  # en RAM, sin archivos temporales
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="The image exceeds the 10 MB limit.")
    if not data:
        raise HTTPException(status_code=400, detail="Empty file.")

    try:
        pred = omr.predict_from_bytes(st.model, st.vocab, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        log.exception("Fallo en la inferencia")
        raise HTTPException(status_code=500, detail="Internal error while processing the image.")

    return build_payload(pred["tokens"], bpm, clef,
                         extra_warnings=pred["warnings"],
                         extra_meta={"image_size": pred["image_size"]})


class RenderRequest(BaseModel):
    tokens: list[Annotated[str, StringConstraints(max_length=64)]] = Field(..., min_length=1, max_length=2000)
    bpm: int = Field(120, ge=20, le=300)
    clef: Optional[str] = None  # p. ej. "F-L4"; None = usar lo predicho


@app.post("/api/render-tokens")
def render_tokens(body: RenderRequest):
    """Re-interpreta tokens ya predichos (otra clave / otro BPM) sin volver a correr el modelo."""
    return build_payload(body.tokens, body.bpm, body.clef)