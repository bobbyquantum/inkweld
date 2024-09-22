package observer.quantum.worm.project;

import java.util.List;
import observer.quantum.worm.user.User;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProjectRepository extends JpaRepository<Project, String> {
  List<Project> findByUser(User user);
}
