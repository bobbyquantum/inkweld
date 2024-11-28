package observer.quantum.worm.domain.project.element;

import java.util.List;
import observer.quantum.worm.domain.project.Project;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProjectElementRepository extends JpaRepository<ProjectElement, String> {
  List<ProjectElement> findByProjectOrderByPosition(Project project);
}
