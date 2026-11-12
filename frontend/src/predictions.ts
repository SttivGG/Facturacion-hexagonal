export interface DailySale { fecha: string; total: string }
export interface PredictionMetrics {
  mae: string; wape: string | null; maeReferencia: string; wapeReferencia: string | null;
  mejoraReferencia: string | null; diasEvaluacion: number;
  finEntrenamientoEvaluacion: string; inicioEvaluacion: string; finEvaluacion: string;
}
export interface PredictionModel {
  version: string; algoritmo: string; alpha: string; fechaEntrenamiento: string;
  inicioDatos: string; finDatos: string; observaciones: number; totalHistorico: string;
  metricas: PredictionMetrics;
}
export interface PredictionState {
  habilitado: boolean; disponible: boolean; entrenado: boolean; entrenando: boolean;
  estado: string; ultimaFechaEntrenamiento: string | null; modelo: PredictionModel | null; mensaje: string | null;
}
export interface SalesForecast {
  horizonte: number; estado: string; predicciones: DailySale[]; totalProyectado: string;
  promedioDiario: string; historico: DailySale[]; modelo: PredictionModel;
}
export type PredictionMode = "real" | "demo";
export interface DemoResult<T> { modo: "DEMOSTRACION"; datosSimulados: true; resultado: T }
