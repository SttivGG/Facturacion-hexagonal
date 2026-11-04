package com.sttiv.facturacion;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import com.mongodb.client.MongoClient;

@SpringBootTest
@AutoConfigureMockMvc
class FacturacionHexagonalApplicationTests {

	@MockitoBean
	private MongoClient mongoClient;

	@Autowired
	private MockMvc mockMvc;

	@Test
	void healthReturnsOkAndSystemName() throws Exception {
		mockMvc.perform(get("/api/health").accept(MediaType.APPLICATION_JSON))
				.andExpect(status().isOk())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
				.andExpect(content().json("""
						{
						  "status": "OK",
						  "sistema": "Facturacion Hexagonal"
						}
						""", JsonCompareMode.STRICT));
	}

}
