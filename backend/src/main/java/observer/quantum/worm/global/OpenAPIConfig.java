package observer.quantum.worm.global;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.SpecVersion;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.tags.Tag;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Arrays;

@SuppressWarnings("unused")
@Configuration
public class OpenAPIConfig {

    @Bean
    public OpenAPI customOpenAPI(@Value("${worm.version}") String version) {
        return new OpenAPI()
                .info(new Info()
                                .title("Worm API")
                                .description("Worm tunnel protocol - Secure API for managing projects and user data")
                                .version(version)
//                        .contact(new Contact()
//                                .name("API Support")
//                                .email("support@wormapi.com")
//                                .url("https://www.wormapi.com/support"))
//                        .license(new License()
//                                .name("Apache 2.0")
//                                .url("http://www.apache.org/licenses/LICENSE-2.0.html"))
                )
//                .externalDocs(new ExternalDocumentation()
//                        .description("Worm API Documentation")
//                        .url("https://www.wormapi.com/docs"))
                .tags(Arrays.asList(
                        new Tag().name("User API").description("The user controller allows accessing and updating details for the current user."),
                        new Tag().name("Project API").description("The project controller supports various functions relating to projects.")
                ))
//                .servers(Arrays.asList(
//                        new Server().url("http://localhost:8333/").description("Development server")
//                ))
//                .security(Arrays.asList(new SecurityRequirement().addList("OAuth2")))
//                .components(new Components()
//                        .addSecuritySchemes("OAuth2", new SecurityScheme()
//                                .type(SecurityScheme.Type.OAUTH2)
//                                .flows(new OAuthFlows()
//                                        .implicit(new OAuthFlow()
//                                                .authorizationUrl("/oauth2/authorization/github")
//                                        )
//                                )
//                        )
//                )
                .specVersion(SpecVersion.V31);
    }
}
