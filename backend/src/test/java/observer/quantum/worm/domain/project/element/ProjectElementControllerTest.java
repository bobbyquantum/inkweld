package observer.quantum.worm.domain.project.element;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import observer.quantum.worm.domain.project.ProjectNotFoundException;
import observer.quantum.worm.domain.user.User;
import observer.quantum.worm.domain.user.UserService;
import observer.quantum.worm.error.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@Slf4j
@WebMvcTest(ProjectElementController.class)
@Import(GlobalExceptionHandler.class)
@WithMockUser(username = "testUser", roles = "USER")
public class ProjectElementControllerTest {

  @Autowired private MockMvc mockMvc;

  @MockitoBean private ProjectElementService elementService;

  @MockitoBean private UserService userService;

  private ProjectElementDto element1;
  private ProjectElementDto element2;
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

    element1 = new ProjectElementDto();
    element1.setId("1");
    element1.setName("Root Folder");
    element1.setType(ElementType.FOLDER);
    element1.setPosition(0);
    element1.setLevel(0);

    element2 = new ProjectElementDto();
    element2.setId("2");
    element2.setName("Child Item");
    element2.setType(ElementType.ITEM);
    element2.setPosition(1);
    element2.setLevel(1);
  }

  @Test
  public void testGetProjectElements() throws Exception {
    List<ProjectElementDto> elements = Arrays.asList(element1, element2);
    when(elementService.getProjectElements("testUser", "my-project")).thenReturn(elements);

    mockMvc
        .perform(get("/api/v1/projects/testUser/my-project/elements"))
        .andDo(result -> log.info(result.getResponse().getContentAsString()))
        .andExpect(status().isOk())
        .andExpect(content().contentType(MediaType.APPLICATION_JSON))
        .andExpect(jsonPath("$[0].name").value("Root Folder"))
        .andExpect(jsonPath("$[1].name").value("Child Item"));

    verify(elementService, times(1)).getProjectElements("testUser", "my-project");
  }

  @Test
  public void testDinsertElements() throws Exception {
    List<ProjectElementDto> elements = Arrays.asList(element1, element2);
    when(elementService.bulkDinsertElements("testUser", "my-project", elements))
        .thenReturn(elements);

    mockMvc
        .perform(
            put("/api/v1/projects/testUser/my-project/elements")
                .with(csrf())
                .header(XSRF_HEADER, XSRF_TOKEN)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(elements)))
        .andExpect(status().isOk())
        .andExpect(content().contentType(MediaType.APPLICATION_JSON))
        .andExpect(jsonPath("$[0].name").value("Root Folder"))
        .andExpect(jsonPath("$[1].name").value("Child Item"));

    verify(elementService, times(1)).bulkDinsertElements("testUser", "my-project", elements);
  }

  @Test
  public void testDinsertElements_ProjectNotFound() throws Exception {
    List<ProjectElementDto> elements = Arrays.asList(element1, element2);
    when(elementService.bulkDinsertElements("testUser", "non-existent", elements))
        .thenThrow(new ProjectNotFoundException("testUser", "non-existent"));

    mockMvc
        .perform(
            put("/api/v1/projects/testUser/non-existent/elements")
                .with(csrf())
                .header(XSRF_HEADER, XSRF_TOKEN)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(elements)))
        .andExpect(status().isNotFound())
        .andExpect(content().contentType(MediaType.APPLICATION_JSON))
        .andExpect(
            jsonPath("$.message")
                .value("Project not found with username: testUser and slug: non-existent"));
  }

  @Test
  public void testDinsertElements_AccessDenied() throws Exception {
    List<ProjectElementDto> elements = Arrays.asList(element1, element2);
    when(elementService.bulkDinsertElements("otherUser", "my-project", elements))
        .thenThrow(new AccessDeniedException("Access denied"));

    mockMvc
        .perform(
            put("/api/v1/projects/otherUser/my-project/elements")
                .with(csrf())
                .header(XSRF_HEADER, XSRF_TOKEN)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(elements)))
        .andExpect(status().isForbidden())
        .andExpect(content().contentType(MediaType.APPLICATION_JSON))
        .andExpect(jsonPath("$.message").value("Access denied"));
  }

  @Test
  public void testDinsertElements_MissingCsrfToken() throws Exception {
    List<ProjectElementDto> elements = Arrays.asList(element1, element2);

    mockMvc
        .perform(
            put("/api/v1/projects/testUser/my-project/elements/dinsert")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(elements)))
        .andExpect(status().isForbidden());

    verify(elementService, never()).bulkDinsertElements(any(), any(), any());
  }
}
