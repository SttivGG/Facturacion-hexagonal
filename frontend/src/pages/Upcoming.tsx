import { ArrowRight, CreditCard, FileText, ShoppingBag } from "lucide-react";
import type { Page } from "../types";
import { Badge, Button } from "../components/ui";

export function Upcoming({
  page,
  navigate,
}: {
  page: "facturas" | "venta" | "creditos";
  navigate: (page: Page) => void;
}) {
  const content = {
    facturas: {
      title: "Facturas",
      description: "Cada venta, con todos sus detalles.",
      icon: FileText,
      items: [
        "Historial y detalle de facturas",
        "Información del cliente",
        "Estados de facturación",
      ],
    },
    venta: {
      title: "Nueva venta",
      description: "Una experiencia de venta con todo a mano.",
      icon: ShoppingBag,
      items: [
        "Selección de productos y carrito",
        "Cliente y métodos de pago",
        "Ventas de contado y a crédito",
      ],
    },
    creditos: {
      title: "Créditos y pagos",
      description: "Una visión clara de cada saldo.",
      icon: CreditCard,
      items: [
        "Facturas a crédito y vencimientos",
        "Registro de abonos",
        "Historial y estados de pago",
      ],
    },
  }[page];
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">EL SIGUIENTE CAPÍTULO</span>
          <h1>
            {content.title}
            <span className="title-dot">.</span>
          </h1>
          <p>{content.description}</p>
        </div>
        <Badge>Fase 6B</Badge>
      </div>
      <section className="glass upcoming-panel">
        <span className="upcoming-icon">
          <content.icon size={38} strokeWidth={1.3} aria-hidden="true" />
        </span>
        <Badge tone="blue">Próximamente</Badge>
        <h2>Un nuevo espacio está en camino.</h2>
        <p>
          Este módulo se habilitará en la Fase 6B.
          <br />
          Por ahora, puedes preparar tus productos y personas.
        </p>
        <div className="upcoming-items">
          {content.items.map((item) => (
            <span key={item}>
              <span className="tiny-dot" />
              {item}
            </span>
          ))}
        </div>
        <Button variant="primary" onClick={() => navigate("productos")}>
          Ir a mi catálogo
          <ArrowRight size={17} />
        </Button>
        <p className="data-note">
          El dashboard ya puede consultar los indicadores que existen en la API.
        </p>
      </section>
    </>
  );
}
