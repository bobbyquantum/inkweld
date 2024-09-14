package observer.quantum.worm.project;

import observer.quantum.worm.user.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ProjectRepository extends JpaRepository<Project, String> {
    List<Project> findByUser(User user);
}
