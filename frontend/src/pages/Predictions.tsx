import { useEffect, useRef, useState } from "react";
import { BrainCircuit, CalendarClock, ChartNoAxesCombined, RefreshCw, TrendingUp } from "lucide-react";
import { ApiError, date, money, request } from "../api";
import { Badge, Button, Empty, ErrorNotice, Loading, SectionHeading } from "../components/ui";
import type { DemoResult, PredictionMode, PredictionModel, PredictionState, SalesForecast } from "../predictions";

function ForecastChart({ data, demo }: { data: SalesForecast; demo: boolean }) {
  const chartRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(950);
  useEffect(() => {
    const svg = chartRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(200, Math.round(entries[0].contentRect.width))));
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);
  // Solo las coordenadas de dibujo usan Number; importes y totales conservan sus cadenas.
  const history = demo ? data.historico : data.historico.slice(-56);
  const rows = [...history, ...data.predicciones];
  const max = Math.max(1, ...rows.map(r => Number(r.total)));
  const firstDate = Date.parse(rows[0].fecha);
  const dateSpan = Math.max(1, Date.parse(rows[rows.length - 1].fecha) - firstDate);
  const right = width - 24;
  const x = (index: number) => 66 + (Date.parse(rows[index].fecha) - firstDate) / dateSpan * (right - 66);
  const y = (amount: string) => 248 - Number(amount) / max * 212;
  const line = (items: typeof rows, offset: number) => items.map((r, i) => `${x(i + offset)},${y(r.total)}`).join(" ");
  return <>
    <div className="prediction-legend"><span><i className="prediction-real-key" /> {demo ? "Histórico simulado" : "Valor facturado real"}</span><span><i className="prediction-future-key" /> {demo ? "Predicción Ridge · datos simulados" : "Predicción Ridge"}</span></div>
    <svg ref={chartRef} className="prediction-chart" viewBox={`0 0 ${width} 300`} role="img" aria-label={`${demo ? "Datos simulados" : "Valor facturado real"} de los últimos ${history.length} días y predicción de ${data.horizonte} días. Valores exactos en la tabla de datos.`}>
      {[0, 0.5, 1].map(ratio => <g key={ratio}>
        <line x1="66" x2={right} y1={248 - ratio * 212} y2={248 - ratio * 212} className="prediction-grid-line" />
        <text x="58" y={252 - ratio * 212} textAnchor="end">{new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 }).format(max * ratio)}</text>
      </g>)}
      <rect x={x(history.length)} y="20" width={Math.max(0, right - x(history.length))} height="228" className="prediction-future-area" />
      <polyline points={line(history, 0)} className="prediction-real-line" />
      <polyline points={line(data.predicciones, history.length)} className="prediction-future-line" />
      {data.predicciones.map((r, i) => <circle key={r.fecha} cx={x(history.length + i)} cy={y(r.total)} r="3" className="prediction-point"><title>{date(r.fecha)} · Estimado: {money(r.total)}</title></circle>)}
      {[...new Set(width < 500 ? [0, rows.length - 1] : [0, history.length - 1, rows.length - 1])].map(i => <text key={i} x={x(i)} y="279" textAnchor={i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle"}>{new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" }).format(new Date(`${rows[i].fecha}T12:00:00Z`))}</text>)}
    </svg>
    <p className="data-note">Histórico {demo ? "simulado" : "visible"}: últimos {history.length} días. El área naranja corresponde al pronóstico; no representa un intervalo de confianza.</p>
    <details className="prediction-data"><summary>Ver valores diarios exactos</summary>
      <div className="prediction-table-wrap"><table><caption>{demo ? "Datos simulados: historial y predicción" : "Valor facturado histórico y estimado"} · COP</caption><thead><tr><th>Fecha</th><th>Serie</th><th>Valor</th></tr></thead><tbody>
        {[...data.historico, ...data.predicciones].map((row, i) => <tr key={`${i}-${row.fecha}`}><td>{date(row.fecha)}</td><td>{i < data.historico.length ? (demo ? "Simulado" : "Real") : (demo ? "Predicción simulada" : "Predicción")}</td><td>{money(row.total)}</td></tr>)}
      </tbody></table></div>
    </details>
  </>;
}

