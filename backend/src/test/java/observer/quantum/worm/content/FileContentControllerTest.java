package observer.quantum.worm.content;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.io.ByteArrayInputStream;
import java.util.Collections;
import java.util.Optional;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import observer.quantum.worm.domain.content.File;
import observer.quantum.worm.domain.content.FileContentController;
import observer.quantum.worm.domain.content.FileContentStore;
import observer.quantum.worm.domain.content.FilePatchDto;
import observer.quantum.worm.domain.content.FileService;
import observer.quantum.worm.domain.user.User;
import observer.quantum.worm.domain.user.UserService;
import observer.quantum.worm.error.GlobalExceptionHandler;
import observer.quantum.worm.global.TestPageableArgumentResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.data.domain.*;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@Slf4j
public class FileContentControllerTest {

  @InjectMocks private FileContentController fileContentController;

  @Mock private FileService fileService;

  @Mock private FileContentStore contentStore;

  @Mock private UserService userService;

  private MockMvc mockMvc;

  private File file;
  private User owner;

  @BeforeEach
  public void setUp() {
    MockitoAnnotations.openMocks(this);
    mockMvc =
        MockMvcBuilders.standaloneSetup(fileContentController)
            .setCustomArgumentResolvers(new TestPageableArgumentResolver())
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();

    owner = new User();
    owner.setId(UUID.fromString("00000000-0000-0000-0000-000000000001"));
    owner.setUsername("owner");

    file = new File();
    file.setId(UUID.fromString("00000000-0000-0000-0000-000000000001"));
    file.setName("test.txt");
    file.setContentMimeType("text/plain");
    file.setContentLength(100L);
    file.setOwner(owner);
  }

  @Test
  public void testUploadFile() throws Exception {
    when(userService.getCurrentUser()).thenReturn(Optional.of(owner));
    when(fileService.createFile(any())).thenReturn(file);

    MockMultipartFile multipartFile =
        new MockMultipartFile("file", "test.txt", "text/plain", "Hello, World!".getBytes());

    mockMvc
        .perform(
            multipart("/api/v1/files").file(multipartFile).header("X-XSRF-TOKEN", "test-token"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.id").value("00000000-0000-0000-0000-000000000001"))
        .andExpect(jsonPath("$.name").value("test.txt"))
        .andExpect(jsonPath("$.contentMimeType").value("text/plain"))
        .andExpect(jsonPath("$.contentLength").value(100));

    verify(fileService, times(1)).createFile(any());
  }

  @Test
  public void testGetFileMeta() throws Exception {
    when(fileService.getFile(UUID.fromString("00000000-0000-0000-0000-000000000001")))
        .thenReturn(Optional.of(file));

    mockMvc
        .perform(get("/api/v1/files/00000000-0000-0000-0000-000000000001"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value("00000000-0000-0000-0000-000000000001"))
        .andExpect(jsonPath("$.name").value("test.txt"))
        .andExpect(jsonPath("$.contentMimeType").value("text/plain"))
        .andExpect(jsonPath("$.contentLength").value(100));

    verify(fileService, times(1)).getFile(UUID.fromString("00000000-0000-0000-0000-000000000001"));
  }

  @Test
  public void testDownloadFile() throws Exception {
    when(fileService.getFile(UUID.fromString("00000000-0000-0000-0000-000000000001")))
        .thenReturn(Optional.of(file));
    when(contentStore.getContent(file))
        .thenReturn(new ByteArrayInputStream("Hello, World!".getBytes()));

    mockMvc
        .perform(get("/api/v1/files/00000000-0000-0000-0000-000000000001/content"))
        .andExpect(status().isOk())
        .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "text/plain"))
        .andExpect(
            header().string(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"test.txt\""))
        .andExpect(content().string("Hello, World!"));

    verify(fileService, times(1)).getFile(UUID.fromString("00000000-0000-0000-0000-000000000001"));
    verify(contentStore, times(1)).getContent(file);
  }

  @Test
  public void testDownloadFileInline() throws Exception {
    when(fileService.getFile(UUID.fromString("00000000-0000-0000-0000-000000000001")))
        .thenReturn(Optional.of(file));
    when(contentStore.getContent(file))
        .thenReturn(new ByteArrayInputStream("Hello, World!".getBytes()));

    mockMvc
        .perform(
            get("/api/v1/files/00000000-0000-0000-0000-000000000001/content")
                .param("download", "false"))
        .andExpect(status().isOk())
        .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "text/plain"))
        .andExpect(
            header().string(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"test.txt\""))
        .andExpect(content().string("Hello, World!"));

