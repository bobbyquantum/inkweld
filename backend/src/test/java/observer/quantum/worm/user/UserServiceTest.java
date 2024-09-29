package observer.quantum.worm.user;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.RememberMeAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;

@ExtendWith(MockitoExtension.class)
public class UserServiceTest {

  @Mock private UserRepository userRepository;

  @Mock private UserIdentityRepository userIdentityRepository;

  @Mock private SecurityContext securityContext;

  @Mock private PasswordEncoder passwordEncoder;

  @InjectMocks private UserService userService;

  @Test
  public void testUserConstructors() {
    Long id = 1L;
    String username = "username";
    String name = "name";
    String email = "email@example.com";
    String password = "password";
    String avatarImageUrl = "avatarImageUrl";
    List<UserIdentity> identities = new ArrayList<>();

    User user = new User(id, username, name, email, password, avatarImageUrl, identities);

    assertEquals(id, user.getId());
    assertEquals(username, user.getUsername());
    assertEquals(name, user.getName());
    assertEquals(email, user.getEmail());
    assertEquals(password, user.getPassword());
    assertEquals(avatarImageUrl, user.getAvatarImageUrl());
    assertEquals(identities, user.getIdentities());

    UserIdentity identity = new UserIdentity();
    identity.setId(id);
    identity.setProvider("provider");
    identity.setProviderId("providerId");
    identity.setUser(user);

    assertEquals(id, identity.getId());
    assertEquals("provider", identity.getProvider());
    assertEquals("providerId", identity.getProviderId());
    assertEquals(user.getUsername(), identity.getUser().getUsername());
  }

  @Test
  public void testGetCurrentUser_withOAuth2AuthenticationToken() {
    // Arrange
    var oAuth2User =
        new DefaultOAuth2User(
            Collections.singleton(new SimpleGrantedAuthority("ROLE_USER")),
            Map.of(
                "name", "John Doe",
                "email", "john.doe@example.com",
                "avatar_url", "https://example.com/avatar.jpg"),
            "name");
    var oAuth2AuthenticationToken = mock(OAuth2AuthenticationToken.class);
    when(oAuth2AuthenticationToken.getAuthorizedClientRegistrationId()).thenReturn("github");
    when(oAuth2AuthenticationToken.getPrincipal()).thenReturn(oAuth2User);
    when(oAuth2AuthenticationToken.getName()).thenReturn("1234567890");

    var userRecord = new User();
    userRecord.setPassword("dummyPassword"); // Set a dummy password for the test
    when(userRepository.save(any(User.class))).thenReturn(userRecord);

    var userIdentity = new UserIdentity();
    when(userIdentityRepository.save(any(UserIdentity.class))).thenReturn(userIdentity);

    when(securityContext.getAuthentication()).thenReturn(oAuth2AuthenticationToken);
    when(passwordEncoder.encode(anyString())).thenReturn("encodedPassword");

    // Act
    SecurityContextHolder.setContext(securityContext);
    var currentUser = userService.getCurrentUser();

    // Assert
    assertTrue(currentUser.isPresent());
    assertNotNull(currentUser.get().getUsername());
    assertNotNull(currentUser.get().getName());
    assertNotNull(currentUser.get().getAvatarImageUrl());
    assertNotNull(currentUser.get().getPassword());
    verify(passwordEncoder).encode(anyString());
  }

  @Test
  public void testGetCurrentUser_withRememberMeAuthenticationToken() {
    // Arrange
    var rememberMeAuthenticationToken = mock(RememberMeAuthenticationToken.class);
    when(rememberMeAuthenticationToken.getName()).thenReturn("john.doe");

    var userRecord = new User();
    userRecord.setUsername("john.doe");
    userRecord.setPassword("dummyPassword"); // Set a dummy password for the test
    when(userRepository.findByUsername(anyString())).thenReturn(java.util.Optional.of(userRecord));

    when(securityContext.getAuthentication()).thenReturn(rememberMeAuthenticationToken);

    // Act
    SecurityContextHolder.setContext(securityContext);
    var currentUser = userService.getCurrentUser();

    // Assert
    assertTrue(currentUser.isPresent());
    assertNotNull(currentUser.get().getUsername());
    assertNotNull(currentUser.get().getPassword());
  }

