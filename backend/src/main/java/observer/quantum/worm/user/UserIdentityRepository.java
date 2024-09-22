package observer.quantum.worm.user;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserIdentityRepository extends JpaRepository<UserIdentity, String> {
  Optional<UserIdentity> findByProviderAndProviderId(String provider, String providerId);

  void deleteAllByUser(User user);
}