export function Predictions() {
  const [mode, setMode] = useState<PredictionMode>("real");
  const demo = mode === "demo";
  const [state, setState] = useState<PredictionState | null>(null);
  const [forecast, setForecast] = useState<SalesForecast | null>(null);
  const [horizon, setHorizon] = useState(7);
  const [busy, setBusy] = useState<"load" | "train" | null>("load");
  const [error, setError] = useState("");
  const [trainingError, setTrainingError] = useState(false);
  const [insufficient, setInsufficient] = useState(false);
  const [trained, setTrained] = useState(false);
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);

  async function load(nextHorizon: number, train = false, nextMode: PredictionMode = mode) {
    if (pending.current) return;
    pending.current = true;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(train ? "train" : "load"); setError(""); setTrainingError(false); setInsufficient(false); setTrained(false);
    // Se ocultan resultados anteriores para no asociar un horizonte nuevo con valores viejos.
    setForecast(null);
    if (nextMode !== mode) setState(null);
    const base = nextMode === "demo" ? "/predicciones/demo" : "/predicciones";
    async function fetchMode<T>(path: string, method = "GET"): Promise<T> {
      if (nextMode === "real") return request<T>(`${base}${path}`, { method, signal: abort.signal });
      const response = await request<DemoResult<T>>(`${base}${path}`, { method, signal: abort.signal });
      if (response.modo !== "DEMOSTRACION" || response.datosSimulados !== true || !response.resultado)
        throw new Error("El servicio no identificó los datos de demostración. No se mostraron resultados.");
      return response.resultado;
    }
    try {
      if (train) await fetchMode<PredictionModel>("/entrenar", "POST");
      const status = await fetchMode<PredictionState>("/estado");
      if (abort.signal.aborted) return;
      setState(status);
      if (status.disponible && status.entrenado) {
        const result = await fetchMode<SalesForecast>(`/ventas?horizonte=${nextHorizon}`);
        if (!abort.signal.aborted) setForecast(result);
      }
      if (train && status.disponible && status.entrenado) setTrained(true);
    } catch (err) {
      if (abort.signal.aborted) return;
      setError(err instanceof ApiError || err instanceof Error ? err.message : "No se pudo consultar la predicción.");
      setTrainingError(train);
      setInsufficient(train && err instanceof ApiError && err.status === 422);
    } finally {
      // StrictMode y desmontaje: una solicitud anterior no modifica la nueva pantalla.
      if (controller.current === abort) {
        pending.current = false;
        if (!abort.signal.aborted) setBusy(null);
      }
    }
  }
  useEffect(() => {
    void load(7);
    return () => { controller.current?.abort(); pending.current = false; };
  }, []);
  const model = forecast?.modelo || state?.modelo;
  const disabled = !state?.habilitado || !state.disponible || state.entrenando;
  const emptyTitle = !state ? "Consulta no disponible" : !state.habilitado ? (demo ? "Demostración deshabilitada" : "Predicciones deshabilitadas")
    : !state.disponible ? "Servicio ML no disponible" : state.entrenando ? "Entrenamiento en curso"
    : demo ? "Tu demostración está lista para entrenar" : "Tu modelo está pendiente de entrenamiento";
  const emptyDescription = !state ? "Intenta consultar nuevamente el estado del módulo."
    : !state.habilitado ? (demo ? "Activa ML_ENABLED y ML_DEMO_ENABLED en el entorno académico local. La demostración está deshabilitada por defecto." : "El módulo opcional aún no está activo. Puedes continuar usando todas las operaciones de Nexo.")
    : !state.disponible ? "No pudimos conectar con el servicio de predicción. Puedes volver a consultar su estado."
    : state.entrenando ? "Hay un entrenamiento en proceso. Actualiza el estado en unos segundos."
    : demo ? "Pulsa Entrenar modelo para generar 90 días simulados, evaluar Ridge y calcular tu primera predicción. El modelo real se conserva por separado."
    : "Necesitas al menos 56 días completos y ventas en varias semanas. Entrena con tu historial real para comenzar.";
  return <div className="predictions-page">
    <div className="prediction-heading"><div><span className="eyebrow">Una mirada al futuro</span><h1>Predicciones inteligentes</h1><p>Descubre hacia dónde podrían ir tus ventas.</p></div><span className="prediction-heading-icon"><BrainCircuit size={30} aria-hidden="true" /></span></div>
    <section className="glass prediction-controls" aria-label="Controles de predicción">
      <fieldset className="prediction-mode" disabled={!!busy}>
        <legend>Origen de los datos</legend>
        <div>{([ ["real", "Datos reales"], ["demo", "Demostración"] ] as const).map(([value, label]) =>
          <label key={value} className={mode === value ? "selected" : ""}><input type="radio" name="prediction-mode" value={value} checked={mode === value} onChange={() => { setMode(value); void load(horizon, false, value); }} />{label}</label>
        )}</div>
      </fieldset>
      <label htmlFor="forecast-horizon">Horizonte de predicción<select id="forecast-horizon" value={horizon} disabled={!!busy} onChange={e => { const value = Number(e.target.value); setHorizon(value); void load(value); }}><option value={7}>7 días</option><option value={14}>14 días</option></select></label>
      <div className="prediction-actions"><Button onClick={() => void load(horizon)} disabled={!!busy}><RefreshCw size={16} aria-hidden="true" />{forecast ? "Actualizar predicción" : "Actualizar estado"}</Button>
        <Button variant="primary" busy={busy === "train"} disabled={!!busy || disabled} onClick={() => void load(horizon, true)}><BrainCircuit size={16} aria-hidden="true" />Entrenar modelo</Button></div>
    </section>
    {demo ? <aside className="prediction-demo-banner" aria-label="Aviso de datos simulados"><BrainCircuit size={22} aria-hidden="true" /><div><strong>Datos simulados · Demostración académica</strong><p>90 días generados en COP. Ridge aprende y calcula las métricas realmente. Estos valores no son ventas auténticas ni modifican tus facturas.</p></div></aside>
      : <p className="prediction-disclaimer">Estimamos <strong>valor facturado en COP</strong>, no dinero recaudado. Los abonos no se cuentan como ventas nuevas.</p>}
    {error && <div><p className="prediction-error-title">{insufficient ? "Historial insuficiente para entrenar" : trainingError ? "No se pudo entrenar el modelo" : "No se pudo actualizar la predicción"}</p><ErrorNotice message={error} retry={() => void load(horizon)} /></div>}
    {trained && <p className="prediction-success" role="status">{demo ? "Modelo de demostración entrenado con datos simulados. Predicción calculada por Ridge." : "Modelo entrenado con tu historial real. Predicción actualizada."}</p>}
    {busy ? <section className="glass prediction-panel"><Loading label={busy === "train" ? (demo ? "Entrenando y evaluando con 90 días simulados" : "Entrenando y evaluando con tu historial") : "Consultando predicciones"} /></section> : !forecast ?
      <section className="glass prediction-panel"><Empty icon={ChartNoAxesCombined} title={emptyTitle} description={emptyDescription} /></section> : <>
        {forecast.estado === "MODELO_DESACTUALIZADO" && <div className="prediction-warning" role="status"><CalendarClock size={20} aria-hidden="true" /><p><strong>Modelo desactualizado.</strong> El historial termina el {date(forecast.modelo.finDatos)}. Vuelve a entrenar para incluir las jornadas completas más recientes.</p></div>}
        <section className="prediction-kpis" aria-label="Indicadores de predicción">
          {[
            { label: demo ? "Facturación histórica simulada" : "Facturación histórica", value: money(forecast.modelo.totalHistorico), detail: `${forecast.modelo.observaciones} días ${demo ? "simulados" : "completos"}`, icon: ChartNoAxesCombined },
            { label: `Estimado · próximos ${forecast.horizonte} días`, value: money(forecast.totalProyectado), detail: demo ? "Proyección sobre datos simulados" : "Valor facturado proyectado", icon: TrendingUp },
            { label: "Promedio diario previsto", value: money(forecast.promedioDiario), detail: demo ? "Datos simulados · COP" : "Estimación en COP", icon: BrainCircuit },
            { label: "Último entrenamiento", value: date(forecast.modelo.fechaEntrenamiento), detail: new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }).format(new Date(forecast.modelo.fechaEntrenamiento)), icon: CalendarClock },
          ].map(({ label, value, detail, icon: Icon }) => <article className="glass prediction-kpi" key={label}><div><Icon size={17} aria-hidden="true" /><span>{label}</span></div><strong>{value}</strong><small>{detail}</small></article>)}
        </section>
        <section className="glass prediction-panel"><SectionHeading title={demo ? "Demostración de facturación futura" : "Tu facturación, hacia adelante"} description={`${date(forecast.modelo.inicioDatos)} — ${date(forecast.modelo.finDatos)} · período de entrenamiento`}><Badge tone="amber">{demo ? "Datos simulados · " : ""}Ridge · {forecast.horizonte} días</Badge></SectionHeading><ForecastChart data={forecast} demo={demo} /></section>
      </>}
    {!busy && model && <section className="glass prediction-panel"><SectionHeading title="Cómo se comportó el modelo" description={`Evaluado del ${date(model.metricas.inicioEvaluacion)} al ${date(model.metricas.finEvaluacion)}, con datos separados del entrenamiento.`}>{demo && <Badge tone="amber">Datos simulados</Badge>}</SectionHeading>
      <div className="prediction-metrics">
        <article><span>Error absoluto medio · MAE</span><strong>{money(model.metricas.mae)}</strong><p>En promedio, esta fue la diferencia diaria entre lo estimado y lo facturado.</p></article>
        <article><span>Error ponderado · WAPE</span><strong>{model.metricas.wape === null ? "No calculable" : `${model.metricas.wape}%`}</strong><p>Error total dividido por la facturación real del período. Sin ventas reales, no se calcula.</p></article>
        <article><span>Referencia semanal · MAE</span><strong>{money(model.metricas.maeReferencia)}</strong><p>Repite la última semana conocida. WAPE: {model.metricas.wapeReferencia === null ? "no calculable" : `${model.metricas.wapeReferencia}%`}.</p></article>
      </div>
      <p className="data-note">{model.metricas.mejoraReferencia === null ? "No se calcula mejora porcentual si la referencia no tiene error." : Number(model.metricas.mejoraReferencia) >= 0 ? `Ridge redujo el error de la referencia en ${model.metricas.mejoraReferencia}%.` : `Ridge tuvo más error que la referencia (${model.metricas.mejoraReferencia}% de mejora). Conviene interpretar el pronóstico con cautela.`} MAE y WAPE miden errores; no son porcentajes de confianza.</p>
      <p className="data-note">Modelo {model.version} · tendencia temporal y día de semana. No contempla promociones, festivos ni cambios inesperados del negocio.</p>
    </section>}
  </div>;
}
