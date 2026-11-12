"""Ridge temporal. El artefacto es JSON propio; nunca se deserializa pickle."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, DecimalException, ROUND_HALF_UP
from pathlib import Path
from threading import Lock
import json
import os
from zoneinfo import ZoneInfo

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sklearn.linear_model import Ridge

BOGOTA = ZoneInfo("America/Bogota")
VERSION = "ridge-diaria-v1"
MAX_DAYS = 1095
MAX_AMOUNT = Decimal("1000000000000.00")


def today():
    return datetime.now(BOGOTA).date()


class MlError(Exception):
    def __init__(self, code, detail, status=422):
        self.code, self.detail, self.status = code, detail, status


class Observation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fecha: date
    total: str = Field(pattern=r"^\d{1,13}\.\d{2}$")

    @field_validator("total")
    @classmethod
    def amount(cls, value):
        if Decimal(value) > MAX_AMOUNT:
            raise ValueError("El total diario excede el límite numérico de ML (10^12 COP)")
        return value


class TrainingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    observaciones: list[Observation] = Field(max_length=MAX_DAYS)


def money(value):
    if not np.isfinite(value):
        raise MlError("DATOS_INVALIDOS", "Resultado numérico fuera de rango", 400)
    return format(Decimal(str(float(value))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP), "f")


def features(dates, origin):
    # Tendencia en unidades de 56 días y siete indicadores de día de semana.
    return np.array([[(d - origin).days / 56.0] + [float(d.weekday() == k) for k in range(7)] for d in dates])


def metrics(actual, predicted):
    absolute = float(np.abs(actual - predicted).sum())
    denominator = float(actual.sum())
    return money(absolute / len(actual)), (format(100 * absolute / denominator, ".2f") if denominator > 0 else None)


class Forecaster:
    def __init__(self, directory: Path, source="REAL"):
        if source not in ("REAL", "DEMOSTRACION"):
            raise ValueError("Origen de modelo desconocido")
        self.source = source
        self.directory = directory
        self.lock = Lock()
        self.artifact = None
        self.load_error = None
        path = directory / "ridge-v1.json"
        if path.exists():
            try:
                candidate = json.loads(path.read_text(encoding="utf-8"))
                # Los artefactos anteriores a 8B pertenecen exclusivamente al modo real.
                if candidate.get("origen", "REAL") != self.source:
                    raise ValueError("El artefacto pertenece a otro modo")
                history = [Observation.model_validate(row) for row in candidate["historico"]]
                coefficients = np.array(candidate["coef"], dtype=float)
                if (candidate["modelo"]["version"] != VERSION or coefficients.shape != (8,)
                        or not np.isfinite(coefficients).all() or not np.isfinite(candidate["intercept"])
                        or len(history) < 56 or candidate["modelo"]["observaciones"] != len(history)):
                    raise ValueError("Artefacto incompatible")
                date.fromisoformat(candidate["modelo"]["inicioDatos"])
                date.fromisoformat(candidate["modelo"]["finDatos"])
                datetime.fromisoformat(candidate["modelo"]["fechaEntrenamiento"])
                metadata = candidate["modelo"]
                if (metadata["inicioDatos"] != str(history[0].fecha) or metadata["finDatos"] != str(history[-1].fecha)
                        or any(b.fecha != a.fecha + timedelta(days=1) for a, b in zip(history, history[1:]))
                        or not Decimal(metadata["totalHistorico"]).is_finite()):
                    raise ValueError("Historial del artefacto inconsistente")
                for key in ("mae", "maeReferencia"):
                    if not Decimal(metadata["metricas"][key]).is_finite():
                        raise ValueError("Métricas inválidas")
                self.artifact = candidate
            except (ValueError, KeyError, TypeError, DecimalException, OSError):
                self.load_error = "El artefacto local no es válido; vuelve a entrenar el modelo."

    def state(self):
        a = self.artifact
        state = "MODELO_NO_ENTRENADO" if a is None else ("MODELO_DESACTUALIZADO" if self.stale(a) else "LISTO")
        return dict(habilitado=True, disponible=True, entrenado=a is not None, entrenando=self.lock.locked(),
                    estado=state, ultimaFechaEntrenamiento=a["modelo"]["fechaEntrenamiento"] if a else None,
                    modelo=a["modelo"] if a else None, mensaje=self.load_error)

    @staticmethod
    def stale(artifact):
        return date.fromisoformat(artifact["modelo"]["finDatos"]) < today() - timedelta(days=1)

    def train(self, rows):
        if not self.lock.acquire(blocking=False):
            raise MlError("ENTRENAMIENTO_EN_CURSO", "Ya hay un entrenamiento en curso", 409)
        try:
            dates = [r.fecha for r in rows]
            if len(rows) < 56:
                raise MlError("DATOS_INSUFICIENTES", "Se necesitan al menos 56 días completos de historial")
            if dates[-1] != today() - timedelta(days=1) or any(b != a + timedelta(days=1) for a, b in zip(dates, dates[1:])):
                raise MlError("DATOS_INVALIDOS", "El historial debe ser diario, ordenado, sin duplicados y terminar ayer en Bogotá", 400)
            values = np.array([float(Decimal(r.total)) for r in rows])
            active = np.flatnonzero(values > 0)
            weeks = {int(i) // 7 for i in active}
            train_weeks = {int(i) // 7 for i in active if i < len(rows) - 14}
            if len(active) < 14 or len(weeks) < 6 or len(train_weeks) < 4:
                raise MlError("DATOS_INSUFICIENTES", "Se requieren 14 días con ventas en 6 semanas, incluyendo 4 semanas de entrenamiento")
            x = features(dates, dates[0])
            split = len(rows) - 14
            evaluation = Ridge(alpha=1.0).fit(x[:split], values[:split])
            predicted = np.maximum(0, evaluation.predict(x[split:]))
            # Pronóstico fijo de 14 días: solo repite la semana anterior al corte.
            baseline = np.tile(values[split - 7:split], 2)
            mae, wape = metrics(values[split:], predicted)
            baseline_mae, baseline_wape = metrics(values[split:], baseline)
            base_error = float(np.abs(values[split:] - baseline).sum())
            improvement = format(100 * (1 - float(np.abs(values[split:] - predicted).sum()) / base_error), ".2f") if base_error > 0 else None
            final = Ridge(alpha=1.0).fit(x, values)
            model = dict(version=VERSION, algoritmo="Ridge", alpha="1.0", fechaEntrenamiento=datetime.now(timezone.utc).isoformat(),
                         inicioDatos=str(dates[0]), finDatos=str(dates[-1]), observaciones=len(rows),
                         totalHistorico=format(sum((Decimal(r.total) for r in rows), Decimal(0)), ".2f"),
                         metricas=dict(mae=mae, wape=wape, maeReferencia=baseline_mae, wapeReferencia=baseline_wape,
                                       mejoraReferencia=improvement, diasEvaluacion=14,
                                       finEntrenamientoEvaluacion=str(dates[split - 1]), inicioEvaluacion=str(dates[split]), finEvaluacion=str(dates[-1])))
            artifact = dict(origen=self.source, modelo=model, historico=[r.model_dump(mode="json") for r in rows],
                            coef=final.coef_.tolist(), intercept=float(final.intercept_))
            self.directory.mkdir(parents=True, exist_ok=True)
            temporary = self.directory / "ridge-v1.tmp"
            temporary.write_text(json.dumps(artifact, allow_nan=False), encoding="utf-8")
            os.replace(temporary, self.directory / "ridge-v1.json")
            self.artifact = artifact
            self.load_error = None
            return model
        finally:
            self.lock.release()

    def forecast(self, horizon):
        if horizon not in (7, 14):
            raise MlError("HORIZONTE_INVALIDO", "El horizonte debe ser 7 o 14", 400)
        artifact = self.artifact  # Snapshot inmutable durante un reentrenamiento.
        if artifact is None:
            raise MlError("MODELO_NO_ENTRENADO", "Entrena el modelo antes de solicitar predicciones", 409)
        origin = date.fromisoformat(artifact["modelo"]["inicioDatos"])
        dates = [today() + timedelta(days=i) for i in range(horizon)]
        ridge = Ridge(alpha=1.0)
        ridge.coef_ = np.array(artifact["coef"])
        ridge.intercept_ = artifact["intercept"]
        ridge.n_features_in_ = 8
        values = np.maximum(0, ridge.predict(features(dates, origin)))
        predictions = [dict(fecha=str(d), total=money(v)) for d, v in zip(dates, values)]
        total = sum((Decimal(p["total"]) for p in predictions), Decimal(0))
        return dict(horizonte=horizon, estado="MODELO_DESACTUALIZADO" if self.stale(artifact) else "LISTO",
                    predicciones=predictions, totalProyectado=format(total, ".2f"),
                    promedioDiario=format((total / horizon).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP), ".2f"),
                    historico=artifact["historico"], modelo=artifact["modelo"])
