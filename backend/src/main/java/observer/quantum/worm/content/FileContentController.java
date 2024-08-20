package observer.quantum.worm.content;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.annotation.Secured;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@RestController
@RequestMapping("/api/v1/files")
@Tag(name = "File API", description = "The file controller allows uploading, downloading, and updating files for the current user.")
public class FileContentController {

    private final FileService fileService;
    private final FileContentStore contentStore;

    public FileContentController(FileService fileService, FileContentStore contentStore) {
        this.fileService = fileService;
        this.contentStore = contentStore;
    }

    @Operation(summary = "Upload a new file", description = "Uploads a new file for the currently authenticated user.")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "201", description = "File uploaded successfully"),
            @ApiResponse(responseCode = "401", description = "User not authenticated"),
            @ApiResponse(responseCode = "403", description = "Invalid CSRF token")
    })
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Secured({"USER", "OAUTH2_USER"})
    public ResponseEntity<File> uploadFile(
            @Parameter(description = "File to upload", required = true)
            @RequestParam("file") MultipartFile file,

            @Parameter(in = ParameterIn.HEADER, name = "X-XSRF-TOKEN", description = "CSRF token", required = true)
            @RequestHeader(name = "X-XSRF-TOKEN") String csrfToken
    ) throws IOException {
        File createdFile = fileService.createFile(file);
        return ResponseEntity.status(HttpStatus.CREATED).body(createdFile);
    }

    @Operation(summary = "Download a file", description = "Downloads a file owned by the currently authenticated user.")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "File downloaded successfully"),
            @ApiResponse(responseCode = "401", description = "User not authenticated"),
            @ApiResponse(responseCode = "403", description = "User does not own the file"),
            @ApiResponse(responseCode = "404", description = "File not found")
    })
    @GetMapping("/{fileId}")
    @Secured({"USER", "OAUTH2_USER"})
    public ResponseEntity<?> downloadFile(@PathVariable String fileId) {
        return fileService.getFile(fileId)
                .map(file -> {
                    InputStreamResource inputStreamResource = new InputStreamResource(contentStore.getContent(file));
                    HttpHeaders headers = new HttpHeaders();
                    headers.setContentLength(file.getContentLength());
                    headers.setContentType(MediaType.parseMediaType(file.getContentMimeType()));
                    return ResponseEntity.ok()
                            .headers(headers)
                            .body(inputStreamResource);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @Operation(summary = "Update file content", description = "Updates the content of a file owned by the currently authenticated user.")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "File content updated successfully"),
            @ApiResponse(responseCode = "401", description = "User not authenticated"),
            @ApiResponse(responseCode = "403", description = "User does not own the file or invalid CSRF token"),
            @ApiResponse(responseCode = "404", description = "File not found")
    })
    @PutMapping(value = "/{fileId}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Secured({"USER", "OAUTH2_USER"})
    public ResponseEntity<?> updateFileContent(
            @PathVariable String fileId,
            @RequestParam("file") MultipartFile file,
            @Parameter(in = ParameterIn.HEADER, name = "X-XSRF-TOKEN", description = "CSRF token", required = true)
            @RequestHeader(name = "X-XSRF-TOKEN") String csrfToken
    ) throws IOException {
        boolean updated = fileService.updateFileContent(fileId, file);
        if (updated) {
            return ResponseEntity.ok().build();
        } else {
            return ResponseEntity.notFound().build();
        }
    }
}
