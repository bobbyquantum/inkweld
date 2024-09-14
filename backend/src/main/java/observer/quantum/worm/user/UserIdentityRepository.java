package observer.quantum.worm.user;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserIdentityRepository extends JpaRepository<UserIdentity, String> {
    Optional<UserIdentity> findByProviderAndProviderId(String provider, String providerId);

    void deleteAllByUser(User user);
}
