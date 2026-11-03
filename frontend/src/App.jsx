import { useCallback, useEffect, useRef, useState } from 'react';
import { History, PanelLeftClose, PanelLeftOpen, ScanLine, Trash2 } from 'lucide-react';
import Header from './components/Layout/Header.jsx';
import Panel from './components/Layout/Panel.jsx';
import Placeholder from './components/Layout/Placeholder.jsx';
import Segmented from './components/Layout/Segmented.jsx';
import HistoryDrawer from './components/Layout/HistoryDrawer.jsx';
import DocumentViewer from './components/DocumentViewer/DocumentViewer.jsx';
import RecognitionStatus from './components/MusicNotation/RecognitionStatus.jsx';
import ClefSelect from './components/MusicNotation/ClefSelect.jsx';
import WaveformPlayer from './components/AudioPlayback/WaveformPlayer.jsx';
import InteractivePiano from './components/AudioPlayback/InteractivePiano.jsx';
import { processSegment, renderTokens } from './utils/api.js';
import { dataUriToBlob, downloadBlob } from './utils/audioUtils.js';
import { buildMidiBlob } from './utils/midiExport.js';
import { createPlayerStore } from './utils/usePlayerStore.js';
import { useApiHealth } from './utils/useApiHealth.js';
import { useLayoutMode } from './utils/useLayoutMode.js';

const ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_HISTORY = 20;
const DEFAULT_BPM = 120;
const NO_EVENTS = [];
const VIEWS = [
  { value: 'notation', label: 'Notation' },
  { value: 'roll', label: 'Piano roll' },
];