  @Test
  public void testGetCurrentUser_withoutAuthentication() {
    // Arrange
    when(securityContext.getAuthentication()).thenReturn(null);

    // Act
    SecurityContextHolder.setContext(securityContext);
    var currentUser = userService.getCurrentUser();

    // Assert
    assertFalse(currentUser.isPresent());
  }

  @Test
  public void testCheckUsernameAvailability_Available() {
    // Arrange
    String username = "newuser";
    when(userRepository.findByUsername(username)).thenReturn(Optional.empty());

    // Act
    UsernameAvailabilityResponse response = userService.checkUsernameAvailability(username);

    // Assert
    assertTrue(response.isAvailable());
    assertTrue(response.getSuggestions().isEmpty());
  }

  @Test
  public void testCheckUsernameAvailability_Unavailable() {
    // Arrange
    String username = "existinguser";
    
    when(userRepository.findByUsername(anyString())).thenReturn(Optional.empty());
    when(userRepository.findByUsername(username)).thenReturn(Optional.of(new User()));

    // Act
    UsernameAvailabilityResponse response = userService.checkUsernameAvailability(username);

    // Assert
    assertFalse(response.isAvailable());
    assertEquals(3, response.getSuggestions().size());
    assertTrue(response.getSuggestions().stream().allMatch(suggestion -> !suggestion.equals(username)));
}

  @Test
  public void testRegisterUser_withGitHubProvider() {
    // Arrange
    var oAuth2User =
        new DefaultOAuth2User(
            Collections.singleton(new SimpleGrantedAuthority("ROLE_USER")),
            Map.of(
                "name", "John Doe",
                "email", "john.doe@example.com",
                "avatar_url", "https://example.com/avatar.jpg"),
            "name");
    when(passwordEncoder.encode(anyString())).thenReturn("encodedPassword");

    // Act
    var userRecord = userService.registerUser("github", oAuth2User);

    // Assert
    assertNotNull(userRecord);
    assertNotNull(userRecord.getUsername());
    assertNotNull(userRecord.getName());
    assertNotNull(userRecord.getAvatarImageUrl());
    assertNotNull(userRecord.getPassword()); // Check that a password is set
    verify(passwordEncoder).encode(anyString());
  }

  @Test
  public void testRegisterUser_withGoogleProvider() {
    // Arrange
    var oAuth2User =
        new DefaultOAuth2User(
            Collections.singleton(new SimpleGrantedAuthority("ROLE_USER")),
            Map.of(
                "name", "John Doe",
                "email", "john.doe@example.com"),
            "name");
    when(passwordEncoder.encode(anyString())).thenReturn("encodedPassword");

    // Act
    var userRecord = userService.registerUser("google", oAuth2User);

    // Assert
    assertNotNull(userRecord);
    assertNotNull(userRecord.getUsername());
    assertNotNull(userRecord.getName());
    assertNotNull(userRecord.getPassword()); // Check that a password is set
    verify(passwordEncoder).encode(anyString());
  }

  @Test
  public void testGetUser_withExistingUsername() {
    // Arrange
    var userRecord = new User();
    userRecord.setUsername("john.doe");
    userRecord.setPassword("dummyPassword"); // Set a dummy password for the test
    when(userRepository.findByUsername(anyString())).thenReturn(java.util.Optional.of(userRecord));

    // Act
    var user = userService.getUser("john.doe");

    // Assert
    assertTrue(user.isPresent());
    assertNotNull(user.get().getUsername());
    assertNotNull(user.get().getPassword());
  }

