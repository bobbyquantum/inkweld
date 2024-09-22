package observer.quantum.worm.global;

import static org.junit.jupiter.api.Assertions.*;

import java.time.OffsetDateTime;
import java.util.Date;
import org.junit.jupiter.api.Test;
import org.springframework.security.web.authentication.rememberme.PersistentRememberMeToken;

class PersistentTokenTest {

  @Test
  void testNoArgsConstructor() {
    PersistentToken token = new PersistentToken();
    assertNotNull(token);
    assertNull(token.getId());
    assertNull(token.getSeries());
    assertNull(token.getTokenValue());
    assertNull(token.getLastUsed());
    assertNull(token.getUsername());
  }

  @Test
  void testAllArgsConstructor() {
    Long id = 1L;
    String series = "testSeries";
    String tokenValue = "testTokenValue";
    OffsetDateTime lastUsed = OffsetDateTime.now();
    String username = "testUser";

    PersistentToken token = new PersistentToken(id, series, tokenValue, lastUsed, username);

    assertEquals(id, token.getId());
    assertEquals(series, token.getSeries());
    assertEquals(tokenValue, token.getTokenValue());
    assertEquals(lastUsed, token.getLastUsed());
    assertEquals(username, token.getUsername());
  }

  @Test
  void testConstructorWithPersistentRememberMeToken() {
    String series = "testSeries";
    String tokenValue = "testTokenValue";
    Date lastUsed = new Date();
    String username = "testUser";

    PersistentRememberMeToken rememberMeToken =
        new PersistentRememberMeToken(username, series, tokenValue, lastUsed);
    PersistentToken token = new PersistentToken(username, rememberMeToken);

    assertNull(token.getId());
    assertEquals(series, token.getSeries());
    assertEquals(tokenValue, token.getTokenValue());
    assertEquals(lastUsed, token.getLastUsedAsDate());
    assertEquals(username, token.getUsername());

    // Additional test to ensure the OffsetDateTime is correct
    assertEquals(lastUsed.toInstant(), token.getLastUsed().toInstant());
  }

  @Test
  void testSettersAndGetters() {
    PersistentToken token = new PersistentToken();

    Long id = 1L;
    String series = "testSeries";
    String tokenValue = "testTokenValue";
    OffsetDateTime lastUsed = OffsetDateTime.now();
    String username = "testUser";

    token.setId(id);
    token.setSeries(series);
    token.setTokenValue(tokenValue);
    token.setLastUsed(lastUsed);
    token.setUsername(username);

    assertEquals(id, token.getId());
    assertEquals(series, token.getSeries());
    assertEquals(tokenValue, token.getTokenValue());
    assertEquals(lastUsed, token.getLastUsed());
    assertEquals(username, token.getUsername());
  }
}
