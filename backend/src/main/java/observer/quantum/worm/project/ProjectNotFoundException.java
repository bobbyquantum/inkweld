package observer.quantum.worm.project;

public class ProjectNotFoundException extends RuntimeException {
  public ProjectNotFoundException(String username, String slug) {
    super("Project not found with username: " + username + " and slug: " + slug);
  }
}
