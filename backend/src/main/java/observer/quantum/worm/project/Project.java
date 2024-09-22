package observer.quantum.worm.project;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.Data;
import lombok.NoArgsConstructor;
import observer.quantum.worm.user.User;

@Data
@NoArgsConstructor
@Entity
@Table(name = "projects")
public class Project {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

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

  @ElementCollection
  @CollectionTable(name = "project_chapters", joinColumns = @JoinColumn(name = "project_id"))
  @Column(name = "chapter_id")
  private List<String> chapters = new ArrayList<>();

  @ElementCollection
  @CollectionTable(name = "project_tags", joinColumns = @JoinColumn(name = "project_id"))
  @Column(name = "tag")
  private List<String> tags = new ArrayList<>();

  @PrePersist
  protected void onCreate() {
    createdDate = OffsetDateTime.now();
  }

  @PreUpdate
  protected void onUpdate() {
    updatedDate = OffsetDateTime.now();
  }
}
