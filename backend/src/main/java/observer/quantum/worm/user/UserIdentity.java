package observer.quantum.worm.user;

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
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false)
  private String provider;

  @Column(name = "provider_id", nullable = false)
  private String providerId;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "user_id")
  private User user;
}
