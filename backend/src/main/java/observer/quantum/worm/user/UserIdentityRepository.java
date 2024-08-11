package observer.quantum.worm.user;

import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;

public interface UserIdentityRepository extends MongoRepository<UserIdentity, String> {
    Optional<UserIdentity> findByProviderAndProviderId(String provider, String providerId);

    void deleteAllByUser(User user);
}
