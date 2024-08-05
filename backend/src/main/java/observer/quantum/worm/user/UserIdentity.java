package observer.quantum.worm.user;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.DBRef;
import org.springframework.data.mongodb.core.mapping.Document;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Document(collection = "identities")
@CompoundIndex(name = "provider_providerId", def = "{'provider': 1, 'providerId': 1}")
public class UserIdentity {
    @Id
    private String id;
    private String provider;
    private String providerId;
    @DBRef
    private User user;
}
