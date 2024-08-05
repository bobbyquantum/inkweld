package observer.quantum.worm.global;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.security.web.authentication.rememberme.PersistentRememberMeToken;

import java.util.Date;

@AllArgsConstructor
@NoArgsConstructor
@Getter
@Setter
@Document(collection = "persistent_tokens")
public class PersistentToken {
    @Id
    private String id;
    private String series;
    private String tokenValue;
    private Date lastUsed;
    private String username;

    public PersistentToken(String username, PersistentRememberMeToken token) {
        this.series = token.getSeries();
        this.tokenValue = token.getTokenValue();
        this.lastUsed = token.getDate();
        this.username = username;
    }
}