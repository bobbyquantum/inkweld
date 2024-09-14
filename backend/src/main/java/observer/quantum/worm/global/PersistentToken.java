package observer.quantum.worm.global;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.security.web.authentication.rememberme.PersistentRememberMeToken;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Date;

@AllArgsConstructor
@NoArgsConstructor
@Getter
@Setter
@Entity
@Table(name = "persistent_tokens")
public class PersistentToken {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String series;

    @Column(name = "token_value", nullable = false)
    private String tokenValue;

    @Column(name = "last_used", nullable = false)
    private OffsetDateTime lastUsed;

    @Column(nullable = false)
    private String username;

    public PersistentToken(String username, PersistentRememberMeToken token) {
        this.series = token.getSeries();
        this.tokenValue = token.getTokenValue();
        this.lastUsed = OffsetDateTime.ofInstant(token.getDate().toInstant(), ZoneId.systemDefault());
        this.username = username;
    }

    public Date getLastUsedAsDate() {
        return Date.from(this.lastUsed.toInstant());
    }
}
