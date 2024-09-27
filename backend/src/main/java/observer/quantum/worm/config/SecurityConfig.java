package observer.quantum.worm.config;

import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import observer.quantum.worm.global.CsrfCookieFilter;
import observer.quantum.worm.global.CustomUserDetailsService;
import observer.quantum.worm.global.JpaTokenRepository;
import observer.quantum.worm.global.SpaCsrfTokenRequestHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.password.PasswordEncoder;
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
  private final PasswordEncoder passwordEncoder;

  public SecurityConfig(
      CustomUserDetailsService userDetailsService,
      JpaTokenRepository jpaTokenRepository,
      PasswordEncoder passwordEncoder) {
    this.userDetailsService = userDetailsService;
    this.jpaTokenRepository = jpaTokenRepository;
    this.passwordEncoder = passwordEncoder;
  }

  @Bean
  public DaoAuthenticationProvider authenticationProvider() {
    DaoAuthenticationProvider authProvider = new DaoAuthenticationProvider();
    authProvider.setUserDetailsService(userDetailsService);
    authProvider.setPasswordEncoder(passwordEncoder);
    return authProvider;
  }

  @Bean
  public AuthenticationManager authenticationManager() {
    return new ProviderManager(authenticationProvider());
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

    http.formLogin(
        formLogin -> formLogin.defaultSuccessUrl("/", true).failureUrl("/login?error=true"));

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

    http.authenticationManager(authenticationManager());

    return http.build();
  }

  @Bean
  public StrictHttpFirewall httpFirewall() {
    return new StrictHttpFirewall();
  }
}
