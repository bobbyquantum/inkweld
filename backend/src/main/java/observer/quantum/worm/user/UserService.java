package observer.quantum.worm.user;

import org.springframework.security.authentication.RememberMeAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
public class UserService {

    private final UserRepository userRepository;

    private final UserIdentityRepository userIdentityRepository;

    public UserService(UserRepository userRepository, UserIdentityRepository userIdentityRepository) {
        this.userRepository = userRepository;
        this.userIdentityRepository = userIdentityRepository;
    }

    public Optional<User> getCurrentUser() {
        SecurityContext securityContext = SecurityContextHolder.getContext();
        Authentication authentication = securityContext.getAuthentication();

        if (authentication instanceof OAuth2AuthenticationToken) {
            var clientRegistrationId = ((OAuth2AuthenticationToken) authentication).getAuthorizedClientRegistrationId();
            var userIdentity = userIdentityRepository.findByProviderAndProviderId(clientRegistrationId, authentication.getName());
            return userIdentity.map(UserIdentity::getUser).or(() -> Optional.ofNullable(registerUser(clientRegistrationId, ((OAuth2AuthenticationToken) authentication).getPrincipal())));
        } else if (authentication instanceof RememberMeAuthenticationToken) {
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
                userRecord.setName(user.getAttribute("name"));
                userRecord.setAvatarImageUrl(user.getAttribute("avatar_url"));
                userRecord.setUsername(user.getAttribute("email"));
            }
            case "google" -> {
                userRecord.setName(user.getAttribute("name"));
                userRecord.setUsername(user.getAttribute("email"));
            }
            default -> throw new UserAuthInvalidException();
        }
        userRepository.save(userRecord);
        userIdentityRepository.save(userIdentity);
        return userRecord;
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
    public void deleteAccount() {
        User currentUser = getCurrentUser().orElseThrow(UserAuthInvalidException::new);
        userIdentityRepository.deleteAllByUser(currentUser);
        userRepository.delete(currentUser);
        SecurityContextHolder.clearContext();
    }
}
