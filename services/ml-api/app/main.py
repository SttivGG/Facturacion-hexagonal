import os
from pathlib import Path

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .model import Forecaster, MlError, TrainingRequest
from .demo import generate_demo_history


def create_app(directory=None, demo_enabled=None):
    app = FastAPI(title="Nexo · Predicción de valor facturado", docs_url=None, redoc_url=None)
    root = Path(directory or os.environ.get("ML_MODEL_DIR", "model-data"))
    model = Forecaster(root)
    allow_demo = os.environ.get("ML_DEMO_ENABLED", "false").lower() == "true" if demo_enabled is None else demo_enabled
    demo = Forecaster(root / "demostracion", source="DEMOSTRACION") if allow_demo else None
    app.state.forecaster = model
    app.state.demo_forecaster = demo

    @app.exception_handler(MlError)
    async def model_error(_: Request, exc: MlError):
        return JSONResponse(status_code=exc.status, content=dict(status=exc.status, codigo=exc.code, detail=exc.detail), media_type="application/problem+json")

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        return JSONResponse(status_code=400, content=dict(status=400, codigo="DATOS_INVALIDOS", detail="Fechas, importes o parámetros inválidos. Usa importes como cadenas con dos decimales."), media_type="application/problem+json")

    @app.get("/health")
    def health():
        return {"status": "OK"}

    @app.get("/estado")
    def state():
        return model.state()

    @app.post("/entrenar")
    def train(body: TrainingRequest):
        try:
            return model.train(body.observaciones)
        except OSError as exc:
            raise MlError("PERSISTENCIA_NO_DISPONIBLE", "No se pudo guardar el modelo local; se conserva el anterior", 503) from exc

    @app.get("/ventas")
    def forecast(horizonte: int = Query(7)):
        return model.forecast(horizonte)

    def demo_response(result):
        return dict(modo="DEMOSTRACION", datosSimulados=True, resultado=result)

    def require_demo():
        if demo is None:
            raise MlError("DEMO_DESHABILITADA", "La demostración académica está deshabilitada", 503)
        return demo

    @app.get("/demo/estado")
    def demo_state():
        if demo is None:
            return demo_response(dict(habilitado=False, disponible=True, entrenado=False, entrenando=False,
                                      estado="DEMO_DESHABILITADA", ultimaFechaEntrenamiento=None, modelo=None,
                                      mensaje="Activa ML_DEMO_ENABLED solo en el entorno académico local"))
        return demo_response(demo.state())

    @app.post("/demo/entrenar")
    def demo_train():
        predictor = require_demo()
        try:
            return demo_response(predictor.train(generate_demo_history()))
        except OSError as exc:
            raise MlError("PERSISTENCIA_NO_DISPONIBLE", "No se pudo guardar el modelo de demostración; se conserva el anterior", 503) from exc

    @app.get("/demo/ventas")
    def demo_forecast(horizonte: int = Query(7)):
        return demo_response(require_demo().forecast(horizonte))

    return app


app = create_app()
