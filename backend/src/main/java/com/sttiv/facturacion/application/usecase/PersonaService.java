package com.sttiv.facturacion.application.usecase;

import com.sttiv.facturacion.application.command.PersonaCommand;
import com.sttiv.facturacion.application.port.PersonaUseCase;
import com.sttiv.facturacion.domain.exception.*;
import com.sttiv.facturacion.domain.model.*;
import com.sttiv.facturacion.domain.port.PersonaRepositoryPort;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

public class PersonaService implements PersonaUseCase {
    public static final int LIMITE_POR_ROL = 100;
    private final PersonaRepositoryPort personas;
    private final Clock clock;

    public PersonaService(PersonaRepositoryPort personas, Clock clock) {
        this.personas = personas;
        this.clock = clock;
    }

    @Override public Persona crear(PersonaCommand c, Set<RolPersona> roles) {
        Instant ahora = ahora();
        return personas.crear(new Persona(UUID.randomUUID(), c.tipoDocumento(), c.numeroDocumento(),
                c.nombres(), c.apellidos(), c.correo(), c.telefono(), c.telefonoAlternativo(),
                c.direccion(), c.ciudad(), c.departamento(), c.pais(), c.fechaNacimiento(),
                c.observaciones(), roles, true, ahora, ahora));
    }

    @Override public Persona consultar(UUID id) {
        return personas.buscarPorId(id).orElseThrow(() -> new RecursoNoEncontradoException("Persona no encontrada: " + id));
    }

    @Override public Persona buscarPorDocumento(String tipo, String numero) {
        return personas.buscarPorDocumento(Persona.documento(tipo), Persona.documento(numero))
                .orElseThrow(() -> new RecursoNoEncontradoException("Persona no encontrada por documento"));
    }

    @Override public Persona actualizar(UUID id, PersonaCommand c) {
        Persona anterior = consultar(id);
        if (!anterior.tipoDocumento().equals(Persona.documento(c.tipoDocumento()))
                || !anterior.numeroDocumento().equals(Persona.documento(c.numeroDocumento()))) {
            throw new DatosInvalidosException("El tipo y número de documento no se pueden modificar");
        }
        return personas.guardar(new Persona(anterior.id(), anterior.tipoDocumento(), anterior.numeroDocumento(),
                c.nombres(), c.apellidos(), c.correo(), c.telefono(), c.telefonoAlternativo(),
                c.direccion(), c.ciudad(), c.departamento(), c.pais(), c.fechaNacimiento(),
                c.observaciones(), anterior.roles(), anterior.activo(), anterior.fechaCreacion(), ahora()));
    }

    @Override public Persona reemplazarRoles(UUID id, Set<RolPersona> roles) {
        return personas.guardar(consultar(id).conRoles(roles, ahora()));
    }

    @Override public List<Persona> buscarPorRol(RolPersona rol) {
        if (rol == null) throw new DatosInvalidosException("El rol es obligatorio");
        return personas.buscarPorRol(rol, LIMITE_POR_ROL);
    }

    @Override public void desactivar(UUID id) { personas.guardar(consultar(id).desactivar(ahora())); }

    private Instant ahora() { return clock.instant().truncatedTo(ChronoUnit.MILLIS); }
}
