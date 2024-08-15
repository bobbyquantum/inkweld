package observer.quantum.worm.api;

import lombok.extern.slf4j.Slf4j;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.ResponseEntity;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.client.RestTemplate;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.shaded.org.apache.commons.io.FileUtils;

import java.io.File;

@Slf4j
@Testcontainers
@ActiveProfiles("test")
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "application-test.yml"
)
public class GenerateSpecTest {

    @Container
    @ServiceConnection
    static MongoDBContainer mongoDBContainer = new MongoDBContainer("mongo:latest");

    @LocalServerPort
    private int port;

    @WithMockUser(value = "user", roles = {"USER"})
    @Test
    public void generateOpenApiSpec() throws Exception {
        log.info("Starting test, mongo container ID: {}", mongoDBContainer.getContainerId());
        RestTemplate restTemplate = new RestTemplate();
        String url = "http://localhost:" + port + "/api-docs";
        ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);

        // Save the response to a file
        String openApiSpec = response.getBody();
        File file = new File("target/openapi.json");
        FileUtils.write(file, openApiSpec, "UTF-8");
    }
}

