package observer.quantum.worm.config;

import jakarta.servlet.http.HttpServletResponse;
import java.util.Arrays;
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
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

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
                    "/logout",
                    "/api/v1/users/oauth2-providers",
                    "/api/v1/users/check-username",
                    "/api/v1/users/register",
                    "/api/v1/embeddings")  
                .permitAll()
                .anyRequest()
                .authenticated());

    http.oauth2Login(oauth2 -> oauth2.defaultSuccessUrl("/", true))
        .formLogin(
            formLogin ->
                formLogin
                    .loginProcessingUrl("/login")
                    .successHandler(
                        (request, response, authentication) -> {
                          response.setStatus(HttpServletResponse.SC_OK);
                          response.getWriter().flush();
                        })
                    .failureHandler(
                        (request, response, exception) -> {
                          response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                          response.getWriter().write("{\"error\":\"Invalid credentials\"}");
                          response.getWriter().flush();
                        }));

    http.rememberMe(
        rememberMe ->
            rememberMe
                .tokenRepository(jpaTokenRepository)
                .userDetailsService(userDetailsService)
                .alwaysRemember(true)
                .key("worm"));

    http.logout(
        logout ->
            logout
                .logoutUrl("/logout")
                .logoutSuccessHandler(
                    (request, response, authentication) -> {
                      response.setStatus(HttpServletResponse.SC_OK);
                      response.setContentType("application/json");
                      response
                          .getWriter()
                          .write(
                              "{\"message\":\"Logout successful\",\"redirectUrl\":\"/welcome\"}");
                      response.getWriter().flush();
                    })
                .invalidateHttpSession(true)
                .deleteCookies("JSESSIONID"));

    http.exceptionHandling(
        exceptionHandling ->
            exceptionHandling.authenticationEntryPoint(
                (request, response, authException) -> {
                  response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                  response.setContentType("application/json");
                  response.getWriter().write("{\"error\":\"Unauthorized\"}");
                }));

    http.csrf(
            (csrf) ->
                csrf.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                    .csrfTokenRequestHandler(new SpaCsrfTokenRequestHandler()))
        .addFilterAfter(new CsrfCookieFilter(), BasicAuthenticationFilter.class);

    http.cors(cors -> cors.configurationSource(corsConfigurationSource()));

    http.authenticationManager(authenticationManager(http));

    return http.build();
  }

  @Bean
  public CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration configuration = new CorsConfiguration();
    configuration.setAllowedOrigins(Arrays.asList("http://localhost:8333"));
    configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));
    configuration.setAllowedHeaders(Arrays.asList("*"));
    configuration.setAllowCredentials(true);
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", configuration);
    return source;
  }

  @Bean
  public StrictHttpFirewall httpFirewall() {
    return new StrictHttpFirewall();
  }
}
