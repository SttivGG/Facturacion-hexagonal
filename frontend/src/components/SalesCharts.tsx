import { BarChart3, ChartNoAxesCombined } from "lucide-react";
import type { Factura } from "../types";
import { cents, money } from "../api";

export interface SalesDay {
  key: string;
  label: string;
  count: number;
  total: bigint;
}
const colombiaDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function salesDays(invoices: Factura[], now = new Date()): SalesDay[] {
  const today = new Date(`${colombiaDate.format(now)}T12:00:00Z`);
  const result = Array.from({ length: 30 }, (_, index) => {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - 29 + index);
    return {
      key: colombiaDate.format(day),
      label: new Intl.DateTimeFormat("es-CO", {
        day: "numeric",
        month: "short",
        timeZone: "America/Bogota",
      }).format(day),
      count: 0,
      total: 0n,
    };
  });
  const byDate = new Map(result.map((day) => [day.key, day]));
  for (const invoice of invoices) {
    const day = byDate.get(colombiaDate.format(new Date(invoice.fechaEmision)));
    if (day) {
      day.count += 1;
      day.total += cents(invoice.total);
    }
  }
  return result;
}

export function SalesEvolution({ days }: { days: SalesDay[] }) {
  const hasHistory = days.filter((day) => day.count > 0).length >= 2;
  const maximum = days.reduce(
    (max, day) => (day.total > max ? day.total : max),
    0n,
  );
  const points = days
    .map(
      (day, index) =>
        `${(index * 1000) / 29},${maximum ? 83 - Number((day.total * 68n) / maximum) : 83}`,
    )
    .join(" ");
  return (
    <div className="sales-evolution">
      <div className="evolution-heading">
        <strong>Evolución de ventas</strong>
        <span>Últimos 30 días · COP</span>
      </div>
      {hasHistory ? (
        <figure className="evolution-chart">
          <svg
            viewBox="0 0 1000 100"
            preserveAspectRatio="none"
            role="img"
            aria-label="Total facturado por día en los últimos 30 días"
          >
            <defs>
              <linearGradient id="sales-fill" x1="0" x2="0" y1="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--chart-orange)"
                  stopOpacity=".5"
                />
                <stop
                  offset="100%"
                  stopColor="var(--chart-orange)"
                  stopOpacity="0"
                />
              </linearGradient>
            </defs>
            {[25, 50, 75].map((y) => (
              <line
                key={y}
                x1="0"
                x2="1000"
                y1={y}
                y2={y}
                className="chart-grid-line"
              />
            ))}
            <polygon
              points={`0,100 ${points} 1000,100`}
              fill="url(#sales-fill)"
            />
            <polyline
              points={points}
              fill="none"
              stroke="var(--chart-orange)"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <figcaption>
            <span>{days[0].label}</span>
            <span>{days.at(-1)?.label}</span>
          </figcaption>
          <details className="sr-only">
            <summary>Datos de evolución de ventas</summary>
            <ul>
              {days.map((day) => (
                <li key={day.key}>
                  {day.label}: {money(day.total)} COP
                </li>
              ))}
            </ul>
          </details>
        </figure>
      ) : (
        <div className="evolution-empty">
          <ChartNoAxesCombined size={26} strokeWidth={1.4} aria-hidden="true" />
          <div>
            <strong>
              {days.some((day) => day.count)
                ? "Más días, más perspectiva"
                : "Aún no hay ventas para mostrar"}
            </strong>
            <span>
              {days.some((day) => day.count)
                ? "La evolución aparecerá cuando haya facturas en al menos dos días del periodo."
                : "Las facturas registradas se reflejarán aquí, sin datos de ejemplo."}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function InvoiceActivity({ days }: { days: SalesDay[] }) {
  const count = days.reduce((sum, day) => sum + day.count, 0);
  const maximum = Math.max(1, ...days.map((day) => day.count));
  return count ? (
    <figure className="invoice-bars">
      <div className="invoice-bars-plot">
        {days.map((day) => (
          <div
            className={`invoice-bar-slot ${day.count ? "has-value" : ""}`}
            key={day.key}
            title={`${day.label}: ${day.count} ${day.count === 1 ? "factura" : "facturas"}`}
          >
            <span
              className="invoice-bar"
              style={{ height: `${(day.count / maximum) * 100}%` }}
            />
            <span className="sr-only">
              {day.label}: {day.count} facturas
            </span>
          </div>
        ))}
      </div>
      <figcaption>
        <span>{days[0].label}</span>
        <span>{days.at(-1)?.label}</span>
      </figcaption>
    </figure>
  ) : (
    <div className="activity-empty">
      <BarChart3 size={32} strokeWidth={1.25} aria-hidden="true" />
      <div>
        <strong>La historia de tus ventas empieza aquí.</strong>
        <p>
          Cuando registres facturas, verás la actividad real de los últimos 30
          días.
        </p>
      </div>
    </div>
  );
}
