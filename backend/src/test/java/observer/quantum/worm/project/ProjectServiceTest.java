package observer.quantum.worm.project;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import observer.quantum.worm.user.User;
import observer.quantum.worm.user.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.security.access.AccessDeniedException;

public class ProjectServiceTest {

  @InjectMocks private ProjectService projectService;

  @Mock private ProjectRepository projectRepository;

  @Mock private UserService userService;

  private Project project;
  private User user;

  @BeforeEach
  public void setUp() {
    MockitoAnnotations.openMocks(this);

    user = new User();
    user.setId(UUID.fromString("00000000-0000-0000-0000-000000000001"));
    user.setUsername("testUser");

    project = new Project();
    project.setId(UUID.fromString("00000000-0000-0000-0000-000000000001"));
    project.setTitle("My Project");
    project.setDescription("Project Description");
    project.setSlug("my-project");
    project.setUser(user);
    project.setCreatedDate(OffsetDateTime.now());
    project.setUpdatedDate(OffsetDateTime.now());

    when(userService.getCurrentUser()).thenReturn(Optional.of(user));
  }

  @Test
  public void testFindAllForCurrentUser() {
    List<Project> projects = new ArrayList<>();
    projects.add(project);

    when(projectRepository.findByUser(user)).thenReturn(projects);

    List<Project> result = projectService.findAllForCurrentUser();

    assertEquals(1, result.size());
    assertEquals("My Project", result.getFirst().getTitle());
    verify(projectRepository, times(1)).findByUser(user);
  }

  @Test
  public void testFindByUsernameAndSlug_Success() {
    when(projectRepository.findByUserUsernameAndSlug("testUser", "my-project"))
        .thenReturn(Optional.of(project));

    Project result = projectService.findByUsernameAndSlug("testUser", "my-project");

    assertNotNull(result);
    assertEquals("My Project", result.getTitle());
    verify(projectRepository, times(1)).findByUserUsernameAndSlug("testUser", "my-project");
  }

  @Test
  public void testFindByUsernameAndSlug_AccessDenied() {
    User otherUser = new User();
    otherUser.setId(UUID.fromString("00000000-0000-0000-0000-000000000002"));
    otherUser.setUsername("otherUser");
    project.setUser(otherUser);

    when(projectRepository.findByUserUsernameAndSlug("otherUser", "my-project"))
        .thenReturn(Optional.of(project));

    assertThrows(
        AccessDeniedException.class,
        () -> projectService.findByUsernameAndSlug("otherUser", "my-project"));
  }

  @Test
  public void testCreate_Success() {
    Project newProject = new Project();
    newProject.setTitle("New Project");
    newProject.setDescription("New Description");
    newProject.setSlug("new-project");

    ArgumentCaptor<Project> projectCaptor = ArgumentCaptor.forClass(Project.class);

    when(projectRepository.save(any(Project.class)))
        .thenAnswer(
            invocation -> {
              Project savedProject = invocation.getArgument(0);
              savedProject.setId(UUID.fromString("00000000-0000-0000-0000-000000000002"));
              return savedProject;
            });

    Project result = projectService.create(newProject);

    assertNotNull(result);
    assertEquals("New Project", result.getTitle());
    assertEquals("New Description", result.getDescription());
    assertEquals("new-project", result.getSlug());
    assertEquals(user, result.getUser());
    assertNotNull(result.getId());
    assertNotNull(result.getCreatedDate());
    assertNotNull(result.getUpdatedDate());

    verify(projectRepository).save(projectCaptor.capture());
    Project capturedProject = projectCaptor.getValue();
    assertEquals(user, capturedProject.getUser());
    assertNotNull(capturedProject.getCreatedDate());
    assertNotNull(capturedProject.getUpdatedDate());
  }

  @Test
  public void testCreate_InvalidSlug() {
    Project newProject = new Project();
    newProject.setTitle("New Project");
    newProject.setDescription("New Description");
    newProject.setSlug("Invalid Slug");

    assertThrows(IllegalArgumentException.class, () -> projectService.create(newProject));
  }

  @Test
  public void testUpdate_Success() {
    when(projectRepository.findByUserUsernameAndSlug("testUser", "my-project"))
        .thenReturn(Optional.of(project));
    when(projectRepository.save(any(Project.class))).thenReturn(project);

    Project updatedProject = new Project();
    updatedProject.setTitle("Updated Project");
    updatedProject.setSlug("updated-project");
    Project result = projectService.update("testUser", "my-project", updatedProject);

    assertNotNull(result);
    assertEquals("Updated Project", result.getTitle());
    assertEquals("updated-project", result.getSlug());
    verify(projectRepository, times(1)).findByUserUsernameAndSlug("testUser", "my-project");
    verify(projectRepository, times(1)).save(any(Project.class));
  }

  @Test
  public void testUpdate_InvalidSlug() {
    when(projectRepository.findByUserUsernameAndSlug("testUser", "my-project"))
        .thenReturn(Optional.of(project));

    Project updatedProject = new Project();
    updatedProject.setTitle("Updated Project");
    updatedProject.setSlug("Invalid Slug");

    assertThrows(
        IllegalArgumentException.class,
        () -> projectService.update("testUser", "my-project", updatedProject));
  }

  @Test
  public void testUpdate_AccessDenied() {
    User otherUser = new User();
    otherUser.setId(UUID.fromString("00000000-0000-0000-0000-000000000002"));
    otherUser.setUsername("otherUser");
    project.setUser(otherUser);

    when(projectRepository.findByUserUsernameAndSlug("otherUser", "my-project"))
        .thenReturn(Optional.of(project));

    Project updatedProject = new Project();
    updatedProject.setTitle("Updated Project");

    assertThrows(
        AccessDeniedException.class,
        () -> projectService.update("otherUser", "my-project", updatedProject));
  }

  @Test
  public void testDelete_Success() {
    when(projectRepository.findByUserUsernameAndSlug("testUser", "my-project"))
        .thenReturn(Optional.of(project));
    doNothing().when(projectRepository).delete(any(Project.class));

    projectService.delete("testUser", "my-project");

    verify(projectRepository, times(1)).delete(project);
  }

  @Test
  public void testDelete_AccessDenied() {
    User otherUser = new User();
    otherUser.setId(UUID.fromString("00000000-0000-0000-0000-000000000002"));
    otherUser.setUsername("otherUser");
    project.setUser(otherUser);

    when(projectRepository.findByUserUsernameAndSlug("otherUser", "my-project"))
        .thenReturn(Optional.of(project));

    assertThrows(
        AccessDeniedException.class, () -> projectService.delete("otherUser", "my-project"));
  }
}
