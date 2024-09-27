package observer.quantum.worm.user;

import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@AllArgsConstructor
@NoArgsConstructor
@Getter
@Setter
@Entity
@Table(name = "users")
public class User {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, unique = true)
  private String username;

  @Column(nullable = false)
  private String name;

  @Column(nullable = false)
  private String password;

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
