package observer.quantum.worm.global;

import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;

@SuppressWarnings("unused")
@Configuration(proxyBeanMethods = false)
@EnableWebSecurity
@Slf4j
@Profile("test")
public class TestSecurityConfig {

  @Bean
  public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {

    http.authorizeHttpRequests(
        authorize ->
            authorize
                .requestMatchers("/api-docs/**", "/swagger-ui/**", "/login")
                .permitAll()
                .anyRequest()
                .authenticated());

    http.logout(logout -> logout.logoutUrl("/logout"));

    http.exceptionHandling(
        exceptionHandling ->
            exceptionHandling.defaultAuthenticationEntryPointFor(
                (request, response, accessDeniedException) -> {
                  response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                  response.setContentType("application/json");
                  response.getWriter().write("{\"error\":\"Unauthorized\"}");
                },
                request -> request.getServletPath().startsWith("/api")));

    return http.build();
  }
}
