package observer.quantum.worm.global;

import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;
import org.springframework.security.web.csrf.*;
import org.springframework.security.web.firewall.StrictHttpFirewall;

@Slf4j
@Profile("default")
@Configuration
@EnableWebSecurity
@EnableMethodSecurity(securedEnabled = true, jsr250Enabled = true)
public class SecurityConfig {

  private final CustomUserDetailsService userDetailsService;

  private final JpaTokenRepository jpaTokenRepository;

  public SecurityConfig(
      CustomUserDetailsService userDetailsService, JpaTokenRepository jpaTokenRepository) {
    this.userDetailsService = userDetailsService;
    this.jpaTokenRepository = jpaTokenRepository;
  }

  @Bean
  public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {

    http.authorizeHttpRequests(
        authorize ->
            authorize
                .requestMatchers("/api-docs", "/swagger-ui/**", "/login")
                .permitAll()
                .anyRequest()
                .authenticated());

    http.oauth2Login(oauth2 -> oauth2.defaultSuccessUrl("/", true));

    http.rememberMe(
        rememberMe ->
            rememberMe
                .tokenRepository(jpaTokenRepository)
                .userDetailsService(userDetailsService)
                .alwaysRemember(true)
                .key("worm"));

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

    http.csrf(
            (csrf) ->
                csrf.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                    .csrfTokenRequestHandler(new SpaCsrfTokenRequestHandler()))
        .addFilterAfter(new CsrfCookieFilter(), BasicAuthenticationFilter.class);

    return http.build();
  }

  @Bean
  public StrictHttpFirewall httpFirewall() {
    return new StrictHttpFirewall();
  }
}
