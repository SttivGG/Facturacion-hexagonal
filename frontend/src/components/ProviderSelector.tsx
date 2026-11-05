import { Check, ChevronDown, LoaderCircle, Search, Truck, UserPlus, RefreshCw } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import type { Persona } from "../types";
import { Field } from "./forms";
import { Button } from "./ui";
import "../styles/providers.css";

const eligible = (person: Persona) => person.activo && person.roles.includes("PROVEEDOR");
const fullName = (person: Persona) => `${person.nombres} ${person.apellidos || ""}`.trim();
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").replace(/\s+/g, " ").trim();

export function ProviderSelector({ value, onChange, active, disabled, knownProvider, onCreate }: {
  value: string;
  onChange: (id: string) => void;
  active: boolean;
  disabled?: boolean;
  knownProvider?: Persona;
  onCreate: () => void;
}) {
  const id = useId();
  const [people, setPeople] = useState<Persona[]>([]);
  const [extra, setExtra] = useState<Persona[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [resolved, setResolved] = useState<{ id: string; person?: Persona; message: string }>({ id: "", message: "" });
  const [documentType, setDocumentType] = useState("CC");
  const [documentNumber, setDocumentNumber] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const lookup = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const control = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLFieldSetElement>(null);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => { if (!active || disabled) setOpen(false); }, [active, disabled]);

  // A popover stays inside the modal's focus scope while its top layer escapes
  // the drawer's scrolling/clipping surfaces. Its entire appearance is Nexo CSS.
  useLayoutEffect(() => {
    const popup = panel.current;
    if (!popup) return;
    if (!open) {
      if (popup.matches(":popover-open")) popup.hidePopover();
      return;
    }
    function position() {
      const anchor = control.current?.getBoundingClientRect();
      if (!anchor || !popup) return;
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      const left = viewport?.offsetLeft ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const bottom = top + (viewport?.height ?? window.innerHeight);
      const below = bottom - anchor.bottom - 14;
      const above = anchor.top - top - 14;
      const upwards = below < 300 && above > below;
      const height = Math.max(0, Math.min(330, upwards ? above : below));
      const popupWidth = Math.min(anchor.width, width - 24);
      popup.style.width = `${popupWidth}px`;
      popup.style.left = `${Math.max(left + 12, Math.min(anchor.left, left + width - popupWidth - 12))}px`;
      popup.style.maxHeight = `${height}px`;
      popup.style.top = upwards ? "auto" : `${anchor.bottom + 6}px`;
      popup.style.bottom = upwards ? `${window.innerHeight - anchor.top + 6}px` : "auto";
      popup.dataset.side = upwards ? "above" : "below";
      if (anchor.bottom < top || anchor.top > bottom) setOpen(false);
    }
    position();
    popup.showPopover();
    const observer = new ResizeObserver(position);
    if (control.current) observer.observe(control.current);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
      document.removeEventListener("pointerdown", outside);
      if (popup.matches(":popover-open")) popup.hidePopover();
    };
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${highlighted}`)?.scrollIntoView({ block: "nearest" });
  }, [open, highlighted, id, query]);

  useEffect(() => {
    if (!active) return;
    setQuery("");
    setExtra([]);
    setLookupError("");
    setLooking(false);
    return () => lookup.current?.abort();
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setPeople([]);
    api.people("PROVEEDOR", controller.signal)
      .then(rows => { if (!controller.signal.aborted) setPeople(rows); })
      .catch(reason => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "No se pudieron cargar los proveedores.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [active, revision]);

  // Resolver por ID también permite ver referencias fuera del límite y personas desactivadas.
  // Ninguna consulta cambia el valor que pertenece al formulario del producto.
  useEffect(() => {
    if (!active || !value) return;
    if (knownProvider?.id === value) {
      setResolved({ id: value, person: knownProvider, message: "" });
      return;
    }
    const controller = new AbortController();
    setResolved({ id: value, message: "Consultando proveedor asociado…" });
    api.person(value, controller.signal)
      .then(person => { if (!controller.signal.aborted) setResolved({ id: value, person, message: "" }); })
      .catch(reason => {
        if (controller.signal.aborted) return;
        const unavailable = reason instanceof ApiError && [400, 404].includes(reason.status);
        setResolved({ id: value, message: unavailable
          ? "La referencia del proveedor no está disponible. La asociación se conserva."
          : "No se pudo consultar el proveedor asociado. La asociación se conserva; puedes reintentar." });
      });
    return () => controller.abort();
  }, [active, value, knownProvider, revision]);

  async function findByDocument() {
    if (looking) return;
    setLookupError("");
    if (!documentType.trim() || !documentNumber.trim()) {
      setLookupError("Escribe el tipo y número de documento.");
      return;
    }
    const controller = new AbortController();
    lookup.current?.abort();
    lookup.current = controller;
    setLooking(true);
    try {
      const person = await api.personByDocument(documentType, documentNumber, controller.signal);
      if (controller.signal.aborted) return;
      if (!eligible(person)) {
        setLookupError("La persona debe estar activa y tener rol PROVEEDOR para seleccionarla.");
        return;
      }
      setExtra(rows => [...rows.filter(row => row.id !== person.id), person]);
      choose(person.id);
    } catch (reason) {
      if (!controller.signal.aborted) setLookupError(reason instanceof Error ? reason.message : "No se pudo buscar por documento.");
    } finally {
      if (!controller.signal.aborted) setLooking(false);
    }
  }

  const current = (knownProvider?.id === value ? knownProvider : undefined)
    || (resolved.id === value ? resolved.person : undefined)
    || [...people, ...extra].find(person => person.id === value);
  const candidates = [...new Map([...people, ...extra, ...(knownProvider ? [knownProvider] : []), ...(current ? [current] : [])]
    .map(person => [person.id, person])).values()].filter(eligible);
  const matches = candidates.filter(person => normalize(
    `${fullName(person)} ${person.tipoDocumento} ${person.numeroDocumento} ${person.ciudad || ""}`,
  ).includes(normalize(query)));

  const choices = [{ id: "", person: undefined as Persona | undefined }, ...matches.map(person => ({ id: person.id, person }))];
  const activeIndex = highlighted < choices.length ? highlighted : -1;
  const selectedLabel = value ? current ? fullName(current) : "Proveedor asociado" : "Sin proveedor";

  function expand(last = false) {
    if (disabled || !active) return;
    setQuery("");
    setHighlighted(last ? candidates.length : Math.max(0, candidates.findIndex(person => person.id === value) + 1));
    setOpen(true);
  }
  function choose(next: string) {
    setOpen(false);
    setQuery("");
    onChange(next);
    input.current?.focus({ preventScroll: true });
  }

  return <fieldset ref={root} className="provider-selector" disabled={disabled}>
    <legend>Proveedor (opcional)</legend>
    <p className="field-hint" id={`${id}-hint`}>Selecciona una persona activa con rol Proveedor o deja el producto sin proveedor.</p>
    <label className="sr-only" htmlFor={`${id}-input`}>Buscar proveedor</label>
    <div ref={control} className="provider-control" data-open={open} data-disabled={disabled || undefined}
      onClick={() => { if (!open && !disabled) { input.current?.focus(); expand(); } }}>
      {open ? <Search size={19} aria-hidden="true" /> : <Truck size={19} aria-hidden="true" />}
      <div className="provider-control-value">
        <input ref={input} id={`${id}-input`} data-provider-current role="combobox" type="text" autoComplete="off"
          disabled={disabled} aria-expanded={open} aria-controls={open ? `${id}-list` : undefined}
          aria-autocomplete="list" aria-haspopup="listbox" aria-describedby={`${id}-hint ${id}-selection`}
          aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
          value={open ? query : selectedLabel} placeholder="Nombre, documento o ciudad"
          onFocus={event => event.currentTarget.select()}
          onBlur={event => { if (!panel.current?.contains(event.relatedTarget as Node)) setOpen(false); }}
          onChange={event => {
            setQuery(event.target.value); setHighlighted(1); setOpen(true);
          }}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!open) expand(event.key === "ArrowUp");
              else setHighlighted((activeIndex + (event.key === "ArrowDown" ? 1 : choices.length - 1)) % choices.length);
            }
            if (open && (event.key === "Home" || event.key === "End")) {
              event.preventDefault(); setHighlighted(event.key === "Home" ? 0 : choices.length - 1);
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (open) { if (activeIndex >= 0) choose(choices[activeIndex].id); } else expand();
            }
            if (event.key === "Tab") setOpen(false);
          }} />
        <small id={`${id}-selection`} className={open ? "sr-only" : ""}>
          {value ? current ? `${current.tipoDocumento} ${current.numeroDocumento}${current.ciudad ? ` · ${current.ciudad}` : ""}`
            : "La asociación guardada se conserva." : "Asignación opcional"}
        </small>
      </div>
      <ChevronDown className="provider-chevron" size={18} aria-hidden="true" />
    </div>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div ref={panel} popover="manual" className="provider-popover" aria-label="Proveedores disponibles">
      <div className="provider-panel-heading"><span>PROVEEDORES</span><small>{matches.length} {matches.length === 1 ? "disponible" : "disponibles"}</small></div>
      <div id={`${id}-list`} role="listbox" aria-label="Proveedor del producto" aria-busy={loading} className="provider-options">
        {choices.map((choice, index) => <div key={choice.id} id={`${id}-option-${index}`} role="option"
          aria-selected={value === choice.id} data-active={activeIndex === index} className="provider-option"
          onPointerDown={event => event.preventDefault()} onClick={() => choose(choice.id)}
          onPointerMove={event => { if (event.pointerType === "mouse") setHighlighted(index); }}>
          <span className="provider-option-icon" aria-hidden="true"><Truck size={17} /></span>
          <span className="provider-option-copy"><strong>{choice.person ? fullName(choice.person) : "Sin proveedor"}</strong>
            <small>{choice.person ? `${choice.person.tipoDocumento} ${choice.person.numeroDocumento}${choice.person.ciudad ? ` · ${choice.person.ciudad}` : ""}` : "Puedes asignarlo más adelante."}</small></span>
          {value === choice.id && <Check size={18} className="provider-check" aria-hidden="true" />}
        </div>)}
      </div>
      <div className="provider-feedback" role="status" aria-live="polite" aria-atomic="true">
        {loading ? <><LoaderCircle size={16} className="spin" aria-hidden="true" /> Cargando proveedores…</>
          : error || (candidates.length === 0 ? people.length === 0
            ? "No hay proveedores registrados. Puedes crear uno desde Personas."
            : "No hay proveedores activos en los registros cargados."
            : matches.length === 0 ? "Sin coincidencias en los registros cargados." : `${matches.length} ${matches.length === 1 ? "proveedor" : "proveedores"}. Usa las flechas y Enter para seleccionar.`)}
      </div>
    </div>
    {value && !current && <p className="field-hint" role="status">{resolved.id === value ? resolved.message : "Consultando proveedor asociado…"}</p>}
    {current && !current.activo && <p className="field-hint" role="status">Inactivo · La asociación histórica se conserva.</p>}
    {current && !current.roles.includes("PROVEEDOR") && <p className="field-hint" role="status">Ya no tiene rol Proveedor · La asociación histórica se conserva.</p>}
    <p className="field-hint">La consulta por rol devuelve hasta 100 personas, incluidas las inactivas. Esta lista puede ser parcial; la búsqueda por nombre o ciudad se limita a los registros cargados. Para localizar otro proveedor, usa su documento.</p>
    <div className="provider-actions">
      <Button type="button" onClick={() => setRevision(version => version + 1)} disabled={loading}>
        <RefreshCw size={15} aria-hidden="true" />
        {error || (value && !current) ? "Reintentar consulta de proveedores" : "Actualizar proveedores"}
      </Button>
      <Button type="button" onClick={() => { setOpen(false); onCreate(); }}><UserPlus size={15} aria-hidden="true" />Registrar proveedor en Personas</Button>
    </div>
    <details className="provider-document">
      <summary>Buscar en todas las personas por documento</summary>
      <div className="form-grid">
        <Field name="provider-document-type" label="Tipo de documento del proveedor">
          {props => <input {...props} value={documentType} disabled={looking} onChange={event => setDocumentType(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void findByDocument(); } }} />}
        </Field>
        <Field name="provider-document-number" label="Número de documento del proveedor">
          {props => <input {...props} value={documentNumber} disabled={looking} onChange={event => setDocumentNumber(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void findByDocument(); } }} />}
        </Field>
      </div>
      <Button type="button" busy={looking} onClick={() => void findByDocument()}>Buscar y seleccionar por documento</Button>
      {lookupError && <p role="alert">{lookupError}</p>}
    </details>
  </fieldset>;
}
