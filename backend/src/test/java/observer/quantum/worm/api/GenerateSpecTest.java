package observer.quantum.worm.api;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestTemplate;
import org.testcontainers.shaded.org.apache.commons.io.FileUtils;

import java.io.File;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public class GenerateSpec {

    @LocalServerPort
    private int port;

    @Test
    public void generateOpenApiSpec() throws Exception {
        RestTemplate restTemplate = new RestTemplate();
        String url = "http://localhost:" + port + "/api-docs";
        ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);

        // Save the response to a file
        String openApiSpec = response.getBody();
        File file = new File("openapi.json");
        FileUtils.write(file, openApiSpec, "UTF-8");
    }
}

