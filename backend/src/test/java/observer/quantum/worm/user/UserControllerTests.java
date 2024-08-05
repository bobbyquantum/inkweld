package observer.quantum.worm.user;

import observer.quantum.worm.global.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

public class UserControllerTests {

    @InjectMocks
    private UserController userController;

    @Mock
    private UserService userService;

    private MockMvc mockMvc;

    private User user;

    @BeforeEach
    public void setUp() {
        MockitoAnnotations.openMocks(this);
        mockMvc = MockMvcBuilders.standaloneSetup(userController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();

        user = new User();
        user.setUsername("testuser");
    }

    @Test
    public void testGetCurrentUser() throws Exception {
        when(userService.getCurrentUser()).thenReturn(java.util.Optional.of(user));

        mockMvc.perform(get("/api/users/me"))
                .andExpect(status().isOk());

        verify(userService, times(1)).getCurrentUser();
    }

    @Test
    public void testGetCurrentUser_notAuthenticated() throws Exception {
        when(userService.getCurrentUser()).thenReturn(java.util.Optional.empty());

        mockMvc.perform(get("/api/users/me"))
                .andExpect(status().isUnauthorized());

        verify(userService, times(1)).getCurrentUser();
    }
}