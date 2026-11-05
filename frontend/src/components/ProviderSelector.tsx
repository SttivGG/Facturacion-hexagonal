import { useEffect, useId, useRef, useState } from "react";
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
      onChange(person.id);
    } catch (reason) {
      if (!controller.signal.aborted) setLookupError(reason instanceof Error ? reason.message : "No se pudo buscar por documento.");
    } finally {
      if (!controller.signal.aborted) setLooking(false);
    }
  }

  const current = resolved.id === value ? resolved.person : undefined;
  const candidates = [...new Map([...people, ...extra, ...(knownProvider ? [knownProvider] : []), ...(current ? [current] : [])]
    .map(person => [person.id, person])).values()].filter(eligible);
  const matches = candidates.filter(person => person.id === value || normalize(
    `${fullName(person)} ${person.tipoDocumento} ${person.numeroDocumento} ${person.ciudad || ""}`,
  ).includes(normalize(query)));

  return <fieldset className="provider-selector" disabled={disabled}>
    <legend>Proveedor (opcional)</legend>
    <p className="field-hint" id={`${id}-hint`}>Selecciona una persona activa con rol Proveedor o deja el producto sin proveedor.</p>
    <Field name="provider-search" label="Buscar proveedor" hint="Busca por nombre, documento o ciudad dentro de los registros cargados.">
      {props => <input {...props} type="search" value={query} onChange={event => setQuery(event.target.value)}
        placeholder="Nombre, documento o ciudad" onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} />}
    </Field>
    <div role="radiogroup" aria-label="Proveedor del producto" aria-describedby={`${id}-hint`}>
      <label className="provider-option">
        <input data-provider-current={!value ? true : undefined} type="radio" name={id} checked={!value} onChange={() => onChange("")} />
        <span><strong>Sin proveedor</strong><small>Puedes asignarlo más adelante.</small></span>
      </label>
      {value && !matches.some(person => person.id === value) && <label className="provider-option provider-current">
        <input data-provider-current type="radio" name={id} checked onChange={() => {}} />
        <span>
          <strong>{current ? fullName(current) : "Proveedor asociado"}</strong>
          {current ? <>
            <small>{current.tipoDocumento} {current.numeroDocumento}{current.ciudad ? ` · ${current.ciudad}` : ""}</small>
            {!current.activo && <small>Inactivo · La asociación histórica se conserva.</small>}
            {!current.roles.includes("PROVEEDOR") && <small>Ya no tiene rol Proveedor · La asociación histórica se conserva.</small>}
          </> : <small role="status">{resolved.id === value ? resolved.message : "Consultando proveedor asociado…"}</small>}
        </span>
      </label>}
      <div className="provider-options" aria-busy={loading}>
        {matches.map(person => <label key={person.id} className="provider-option">
          <input data-provider-current={person.id === value ? true : undefined} type="radio" name={id} checked={person.id === value} onChange={() => onChange(person.id)} />
          <span><strong>{fullName(person)}</strong><small>{person.tipoDocumento} {person.numeroDocumento}{person.ciudad ? ` · ${person.ciudad}` : ""}</small></span>
        </label>)}
      </div>
    </div>
    {loading && <p role="status">Cargando proveedores…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && candidates.length === 0 && <p role="status">{people.length === 0
      ? "No hay proveedores registrados. Puedes crear uno desde Personas."
      : "No hay proveedores activos en los registros cargados."}</p>}
    {!loading && !error && candidates.length > 0 && matches.length === 0 && query && <p role="status">Sin coincidencias en los registros cargados.</p>}
    <p className="field-hint">La consulta por rol devuelve hasta 100 personas, incluidas las inactivas. Esta lista puede ser parcial; la búsqueda por nombre o ciudad se limita a los registros cargados. Para localizar otro proveedor, usa su documento.</p>
    <div className="provider-actions">
      <Button type="button" onClick={() => setRevision(version => version + 1)} disabled={loading}>
        {error || (value && !current) ? "Reintentar consulta de proveedores" : "Actualizar proveedores"}
      </Button>
      <Button type="button" onClick={onCreate}>Registrar proveedor en Personas</Button>
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