    verify(fileService, times(1)).getFile(UUID.fromString("00000000-0000-0000-0000-000000000001"));
    verify(contentStore, times(1)).getContent(file);
  }

  //    @Test
  //    public void testDownloadFilePartialContent() throws Exception {
  //        File binaryFile = new File();
  //        binaryFile.setId("2");
  //        binaryFile.setName("test.bin");
  //        binaryFile.setContentMimeType("application/octet-stream");
  //        binaryFile.setContentLength(100L);
  //        binaryFile.setOwner(owner);
  //
  //        byte[] content = new byte[100];
  //        for (int i = 0; i < 100; i++) {
  //            content[i] = (byte) i;
  //        }
  //
  //        when(fileService.getFile("2")).thenReturn(Optional.of(binaryFile));
  //        when(contentStore.getContent(binaryFile)).thenReturn(new ByteArrayInputStream(content));
  //
  //        mockMvc.perform(get("/api/v1/files/2/content")
  //                        .header(HttpHeaders.RANGE, "bytes=0-9"))
  //                .andDo(result -> log.info(result.getResponse().getContentAsString()))
  //                .andExpect(status().isPartialContent())
  //                .andExpect(header().string(HttpHeaders.CONTENT_TYPE,
  // "application/octet-stream"))
  //                .andExpect(header().string(HttpHeaders.CONTENT_RANGE, "bytes 0-9/100"))
  //                .andExpect(content().bytes(Arrays.copyOfRange(content, 0, 10)));
  //
  //        verify(fileService, times(1)).getFile("2");
  //        verify(contentStore, times(1)).getContent(binaryFile);
  //    }

  @Test
  public void testDownloadFileNotFound() throws Exception {
    when(userService.getCurrentUser()).thenReturn(Optional.of(owner));
    when(fileService.getFile(UUID.fromString("00000000-0000-0000-0000-000000000001")))
        .thenReturn(Optional.empty());

    mockMvc
        .perform(get("/api/v1/files/00000000-0000-0000-0000-000000000001"))
        .andExpect(status().isNotFound());

    verify(fileService, times(1)).getFile(UUID.fromString("00000000-0000-0000-0000-000000000001"));
    verify(contentStore, never()).getContent(any());
  }

  @Test
  public void testUpdateFileContent() throws Exception {
    when(userService.getCurrentUser()).thenReturn(Optional.of(owner));
    when(fileService.updateFileContent(
            eq(UUID.fromString("00000000-0000-0000-0000-000000000001")), any()))
        .thenReturn(true);

    MockMultipartFile multipartFile =
        new MockMultipartFile("file", "test.txt", "text/plain", "Updated content".getBytes());

    mockMvc
        .perform(
            multipart("/api/v1/files/00000000-0000-0000-0000-000000000001")
                .file(multipartFile)
                .header("X-XSRF-TOKEN", "test-token")
                .with(
                    request -> {
                      request.setMethod("PUT");
                      return request;
                    }))
        .andExpect(status().isOk());

    verify(fileService, times(1))
        .updateFileContent(eq(UUID.fromString("00000000-0000-0000-0000-000000000001")), any());
  }

  @Test
  public void testUpdateFileContentNotFound() throws Exception {
    when(userService.getCurrentUser()).thenReturn(Optional.of(owner));
    when(fileService.updateFileContent(
            eq(UUID.fromString("00000000-0000-0000-0000-000000000001")), any()))
        .thenReturn(false);

    MockMultipartFile multipartFile =
        new MockMultipartFile("file", "test.txt", "text/plain", "Updated content".getBytes());

    mockMvc
        .perform(
            multipart("/api/v1/files/00000000-0000-0000-0000-000000000001")
                .file(multipartFile)
                .header("X-XSRF-TOKEN", "test-token")
                .with(
                    request -> {
                      request.setMethod("PUT");
                      return request;
                    }))
        .andExpect(status().isNotFound());

    verify(fileService, times(1))
        .updateFileContent(eq(UUID.fromString("00000000-0000-0000-0000-000000000001")), any());
  }

  @Test
  public void testDeleteFile() throws Exception {
    when(userService.getCurrentUser()).thenReturn(Optional.of(owner));
    when(fileService.deleteFile(UUID.fromString("00000000-0000-0000-0000-000000000001")))
        .thenReturn(true);

    mockMvc
        .perform(
            delete("/api/v1/files/00000000-0000-0000-0000-000000000001")
                .header("X-XSRF-TOKEN", "test-token"))
        .andExpect(status().isNoContent());

    verify(fileService, times(1))
        .deleteFile(UUID.fromString("00000000-0000-0000-0000-000000000001"));
  }

  @Test
  public void testDeleteFileNotFound() throws Exception {
    when(userService.getCurrentUser()).thenReturn(Optional.of(owner));
    when(fileService.deleteFile(UUID.fromString("00000000-0000-0000-0000-000000000001")))
        .thenReturn(false);

    mockMvc
        .perform(
            delete("/api/v1/files/00000000-0000-0000-0000-000000000001")
                .header("X-XSRF-TOKEN", "test-token"))
        .andExpect(status().isNotFound());

    verify(fileService, times(1))
        .deleteFile(UUID.fromString("00000000-0000-0000-0000-000000000001"));
  }

  @Test
  public void testSearchFiles() throws Exception {
    when(userService.getCurrentUser()).thenReturn(Optional.of(owner));

    Pageable pageable = PageRequest.of(0, 10, Sort.by(Sort.Direction.DESC, "name"));
    Page<File> filePage = new PageImpl<>(Collections.singletonList(file), pageable, 1);
    when(fileService.searchFiles(eq("test"), any(Pageable.class))).thenReturn(filePage);

    mockMvc
        .perform(
            get("/api/v1/files/search")
                .param("name", "test")
                .param("page", "0")
                .param("size", "10")
                .param("sort", "name,desc"))
        .andDo(result -> log.info(result.getResponse().getContentAsString()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content[0].id").value("00000000-0000-0000-0000-000000000001"))
        .andExpect(jsonPath("$.content[0].name").value("test.txt"))
        .andExpect(jsonPath("$.totalElements").value(1))
        .andExpect(jsonPath("$.totalPages").value(1))
        .andExpect(jsonPath("$.size").value(10))
        .andExpect(jsonPath("$.number").value(0));

    verify(fileService, times(1)).searchFiles(eq("test"), any(Pageable.class));
  }

  @Test
  public void testPatchFile() throws Exception {
    FilePatchDto patchDto = new FilePatchDto();
    patchDto.setName("updated.txt");
    patchDto.setSummary("Updated summary");

    File updatedFile = new File();
    updatedFile.setName("updated.txt");
    updatedFile.setSummary("Updated summary");
    updatedFile.setContentMimeType("text/plain");
    updatedFile.setContentLength(100L);
    updatedFile.setOwner(owner);

    when(fileService.patchFile(
            eq(UUID.fromString("00000000-0000-0000-0000-000000000001")), any(FilePatchDto.class)))
        .thenReturn(Optional.of(updatedFile));

    mockMvc
        .perform(
            patch("/api/v1/files/00000000-0000-0000-0000-000000000001")
                .contentType("application/json")
                .header("X-XSRF-TOKEN", "test-token")
                .content("{\"name\":\"updated.txt\",\"summary\":\"Updated summary\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("updated.txt"))
        .andExpect(jsonPath("$.summary").value("Updated summary"));

    verify(fileService, times(1))
        .patchFile(
            eq(UUID.fromString("00000000-0000-0000-0000-000000000001")), any(FilePatchDto.class));
  }
}
