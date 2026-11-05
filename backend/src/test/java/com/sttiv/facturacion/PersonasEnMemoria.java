package com.sttiv.facturacion;

import com.sttiv.facturacion.domain.exception.DocumentoDuplicadoException;
import com.sttiv.facturacion.domain.model.*;
import com.sttiv.facturacion.domain.port.PersonaRepositoryPort;
import java.util.*;

public class PersonasEnMemoria implements PersonaRepositoryPort {
    public final Map<UUID, Persona> datos = new HashMap<>();
    @Override public Persona crear(Persona p) {
        if (buscarPorDocumento(p.tipoDocumento(), p.numeroDocumento()).isPresent()) throw new DocumentoDuplicadoException();
        return guardar(p);
    }
    @Override public Persona guardar(Persona p) { datos.put(p.id(), p); return p; }
    @Override public Optional<Persona> buscarPorId(UUID id) { return Optional.ofNullable(datos.get(id)); }
    @Override public Optional<Persona> buscarPorDocumento(String tipo, String numero) {
        return datos.values().stream().filter(p -> p.tipoDocumento().equals(tipo) && p.numeroDocumento().equals(numero)).findFirst();
    }
    @Override public List<Persona> buscarPorRol(RolPersona rol, int limite) {
        return datos.values().stream().filter(p -> p.roles().contains(rol)).limit(limite).toList();
    }
}
