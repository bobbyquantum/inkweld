package observer.quantum.worm.domain.project.element;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import observer.quantum.worm.domain.project.Project;
import observer.quantum.worm.domain.project.ProjectService;
import observer.quantum.worm.domain.user.User;
import observer.quantum.worm.domain.user.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.security.access.AccessDeniedException;

public class ProjectElementServiceTest {

  @InjectMocks private ProjectElementService elementService;

  @Mock private ProjectElementRepository elementRepository;

  @Mock private ProjectService projectService;

  @Mock private UserService userService;

  @Captor private ArgumentCaptor<ProjectElement> elementCaptor;

  private Project project;
  private User user;
  private ProjectElement element1;
  private ProjectElement element2;

  @BeforeEach
  public void setUp() {
    MockitoAnnotations.openMocks(this);

    user = new User();
    user.setId(UUID.fromString("00000000-0000-0000-0000-000000000001"));
    user.setUsername("testUser");

    project = new Project();
    project.setId(UUID.fromString("00000000-0000-0000-0000-000000000001"));
    project.setTitle("Test Project");
    project.setSlug("test-project");
    project.setUser(user);

    element1 = new ProjectElement();
    element1.setId("1");
    element1.setName("Root Folder");
    element1.setType(ElementType.FOLDER);
    element1.setPosition(0);
    element1.setLevel(0);
    element1.setProject(project);

    element2 = new ProjectElement();
    element2.setId("2");
    element2.setName("Child Item");
    element2.setType(ElementType.ITEM);
    element2.setPosition(1);
    element2.setLevel(1);
    element2.setProject(project);

    when(userService.getCurrentUser()).thenReturn(Optional.of(user));
    when(projectService.findByUsernameAndSlug("testUser", "test-project")).thenReturn(project);
  }

  @Test
  public void testGetProjectElements() {
    List<ProjectElement> elements = Arrays.asList(element1, element2);
    when(elementRepository.findByProjectOrderByPosition(project)).thenReturn(elements);

    List<ProjectElementDto> result = elementService.getProjectElements("testUser", "test-project");

    assertEquals(2, result.size());
    assertEquals("Root Folder", result.get(0).getName());
    assertEquals("Child Item", result.get(1).getName());
    verify(elementRepository, times(1)).findByProjectOrderByPosition(project);
  }

  @Test
  public void testBulkDinsertElements_CreateAndUpdate() {
    when(elementRepository.findByProjectOrderByPosition(project))
        .thenReturn(Arrays.asList(element1, element2));

    // Prepare DTOs: update element1, create new element3
    ProjectElementDto dto1 = new ProjectElementDto();
    dto1.setId("1");
    dto1.setName("Updated Root");
    dto1.setType(ElementType.FOLDER);
    dto1.setPosition(0);
    dto1.setLevel(0);

    ProjectElementDto dto3 = new ProjectElementDto();
    dto3.setName("New Element");
    dto3.setType(ElementType.ITEM);
    dto3.setPosition(2);
    dto3.setLevel(1);

    List<ProjectElementDto> dtos = Arrays.asList(dto1, dto3);

    // Mock repository behavior
    when(elementRepository.findById("1")).thenReturn(Optional.of(element1));
    when(elementRepository.save(any(ProjectElement.class)))
        .thenAnswer(invocation -> invocation.getArgument(0));

    List<ProjectElementDto> result =
        elementService.bulkDinsertElements("testUser", "test-project", dtos);

    assertEquals(2, result.size());
    verify(elementRepository, times(2)).save(elementCaptor.capture());

    List<ProjectElement> capturedElements = elementCaptor.getAllValues();
    // Verify update
    assertEquals("Updated Root", capturedElements.get(0).getName());
    assertEquals("1", capturedElements.get(0).getId());
    // Verify create
    assertEquals("New Element", capturedElements.get(1).getName());
    assertNotNull(capturedElements.get(1).getProject());

    // Verify delete of element2
    verify(elementRepository, times(1)).delete(element2);
  }

  @Test
  public void testBulkDinsertElements_EmptyList() {
    when(elementRepository.findByProjectOrderByPosition(project))
        .thenReturn(Arrays.asList(element1, element2));

    List<ProjectElementDto> result =
        elementService.bulkDinsertElements("testUser", "test-project", new ArrayList<>());

    assertTrue(result.isEmpty());
    verify(elementRepository, times(1)).delete(element1);
    verify(elementRepository, times(1)).delete(element2);
  }

  @Test
  public void testBulkDinsertElements_AccessDenied() {
    User otherUser = new User();
    otherUser.setId(UUID.fromString("00000000-0000-0000-0000-000000000002"));
    otherUser.setUsername("otherUser");
    project.setUser(otherUser);

    when(projectService.findByUsernameAndSlug("otherUser", "test-project"))
        .thenThrow(new AccessDeniedException("Access denied"));

    List<ProjectElementDto> dtos =
        Arrays.asList(new ProjectElementDto(element1), new ProjectElementDto(element2));

    assertThrows(
        AccessDeniedException.class,
        () -> elementService.bulkDinsertElements("otherUser", "test-project", dtos));

    verify(elementRepository, never()).save(any());
    verify(elementRepository, never()).delete(any());
  }

  @Test
  public void testBulkDinsertElements_ValidateNameRequired() {
    ProjectElementDto dto = new ProjectElementDto();
    dto.setType(ElementType.FOLDER);
    dto.setPosition(0);
    dto.setLevel(0);

    List<ProjectElementDto> dtos = Arrays.asList(dto);

    IllegalArgumentException exception =
        assertThrows(
            IllegalArgumentException.class,
            () -> elementService.bulkDinsertElements("testUser", "test-project", dtos));

    assertEquals("Name is required", exception.getMessage());
    verify(elementRepository, never()).save(any());
  }

  @Test
  public void testBulkDinsertElements_ValidateTypeRequired() {
    ProjectElementDto dto = new ProjectElementDto();
    dto.setName("Test Element");
    dto.setPosition(0);
    dto.setLevel(0);

    List<ProjectElementDto> dtos = Arrays.asList(dto);

    IllegalArgumentException exception =
        assertThrows(
            IllegalArgumentException.class,
            () -> elementService.bulkDinsertElements("testUser", "test-project", dtos));

    assertEquals("Type is required", exception.getMessage());
    verify(elementRepository, never()).save(any());
  }

  @Test
  public void testBulkDinsertElements_ValidatePositionRequired() {
    ProjectElementDto dto = new ProjectElementDto();
    dto.setName("Test Element");
    dto.setType(ElementType.FOLDER);
    dto.setLevel(0);

    List<ProjectElementDto> dtos = Arrays.asList(dto);

    IllegalArgumentException exception =
        assertThrows(
            IllegalArgumentException.class,
            () -> elementService.bulkDinsertElements("testUser", "test-project", dtos));

    assertEquals("Position is required", exception.getMessage());
    verify(elementRepository, never()).save(any());
  }

  @Test
  public void testBulkDinsertElements_ValidateLevelRequired() {
    ProjectElementDto dto = new ProjectElementDto();
    dto.setName("Test Element");
    dto.setType(ElementType.FOLDER);
    dto.setPosition(0);

    List<ProjectElementDto> dtos = Arrays.asList(dto);

    IllegalArgumentException exception =
        assertThrows(
            IllegalArgumentException.class,
            () -> elementService.bulkDinsertElements("testUser", "test-project", dtos));

    assertEquals("Level is required", exception.getMessage());
    verify(elementRepository, never()).save(any());
  }
}
