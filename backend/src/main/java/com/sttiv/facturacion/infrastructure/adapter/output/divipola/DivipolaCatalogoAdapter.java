package com.sttiv.facturacion.infrastructure.adapter.output.divipola;

import com.sttiv.facturacion.domain.exception.DatosInvalidosException;
import com.sttiv.facturacion.domain.model.UbicacionGeografica;
import com.sttiv.facturacion.domain.port.UbicacionCatalogoPort;
import java.io.IOException;
import java.text.Normalizer;
import java.util.*;
import tools.jackson.databind.json.JsonMapper;

/** Catálogo inmutable empaquetado en el JAR. Nunca consulta servicios externos. */
public final class DivipolaCatalogoAdapter implements UbicacionCatalogoPort {
    public record Municipio(String cod_dpto, String dpto, String cod_mpio, String nom_mpio, String tipo_municipio) { }
    private final List<Municipio> municipios;
    private final Map<String, String> departamentos;

    public DivipolaCatalogoAdapter() {
        try (var stream = getClass().getResourceAsStream("/catalogos/divipola.json")) {
            if (stream == null) throw new IllegalStateException("Falta el catálogo local DIVIPOLA");
            var json = JsonMapper.builder().build();
            var root = json.readTree(stream);
            municipios = List.copyOf(Arrays.asList(json.treeToValue(root.get("municipios"), Municipio[].class)));
            var codes = new HashSet<String>();
            var departments = new HashMap<String, String>();
            for (var row : municipios) {
                if (row.cod_dpto() == null || !row.cod_dpto().matches("\\d{2}")
                        || row.cod_mpio() == null || !row.cod_mpio().matches("\\d{5}")
                        || !row.cod_mpio().startsWith(row.cod_dpto()) || !codes.add(row.cod_mpio())
                        || row.dpto() == null || row.dpto().isBlank() || row.nom_mpio() == null
                        || row.nom_mpio().isBlank() || row.tipo_municipio() == null || row.tipo_municipio().isBlank()) {
                    throw new IllegalStateException("Catálogo DIVIPOLA inválido o duplicado");
                }
                var previous = departments.putIfAbsent(row.cod_dpto(), row.dpto());
                if (previous != null && !previous.equals(row.dpto())) throw new IllegalStateException("Departamento inconsistente");
            }
            if (municipios.size() != root.get("metadata").get("registros").asInt()
                    || departamentosInvalidos(departments, root.get("metadata").get("departamentos").asInt())
                    || municipios.size() < 1100) throw new IllegalStateException("Catálogo DIVIPOLA incompleto");
            departamentos = Map.copyOf(departments);
        } catch (IOException ex) {
            throw new IllegalStateException("No se pudo cargar DIVIPOLA local", ex);
        }
    }

    private static boolean departamentosInvalidos(Map<String, String> values, int expected) {
        return values.size() != expected || values.size() != 33;
    }

    public List<Municipio> municipios() { return municipios; }
    public Map<String, String> departamentos() { return departamentos; }

    public static String clave(String value) {
        return Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "").replaceAll("(?U)\\s+", " ").strip().toUpperCase(Locale.ROOT);
    }

    @Override public UbicacionGeografica normalizar(UbicacionGeografica value) {
        var country = clave(value.pais());
        if (!country.isEmpty() && !country.equals("COLOMBIA")) return value;
        var department = clave(value.departamento());
        var city = clave(value.ciudad());
        if (department.isEmpty() && city.isEmpty()) return value;
        var matches = departamentos.entrySet().stream().filter(row -> clave(row.getValue()).equals(department)).toList();
        if (matches.size() != 1) throw new DatosInvalidosException("Selecciona un departamento válido de Colombia antes del municipio");
        var selected = matches.getFirst();
        if (city.isEmpty()) return new UbicacionGeografica("Colombia", selected.getValue(), value.ciudad());
        var cities = municipios.stream().filter(row -> row.cod_dpto().equals(selected.getKey())
                && clave(row.nom_mpio()).equals(city)).toList();
        if (cities.size() != 1) throw new DatosInvalidosException("El municipio no pertenece al departamento seleccionado o la coincidencia es ambigua");
        return new UbicacionGeografica("Colombia", selected.getValue(), cities.getFirst().nom_mpio());
    }
}
