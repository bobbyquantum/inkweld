package observer.quantum.worm.project;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.regex.Pattern;
import observer.quantum.worm.user.User;
import observer.quantum.worm.user.UserAuthInvalidException;
import observer.quantum.worm.user.UserService;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

@Service
public class ProjectService {

  private final ProjectRepository projectRepository;
  private final UserService userService;
  private static final Pattern SLUG_PATTERN = Pattern.compile("^[a-z0-9]+(?:-[a-z0-9]+)*$");

  public ProjectService(ProjectRepository projectRepository, UserService userService) {
    this.projectRepository = projectRepository;
    this.userService = userService;
  }

  public List<Project> findAllForCurrentUser() {
    User currentUser = userService.getCurrentUser().orElseThrow(UserAuthInvalidException::new);
    return projectRepository.findByUser(currentUser);
  }

  public Project findByUsernameAndSlug(String username, String slug) {
    User currentUser = userService.getCurrentUser().orElseThrow(UserAuthInvalidException::new);
    Project project =
        projectRepository
            .findByUserUsernameAndSlug(username, slug)
            .orElseThrow(() -> new ProjectNotFoundException(username, slug));
    if (!project.getUser().getUsername().equals(currentUser.getUsername())) {
      throw new AccessDeniedException("You don't have permission to access this project");
    }
    return project;
  }

  public Project create(Project project) {
    User currentUser = userService.getCurrentUser().orElseThrow(UserAuthInvalidException::new);
    validateSlug(project.getSlug());
    project.setUser(currentUser);
    project.setCreatedDate(OffsetDateTime.now());
    project.setUpdatedDate(OffsetDateTime.now());
    return projectRepository.save(project);
  }

  public Project update(String username, String slug, Project projectDetails) {
    Project existingProject = findByUsernameAndSlug(username, slug);
    validateSlug(projectDetails.getSlug());
    existingProject.setTitle(projectDetails.getTitle());
    existingProject.setDescription(projectDetails.getDescription());
    existingProject.setSlug(projectDetails.getSlug());
    existingProject.setUpdatedDate(OffsetDateTime.now());
    return projectRepository.save(existingProject);
  }

  public void delete(String username, String slug) {
    Project project = findByUsernameAndSlug(username, slug);
    projectRepository.delete(project);
  }

  private void validateSlug(String slug) {
    if (slug == null || !SLUG_PATTERN.matcher(slug).matches()) {
      throw new IllegalArgumentException(
          "Invalid slug format. Slug should contain only lowercase letters, numbers, and hyphens.");
    }
  }
}
