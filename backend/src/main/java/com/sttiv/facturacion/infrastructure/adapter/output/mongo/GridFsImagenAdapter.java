package com.sttiv.facturacion.infrastructure.adapter.output.mongo;

import com.sttiv.facturacion.domain.model.ImagenProducto;
import com.sttiv.facturacion.domain.port.ImagenStoragePort;
import com.mongodb.client.gridfs.model.GridFSFile;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.Optional;
import java.util.UUID;
import org.bson.types.ObjectId;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.gridfs.GridFsTemplate;
import org.springframework.stereotype.Component;

@Component
public class GridFsImagenAdapter implements ImagenStoragePort {
    private final GridFsTemplate gridFs;
    public GridFsImagenAdapter(GridFsTemplate gridFs) { this.gridFs = gridFs; }
    @Override public String guardar(ImagenProducto imagen) {
        return gridFs.store(new ByteArrayInputStream(imagen.contenido()), UUID.randomUUID().toString(),
                imagen.tipoContenido()).toHexString();
    }
    private Query porId(String id) { return Query.query(Criteria.where("_id").is(new ObjectId(id))); }
    @Override public Optional<ImagenProducto> buscar(String id) {
        if (!ObjectId.isValid(id)) return Optional.empty();
        GridFSFile archivo = gridFs.findOne(porId(id));
        if (archivo == null) return Optional.empty();
        var recurso = gridFs.getResource(archivo);
        try (InputStream entrada = recurso.getInputStream()) {
            return Optional.of(new ImagenProducto(entrada.readAllBytes(), recurso.getContentType()));
        } catch (IOException ex) { throw new UncheckedIOException(ex); }
    }
    @Override public void eliminar(String id) {
        if (ObjectId.isValid(id)) gridFs.delete(porId(id));
    }
}
