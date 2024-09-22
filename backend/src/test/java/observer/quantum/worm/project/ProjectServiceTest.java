package observer.quantum.worm.project;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
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
    user.setId(1L);
    user.setUsername("testUser");

    project = new Project();
    project.setId(1L);
    project.setTitle("My Project");
    project.setDescription("Project Description");
    //        project.setStatus("Writing");
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
  public void testFindByIdForCurrentUser_Success() {
    when(projectRepository.findById("1")).thenReturn(Optional.of(project));

    Project result = projectService.findByIdForCurrentUser("1");

    assertNotNull(result);
    assertEquals("My Project", result.getTitle());
    verify(projectRepository, times(1)).findById("1");
  }

  @Test
  public void testFindByIdForCurrentUser_AccessDenied() {
    User otherUser = new User();
    otherUser.setId(2L);
    project.setUser(otherUser);

    when(projectRepository.findById("1")).thenReturn(Optional.of(project));

    assertThrows(AccessDeniedException.class, () -> projectService.findByIdForCurrentUser("1"));
  }

  @Test
  public void testCreate() {
    // Prepare
    Project newProject = new Project();
    newProject.setTitle("New Project");
    newProject.setDescription("New Description");

    // We need to capture the Project being saved to verify its contents
    ArgumentCaptor<Project> projectCaptor = ArgumentCaptor.forClass(Project.class);

    // Mock behavior
    when(projectRepository.save(any(Project.class)))
        .thenAnswer(
            invocation -> {
              Project savedProject = invocation.getArgument(0);
              savedProject.setId(2L); // Simulate ID generation
              return savedProject;
            });

    // Act
    Project result = projectService.create(newProject);

    // Assert
    assertNotNull(result);
    assertEquals("New Project", result.getTitle());
    assertEquals("New Description", result.getDescription());
    assertEquals(user, result.getUser());
    assertNotNull(result.getId());
    assertNotNull(result.getCreatedDate());
    assertNotNull(result.getUpdatedDate());

    // Verify
    verify(projectRepository).save(projectCaptor.capture());
    Project capturedProject = projectCaptor.getValue();
    assertEquals(user, capturedProject.getUser());
    assertNotNull(capturedProject.getCreatedDate());
    assertNotNull(capturedProject.getUpdatedDate());
  }

  @Test
  public void testUpdate_Success() {
    when(projectRepository.findById("1")).thenReturn(Optional.of(project));
    when(projectRepository.save(any(Project.class))).thenReturn(project);

    Project updatedProject = new Project();
    updatedProject.setTitle("Updated Project");
    Project result = projectService.update("1", updatedProject);

    assertNotNull(result);
    assertEquals("Updated Project", result.getTitle());
    verify(projectRepository, times(1)).findById("1");
    verify(projectRepository, times(1)).save(any(Project.class));
  }

  @Test
  public void testUpdate_AccessDenied() {
    User otherUser = new User();
    otherUser.setId(2L);
    project.setUser(otherUser);

    when(projectRepository.findById("1")).thenReturn(Optional.of(project));

    Project updatedProject = new Project();
    updatedProject.setTitle("Updated Project");

    assertThrows(AccessDeniedException.class, () -> projectService.update("1", updatedProject));
  }

  @Test
  public void testDelete_Success() {
    when(projectRepository.findById("1")).thenReturn(Optional.of(project));
    doNothing().when(projectRepository).delete(any(Project.class));

    projectService.delete("1");

    verify(projectRepository, times(1)).delete(project);
  }

  @Test
  public void testDelete_AccessDenied() {
    User otherUser = new User();
    otherUser.setId(2L);
    project.setUser(otherUser);

    when(projectRepository.findById("1")).thenReturn(Optional.of(project));

    assertThrows(AccessDeniedException.class, () -> projectService.delete("1"));
  }
}