export default function App() {
  const mode = useLayoutMode(); // 'wide' | 'medium' | 'small'
  const health = useApiHealth();

  const [store] = useState(createPlayerStore); // tiempo de reproducción (fuera del estado de React)
  const [sourceFile, setSourceFile] = useState(null);
  const [sourceId, setSourceId] = useState(0); // fuerza a remontar el visor al cambiar de archivo
  const [region, setRegion] = useState(null); // última región enviada { page, x, y, w, h }
  const [regionNumber, setRegionNumber] = useState(0); // número de la región mostrada
  const [resultFile, setResultFile] = useState(null); // documento al que pertenece el resultado
  const [status, setStatus] = useState('idle'); // 'idle' | 'processing' | 'done' | 'error'
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // respuesta del backend
  const [bpm, setBpm] = useState(DEFAULT_BPM);
  const [clefOverride, setClefOverride] = useState(null); // null = clave predicha
  const [rendering, setRendering] = useState(false); // re-interpretación (clave / BPM) en curso
  const [renderError, setRenderError] = useState(null);
  const [view, setView] = useState('notation'); // 'notation' | 'roll'
  const [hoverNote, setHoverNote] = useState(null); // nota bajo el cursor (notación o piano roll)
  const [history, setHistory] = useState([]); // más reciente primero, máximo MAX_HISTORY
  const [activeId, setActiveId] = useState(null); // entrada del historial que se está mostrando
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState('source'); // pestañas en modo small
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState(null);

  const abortRef = useRef(null);
  const renderAbortRef = useRef(null);
  const jobRef = useRef(null); // último recorte enviado (para reintentar)
  const counterRef = useRef(0); // numeración de regiones de la sesión
  const idRef = useRef(0);

  // El panel solo se colapsa en el rango medio; en wide siempre está abierto
  const isCollapsed = mode === 'medium' && collapsed;
  const stage = status === 'processing' ? 'recognize' : status === 'done' ? 'refine' : 'import';

  useEffect(
    () => () => {
      abortRef.current?.abort();
      renderAbortRef.current?.abort();
    },
    [],
  );

  // Mantiene la entrada activa del historial al día (clave y tempo cambian tras reconocer)
  useEffect(() => {
    if (activeId == null || !result) return;
    setHistory((h) => h.map((e) => (e.id === activeId ? { ...e, result, bpm, clefOverride } : e)));
  }, [result, bpm, clefOverride, activeId]);

  const resetRefinement = () => {
    renderAbortRef.current?.abort();
    setClefOverride(null);
    setRendering(false);
    setRenderError(null);
    setHoverNote(null);
  };

  const runRecognition = useCallback(
    async (job) => {
      abortRef.current?.abort(); // un envío nuevo cancela la petición anterior
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      resetRefinement();
      setActiveId(null);
      setStatus('processing');
      setError(null);
      setResult(null);
      try {
        const data = await processSegment(job.blob, { bpm, signal: ctrl.signal });
        if (ctrl.signal.aborted) return;
        idRef.current += 1;
        const entry = {
          id: idRef.current,
          number: job.number,
          time: new Date().toLocaleTimeString('en-GB', { hour12: false }),
          thumb: job.thumb,
          page: job.page,
          rect: job.rect,
          sourceId: job.sourceId,
          fileName: job.fileName,
          result: data,
          bpm,
          clefOverride: null,
        };
        setResult(data);
        setResultFile(job.fileName);
        setStatus('done');
        setHistory((h) => [entry, ...h].slice(0, MAX_HISTORY));
        setActiveId(entry.id);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        setError(err.message);
        setStatus('error');
      }
    },
    [bpm],
  );

  // Re-interpreta los tokens con otra clave y/o BPM, sin volver a correr el modelo.
  // clef: undefined = mantener, null = clave predicha. nextBpm: undefined = mantener.
  const rerender = useCallback(
    async ({ clef, bpm: nextBpm }) => {
      if (!result) return;
      const finalClef = clef === undefined ? clefOverride : clef;
      const finalBpm = nextBpm === undefined ? bpm : nextBpm;
      renderAbortRef.current?.abort();
      const ctrl = new AbortController();
      renderAbortRef.current = ctrl;
      setRendering(true);
      setRenderError(null);
      try {
        const data = await renderTokens(result.raw_tokens, { bpm: finalBpm, clef: finalClef, signal: ctrl.signal });
        if (ctrl.signal.aborted) return;
        setResult(data);
        setClefOverride(finalClef);
        setBpm(finalBpm);
        setHoverNote(null);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        setRenderError(err.message);
      } finally {
        if (!ctrl.signal.aborted) setRendering(false);
      }
    },
    [result, clefOverride, bpm],
  );

  const applyClef = useCallback((clef) => rerender({ clef }), [rerender]);
  const applyBpm = useCallback((value) => rerender({ bpm: value }), [rerender]);

  // El visor llama aquí solo cuando el usuario pulsa "Recognize"
  const handleRecognize = useCallback(
    ({ blob, thumb, page, rect }) => {
      counterRef.current += 1;
      const job = {
        blob,
        thumb,
        page,
        rect,
        number: counterRef.current,
        sourceId,
        fileName: sourceFile?.name ?? null,
      };
      jobRef.current = job;
      setRegion({ page, ...rect });
      setRegionNumber(job.number);
      if (mode === 'small') setTab('notation');
      runRecognition(job);
    },
    [mode, sourceId, sourceFile, runRecognition],
  );

  const handleRetry = useCallback(() => {
    if (jobRef.current) runRecognition(jobRef.current);
  }, [runRecognition]);

  // Restaura la predicción completa de una entrada del historial
  const handleSelectHistory = useCallback(
    (entry) => {
      abortRef.current?.abort();
      renderAbortRef.current?.abort();
      jobRef.current = null;
      setResult(entry.result);
      setResultFile(entry.fileName);
      setBpm(entry.bpm);
      setClefOverride(entry.clefOverride);
      setStatus('done');
      setError(null);
      setRendering(false);
      setRenderError(null);
      setHoverNote(null);
      setActiveId(entry.id);
      setRegionNumber(entry.number);
      // La caja solo tiene sentido si la entrada es del documento abierto
      setRegion(entry.sourceId === sourceId ? { page: entry.page, ...entry.rect } : null);
      if (mode === 'small') setTab('notation');
    },
    [sourceId, mode],
  );

  const clearHistory = () => {
    setHistory([]);
    setActiveId(null);
  };

  const handleFile = useCallback((file) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setNotice('Unsupported file. Please use a PDF, PNG or JPEG.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setNotice('The file is larger than 50 MB.');
      return;
    }
    abortRef.current?.abort();
    renderAbortRef.current?.abort();
    jobRef.current = null;
    setNotice(null);
    setSourceFile(file);
    setSourceId((id) => id + 1);
    setRegion(null);
    setRegionNumber(0);
    setResultFile(null);
    setResult(null);
    setError(null);
    setClefOverride(null);
    setRendering(false);
    setRenderError(null);
    setHoverNote(null);
    setActiveId(null);
    setStatus('idle');
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };
  const handleDragLeave = (e) => {
    // Ignora los eventos que solo pasan de un hijo a otro
    if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // Exportación: todo se genera en memoria y se descarga desde el navegador
  const exportName = () => {
    const base = (resultFile ?? sourceFile?.name ?? 'notevision').replace(/\.[^.]+$/, '');
    return `${base}-region-${String(regionNumber).padStart(2, '0')}`;
  };
  const handleExportWav = () => {
    if (result?.audio_b64) downloadBlob(dataUriToBlob(result.audio_b64), `${exportName()}.wav`);
  };
  const handleExportMidi = () => {
    if (result) downloadBlob(buildMidiBlob(result), `${exportName()}.mid`);
  };

  // Los compases se numeran dentro del recorte (el modelo no conoce la numeración real)
  const bars = result?.metadata?.measure_count ?? 0;
  const regionLabel = region
    ? `Region ${String(regionNumber).padStart(2, '0')}${bars > 0 ? ` · Bars 1–${bars}` : ''}`
    : null;

  const canExport = Boolean(result?.audio_b64);

  return (
    <div className="app">
      <Header
        fileName={sourceFile?.name}
        stage={stage}
        apiState={health.state}
        apiError={health.error}
        canExport={canExport}
        onFile={handleFile}
        onExportWav={handleExportWav}
        onExportMidi={handleExportMidi}
      />

      {notice && (
        <div className="notice" role="alert">
          <span>{notice}</span>
          <button type="button" className="btn" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      {mode === 'small' && (
        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className="tabs__tab"
            aria-selected={tab === 'source'}
            onClick={() => setTab('source')}
          >
            Source &amp; Crop
          </button>
          <button
            type="button"
            role="tab"
            className="tabs__tab"
            aria-selected={tab === 'notation'}
            onClick={() => setTab('notation')}
          >
            Notation &amp; DAW Playback
          </button>
        </div>
      )}

      <main className="workspace" data-mode={mode} data-tab={tab} data-collapsed={isCollapsed}>
        {/* Columna izquierda: documento + historial (se oculta, no se desmonta, al colapsar) */}
        <div className="col-source area-source">
          {isCollapsed && (
            <div className="rail">
              <button
                type="button"
                className="icon-btn"
                onClick={() => setCollapsed(false)}
                aria-label="Expand source panel"
                title="Expand source panel"
              >
                <PanelLeftOpen size={18} />
              </button>
              <span className="badge rail__label">Source &amp; Crop</span>
            </div>
          )}

          <div className="col-source__panels" hidden={isCollapsed}>
            <Panel
              className="panel--source"
              bodyClassName="panel__body--flush"
              title="Source document"
              badge={sourceFile ? (sourceFile.type === 'application/pdf' ? 'PDF' : 'Image') : null}
              actions={
                mode === 'medium' && (
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setCollapsed(true)}
                    aria-label="Collapse source panel"
                    title="Collapse source panel"
                  >
                    <PanelLeftClose size={18} />
                  </button>
                )
              }
              data-dragging={dragging}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {sourceFile ? (
                <DocumentViewer
                  key={sourceId}
                  file={sourceFile}
                  region={region}
                  regionLabel={regionLabel}
                  onRecognize={handleRecognize}
                />
              ) : (
                <Placeholder
                  icon={ScanLine}
                  title="Drop a PDF or image here"
                  hint="Or use Upload PDF/Image in the top bar. Then select a single staff system to recognize."
                />
              )}
            </Panel>

            <Panel
              className="panel--history"
              bodyClassName="panel__body--history"
              title="History"
              badge={history.length ? `${history.length}/${MAX_HISTORY}` : null}
              actions={
                history.length > 0 && (
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={clearHistory}
                    aria-label="Clear history"
                    title="Clear history"
                  >
                    <Trash2 size={16} />
                  </button>
                )
              }
            >
              {history.length > 0 ? (
                <HistoryDrawer
                  items={history}
                  activeId={activeId}
                  currentSourceId={sourceId}
                  onSelect={handleSelectHistory}
                />
              ) : (
                <Placeholder icon={History} title="No crops yet" />
              )}
            </Panel>
          </div>
        </div>

        {/* Derecha superior: notación / piano roll */}
        <Panel
          className="area-notation"
          title="Notation refinement"
          actions={
            status === 'done' &&
            result && (
              <>
                <Segmented label="Notation view" options={VIEWS} value={view} onChange={setView} />
                <ClefSelect
                  override={clefOverride}
                  detected={result.metadata.detected_clef}
                  disabled={rendering}
                  onChange={applyClef}
                  onRevert={() => applyClef(null)}
                />
              </>
            )
          }
        >
          <RecognitionStatus
            status={status}
            error={error}
            result={result}
            rendering={rendering}
            renderError={renderError}
            view={view}
            store={store}
            onHoverNote={setHoverNote}
            onRetry={handleRetry}
          />
        </Panel>

        {/* Derecha inferior: transporte, onda y piano */}
        <Panel className="area-playback" bodyClassName="panel__body--flush" title="Playback" badge="Synth · Mono">
          <WaveformPlayer store={store} result={result} busy={rendering} bpm={bpm} onBpmChange={applyBpm} />
          <InteractivePiano store={store} events={result?.events ?? NO_EVENTS} hoverMidi={hoverNote?.midi ?? null} />
        </Panel>
      </main>
    </div>
  );
}