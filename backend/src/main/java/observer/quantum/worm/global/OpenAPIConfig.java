package observer.quantum.worm.global;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.SpecVersion;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.FileInputStream;
import java.util.Arrays;
import java.util.Properties;

@Configuration
public class OpenAPIConfig {
    @Bean
    public OpenAPI customOpenAPI(@Value("${worm.version}") String version) {
        return new OpenAPI()
                .info(new Info()
                        .title("Worm API")
                        .description("worm tunnel protocol")
                        .version(version)
                )
                .specVersion(SpecVersion.V31);
//                .tags(Arrays.asList(
//                        new Tag("users", "User API"),
//                        new Tag("products", "Product API")
//                ));
    }
}
