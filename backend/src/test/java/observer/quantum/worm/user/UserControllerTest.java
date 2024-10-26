package observer.quantum.worm.user;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import observer.quantum.worm.error.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@Slf4j
public class UserControllerTest {

  @InjectMocks private UserController userController;

  @Mock private UserService userService;

  private MockMvc mockMvc;

  private User user;

  private ObjectMapper objectMapper;

  private static final String XSRF_TOKEN = "test-xsrf-token";
  private static final String XSRF_HEADER = "X-XSRF-TOKEN";

  @BeforeEach
  public void setUp() {
    MockitoAnnotations.openMocks(this);
    mockMvc =
        MockMvcBuilders.standaloneSetup(userController)
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();

    user = new User();
    user.setUsername("tester");

    objectMapper = new ObjectMapper();
  }

  @Test
  public void testGetCurrentUser() throws Exception {
    when(userService.getCurrentUser()).thenReturn(java.util.Optional.of(user));

    mockMvc
        .perform(get("/api/v1/users/me").accept(MediaType.APPLICATION_JSON))
        .andDo(result -> log.info("Result {}", result))
        .andExpect(status().isOk());

    verify(userService, times(1)).getCurrentUser();
  }

  @Test
  public void testGetCurrentUser_notAuthenticated() throws Exception {
    when(userService.getCurrentUser()).thenReturn(java.util.Optional.empty());

    mockMvc
        .perform(get("/api/v1/users/me").accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isUnauthorized());

    verify(userService, times(1)).getCurrentUser();
  }

  @Test
  public void testGetCurrentUser_accessDenied() throws Exception {
    doThrow(AccessDeniedException.class).when(userService).getCurrentUser();

    mockMvc
        .perform(get("/api/v1/users/me").accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.message").value("Access denied"));

    verify(userService, times(1)).getCurrentUser();
  }

  @Test
  public void testUpdateUserDetails() throws Exception {
    UpdateUserRequest updateUserDto = new UpdateUserRequest();
    updateUserDto.setName("New Name");

    User updatedUser = new User();
    updatedUser.setUsername("tester");
    updatedUser.setName("New Name");

    when(userService.updateUserDetails(any(UpdateUserRequest.class))).thenReturn(updatedUser);

    mockMvc
        .perform(
            put("/api/v1/users/me")
                .header(XSRF_HEADER, XSRF_TOKEN)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(updateUserDto))
                .accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("New Name"));

    verify(userService, times(1)).updateUserDetails(any(UpdateUserRequest.class));
  }

  @Test
  public void testUpdateUserDetails_invalidInput() throws Exception {
    when(userService.getCurrentUser()).thenReturn(java.util.Optional.of(user));
    UpdateUserRequest updateUserDto = new UpdateUserRequest();

    mockMvc
        .perform(
            put("/api/v1/users/me")
                .header(XSRF_HEADER, XSRF_TOKEN)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(updateUserDto))
                .accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isBadRequest());

    verify(userService, never()).updateUserDetails(any(UpdateUserRequest.class));
  }

  @Test
  public void testDeleteAccount() throws Exception {
    mockMvc
        .perform(delete("/api/v1/users/me").header(XSRF_HEADER, XSRF_TOKEN))
        .andDo(result -> log.info(result.getResponse().getContentAsString()))
        .andExpect(status().isNoContent());

    verify(userService, times(1)).deleteAccount();
  }

  @Test
  public void testDeleteAccount_accessDenied() throws Exception {
    doThrow(AccessDeniedException.class).when(userService).deleteAccount();

    mockMvc
        .perform(delete("/api/v1/users/me").header(XSRF_HEADER, XSRF_TOKEN))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.message").value("Access denied"));

    verify(userService, times(1)).deleteAccount();
  }

  @Test
  public void testUpdateUserDetails_missingXsrfToken() throws Exception {
    UpdateUserRequest updateUserDto = new UpdateUserRequest();
    updateUserDto.setName("New Name");

    mockMvc
        .perform(
            put("/api/v1/users/me")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(updateUserDto))
                .accept(MediaType.APPLICATION_JSON))
        .andDo(result -> log.info(result.getResponse().getContentAsString()))
        .andExpect(status().isForbidden());

    verify(userService, never()).updateUserDetails(any(UpdateUserRequest.class));
  }

  @Test
  public void testDeleteAccount_missingXsrfToken() throws Exception {
    mockMvc.perform(delete("/api/v1/users/me")).andExpect(status().isForbidden());

    verify(userService, never()).deleteAccount();
  }
}
