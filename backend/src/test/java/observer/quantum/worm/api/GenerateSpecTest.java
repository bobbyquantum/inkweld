package observer.quantum.worm.api;

import java.io.File;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.io.FileUtils;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.client.RestTemplate;

@Slf4j
@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public class GenerateSpecTest {

  @LocalServerPort private int port;

  @WithMockUser()
  @Test
  public void generateOpenApiSpec() throws Exception {
    RestTemplate restTemplate = new RestTemplate();
    String url = "http://localhost:" + port + "/api-docs";
    ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);

    String openApiSpec = response.getBody();
    File file = new File("target/openapi.json");
    FileUtils.writeStringToFile(file, openApiSpec, "UTF-8");
  }
}
