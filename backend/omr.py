"""OMR: carga del modelo CRNN y predicción de tokens agnósticos desde bytes en RAM.

Basado en predict.py (referencia). Sin subprocess y sin escribir nada a disco.
"""
import csv
import io
import logging
import os
import threading
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

import numpy as np
import tensorflow as tf
from PIL import Image
from tensorflow import keras
from tensorflow.keras import layers

log = logging.getLogger("notevision.omr")

IMG_HEIGHT = 128
REDUCTION = 8          # submuestreo horizontal de la CNN
CTC_BLANK = 0          # clase 0 = blank; token id i -> clase i + 1
LSTM_UNITS = 128
# El entrenamiento rellena cada imagen hasta (límite de bucket - 1); se replica aquí.
BOUNDS = list(range(600, 2201, 100)) + [2600, 3000, 3600]
MAX_TRAINED_WIDTH = 3600
MAX_PIXELS = 40_000_000  # protección ante imágenes gigantes

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_WEIGHTS = Path(os.environ.get("NOTEVISION_WEIGHTS", BASE_DIR / "models" / "best.weights.h5"))
DEFAULT_VOCAB = Path(os.environ.get("NOTEVISION_VOCAB", BASE_DIR / "models" / "vocab_agnostic.csv"))

# Los modelos de Keras no son seguros ante llamadas concurrentes: se serializa la inferencia.
_infer_lock = threading.Lock()


# ---------------------------------------------------------------- modelo
class CRNN(keras.Model):
    """Misma arquitectura (y mismos nombres de atributos) que en entrenamiento.

    No cambiar nombres ni orden de capas: los pesos se cargan por estructura.
    """

    def __init__(self, num_classes, lstm_units=LSTM_UNITS, dropout=0.25, **kw):
        super().__init__(**kw)
        filters = (32, 64, 128, 256)
        pools = ((2, 2), (2, 2), (2, 2), (2, 1))  # ancho /2 tres veces -> x8
        self.convs = [layers.Conv2D(f, 3, padding="same", use_bias=False) for f in filters]
        self.bns = [layers.BatchNormalization() for _ in filters]
        self.pools = [layers.MaxPool2D(p) for p in pools]
        self.proj = layers.Dense(256, activation="relu")
        self.drop = layers.Dropout(dropout)
        self.rnn1 = layers.Bidirectional(layers.LSTM(lstm_units, return_sequences=True))
        self.rnn2 = layers.Bidirectional(layers.LSTM(lstm_units, return_sequences=True))
        self.classifier = layers.Dense(num_classes)

    def call(self, inputs, training=False):
        x, widths = inputs["image"], inputs["width"]
        for conv, bn, pool in zip(self.convs, self.bns, self.pools):
            x = pool(tf.nn.relu(bn(conv(x), training=training)))
        x = tf.transpose(x, [0, 2, 1, 3])
        s = tf.shape(x)
        x = tf.reshape(x, [s[0], s[1], x.shape[2] * x.shape[3]])
        x = self.drop(self.proj(x), training=training)
        logit_len = widths // REDUCTION
        mask = tf.sequence_mask(logit_len, maxlen=s[1])
        x = self.rnn1(x, mask=mask, training=training)
        x = self.rnn2(self.drop(x, training=training), mask=mask, training=training)
        return self.classifier(self.drop(x, training=training)), logit_len


