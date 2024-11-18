package observer.quantum.worm.project;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import lombok.extern.slf4j.Slf4j;
import observer.quantum.worm.error.GlobalExceptionHandler;
import observer.quantum.worm.user.User;
import observer.quantum.worm.user.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

@Slf4j
@WebMvcTest(ProjectController.class)
@Import(GlobalExceptionHandler.class)
@WithMockUser(username = "testUser", roles = "USER")
public class ProjectControllerTest {

  @Autowired private MockMvc mockMvc;

  @MockBean private ProjectService projectService;

  @MockBean private UserService userService;

  private Project project;
  private User mockUser;

  private ObjectMapper objectMapper;

  private static final String XSRF_TOKEN = "test-xsrf-token";
  private static final String XSRF_HEADER = "X-XSRF-TOKEN";

  @BeforeEach
  public void setUp() {
    objectMapper = new ObjectMapper();
    objectMapper.registerModule(new JavaTimeModule());

    mockUser = new User();
    mockUser.setId(UUID.fromString("00000000-0000-0000-0000-000000000001"));
    mockUser.setUsername("testUser");
    when(userService.getCurrentUser()).thenReturn(Optional.of(mockUser));

    project = new Project();
    project.setId(UUID.fromString("00000000-0000-0000-0000-000000000001"));
    project.setTitle("My Project");
    project.setDescription("Project Description");
    project.setSlug("my-project");
    project.setCreatedDate(OffsetDateTime.now());
    project.setUpdatedDate(OffsetDateTime.now());
    project.setUser(mockUser);
  }

  @Test
  public void testGetAllProjects() throws Exception {
    List<Project> projects = Collections.singletonList(project);
    when(projectService.findAllForCurrentUser()).thenReturn(projects);

    mockMvc
        .perform(get("/api/v1/projects"))
        .andDo(result -> log.info(result.getResponse().getContentAsString()))
        .andExpect(status().isOk())
        .andExpect(content().contentType(MediaType.APPLICATION_JSON))
        .andExpect(jsonPath("$[0].title").value("My Project"));

    verify(projectService, times(1)).findAllForCurrentUser();
  }

  @Test
  public void testGetProjectByUsernameAndSlug() throws Exception {
    when(projectService.findByUsernameAndSlug("testUser", "my-project")).thenReturn(project);

    mockMvc
        .perform(get("/api/v1/projects/testUser/my-project"))
        .andDo(result -> log.info(result.getResponse().getContentAsString()))
        .andExpect(status().isOk())
        .andExpect(content().contentType(MediaType.APPLICATION_JSON))
        .andExpect(jsonPath("$.title").value("My Project"));

    verify(projectService, times(1)).findByUsernameAndSlug("testUser", "my-project");
  }

  @Test
  public void testCreateProject() throws Exception {
    Project newProject = new Project();
    newProject.setTitle("New Project");
    newProject.setDescription("New Description");
    newProject.setSlug("new-project");
    newProject.setUser(mockUser);

    when(projectService.create(any(Project.class))).thenReturn(newProject);

    mockMvc
        .perform(
            post("/api/v1/projects")
                .with(csrf())
                .header(XSRF_HEADER, XSRF_TOKEN)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(newProject)))
        .andExpect(status().isCreated())
        .andExpect(content().contentType(MediaType.APPLICATION_JSON))
        .andExpect(jsonPath("$.title").value("New Project"));