  @Test
  public void testGetUser_withNonExistingUsername() {
    // Arrange
    when(userRepository.findByUsername(anyString())).thenReturn(java.util.Optional.empty());

    // Act
    var user = userService.getUser("john.doe");

    // Assert
    assertFalse(user.isPresent());
  }

  @Test
  public void testUpdateUserDetails_withValidInput() {
    // Arrange
    User currentUser = new User();
    currentUser.setName("Old Name");
    currentUser.setAvatarImageUrl("old-avatar-url");
    currentUser.setPassword("oldPassword");

    UpdateUserRequest updateUserDto = new UpdateUserRequest();
    updateUserDto.setName("New Name");
    updateUserDto.setAvatarImageUrl("new-avatar-url");

    // Mock OAuth2AuthenticationToken
    OAuth2AuthenticationToken oauth2Auth = mock(OAuth2AuthenticationToken.class);
    when(oauth2Auth.getAuthorizedClientRegistrationId()).thenReturn("github");
    when(oauth2Auth.getName()).thenReturn("1234567890");

    SecurityContextHolder.getContext().setAuthentication(oauth2Auth);

    // Mock UserIdentity and User retrieval
    UserIdentity userIdentity = new UserIdentity();
    userIdentity.setUser(currentUser);
    when(userIdentityRepository.findByProviderAndProviderId("github", "1234567890"))
        .thenReturn(Optional.of(userIdentity));

    when(userRepository.save(any(User.class))).thenReturn(currentUser);

    // Act
    User updatedUser = userService.updateUserDetails(updateUserDto);

    // Assert
    assertNotNull(updatedUser);
    assertEquals("New Name", updatedUser.getName());
    assertEquals("new-avatar-url", updatedUser.getAvatarImageUrl());
    assertEquals("oldPassword", updatedUser.getPassword()); // Password should remain unchanged
    verify(userRepository).save(currentUser);
  }

  @Test
  public void testUpdateUserDetails_withNullInput() {
    // Arrange
    UpdateUserRequest updateUserDto = new UpdateUserRequest();

    // Act & Assert
    assertThrows(
        IllegalArgumentException.class, () -> userService.updateUserDetails(updateUserDto));
  }

  @Test
  public void testUpdateUserDetails_withNoAuthentication() {
    // Arrange
    UpdateUserRequest updateUserDto = new UpdateUserRequest();
    updateUserDto.setName("New Name");

    // Clear the SecurityContext
    SecurityContextHolder.clearContext();

    // Act & Assert
    assertThrows(
        UserAuthInvalidException.class, () -> userService.updateUserDetails(updateUserDto));
  }

  @Test
  public void testDeleteAccount_withValidAuthentication() {
    // Arrange
    User currentUser = new User();
    currentUser.setName("Test User");
    currentUser.setPassword("testPassword");

    // Mock OAuth2AuthenticationToken
    OAuth2AuthenticationToken oauth2Auth = mock(OAuth2AuthenticationToken.class);
    when(oauth2Auth.getAuthorizedClientRegistrationId()).thenReturn("github");
    when(oauth2Auth.getName()).thenReturn("1234567890");

    SecurityContextHolder.getContext().setAuthentication(oauth2Auth);

    // Mock UserIdentity and User retrieval
    UserIdentity userIdentity = new UserIdentity();
    userIdentity.setUser(currentUser);
    when(userIdentityRepository.findByProviderAndProviderId("github", "1234567890"))
        .thenReturn(Optional.of(userIdentity));

    // Act
    userService.deleteAccount();

    // Assert
    verify(userIdentityRepository).deleteAllByUser(currentUser);
    verify(userRepository).delete(currentUser);
    assertNull(SecurityContextHolder.getContext().getAuthentication());
  }

  @Test
  public void testDeleteAccount_withNoAuthentication() {
    // Arrange

    // Clear the SecurityContext
    SecurityContextHolder.clearContext();

    // Act & Assert
    assertThrows(UserAuthInvalidException.class, () -> userService.deleteAccount());
  }
}
