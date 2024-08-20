package observer.quantum.worm.global;

import org.junit.jupiter.api.Test;
import org.springframework.security.web.authentication.rememberme.PersistentRememberMeToken;

import java.util.Date;

import static org.junit.jupiter.api.Assertions.*;

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
        String id = "testId";
        String series = "testSeries";
        String tokenValue = "testTokenValue";
        Date lastUsed = new Date();
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

        PersistentRememberMeToken rememberMeToken = new PersistentRememberMeToken(username, series, tokenValue, lastUsed);
        PersistentToken token = new PersistentToken(username, rememberMeToken);

        assertNull(token.getId());
        assertEquals(series, token.getSeries());
        assertEquals(tokenValue, token.getTokenValue());
        assertEquals(lastUsed, token.getLastUsed());
        assertEquals(username, token.getUsername());
    }

    @Test
    void testSettersAndGetters() {
        PersistentToken token = new PersistentToken();

        String id = "testId";
        String series = "testSeries";
        String tokenValue = "testTokenValue";
        Date lastUsed = new Date();
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
