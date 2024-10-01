package observer.quantum.worm.user;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Random;
import java.util.UUID;
import org.springframework.security.authentication.RememberMeAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {

  private final UserRepository userRepository;
  private final UserIdentityRepository userIdentityRepository;
  private final PasswordEncoder passwordEncoder;
  private final ClientRegistrationRepository clientRegistrationRepository;

  public UserService(
      UserRepository userRepository,
      UserIdentityRepository userIdentityRepository,
      PasswordEncoder passwordEncoder,
      ClientRegistrationRepository clientRegistrationRepository) {
    this.userRepository = userRepository;
    this.userIdentityRepository = userIdentityRepository;
    this.passwordEncoder = passwordEncoder;
    this.clientRegistrationRepository = clientRegistrationRepository;
  }

  public Optional<User> getCurrentUser() {
    SecurityContext securityContext = SecurityContextHolder.getContext();
    Authentication authentication = securityContext.getAuthentication();

    if (authentication instanceof OAuth2AuthenticationToken) {
      var clientRegistrationId =
          ((OAuth2AuthenticationToken) authentication).getAuthorizedClientRegistrationId();
      var userIdentity =
          userIdentityRepository.findByProviderAndProviderId(
              clientRegistrationId, authentication.getName());
      return userIdentity
          .map(UserIdentity::getUser)
          .or(
              () ->
                  Optional.ofNullable(
                      registerUser(
                          clientRegistrationId,
                          ((OAuth2AuthenticationToken) authentication).getPrincipal())));
    } else if (authentication instanceof RememberMeAuthenticationToken) {
      return this.getUser(authentication.getName());
    } else if (authentication instanceof UsernamePasswordAuthenticationToken) {
      return this.getUser(authentication.getName());
    }
    return Optional.empty();
  }

  public User registerUser(String provider, OAuth2User user) {
    var userRecord = new User();
    var userIdentity = new UserIdentity();
    userIdentity.setProvider(provider);
    userIdentity.setProviderId(user.getName());
    userIdentity.setUser(userRecord);
    switch (provider) {
      case "github" -> {
        userIdentity.setProviderUser(user.getAttribute("login"));
        userIdentity.setProviderDisplay(user.getAttribute("name"));
        userRecord.setUsername(user.getAttribute("login"));
        userRecord.setName(user.getAttribute("name"));
        userRecord.setAvatarImageUrl(user.getAttribute("avatar_url"));
        userRecord.setEmail(user.getAttribute("email"));
      }
      case "google" -> {
        userRecord.setName(user.getAttribute("name"));
        userRecord.setUsername(user.getAttribute("email"));
      }
      default -> throw new UserAuthInvalidException();
    }
    // Set a random password for OAuth2 users
    String randomPassword = UUID.randomUUID().toString();
    userRecord.setPassword(passwordEncoder.encode(randomPassword));

    userRepository.save(userRecord);
    userIdentityRepository.save(userIdentity);
    return userRecord;
  }

  public User registerUser(String username, String email, String password, String name) {
    if (userRepository.findByUsername(username).isPresent()) {
      throw new IllegalArgumentException("Username already exists");
    }

    if (!isPasswordStrong(password)) {
      throw new IllegalArgumentException("Password does not meet strength requirements");
    }

    var userRecord = new User();
    userRecord.setUsername(username);
    userRecord.setName(name);
    userRecord.setEmail(email);
    userRecord.setPassword(passwordEncoder.encode(password));
    userRecord.setEnabled(true);

    return userRepository.save(userRecord);
  }

  public Optional<User> getUser(String username) {
    return userRepository.findByUsername(username);
  }

  @Transactional
  public User updateUserDetails(UpdateUserRequest updateUserDto) {
    if (updateUserDto.getName() == null && updateUserDto.getAvatarImageUrl() == null) {
      throw new IllegalArgumentException("At least one field must be provided for update");
    }
    User currentUser = getCurrentUser().orElseThrow(UserAuthInvalidException::new);

    if (updateUserDto.getName() != null) {
      currentUser.setName(updateUserDto.getName());
    }
    if (updateUserDto.getAvatarImageUrl() != null) {
      currentUser.setAvatarImageUrl(updateUserDto.getAvatarImageUrl());
    }

    return userRepository.save(currentUser);
  }

  @Transactional
  public void updatePassword(String oldPassword, String newPassword) {
    User currentUser = getCurrentUser().orElseThrow(UserAuthInvalidException::new);

    if (!passwordEncoder.matches(oldPassword, currentUser.getPassword())) {
      throw new IllegalArgumentException("Old password is incorrect");
    }

    if (!isPasswordStrong(newPassword)) {
      throw new IllegalArgumentException("New password does not meet strength requirements");
    }

    currentUser.setPassword(passwordEncoder.encode(newPassword));
    userRepository.save(currentUser);
  }

  @Transactional
  public void deleteAccount() {
    User currentUser = getCurrentUser().orElseThrow(UserAuthInvalidException::new);
    userIdentityRepository.deleteAllByUser(currentUser);
    userRepository.delete(currentUser);
    SecurityContextHolder.clearContext();
  }

  private boolean isPasswordStrong(String password) {
    // Password must be at least 8 characters long and contain at least one uppercase letter,
    // one lowercase letter, one digit, and one special character
    String passwordRegex = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$";
    return password.matches(passwordRegex);
  }

  @Transactional
  public void migrateUnhashedPasswords() {
    userRepository
        .findAll()
        .forEach(
            user -> {
              if (!user.getPassword()
                  .startsWith("$2a$")) { // Check if the password is not already hashed
                user.setPassword(passwordEncoder.encode(user.getPassword()));
                userRepository.save(user);
              }
            });
  }

  public UsernameAvailabilityResponse checkUsernameAvailability(String username) {
    boolean isAvailable = !userRepository.findByUsername(username).isPresent();
    List<String> suggestions = new ArrayList<>();

    if (!isAvailable) {
      suggestions = generateUsernameSuggestions(username);
    }

    return new UsernameAvailabilityResponse(isAvailable, suggestions);
  }

  private List<String> generateUsernameSuggestions(String username) {
    List<String> suggestions = new ArrayList<>();
    Random random = new Random();

    // Add a random number to the end
    suggestions.add(username + random.nextInt(1000));

    // Add an underscore and a random number
    suggestions.add(username + "_" + random.nextInt(100));

    // Add a random adjective before the username
    String[] adjectives = {"cool", "awesome", "super", "mega", "ultra"};
    suggestions.add(adjectives[random.nextInt(adjectives.length)] + "_" + username);

    // Add a random suffix
    String[] suffixes = {"dev", "coder", "ninja", "guru", "pro"};
    suggestions.add(username + "_" + suffixes[random.nextInt(suffixes.length)]);

    // Ensure all suggestions are unique and available
    return suggestions.stream()
        .distinct()
        .filter(suggestion -> !userRepository.findByUsername(suggestion).isPresent())
        .limit(3)
        .toList();
  }

  public List<String> getEnabledOAuth2Providers() {
    List<String> providers = new ArrayList<>();

    String[] providerIds = {"github", "google"};
    for (String providerId : providerIds) {
      ClientRegistration registration =
          clientRegistrationRepository.findByRegistrationId(providerId);
      if (registration != null) {
        providers.add(registration.getRegistrationId());
      }
    }

    return providers;
  }
}
