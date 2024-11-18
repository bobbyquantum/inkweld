package observer.quantum.worm.project;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import observer.quantum.worm.user.User;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProjectRepository extends JpaRepository<Project, UUID> {
  List<Project> findByUser(User user);

  Optional<Project> findByUserUsernameAndSlug(String username, String slug);
}
