package observer.quantum.worm.project;

import java.time.OffsetDateTime;
import java.util.List;
import observer.quantum.worm.user.User;
import observer.quantum.worm.user.UserAuthInvalidException;
import observer.quantum.worm.user.UserService;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

@SuppressWarnings("unused")
@Service
public class ProjectService {

  private final ProjectRepository projectRepository;
  private final UserService userService;

  public ProjectService(ProjectRepository projectRepository, UserService userService) {
    this.projectRepository = projectRepository;
    this.userService = userService;
  }

  public List<Project> findAllForCurrentUser() {
    User currentUser = userService.getCurrentUser().orElseThrow(UserAuthInvalidException::new);
    return projectRepository.findByUser(currentUser);
  }

  public Project findByIdForCurrentUser(String id) {
    User currentUser = userService.getCurrentUser().orElseThrow(UserAuthInvalidException::new);
    Project project =
        projectRepository.findById(id).orElseThrow(() -> new ProjectNotFoundException(id));
    if (!project.getUser().equals(currentUser)) {
      throw new AccessDeniedException("You don't have permission to access this project");
    }
    return project;
  }

  public Project create(Project project) {
    User currentUser = userService.getCurrentUser().orElseThrow(UserAuthInvalidException::new);
    project.setUser(currentUser);
    project.setCreatedDate(OffsetDateTime.now());
    project.setUpdatedDate(OffsetDateTime.now());
    return projectRepository.save(project);
  }

  public Project update(String id, Project projectDetails) {
    Project existingProject = findByIdForCurrentUser(id);
    existingProject.setTitle(projectDetails.getTitle());
    existingProject.setDescription(projectDetails.getDescription());
    //        existingProject.setStatus(projectDetails.getStatus());
    existingProject.setTags(projectDetails.getTags());
    existingProject.setUpdatedDate(OffsetDateTime.now());
    return projectRepository.save(existingProject);
  }

  public void delete(String id) {
    Project project = findByIdForCurrentUser(id);
    projectRepository.delete(project);
  }
}
