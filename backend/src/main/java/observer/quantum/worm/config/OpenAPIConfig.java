package observer.quantum.worm.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.SpecVersion;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.servers.Server;
import io.swagger.v3.oas.models.tags.Tag;
import java.util.Arrays;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenAPIConfig {

  @Bean
  public OpenAPI customOpenAPI(@Value("${worm.version}") String version) {
    return new OpenAPI()
        .info(
            new Info()
                .title("Worm API")
                .description(
                    "Worm tunnel protocol - Secure API for managing projects and user data")
                .version(version)
            )
        .tags(
            Arrays.asList(
                new Tag()
                    .name("User API")
                    .description(
                        "The user controller allows accessing and updating details for the current user."),
                new Tag()
                    .name("Project API")
                    .description(
                        "The project controller supports various functions relating to projects.")))
                       .servers(Arrays.asList(
                               new
        Server().url("http://localhost:8333/").description("Development server")
                       ))

        .specVersion(SpecVersion.V31);
  }
}
