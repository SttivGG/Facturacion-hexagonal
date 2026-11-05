package com.sttiv.facturacion.infrastructure;

import com.mongodb.client.gridfs.model.GridFSFile;
import com.sttiv.facturacion.domain.model.ImagenProducto;
import com.sttiv.facturacion.infrastructure.adapter.output.mongo.GridFsImagenAdapter;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import org.bson.types.ObjectId;
import org.junit.jupiter.api.Test;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.gridfs.GridFsResource;
import org.springframework.data.mongodb.gridfs.GridFsTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class GridFsImagenAdapterTests {
    @Test void guardaYRecuperaBytesYMimeSinAlterarlos() throws Exception {
        var gridFs = mock(GridFsTemplate.class);
        var adapter = new GridFsImagenAdapter(gridFs);
        var id = new ObjectId();
        byte[] bytes = {(byte)137, 80, 78, 71, 13, 10, 26, 10};
        when(gridFs.store(any(InputStream.class), anyString(), eq("image/png"))).thenAnswer(call -> {
            assertThat(call.getArgument(0, InputStream.class).readAllBytes()).isEqualTo(bytes);
            return id;
        });
        assertThat(adapter.guardar(new ImagenProducto(bytes, "image/png"))).isEqualTo(id.toHexString());
        var file = mock(GridFSFile.class);
        var resource = mock(GridFsResource.class);
        when(gridFs.findOne(any(Query.class))).thenReturn(file);
        when(gridFs.getResource(file)).thenReturn(resource);
        when(resource.getInputStream()).thenReturn(new ByteArrayInputStream(bytes));
        when(resource.getContentType()).thenReturn("image/png");
        ImagenProducto imagen = adapter.buscar(id.toHexString()).orElseThrow();
        assertThat(imagen.contenido()).isEqualTo(bytes);
        assertThat(imagen.tipoContenido()).isEqualTo("image/png");
    }

    @Test void idsInvalidosNoConsultanNiEliminanImagenes() {
        var gridFs = mock(GridFsTemplate.class);
        var adapter = new GridFsImagenAdapter(gridFs);
        assertThat(adapter.buscar("referencia-invalida")).isEmpty();
        adapter.eliminar("referencia-invalida");
        verifyNoInteractions(gridFs);
    }

    @Test void imagenAusenteYEliminacionSeRestringenAlIdSolicitado() {
        var gridFs = mock(GridFsTemplate.class);
        var adapter = new GridFsImagenAdapter(gridFs);
        var id = new ObjectId();
        assertThat(adapter.buscar(id.toHexString())).isEmpty();
        adapter.eliminar(id.toHexString());
        verify(gridFs).delete(argThat(query -> query.getQueryObject().get("_id").equals(id)));
    }
}