    verify(projectService, times(1)).create(any(Project.class));
  }

  @Test
  public void testUpdateProject() throws Exception {
    project.setTitle("Updated Project");

    when(projectService.update(eq("testUser"), eq("my-project"), any(Project.class)))
        .thenReturn(project);

    mockMvc
        .perform(
            put("/api/v1/projects/testUser/my-project")
                .with(csrf())
                .header(XSRF_HEADER, XSRF_TOKEN)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(project)))
        .andExpect(status().isOk())
        .andExpect(content().contentType(MediaType.APPLICATION_JSON))
        .andExpect(jsonPath("$.title").value("Updated Project"));

    verify(projectService, times(1)).update(eq("testUser"), eq("my-project"), any(Project.class));
  }

  @Test
  public void testDeleteProject() throws Exception {
    doNothing().when(projectService).delete("testUser", "my-project");

    mockMvc
        .perform(
            delete("/api/v1/projects/testUser/my-project")
                .with(csrf())
                .header(XSRF_HEADER, XSRF_TOKEN))
        .andExpect(status().isNoContent());

    verify(projectService, times(1)).delete("testUser", "my-project");
  }

  @Test
  public void testGetProjectByUsernameAndSlugNotFound() throws Exception {
    when(projectService.findByUsernameAndSlug("testUser", "non-existent"))
        .thenThrow(new ProjectNotFoundException("testUser", "non-existent"));

    mockMvc
        .perform(get("/api/v1/projects/testUser/non-existent"))
        .andExpect(status().isNotFound())
        .andExpect(content().contentType(MediaType.APPLICATION_JSON))
        .andExpect(
            jsonPath("$.message")
                .value("Project not found with username: testUser and slug: non-existent"));

    verify(projectService, times(1)).findByUsernameAndSlug("testUser", "non-existent");
  }

  @Test
  public void testUpdateProjectNotFound() throws Exception {
    when(projectService.update(eq("testUser"), eq("non-existent"), any(Project.class)))
        .thenThrow(new ProjectNotFoundException("testUser", "non-existent"));

    mockMvc
        .perform(
            put("/api/v1/projects/testUser/non-existent")
                .with(csrf())
                .header(XSRF_HEADER, XSRF_TOKEN)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(project)))
        .andExpect(status().isNotFound())
        .andExpect(content().contentType(MediaType.APPLICATION_JSON))
        .andExpect(
            jsonPath("$.message")
                .value("Project not found with username: testUser and slug: non-existent"));

    verify(projectService, times(1)).update(eq("testUser"), eq("non-existent"), any(Project.class));
  }

  @Test
  public void testDeleteProjectNotFound() throws Exception {
    doThrow(new ProjectNotFoundException("testUser", "non-existent"))
        .when(projectService)
        .delete("testUser", "non-existent");

    mockMvc
        .perform(
            delete("/api/v1/projects/testUser/non-existent")
                .with(csrf())
                .header(XSRF_HEADER, XSRF_TOKEN))
        .andExpect(status().isNotFound())
        .andExpect(content().contentType(MediaType.APPLICATION_JSON))
        .andExpect(
            jsonPath("$.message")
                .value("Project not found with username: testUser and slug: non-existent"));

    verify(projectService, times(1)).delete("testUser", "non-existent");
  }

  @Test
  public void testCreateProject_missingCsrfToken() throws Exception {
    Project newProject = new Project();
    newProject.setTitle("New Project");
    newProject.setDescription("New Description");
    newProject.setSlug("new-project");

    mockMvc
        .perform(
            post("/api/v1/projects")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(newProject)))
        .andExpect(status().isForbidden());

    verify(projectService, never()).create(any(Project.class));
  }

  @Test
  public void testUpdateProject_missingCsrfToken() throws Exception {
    mockMvc
        .perform(
            put("/api/v1/projects/testUser/my-project")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(project)))
        .andExpect(status().isForbidden());

    verify(projectService, never()).update(anyString(), anyString(), any(Project.class));
  }

  @Test
  public void testDeleteProject_missingCsrfToken() throws Exception {
    mockMvc
        .perform(delete("/api/v1/projects/testUser/my-project"))
        .andExpect(status().isForbidden());

    verify(projectService, never()).delete(anyString(), anyString());
  }

  @Test
  public void testUpdateProject_AccessDenied() throws Exception {
    project.setTitle("Updated Project");

    when(projectService.update(eq("otherUser"), eq("my-project"), any(Project.class)))
        .thenThrow(new AccessDeniedException("Access denied"));

    mockMvc
        .perform(
            put("/api/v1/projects/otherUser/my-project")
                .with(csrf())
                .header(XSRF_HEADER, XSRF_TOKEN)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(project)))
        .andExpect(status().isForbidden())
        .andExpect(content().contentType(MediaType.APPLICATION_JSON))
        .andExpect(jsonPath("$.message").value("Access denied"));

    verify(projectService, times(1)).update(eq("otherUser"), eq("my-project"), any(Project.class));
  }

  @Test
  public void testDeleteProject_AccessDenied() throws Exception {
    doThrow(new AccessDeniedException("Access denied"))
        .when(projectService)
        .delete("otherUser", "my-project");

    mockMvc
        .perform(
            delete("/api/v1/projects/otherUser/my-project")
                .with(csrf())
                .header(XSRF_HEADER, XSRF_TOKEN))
        .andExpect(status().isForbidden())
        .andExpect(content().contentType(MediaType.APPLICATION_JSON))
        .andExpect(jsonPath("$.message").value("Access denied"));

    verify(projectService, times(1)).delete("otherUser", "my-project");
  }
}
