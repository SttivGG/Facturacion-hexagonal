from datetime import timedelta
from decimal import Decimal
import json

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sklearn.linear_model import Ridge

from app.main import create_app
from app.model import Forecaster, MlError, Observation, features, metrics, today


def history(count=70):
    start = today() - timedelta(days=count)
    return [Observation(fecha=start + timedelta(days=i), total=f"{1000 + i * 12 + (i % 7) * 100}.25") for i in range(count)]


def test_real_ridge_chronological_holdout_and_refit(tmp_path, monkeypatch):
    calls = []
    fit = Ridge.fit
    def spy(self, x, y, *args, **kwargs):
        calls.append((x.copy(), y.copy()))
        return fit(self, x, y, *args, **kwargs)
    monkeypatch.setattr(Ridge, "fit", spy)
    rows = history()
    model = Forecaster(tmp_path)
    metadata = model.train(rows)
    assert [len(y) for _, y in calls] == [56, 70]
    assert np.array_equal(calls[0][1], [float(r.total) for r in rows[:-14]])
    assert metadata["metricas"]["finEntrenamientoEvaluacion"] == str(rows[-15].fecha)
    assert metadata["metricas"]["inicioEvaluacion"] == str(rows[-14].fecha)
    # Cambiar el futuro no modifica las observaciones de entrenamiento.
    rows[-1] = Observation(fecha=rows[-1].fecha, total="99999.00")
    model.train(rows)
    assert np.array_equal(calls[0][1], calls[2][1])
    assert features([rows[0].fecha], rows[0].fecha).shape == (1, 8)


@pytest.mark.parametrize("horizon", [7, 14])
def test_predictions_money_dates_persistence(tmp_path, horizon):
    model = Forecaster(tmp_path)
    model.train(history())
    result = model.forecast(horizon)
    assert len(result["predicciones"]) == horizon
    assert result["predicciones"][0]["fecha"] == str(today())
    assert result["predicciones"][-1]["fecha"] == str(today() + timedelta(days=horizon-1))
    assert all(Decimal(p["total"]) >= 0 and isinstance(p["total"], str) for p in result["predicciones"])
    assert Decimal(result["totalProyectado"]) == sum(Decimal(p["total"]) for p in result["predicciones"])
    assert Forecaster(tmp_path).forecast(horizon) == result
    assert isinstance(result["modelo"]["metricas"]["mae"], str)


@pytest.mark.parametrize("count", [0, 55])
def test_insufficient(tmp_path, count):
    with pytest.raises(MlError, match="56 días"):
        Forecaster(tmp_path).train(history(count))


def test_sparse_and_zero_activity(tmp_path):
    rows = history(56)
    zeros = [Observation(fecha=r.fecha, total="0.00") for r in rows]
    with pytest.raises(MlError, match="6 semanas"):
        Forecaster(tmp_path).train(zeros)
    zeros[:14] = rows[:14]
    with pytest.raises(MlError):
        Forecaster(tmp_path).train(zeros)


def test_zero_evaluation_wape_undefined_and_no_negative_predictions(tmp_path):
    rows = history(70)
    rows[-14:] = [Observation(fecha=r.fecha, total="0.00") for r in rows[-14:]]
    model = Forecaster(tmp_path)
    metadata = model.train(rows)
    assert metadata["metricas"]["wape"] is None
    assert metadata["metricas"]["wapeReferencia"] is None
    assert metrics(np.zeros(14), np.ones(14)) == ("1.00", None)
    model.artifact["coef"] = [0.] * 8
    model.artifact["intercept"] = -1000.
    assert all(r["total"] == "0.00" for r in model.forecast(14)["predicciones"])


def test_no_future_reference_leak(tmp_path):
    rows = history()
    rows[-14:] = [Observation(fecha=r.fecha, total="8000.00") for r in rows[-14:]]
    metadata = Forecaster(tmp_path).train(rows)
    baseline = np.tile([float(r.total) for r in rows[-21:-14]], 2)
    expected = metrics(np.full(14, 8000.), baseline)
    assert (metadata["metricas"]["maeReferencia"], metadata["metricas"]["wapeReferencia"]) == expected


def test_invalid_dates_concurrency_and_old_model_preserved(tmp_path):
    model = Forecaster(tmp_path)
    model.train(history())
    original = model.forecast(7)
    rows = history()
    rows[-1] = Observation(fecha=today(), total="100.00")
    with pytest.raises(MlError, match="terminar ayer"):
        model.train(rows)
    rows = history()
    rows[1] = rows[0]
    with pytest.raises(MlError):
        model.train(rows)
    assert model.forecast(7) == original
    with model.lock:
        with pytest.raises(MlError) as ex:
            model.train(history())
        assert ex.value.status == 409


def test_corrupt_and_stale_artifact(tmp_path):
    model = Forecaster(tmp_path)
    model.train(history())
    path = tmp_path / "ridge-v1.json"
    artifact = json.loads(path.read_text())
    artifact["modelo"]["finDatos"] = str(today() - timedelta(days=2))
    artifact["historico"] = [dict(fecha=str(Observation.model_validate(r).fecha - timedelta(days=1)), total=r["total"]) for r in artifact["historico"]]
    artifact["modelo"]["inicioDatos"] = artifact["historico"][0]["fecha"]
    path.write_text(json.dumps(artifact))
    assert Forecaster(tmp_path).forecast(7)["estado"] == "MODELO_DESACTUALIZADO"
    path.write_text("corrupto")
    assert not Forecaster(tmp_path).state()["entrenado"]


def test_http_contracts_and_decimal_validation(tmp_path):
    with TestClient(create_app(tmp_path)) as client:
        assert client.get("/health").json() == {"status": "OK"}
        assert client.get("/estado").json()["estado"] == "MODELO_NO_ENTRENADO"
        assert client.get("/ventas").status_code == 409
        assert client.get("/ventas?horizonte=8").status_code == 400
        assert client.post("/entrenar", json={"observaciones": []}).status_code == 422
        for total in [1.25, "-1.00", "NaN", "1.001", "1000000000001.00"]:
            response = client.post("/entrenar", json={"observaciones": [{"fecha": "2026-01-01", "total": total}]})
            assert response.status_code == 400
        data = {"observaciones": [r.model_dump(mode="json") for r in history(56)]}
        response = client.post("/entrenar", json=data)
        assert response.status_code == 200
        assert response.json()["observaciones"] == 56
        assert client.get("/estado").json()["entrenado"]
        assert client.get("/ventas?horizonte=14").json()["horizonte"] == 14


def test_failed_save_keeps_previous_model(tmp_path, monkeypatch):
    app = create_app(tmp_path)
    model = app.state.forecaster
    model.train(history())
    original = model.forecast(7)
    def unavailable(*args):
        raise OSError("Disco no disponible")
    monkeypatch.setattr("app.model.os.replace", unavailable)
    with TestClient(app) as client:
        response = client.post("/entrenar", json={"observaciones": [r.model_dump(mode="json") for r in history(80)]})
        assert response.status_code == 503
    assert model.forecast(7) == original
    assert not model.state()["entrenando"]
