package observer.quantum.worm.global;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Date;
import observer.quantum.worm.domain.user.UserService;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.web.authentication.rememberme.PersistentRememberMeToken;
import org.springframework.security.web.authentication.rememberme.PersistentTokenRepository;
import org.springframework.transaction.annotation.Transactional;

@Configuration
public class JpaTokenRepository implements PersistentTokenRepository {

  private final UserService userService;

  @PersistenceContext private EntityManager entityManager;

  public JpaTokenRepository(UserService userService) {
    this.userService = userService;
  }

  @Override
  @Transactional
  public void createNewToken(PersistentRememberMeToken token) {
    var userRecord = userService.getCurrentUser();
    userRecord.ifPresent(
        user -> {
          PersistentToken persistentToken = new PersistentToken(user.getUsername(), token);
          entityManager.persist(persistentToken);
        });
  }

  @Override
  @Transactional
  public void updateToken(String series, String tokenValue, Date lastUsed) {
    PersistentToken token =
        entityManager
            .createQuery(
                "SELECT t FROM PersistentToken t WHERE t.series = :series", PersistentToken.class)
            .setParameter("series", series)
            .getResultStream()
            .findFirst()
            .orElse(null);

    if (token != null) {
      token.setTokenValue(tokenValue);
      token.setLastUsed(convertToOffsetDateTime(lastUsed));
      entityManager.merge(token);
    }
  }

  @Override
  @Transactional(readOnly = true)
  public PersistentRememberMeToken getTokenForSeries(String seriesId) {
    PersistentToken token =
        entityManager
            .createQuery(
                "SELECT t FROM PersistentToken t WHERE t.series = :series", PersistentToken.class)
            .setParameter("series", seriesId)
            .getResultStream()
            .findFirst()
            .orElse(null);

    if (token != null) {
      return new PersistentRememberMeToken(
          token.getUsername(),
          token.getSeries(),
          token.getTokenValue(),
          convertToDate(token.getLastUsed()));
    } else {
      return null;
    }
  }

  @Override
  @Transactional
  public void removeUserTokens(String username) {
    entityManager
        .createQuery("DELETE FROM PersistentToken t WHERE t.username = :username")
        .setParameter("username", username)
        .executeUpdate();
  }

  private OffsetDateTime convertToOffsetDateTime(Date dateToConvert) {
    return dateToConvert.toInstant().atZone(ZoneId.systemDefault()).toOffsetDateTime();
  }

  private Date convertToDate(OffsetDateTime dateToConvert) {
    return Date.from(dateToConvert.toInstant());
  }
}