def load_vocab(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        tokens = [row["token"] for row in csv.DictReader(f)]
    if not tokens:
        raise ValueError(f"Empty vocabulary: {path}")
    return tokens


def load_model(weights=None, vocab=None):
    """Carga vocabulario y pesos. Se llama una sola vez (lifespan de FastAPI)."""
    weights = Path(weights or DEFAULT_WEIGHTS)
    vocab = Path(vocab or DEFAULT_VOCAB)
    if not weights.is_file():
        raise FileNotFoundError(f"Weights file not found: {weights}")
    if not vocab.is_file():
        raise FileNotFoundError(f"Vocabulary file not found: {vocab}")

    tokens = load_vocab(vocab)
    model = CRNN(len(tokens) + 1)
    # Llamada de construcción para crear los pesos antes de cargarlos
    model({"image": tf.zeros([1, IMG_HEIGHT, 256, 1]), "width": tf.constant([256])})
    try:
        model.load_weights(str(weights))
    except Exception as exc:
        raise RuntimeError(
            "Could not load the weights. Check that the vocabulary matches the model "
            "and that the versions match training (TF 2.21.0 / Keras 3.13.2). "
            f"Details: {exc}"
        ) from exc
    log.info("Modelo cargado: %d tokens en el vocabulario", len(tokens))
    return model, tokens


# ---------------------------------------------------------------- preprocesamiento
def read_rgb(data: bytes):
    """Decodifica PNG/JPG desde bytes a RGB uint8. El alfa real se compone sobre blanco."""
    with Image.open(io.BytesIO(data)) as im:
        if im.width * im.height > MAX_PIXELS:
            raise ValueError("The image is too large.")
        im.load()
        if im.mode in ("RGBA", "LA", "PA") or (im.mode == "P" and "transparency" in im.info):
            rgba = im.convert("RGBA")
            fondo = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
            im = Image.alpha_composite(fondo, rgba)
        return np.asarray(im.convert("RGB"))


def padded_width(width):
    for b in BOUNDS:
        if width < b:
            return b - 1
    return width


def preprocess(rgb):
    """Igual que en entrenamiento: gris, alto 128 conservando proporción, tinta=1, fondo=0."""
    gray = tf.image.rgb_to_grayscale(tf.convert_to_tensor(rgb))
    h = tf.cast(tf.shape(gray)[0], tf.float32)
    w = tf.cast(tf.shape(gray)[1], tf.float32)
    new_w = int(tf.maximum(1, tf.cast(tf.round(w * IMG_HEIGHT / h), tf.int32)))
    gray = tf.image.resize(tf.cast(gray, tf.float32), (IMG_HEIGHT, new_w),
                           method="bilinear", antialias=True)
    gray = tf.clip_by_value(gray, 0.0, 255.0)
    image = (1.0 - gray / 255.0).numpy()
    pad_to = padded_width(new_w)
    if pad_to > new_w:
        image = np.pad(image, ((0, 0), (0, pad_to - new_w), (0, 0)))
    return image, new_w


# ---------------------------------------------------------------- decodificación
def greedy_decode(logits, lengths, blank=CTC_BLANK):
    ids = np.argmax(logits, axis=-1)
    out = []
    for seq, n in zip(ids, lengths):
        seq = seq[:n]
        changed = np.concatenate([[True], seq[1:] != seq[:-1]])
        seq = seq[changed]
        out.append((seq[seq != blank] - 1).tolist())
    return out


def predict_from_bytes(model, vocab, data: bytes):
    """Imagen (bytes) -> tokens agnósticos. Todo en memoria."""
    rgb = read_rgb(data)
    height_px, width_px = int(rgb.shape[0]), int(rgb.shape[1])
    if height_px < 8 or width_px < 8:
        raise ValueError("The image is too small.")

    image, width = preprocess(rgb)
    x = tf.convert_to_tensor(image[None], dtype=tf.float32)
    with _infer_lock:
        logits, logit_len = model(
            {"image": x, "width": tf.constant([width], dtype=tf.int32)}, training=False
        )
    ids = greedy_decode(logits.numpy(), logit_len.numpy())[0]

    warnings = []
    if width > MAX_TRAINED_WIDTH:
        warnings.append(
            f"The image is {width} px wide after resizing to height {IMG_HEIGHT}, wider than any "
            f"training image (< {MAX_TRAINED_WIDTH}); the prediction may be unreliable. "
            "Try cropping a shorter system."
        )
    return {
        "tokens": [vocab[i] for i in ids],
        "image_size": {"width": width_px, "height": height_px},
        "warnings": warnings,
    }