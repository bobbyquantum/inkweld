package observer.quantum.worm.user;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.RememberMeAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private UserIdentityRepository userIdentityRepository;

    @Mock
    private SecurityContext securityContext;

    @InjectMocks
    private UserService userService;

    @Test
    public void testUserConstructors() {
        String id = "id";
        String username = "username";
        String name = "name";
        String avatarImageUrl = "avatarImageUrl";
        List<UserIdentity> identities = new ArrayList<>();

        User user = new User(id, username, name, avatarImageUrl, identities);

        assertEquals(id, user.getId());
        assertEquals(username, user.getUsername());
        assertEquals(name, user.getName());
        assertEquals(avatarImageUrl, user.getAvatarImageUrl());
        assertEquals(identities, user.getIdentities());

        String provider = "provider";
        String providerId = "providerId";

        UserIdentity identity = new UserIdentity(id, provider, providerId, user);

        assertEquals(id, identity.getId());
        assertEquals(provider, identity.getProvider());
        assertEquals(providerId, identity.getProviderId());
        assertEquals(user.getUsername(), identity.getUser().getUsername());


    }

    @Test
    public void testGetCurrentUser_withOAuth2AuthenticationToken() {
        // Arrange
        var oAuth2User = new DefaultOAuth2User(
                Collections.singleton(new SimpleGrantedAuthority("ROLE_USER")),
                Map.of(
                        "name", "John Doe",
                        "email", "john.doe@example.com",
                        "avatar_url", "https://example.com/avatar.jpg"
                ),
                "name"
        );
        var oAuth2AuthenticationToken = mock(OAuth2AuthenticationToken.class);
        when(oAuth2AuthenticationToken.getAuthorizedClientRegistrationId()).thenReturn("github");
        when(oAuth2AuthenticationToken.getPrincipal()).thenReturn(oAuth2User);
        when(oAuth2AuthenticationToken.getName()).thenReturn("1234567890");

        var userRecord = new User();
        when(userRepository.save(any(User.class))).thenReturn(userRecord);

        var userIdentity = new UserIdentity();
        when(userIdentityRepository.save(any(UserIdentity.class))).thenReturn(userIdentity);

        when(securityContext.getAuthentication()).thenReturn(oAuth2AuthenticationToken);

        // Act
        SecurityContextHolder.setContext(securityContext);
        var currentUser = userService.getCurrentUser();

        // Assert
        assertTrue(currentUser.isPresent());
        assertNotNull(currentUser.get().getUsername());
        assertNotNull(currentUser.get().getName());
        assertNotNull(currentUser.get().getAvatarImageUrl());
    }

    @Test
    public void testGetCurrentUser_withRememberMeAuthenticationToken() {
        // Arrange
        var rememberMeAuthenticationToken = mock(RememberMeAuthenticationToken.class);
        when(rememberMeAuthenticationToken.getName()).thenReturn("john.doe");

        var userRecord = new User();
        userRecord.setUsername("john.doe");
        when(userRepository.findByUsername(anyString())).thenReturn(java.util.Optional.of(userRecord));

        when(securityContext.getAuthentication()).thenReturn(rememberMeAuthenticationToken);

        // Act
        SecurityContextHolder.setContext(securityContext);
        var currentUser = userService.getCurrentUser();

        // Assert
        assertTrue(currentUser.isPresent());
        assertNotNull(currentUser.get().getUsername());
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
    public void testRegisterUser_withGitHubProvider() {
        // Arrange
        var oAuth2User = new DefaultOAuth2User(
                Collections.singleton(new SimpleGrantedAuthority("ROLE_USER")),
                Map.of(
                        "name", "John Doe",
                        "email", "john.doe@example.com",
                        "avatar_url", "https://example.com/avatar.jpg"
                ),
                "name"
        );
        // Act
        var userRecord = userService.registerUser("github", oAuth2User);

        // Assert
        assertNotNull(userRecord);
        assertNotNull(userRecord.getUsername());
        assertNotNull(userRecord.getName());
        assertNotNull(userRecord.getAvatarImageUrl());
    }

    @Test
    public void testRegisterUser_withGoogleProvider() {
        // Arrange
        var oAuth2User = new DefaultOAuth2User(
                Collections.singleton(new SimpleGrantedAuthority("ROLE_USER")),
                Map.of(
                        "name", "John Doe",
                        "email", "john.doe@example.com"
                ),
                "name"
        );
        // Act
        var userRecord = userService.registerUser("google", oAuth2User);

        // Assert
        assertNotNull(userRecord);
        assertNotNull(userRecord.getUsername());
        assertNotNull(userRecord.getName());
    }

    @Test
    public void testGetUser_withExistingUsername() {
        // Arrange
        var userRecord = new User();
        userRecord.setUsername("john.doe");
        when(userRepository.findByUsername(anyString())).thenReturn(java.util.Optional.of(userRecord));

        // Act
        var user = userService.getUser("john.doe");

        // Assert
        assertTrue(user.isPresent());
        assertNotNull(user.get().getUsername());
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
}