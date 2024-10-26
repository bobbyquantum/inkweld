package observer.quantum.worm.project.element;

import java.util.List;
import observer.quantum.worm.project.Project;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProjectElementRepository extends JpaRepository<ProjectElement, String> {
  List<ProjectElement> findByProjectOrderByPosition(Project project);

  List<ProjectElement> findByParentIdOrderByPosition(String parentId);

  @Query(
      "SELECT e FROM ProjectElement e WHERE e.project = :project AND e.parentId IS NULL ORDER BY e.position")
  List<ProjectElement> findRootElements(@Param("project") Project project);

  @Query("SELECT e FROM ProjectElement e WHERE e.parentId = :elementId ORDER BY e.position")
  List<ProjectElement> findDirectChildren(@Param("elementId") String elementId);

  @Query("SELECT MAX(e.position) FROM ProjectElement e WHERE e.parentId = :parentId")
  Double findMaxPositionByParentId(@Param("parentId") String parentId);

  void deleteByParentId(String parentId);
}
