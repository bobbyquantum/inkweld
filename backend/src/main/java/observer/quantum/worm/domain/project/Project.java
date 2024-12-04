package observer.quantum.worm.domain.project;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.NoArgsConstructor;
import observer.quantum.worm.domain.user.User;

@Data
@NoArgsConstructor
@Entity
@Table(name = "projects")
public class Project {
  @Id
  @GeneratedValue(strategy = GenerationType.UUID)
  private UUID id;

  @Version private Long version;

  @Column(nullable = false)
  private String slug;

  @Column(nullable = false)
  private String title;

  @Column(length = 1000)
  private String description;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "user_id", nullable = false)
  private User user;

  @Column(name = "created_date", nullable = false, updatable = false)
  private OffsetDateTime createdDate;

  @Column(name = "updated_date")
  private OffsetDateTime updatedDate;

  @PrePersist
  protected void onCreate() {
    createdDate = OffsetDateTime.now();
  }

  @PreUpdate
  protected void onUpdate() {
    updatedDate = OffsetDateTime.now();
  }
}
