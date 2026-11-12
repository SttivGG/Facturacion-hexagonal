from datetime import date, timedelta
from decimal import Decimal
import json
import shutil

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sklearn.linear_model import Ridge

from app.demo import DEMO_DAYS, generate_demo_history
from app.main import create_app
from app.model import Forecaster, features, metrics, today


def test_generator_reproducible_complete_nonnegative_and_varied():
    rows = generate_demo_history(date(2026, 11, 11))
    assert rows == generate_demo_history(date(2026, 11, 11))
    assert len(rows) == DEMO_DAYS == 90
    assert rows[-1].fecha == date(2026, 11, 11)
    assert all(b.fecha == a.fecha + timedelta(days=1) for a, b in zip(rows, rows[1:]))
    assert all(Decimal(r.total) >= 0 for r in rows)
    assert len({r.total for r in rows}) > 80
    values = np.array([float(r.total) for r in rows])
    assert values[-21:].mean() > values[:21].mean()
    assert values.min() < values.mean() * 0.4
    weekdays = {d: np.mean([float(r.total) for r in rows if r.fecha.weekday() == d]) for d in range(7)}
    assert weekdays[5] > weekdays[6]
    assert generate_demo_history()[-1].fecha == today() - timedelta(days=1)


def test_demo_uses_same_fit_evaluation_and_refit(tmp_path, monkeypatch):
    calls = []
    original_fit = Ridge.fit
    def spy(self, x, y, *args, **kwargs):
        calls.append((x.copy(), y.copy()))
        return original_fit(self, x, y, *args, **kwargs)
    monkeypatch.setattr(Ridge, "fit", spy)
    rows = generate_demo_history()
    model = Forecaster(tmp_path, source="DEMOSTRACION")
    metadata = model.train(rows)
    assert [len(y) for _, y in calls] == [76, 90]
    assert np.array_equal(calls[0][1], [float(r.total) for r in rows[:76]])
    evaluation = Ridge(alpha=1.0).fit(features([r.fecha for r in rows[:76]], rows[0].fecha), np.array([float(r.total) for r in rows[:76]]))
    predicted = np.maximum(0, evaluation.predict(features([r.fecha for r in rows[76:]], rows[0].fecha)))
    assert (metadata["metricas"]["mae"], metadata["metricas"]["wape"]) == metrics(np.array([float(r.total) for r in rows[76:]]), predicted)
    assert metadata["metricas"]["inicioEvaluacion"] == str(rows[76].fecha)
    assert metadata["metricas"]["finEntrenamientoEvaluacion"] == str(rows[75].fecha)


@pytest.mark.parametrize("horizon", [7, 14])
def test_http_demo_training_forecast_persistence_and_real_isolation(tmp_path, horizon):
    # Un modelo real previo debe conservarse byte por byte.
    real = Forecaster(tmp_path)
    real.train(generate_demo_history())
    real_artifact = (tmp_path / "ridge-v1.json").read_bytes()
    real_prediction = real.forecast(horizon)
    app = create_app(tmp_path, demo_enabled=True)
    with TestClient(app) as client:
        assert not client.get("/demo/estado").json()["resultado"]["entrenado"]
        assert client.get("/demo/ventas").status_code == 409
        response = client.post("/demo/entrenar")
        assert response.status_code == 200
        assert response.json()["modo"] == "DEMOSTRACION"
        assert response.json()["datosSimulados"] is True
        assert response.json()["resultado"]["observaciones"] == 90
        result = client.get(f"/demo/ventas?horizonte={horizon}").json()
        assert len(result["resultado"]["historico"]) == 90
        assert len(result["resultado"]["predicciones"]) == horizon
        assert all(Decimal(r["total"]) >= 0 for r in result["resultado"]["predicciones"])
        assert client.get(f"/ventas?horizonte={horizon}").json() == real_prediction
        assert (tmp_path / "ridge-v1.json").read_bytes() == real_artifact
    with TestClient(create_app(tmp_path, demo_enabled=True)) as restarted:
        assert restarted.get("/demo/estado").json()["resultado"]["entrenado"]
        assert restarted.get(f"/demo/ventas?horizonte={horizon}").json() == result
    assert json.loads((tmp_path / "demostracion" / "ridge-v1.json").read_text())["origen"] == "DEMOSTRACION"


def test_demo_cannot_train_or_populate_real_channel(tmp_path):
    with TestClient(create_app(tmp_path, demo_enabled=True)) as client:
        assert client.post("/demo/entrenar").status_code == 200
        assert client.get("/estado").json()["entrenado"] is False
        assert client.get("/ventas").status_code == 409
        assert client.get("/demo/ventas?horizonte=8").status_code == 400
    assert not (tmp_path / "ridge-v1.json").exists()
    shutil.copy(tmp_path / "demostracion" / "ridge-v1.json", tmp_path / "ridge-v1.json")
    assert not Forecaster(tmp_path).state()["entrenado"]


def test_demo_disabled_by_default_and_cannot_recover_real_artifact(tmp_path, monkeypatch):
    monkeypatch.delenv("ML_DEMO_ENABLED", raising=False)
    with TestClient(create_app(tmp_path)) as client:
        state = client.get("/demo/estado").json()
        assert state["datosSimulados"] is True
        assert state["resultado"]["habilitado"] is False
        assert client.post("/demo/entrenar").status_code == 503
        assert client.get("/demo/ventas").status_code == 503
    real = Forecaster(tmp_path)
    real.train(generate_demo_history())
    assert not Forecaster(tmp_path, source="DEMOSTRACION").state()["entrenado"]
