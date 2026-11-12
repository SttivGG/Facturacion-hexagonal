"""Historial académico reproducible; no consulta ni escribe en bases de datos."""
from datetime import date, timedelta

import numpy as np

from .model import Observation, money, today

DEMO_SEED = 20261112
DEMO_DAYS = 90


def generate_demo_history(end: date | None = None) -> list[Observation]:
    """Mismos importes para la misma fecha de corte y semilla; termina ayer por defecto."""
    last = end if end is not None else today() - timedelta(days=1)
    start = last - timedelta(days=DEMO_DAYS - 1)
    rng = np.random.default_rng(DEMO_SEED)
    weekday_factors = (0.85, 0.95, 1.0, 1.04, 1.15, 1.35, 0.55)
    rows = []
    for i in range(DEMO_DAYS):
        day = start + timedelta(days=i)
        trend = 280_000 * (1 + 0.002 * i)
        noise = 1 + rng.normal(0, 0.065)
        quiet_day = 0.35 if i % 23 == 7 else 1.0
        amount = max(0, trend * weekday_factors[day.weekday()] * noise * quiet_day)
        rows.append(Observation(fecha=day, total=money(amount)))
    return rows
