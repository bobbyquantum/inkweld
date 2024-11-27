package observer.quantum.worm.domain.user;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserIdentityRepository extends JpaRepository<UserIdentity, UUID> {
  Optional<UserIdentity> findByProviderAndProviderId(String provider, String providerId);

  void deleteAllByUser(User user);
}
