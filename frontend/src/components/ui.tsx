import {
  AlertCircle,
  ArrowRight,
  Check,
  ImageOff,
  LoaderCircle,
  Package,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import type { Producto } from "../types";

export function Button({
  children,
  variant = "secondary",
  busy,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      className={`button button-${variant} ${className}`}
      disabled={props.disabled || busy}
    >
      {busy && <LoaderCircle className="spin" size={16} aria-hidden="true" />}
      {children}
    </button>
  );
}
export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...props}
      className={`icon-button ${props.className || ""}`}
    >
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "blue" | "amber";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function Status({ active }: { active: boolean }) {
  return (
    <Badge tone={active ? "green" : "neutral"}>
      <span className="status-dot" />
      {active ? "Activo" : "Inactivo"}
    </Badge>
  );
}
export function Empty({
  icon: Icon = Package,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={26} aria-hidden="true" />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function ErrorNotice({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error-notice" role="alert">
      <AlertCircle size={20} aria-hidden="true" />
      <p>{message}</p>
      {retry && <Button onClick={retry}>Reintentar</Button>}
    </div>
  );
}
export function Loading({
  label = "Cargando información",
}: {
  label?: string;
}) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" size={24} aria-hidden="true" />
      <span>{label}…</span>
    </div>
  );
}
export function SearchField({
  value,
  onChange,
  placeholder = "Buscar…",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search-field">
      <Search size={18} aria-hidden="true" />
      <span className="sr-only">{placeholder}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button
          type="button"
          aria-label="Limpiar búsqueda"
          onClick={() => onChange("")}
        >
          <X size={16} />
        </button>
      )}
    </label>
  );
}
export function ProductImage({
  product,
  large = false,
}: {
  product: Producto;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(
    () => setFailed(false),
    [product.imagenId, product.fechaActualizacion],
  );
  return (
    <div className={`product-image ${large ? "large" : ""}`}>
      {product.imagenId && !failed ? (
        <img
          src={api.image(product)}
          alt={product.nombre}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <span>
            {failed ? (
              <ImageOff size={large ? 32 : 21} />
            ) : (
              <Package size={large ? 36 : 22} />
            )}
          </span>
          {large && (
            <small>{failed ? "Imagen no disponible" : "Sin imagen"}</small>
          )}
        </>
      )}
    </div>
  );
}
export function SectionHeading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function TextLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className="text-link" onClick={onClick}>
      {children}
      <ArrowRight size={16} aria-hidden="true" />
    </button>
  );
}

// Native dialogs handle focus containment, inert background, Escape and focus restoration.
// Keeping the dialog mounted during its closing animation avoids abrupt drawer exits.
export function Overlay({
  open,
  title,
  onClose,
  children,
  footer,
  kind = "drawer",
  busy = false,
  onClosed,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  kind?: "drawer" | "modal" | "navigation";
  busy?: boolean;
  onClosed?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [closing, setClosing] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const closedRef = useRef(onClosed);
  closedRef.current = onClosed;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) {
      setClosing(false);
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      setClosing(true);
      const timer = window.setTimeout(
        () => {
          dialog.close();
          setClosing(false);
          closedRef.current?.();
        },
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180,
      );
      return () => window.clearTimeout(timer);
    }
  }, [open]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const cancel = (event: Event) => {
      event.preventDefault();
      if (!busy) closeRef.current();
    };
    dialog.addEventListener("cancel", cancel);
    return () => dialog.removeEventListener("cancel", cancel);
  }, [busy]);
  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={id}
      className={`overlay ${kind} ${closing ? "closing" : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="overlay-content">
        <header className="overlay-header">
          <div>
            <span className="eyebrow">NEXO / TU ESPACIO DE TRABAJO</span>
            <h2 id={id}>{title}</h2>
          </div>
          <IconButton label="Cerrar panel" onClick={onClose} disabled={busy}>
            <X size={20} />
          </IconButton>
        </header>
        <div className="overlay-body">{children}</div>
        {footer && <footer className="overlay-footer">{footer}</footer>}
      </div>
    </dialog>,
    document.body,
  );
}
export function Confirm({
  open,
  title,
  description,
  onCancel,
  onConfirm,
  busy,
  danger = true,
  error,
}: {
  open: boolean;
  title: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
  danger?: boolean;
  error?: string;
}) {
  return (
    <Overlay
      open={open}
      title={title}
      kind="modal"
      onClose={onCancel}
      busy={busy}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>
            Volver
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
            busy={busy}
          >
            {danger ? "Sí, continuar" : "Confirmar"}
          </Button>
        </>
      }
    >
      <p className="confirm-description">{description}</p>
      {error && <ErrorNotice message={error} />}
    </Overlay>
  );
}
export function Toast({
  message,
  clear,
}: {
  message: string;
  clear: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(clear, 6000);
    return () => window.clearTimeout(timer);
  }, [message, clear]);
  return message ? (
    <div className="toast" role="status">
      <Check size={20} aria-hidden="true" />
      <span>{message}</span>
      <IconButton label="Cerrar mensaje" onClick={clear}>
        <X size={16} />
      </IconButton>
    </div>
  ) : null;
}
