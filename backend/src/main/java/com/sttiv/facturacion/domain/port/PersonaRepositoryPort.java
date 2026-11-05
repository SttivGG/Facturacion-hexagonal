package com.sttiv.facturacion.domain.port;

import com.sttiv.facturacion.domain.model.*;
import java.util.*;

public interface PersonaRepositoryPort {
    Persona crear(Persona persona);
    Persona guardar(Persona persona);
    Optional<Persona> buscarPorId(UUID id);
    Optional<Persona> buscarPorDocumento(String tipo, String numero);
    List<Persona> buscarPorRol(RolPersona rol, int limite);
}
