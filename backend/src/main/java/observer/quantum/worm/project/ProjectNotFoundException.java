package observer.quantum.worm.project;

public class ProjectNotFoundException extends RuntimeException {
  public ProjectNotFoundException(String id) {
    super("Project not found with ID: " + id);
  }
}
