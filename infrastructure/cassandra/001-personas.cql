CREATE KEYSPACE IF NOT EXISTS facturacion_personas
WITH replication = {'class': 'NetworkTopologyStrategy', 'datacenter1': 1};

CREATE TABLE IF NOT EXISTS facturacion_personas.personas_por_id (
    id uuid PRIMARY KEY,
    tipo_documento text,
    numero_documento text,
    nombres text,
    apellidos text,
    correo text,
    telefono text,
    telefono_alternativo text,
    direccion text,
    ciudad text,
    departamento text,
    pais text,
    fecha_nacimiento date,
    observaciones text,
    roles set<text>,
    activo boolean,
    fecha_creacion timestamp,
    fecha_actualizacion timestamp
);

CREATE TABLE IF NOT EXISTS facturacion_personas.id_por_documento (
    tipo_documento text,
    numero_documento text,
    persona_id uuid,
    PRIMARY KEY ((tipo_documento, numero_documento))
);

CREATE TABLE IF NOT EXISTS facturacion_personas.personas_por_rol (
    rol text,
    persona_id uuid,
    PRIMARY KEY ((rol), persona_id)
);
