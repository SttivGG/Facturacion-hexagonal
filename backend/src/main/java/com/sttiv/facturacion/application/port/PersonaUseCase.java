package com.sttiv.facturacion.application.port;

import com.sttiv.facturacion.application.command.PersonaCommand;
import com.sttiv.facturacion.domain.model.*;
import java.util.*;

public interface PersonaUseCase {
    Persona crear(PersonaCommand datos, Set<RolPersona> roles);
    Persona consultar(UUID id);
    Persona buscarPorDocumento(String tipo, String numero);
    Persona actualizar(UUID id, PersonaCommand datos);
    Persona reemplazarRoles(UUID id, Set<RolPersona> roles);
    List<Persona> buscarPorRol(RolPersona rol);
    void desactivar(UUID id);
}
