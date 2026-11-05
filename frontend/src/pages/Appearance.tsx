import {
  Check,
  Moon,
  RotateCcw,
  SlidersHorizontal,
  Sun,
  Wallpaper,
} from "lucide-react";
import {
  useAppearance,
  appearanceDefaults,
  type Appearance as AppearanceType,
} from "../appearance";
import { Badge, Button, SectionHeading } from "../components/ui";

const backgrounds: {
  id: AppearanceType["background"];
  name: string;
  description: string;
}[] = [
  {
    id: "aurora",
    name: "Aurora",
    description: "Un lago entre montañas y luz de mañana.",
  },
  {
    id: "bosque",
    name: "Bosque",
    description: "Un bosque tranquilo, a tu ritmo.",
  },
  {
    id: "horizonte",
    name: "Horizonte",
    description: "Un horizonte abierto para tu día.",
  },
];
export function Appearance() {
  const { preferences, update } = useAppearance();
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">UN ESPACIO MUY TUYO</span>
          <h1>
            A tu manera<span className="title-dot">.</span>
          </h1>
          <p>Encuentra el ambiente que te ayuda a trabajar mejor.</p>
        </div>
        <Badge tone="green">Se guarda en este navegador</Badge>
      </div>
      <div className="appearance-grid">
        <section className="glass appearance-section">
          <SectionHeading
            title="Elige tu luz"
            description="La misma claridad, en dos ambientes."
          />
          <div className="theme-options">
            {(["light", "dark"] as const).map((theme) => (
              <button
                key={theme}
                className={`theme-option ${theme} ${preferences.theme === theme ? "selected" : ""}`}
                aria-pressed={preferences.theme === theme}
                onClick={() => update({ theme })}
              >
                <div className="theme-preview">
                  <span className="preview-rail" />
                  <div>
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
                <span>
                  {theme === "light" ? <Sun size={18} /> : <Moon size={18} />}
                  {theme === "light" ? "Claro" : "Oscuro"}
                  {preferences.theme === theme && (
                    <Check size={17} className="ml-auto" />
                  )}
                </span>
              </button>
            ))}
          </div>
          <p className="settings-note">
            Cambia el ambiente cuando quieras. Tu selección se conserva al
            recargar.
          </p>
        </section>
        <section className="glass appearance-section">
          <SectionHeading
            title="La textura del vidrio"
            description="Un poco más de enfoque. Un poco más de profundidad."
          >
            <SlidersHorizontal size={20} className="muted" />
          </SectionHeading>
          <div className="frost-preview">
            <div className="frost-preview-card">
              <span className="kpi-icon mint">
                <Wallpaper size={20} />
              </span>
              <strong>Claridad en cada detalle</strong>
              <span>Así se verán tus paneles.</span>
            </div>
          </div>
          <label className="range-label" htmlFor="frost">
            Desenfoque del fondo
            <output htmlFor="frost">{preferences.frost} px</output>
          </label>
          <input
            id="frost"
            type="range"
            min="8"
            max="32"
            step="1"
            value={preferences.frost}
            onChange={(e) => update({ frost: Number(e.target.value) })}
          />
          <div className="range-captions">
            <span>Menos desenfoque</span>
            <span>Más desenfoque</span>
          </div>
          <label className="range-label" htmlFor="opacity">
            Opacidad de los paneles
            <output htmlFor="opacity">{preferences.opacity}%</output>
          </label>
          <input
            id="opacity"
            type="range"
            min="55"
            max="90"
            value={preferences.opacity}
            onChange={(e) => update({ opacity: Number(e.target.value) })}
          />
          <div className="range-captions">
            <span>Más transparente</span>
            <span>Más sólido</span>
          </div>
          <p className="settings-note">
            Ajusta el vidrio sin perder claridad. El fondo conserva una capa de
            suavizado.
          </p>
        </section>
        <section className="glass appearance-section wallpaper-section">
          <SectionHeading
            title="Un fondo para tu día"
            description="Tres fotografías optimizadas, disponibles también sin conexión externa."
          >
            <Wallpaper size={20} className="muted" />
          </SectionHeading>
          <div className="wallpaper-options">
            {backgrounds.map((background) => (
              <button
                key={background.id}
                aria-pressed={preferences.background === background.id}
                className={`wallpaper-option ${preferences.background === background.id ? "selected" : ""}`}
                onClick={() => update({ background: background.id })}
              >
                <div className={`wallpaper-swatch wallpaper-${background.id}`}>
                  <span />
                  {preferences.background === background.id && (
                    <span className="swatch-check">
                      <Check size={17} />
                    </span>
                  )}
                </div>
                <strong>{background.name}</strong>
                <small>{background.description}</small>
              </button>
            ))}
          </div>
        </section>
      </div>
      <div className="settings-footer">
        <span>Tu apariencia solo cambia este espacio de trabajo.</span>
        <Button onClick={() => update(appearanceDefaults)}>
          <RotateCcw size={16} />
          Restaurar apariencia
        </Button>
      </div>
    </>
  );
}
