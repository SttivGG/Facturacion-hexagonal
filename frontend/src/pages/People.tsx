import { Mail, MapPin, Pencil, Plus, Power, Search, Users } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { api, request, ApiError } from "../api";
import { useResource } from "../hooks";
import { roles, roleNames, type Persona, type Rol } from "../types";
import { PersonEditor } from "../components/PersonEditor";
import {
  Badge,
  Button,
  Confirm,
  Empty,
  ErrorNotice,
  IconButton,
  Loading,
  SearchField,
  Status,
} from "../components/ui";

export function People({ notify }: { notify: (message: string) => void }) {
  const [role, setRole] = useState<Rol>("CLIENTE");
  const loader = useCallback(
    (signal: AbortSignal) => api.people(role, signal),
    [role],
  );
  const { data, loading, error, refresh } = useResource(loader);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [selected, setSelected] = useState<Persona>();
  const [deactivate, setDeactivate] = useState<Persona>();
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState("");
  const [documentType, setDocumentType] = useState("CC");
  const [documentNumber, setDocumentNumber] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [found, setFound] = useState<Persona | null>();
  const filtered = useMemo(
    () =>
      data?.filter(
        (p) =>
          `${p.nombres} ${p.apellidos || ""} ${p.numeroDocumento} ${p.correo || ""}`
            .toLocaleLowerCase("es")
            .includes(query.toLocaleLowerCase("es")) &&
          (status === "all" || p.activo === (status === "active")),
      ) || [],
    [data, query, status],
  );
  function edit(person?: Persona) {
    setSelected(person);
    setEditorOpen(true);
  }
  async function lookup() {
    if (!documentType.trim() || !documentNumber.trim()) {
      setLookupError("Escribe el tipo y el número del documento.");
      return;
    }
    setLookupBusy(true);
    setLookupError("");
    setFound(undefined);
    try {
      setFound(
        await request<Persona>(
          `/personas/documento/${encodeURIComponent(documentType.trim())}/${encodeURIComponent(documentNumber.trim())}`,
        ),
      );
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 404) setFound(null);
      else
        setLookupError(
          reason instanceof Error ? reason.message : "No se pudo buscar.",
        );
    } finally {
      setLookupBusy(false);
    }
  }
  async function confirmDeactivate() {
    if (!deactivate) return;
    setDeactivating(true);
    setDeactivateError("");
    try {
      await request(`/personas/${encodeURIComponent(deactivate.id)}`, {
        method: "DELETE",
      });
      setDeactivate(undefined);
      setFound(undefined);
      refresh();
      notify("Persona desactivada. Su historial se conserva.");
    } catch (reason) {
      setDeactivateError(
        reason instanceof Error ? reason.message : "No se pudo desactivar.",
      );
    } finally {
      setDeactivating(false);
    }
  }
  function personCard(person: Persona) {
    return (
      <article className="person-card" key={person.id}>
        <div className="person-card-top">
          <span className="avatar">
            {`${person.nombres[0]}${person.apellidos?.[0] || ""}`.toLocaleUpperCase(
              "es",
            )}
          </span>
          <Status active={person.activo} />
        </div>
        <h2>
          {person.nombres} {person.apellidos}
        </h2>
        <p className="document-text">
          {person.tipoDocumento} {person.numeroDocumento}
        </p>
        <div className="person-contact">
          <span>
            <Mail size={14} aria-hidden="true" />
            {person.correo || "Sin correo electrónico"}
          </span>
          <span>
            <MapPin size={14} aria-hidden="true" />
            {[person.ciudad, person.departamento].filter(Boolean).join(", ") ||
              "Sin ubicación"}
          </span>
        </div>
        <div className="person-card-footer">
          <div className="badge-list">
            {person.roles.length ? (
              person.roles.map((r) => (
                <Badge key={r} tone={r === "CLIENTE" ? "blue" : "neutral"}>
                  {roleNames[r]}
                </Badge>
              ))
            ) : (
              <Badge>Sin roles</Badge>
            )}
          </div>
          <div className="row-actions">
            <IconButton
              label={`Editar ${person.nombres}`}
              onClick={() => edit(person)}
            >
              <Pencil size={16} />
            </IconButton>
            {person.activo && (
              <IconButton
                label={`Desactivar ${person.nombres}`}
                onClick={() => {
                  setDeactivateError("");
                  setDeactivate(person);
                }}
              >
                <Power size={16} />
              </IconButton>
            )}
          </div>
        </div>
      </article>
    );
  }
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">CONEXIONES QUE CUENTAN</span>
          <h1>
            Personas<span className="title-dot">.</span>
          </h1>
          <p>Clientes, proveedores y equipo. Más cerca.</p>
        </div>
        <Button variant="primary" onClick={() => edit()}>
          <Plus size={18} />
          Nueva persona
        </Button>
      </div>
      <section
        className="glass catalog-panel"
        aria-label="Directorio de personas"
      >
        <div className="role-tabs" aria-label="Filtrar por rol">
          {roles.map((r) => (
            <button
              type="button"
              aria-pressed={role === r}
              className={role === r ? "active" : ""}
              onClick={() => {
                setRole(r);
                setQuery("");
              }}
              key={r}
            >
              {roleNames[r]}
              {r === "CLIENTE"
                ? "s"
                : r === "PROVEEDOR"
                  ? "es"
                  : r === "TRABAJADOR"
                    ? "es"
                    : "es"}
            </button>
          ))}
        </div>
        <div className="catalog-toolbar">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Buscar entre las personas cargadas"
          />
          <label>
            <span className="sr-only">Filtrar por estado</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </label>
        </div>
        {error ? (
          <ErrorNotice message={error} retry={refresh} />
        ) : loading ? (
          <Loading label="Cargando personas" />
        ) : filtered.length ? (
          <div className="people-grid">{filtered.map(personCard)}</div>
        ) : (
          <Empty
            icon={Users}
            title={
              query || status !== "all"
                ? "No encontramos coincidencias"
                : `Aún no hay personas con rol ${roleNames[role].toLocaleLowerCase("es")}`
            }
            description={
              query || status !== "all"
                ? "Prueba con otro término o cambia el estado."
                : "Agrega una persona o consulta otro rol para comenzar."
            }
            action={
              <Button onClick={() => edit()}>
                <Plus size={16} />
                Nueva persona
              </Button>
            }
          />
        )}
        <footer className="catalog-footer">
          <span>
            <Users size={14} aria-hidden="true" />
            {loading ? "Consultando" : `${filtered.length} personas cargadas`}
          </span>
          <span>Hasta 100 registros por rol · Incluye inactivos</span>
        </footer>
      </section>
      <section className="glass document-lookup">
        <div>
          <h2>¿Buscas a alguien en particular?</h2>
          <p>Consulta por documento, incluso si la persona no tiene roles.</p>
        </div>
        <form
          className="lookup-form"
          onSubmit={(e) => {
            e.preventDefault();
            void lookup();
          }}
        >
          <label>
            <span>Tipo</span>
            <input
              aria-label="Tipo de documento para buscar"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              placeholder="CC"
            />
          </label>
          <label className="grow">
            <span>Número de documento</span>
            <input
              aria-label="Número de documento para buscar"
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
              placeholder="Escribe el número"
            />
          </label>
          <Button type="submit" busy={lookupBusy}>
            <Search size={17} />
            Buscar
          </Button>
        </form>
        {lookupError && <ErrorNotice message={lookupError} />}
        {found === null && (
          <p role="status" className="lookup-result">
            No encontramos una persona con ese documento.
          </p>
        )}
        {found && <div className="lookup-result">{personCard(found)}</div>}
      </section>
      <PersonEditor
        onPersisted={() => {
          refresh();
          setFound(undefined);
        }}
        open={editorOpen}
        person={selected}
        onClose={() => setEditorOpen(false)}
        onSaved={(message) => {
          refresh();
          setFound(undefined);
          notify(message);
        }}
      />
      <Confirm
        open={Boolean(deactivate)}
        title="¿Desactivar esta persona?"
        description={`«${deactivate?.nombres || ""}» no podrá participar en nuevas ventas. Se conservarán sus datos y su historial.`}
        onCancel={() => setDeactivate(undefined)}
        onConfirm={confirmDeactivate}
        busy={deactivating}
        error={deactivateError}
      />
    </>
  );
}
