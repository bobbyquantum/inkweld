package observer.quantum.worm.user;

import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@AllArgsConstructor
@NoArgsConstructor
@Data
@Entity
@Table(name = "users")
public class User {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = true, unique = true)
  private String username;

  @Column(nullable = true)
  private String name;

  @Column(nullable = true)
  private String email;

  @Column(nullable = true)
  private String password;

  @Column(nullable = false)
  private Boolean enabled = false;

  @Column(name = "avatar_image_url")
  private String avatarImageUrl;

  @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true)
  private List<UserIdentity> identities = new ArrayList<>();

  public void addIdentity(UserIdentity identity) {
    identities.add(identity);
    identity.setUser(this);
  }

  public void removeIdentity(UserIdentity identity) {
    identities.remove(identity);
    identity.setUser(null);
  }
}
