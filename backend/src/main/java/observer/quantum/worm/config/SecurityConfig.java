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
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.builders.AuthenticationManagerBuilder;
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
  public DaoAuthenticationProvider daoAuthenticationProvider() {
    DaoAuthenticationProvider authProvider = new DaoAuthenticationProvider();
    authProvider.setUserDetailsService(userDetailsService);
    authProvider.setPasswordEncoder(passwordEncoder);
    return authProvider;
  }

  @Bean
  public AuthenticationManager authenticationManager(HttpSecurity http) throws Exception {
    AuthenticationManagerBuilder authenticationManagerBuilder =
        http.getSharedObject(AuthenticationManagerBuilder.class);
    authenticationManagerBuilder
        .userDetailsService(userDetailsService)
        .passwordEncoder(passwordEncoder);
    authenticationManagerBuilder.authenticationProvider(daoAuthenticationProvider());
    return authenticationManagerBuilder.build();
  }

  @Bean
  public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
    http.authorizeHttpRequests(
        authorize ->
            authorize
                .requestMatchers(
                    "/api-docs",
                    "/swagger-ui/**",
                    "/login",
                    "/api/v1/users/oauth2-providers",
                    "/api/v1/users/check-username",
                    "/api/v1/users/register")
                .permitAll()
                .anyRequest()
                .authenticated());

    http.oauth2Login(oauth2 -> oauth2.defaultSuccessUrl("/", true))
        .formLogin(
            formLogin -> formLogin.defaultSuccessUrl("/", true).failureUrl("/login?error=true"));

    http.rememberMe(
        rememberMe ->
            rememberMe
                .tokenRepository(jpaTokenRepository)
                .userDetailsService(userDetailsService)
                .alwaysRemember(true)
                .key("worm"));

    http.logout(logout -> logout.logoutUrl("/logout").logoutSuccessUrl("/"));

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

    http.authenticationManager(authenticationManager(http));

    return http.build();
  }

  @Bean
  public StrictHttpFirewall httpFirewall() {
    return new StrictHttpFirewall();
  }
}
