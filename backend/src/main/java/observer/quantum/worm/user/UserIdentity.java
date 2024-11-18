package observer.quantum.worm.user;

import java.util.UUID;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Entity
@Table(
    name = "user_identities",
    uniqueConstraints = @UniqueConstraint(columnNames = {"provider", "provider_id"}))
public class UserIdentity {
  @Id
  @GeneratedValue(strategy = GenerationType.UUID)
  private UUID id;

  @Column(nullable = false)
  private String provider;

  @Column(name = "provider_id", nullable = false)
  private String providerId;

  @Column(nullable = false)
  private String providerUser;

  @Column(nullable = false)
  private String providerDisplay;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "user_id")
  private User user;
}
