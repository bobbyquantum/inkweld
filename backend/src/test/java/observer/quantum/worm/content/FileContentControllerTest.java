package observer.quantum.worm.content;

import lombok.extern.slf4j.Slf4j;
import observer.quantum.worm.error.GlobalExceptionHandler;
import observer.quantum.worm.user.User;
import observer.quantum.worm.user.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.io.ByteArrayInputStream;
import java.util.Optional;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Slf4j
public class FileContentControllerTest {

    @InjectMocks
    private FileContentController fileContentController;

    @Mock
    private FileService fileService;

    @Mock
    private FileContentStore contentStore;

    @Mock
    private UserService userService;

    private MockMvc mockMvc;

    private File file;
    private User owner;

    @BeforeEach
    public void setUp() {
        MockitoAnnotations.openMocks(this);
        mockMvc = MockMvcBuilders.standaloneSetup(fileContentController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();

        owner = new User();
        owner.setId("ownerId");
        owner.setUsername("owner");

        file = new File();
        file.setId("1");
        file.setName("test.txt");
        file.setContentMimeType("text/plain");
        file.setContentLength(100L);
        file.setOwner(owner);
    }

    @Test
    public void testUploadFile() throws Exception {
        when(userService.getCurrentUser()).thenReturn(Optional.of(owner));
        when(fileService.createFile(any())).thenReturn(file);

        MockMultipartFile multipartFile = new MockMultipartFile("file", "test.txt",
                "text/plain", "Hello, World!".getBytes());

        mockMvc.perform(multipart("/api/v1/files")
                        .file(multipartFile)
                        .header("X-XSRF-TOKEN", "test-token"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value("1"))
                .andExpect(jsonPath("$.name").value("test.txt"))
                .andExpect(jsonPath("$.contentMimeType").value("text/plain"))
                .andExpect(jsonPath("$.contentLength").value(100));

        verify(fileService, times(1)).createFile(any());
    }

    @Test
    public void testDownloadFile() throws Exception {
        when(userService.getCurrentUser()).thenReturn(Optional.of(owner));
        when(fileService.getFile("1")).thenReturn(Optional.of(file));
        when(contentStore.getContent(file)).thenReturn(new ByteArrayInputStream("Hello, World!".getBytes()));

        mockMvc.perform(get("/api/v1/files/1"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "text/plain"))
                .andExpect(header().string(HttpHeaders.CONTENT_LENGTH, "100"))
                .andExpect(content().string("Hello, World!"));

        verify(fileService, times(1)).getFile("1");
        verify(contentStore, times(1)).getContent(file);
    }

    @Test
    public void testDownloadFileNotFound() throws Exception {
        when(userService.getCurrentUser()).thenReturn(Optional.of(owner));
        when(fileService.getFile("1")).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/files/1"))
                .andExpect(status().isNotFound());

        verify(fileService, times(1)).getFile("1");
        verify(contentStore, never()).getContent(any());
    }

    @Test
    public void testUpdateFileContent() throws Exception {
        when(userService.getCurrentUser()).thenReturn(Optional.of(owner));
        when(fileService.updateFileContent(eq("1"), any())).thenReturn(true);

        MockMultipartFile multipartFile = new MockMultipartFile("file", "test.txt",
                "text/plain", "Updated content".getBytes());

        mockMvc.perform(multipart("/api/v1/files/1")
                        .file(multipartFile)
                        .header("X-XSRF-TOKEN", "test-token")
                        .with(request -> {
                            request.setMethod("PUT");
                            return request;
                        }))
                .andExpect(status().isOk());

        verify(fileService, times(1)).updateFileContent(eq("1"), any());
    }

    @Test
    public void testUpdateFileContentNotFound() throws Exception {
        when(userService.getCurrentUser()).thenReturn(Optional.of(owner));
        when(fileService.updateFileContent(eq("1"), any())).thenReturn(false);

        MockMultipartFile multipartFile = new MockMultipartFile("file", "test.txt",
                "text/plain", "Updated content".getBytes());

        mockMvc.perform(multipart("/api/v1/files/1")
                        .file(multipartFile)
                        .header("X-XSRF-TOKEN", "test-token")
                        .with(request -> {
                            request.setMethod("PUT");
                            return request;
                        }))
                .andExpect(status().isNotFound());

        verify(fileService, times(1)).updateFileContent(eq("1"), any());
    }
}
