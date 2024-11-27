package observer.quantum.worm.domain.content;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.io.IOException;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import observer.quantum.worm.error.ErrorResponse;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.ResourceRegion;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.*;
import org.springframework.security.access.annotation.Secured;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/files")
@Tag(
    name = "File API",
    description =
        "The file controller allows uploading, downloading, and updating files for the current user.")
public class FileContentController {

  private final FileService fileService;
  private final FileContentStore contentStore;

  public FileContentController(FileService fileService, FileContentStore contentStore) {
    this.fileService = fileService;
    this.contentStore = contentStore;
  }

  @Operation(
      summary = "Upload a new file",
      description = "Uploads a new file for the currently authenticated user.")
  @ApiResponses(
      value = {
        @ApiResponse(responseCode = "201", description = "File uploaded successfully"),
        @ApiResponse(
            responseCode = "401",
            description = "User not authenticated",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "403",
            description = "Invalid CSRF token",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class)))
      })
  @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  @Secured({"USER", "OAUTH2_USER"})
  public ResponseEntity<FileDto> uploadFile(
      @Parameter(description = "File to upload", required = true) @RequestParam("file")
          MultipartFile file,
      @Parameter(
              in = ParameterIn.HEADER,
              name = "X-XSRF-TOKEN",
              description = "CSRF token",
              required = true)
          @RequestHeader(name = "X-XSRF-TOKEN")
          String csrfToken)
      throws IOException {
    File createdFile = fileService.createFile(file);
    return ResponseEntity.status(HttpStatus.CREATED).body(new FileDto(createdFile));
  }

  @Operation(
      summary = "Get file meta",
      description = "Gets file meta for a file owned by the currently authenticated user.")
  @ApiResponses(
      value = {
        @ApiResponse(
            responseCode = "200",
            description = "File meta returned successfully",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = FileDto.class))),
        @ApiResponse(
            responseCode = "401",
            description = "User not authenticated",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "403",
            description = "User does not own the file",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "404",
            description = "File not found",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class)))
      })
  @GetMapping("/{fileId}")
  @Secured({"USER", "OAUTH2_USER"})
  public ResponseEntity<?> fileMeta(@PathVariable UUID fileId) {
    return fileService
        .getFile(fileId)
        .map(file -> ResponseEntity.ok().body(new FileDto(file)))
        .orElse(ResponseEntity.notFound().build());
  }

  @Operation(
      summary = "Download a file",
      description = "Downloads a file owned by the currently authenticated user.")
  @Parameter(
      name = "download",
      description = "Set to true to download the file, false to display inline",
      required = false)
  @ApiResponses(
      value = {
        @ApiResponse(
            responseCode = "200",
            description = "File downloaded successfully",
            content = @Content(mediaType = MediaType.APPLICATION_OCTET_STREAM_VALUE)),
        @ApiResponse(
            responseCode = "401",
            description = "User not authenticated",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "403",
            description = "User does not own the file",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "404",
            description = "File not found",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class)))
      })
  @GetMapping("/{fileId}/content")
  @Secured({"USER", "OAUTH2_USER"})
  public ResponseEntity<?> getFile(
      @PathVariable UUID fileId,
      @RequestHeader(value = HttpHeaders.RANGE, required = false) String rangeHeader,
      @RequestParam(value = "download", defaultValue = "false") boolean download) {

    return fileService
        .getFile(fileId)
        .map(
            file -> {
              Resource resource = new InputStreamResource(contentStore.getContent(file));
              HttpHeaders headers = new HttpHeaders();
              headers.setContentType(MediaType.parseMediaType(file.getContentMimeType()));
              if (download) {
                headers.setContentDisposition(
                    ContentDisposition.attachment().filename(file.getName()).build());
              } else {
                headers.setContentDisposition(
                    ContentDisposition.inline().filename(file.getName()).build());
              }
              try {
                if (rangeHeader == null) {
                  return ResponseEntity.ok()
                      .headers(headers)
                      .contentLength(file.getContentLength())
                      .body(resource);
                } else {
                  List<HttpRange> ranges = HttpRange.parseRanges(rangeHeader);
                  if (ranges.isEmpty()) {
                    return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                        .header(HttpHeaders.CONTENT_RANGE, "bytes */" + file.getContentLength())
                        .build();
                  }
                  HttpRange range = ranges.getFirst();
                  long start = range.getRangeStart(file.getContentLength());
                  long end = range.getRangeEnd(file.getContentLength());
                  long length = end - start + 1;
                  headers.add(
                      HttpHeaders.CONTENT_RANGE,
                      "bytes " + start + "-" + end + "/" + file.getContentLength());
                  return ResponseEntity.status(HttpStatus.PARTIAL_CONTENT)
                      .headers(headers)
                      .contentLength(length)
                      .body(new ResourceRegion(resource, start, length));
                }
              } catch (Exception e) {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(
                        new ErrorResponse(
                            "Internal server error",
                            HttpStatus.INTERNAL_SERVER_ERROR.value(),
                            e.getMessage()));
              }
            })
        .orElse(ResponseEntity.notFound().build());
  }

  @Operation(
      summary = "Update file metadata",
      description = "Updates metadata for a file owned by the currently authenticated user.")
  @ApiResponses(
      value = {
        @ApiResponse(
            responseCode = "200",
            description = "File metadata updated successfully",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = FileDto.class))),
        @ApiResponse(
            responseCode = "400",
            description = "Invalid input",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "401",
            description = "User not authenticated",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "403",
            description = "User does not own the file",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "404",
            description = "File not found",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class)))
      })
  @PatchMapping("/{fileId}")
  @Secured({"USER", "OAUTH2_USER"})
  public ResponseEntity<?> patchFile(
      @PathVariable UUID fileId,
      @RequestBody @Valid FilePatchDto patchDto,
      @RequestHeader(name = "X-XSRF-TOKEN") String csrfToken) {

    return fileService
        .patchFile(fileId, patchDto)
        .map(updatedFile -> ResponseEntity.ok().body(new FileDto(updatedFile)))
        .orElse(ResponseEntity.notFound().build());
  }

  @Operation(
      summary = "Update file content",
      description = "Updates the content of a file owned by the currently authenticated user.")
  @ApiResponses(
      value = {
        @ApiResponse(responseCode = "200", description = "File content updated successfully"),
        @ApiResponse(
            responseCode = "401",
            description = "User not authenticated",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "403",
            description = "User does not own the file or invalid CSRF token",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "404",
            description = "File not found",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class)))
      })
  @PutMapping(value = "/{fileId}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  @Secured({"USER", "OAUTH2_USER"})
  public ResponseEntity<?> updateFileContent(
      @PathVariable UUID fileId,
      @RequestParam("file") MultipartFile file,
      @Parameter(
              in = ParameterIn.HEADER,
              name = "X-XSRF-TOKEN",
              description = "CSRF token",
              required = true)
          @RequestHeader(name = "X-XSRF-TOKEN")
          String csrfToken)
      throws IOException {
    boolean updated = fileService.updateFileContent(fileId, file);
    if (updated) {
      return ResponseEntity.ok().build();
    } else {
      return ResponseEntity.notFound().build();
    }
  }

  @Operation(
      summary = "Delete file",
      description = "Deletes a file owned by the currently authenticated user.")
  @ApiResponses(
      value = {
        @ApiResponse(responseCode = "204", description = "File deleted successfully"),
        @ApiResponse(
            responseCode = "401",
            description = "User not authenticated",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "403",
            description = "User does not own the file or invalid CSRF token",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "404",
            description = "File not found",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class)))
      })
  @DeleteMapping("/{fileId}")
  @Secured({"USER", "OAUTH2_USER"})
  public ResponseEntity<?> deleteFile(
      @PathVariable UUID fileId,
      @Parameter(
              in = ParameterIn.HEADER,
              name = "X-XSRF-TOKEN",
              description = "CSRF token",
              required = true)
          @RequestHeader(name = "X-XSRF-TOKEN")
          String csrfToken) {
    boolean deleted = fileService.deleteFile(fileId);
    if (deleted) {
      return ResponseEntity.noContent().build();
    } else {
      return ResponseEntity.notFound().build();
    }
  }

  @Operation(
      summary = "Search files",
      description =
          "Searches for files owned by the currently authenticated user based on the provided criteria.")
  @ApiResponses(
      value = {
        @ApiResponse(
            responseCode = "200",
            description = "Successfully retrieved list of files",
            content =
                @Content(
                    mediaType = "application/json",
                    schema = @Schema(implementation = PageFileResponse.class))),
        @ApiResponse(
            responseCode = "401",
            description = "User not authenticated",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "403",
            description = "Invalid CSRF token",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class)))
      })
  @GetMapping("/search")
  @Secured({"USER", "OAUTH2_USER"})
  public ResponseEntity<Page<FileDto>> searchFiles(
      @Parameter(description = "Name of the file to search for (case-insensitive, partial match)")
          @RequestParam(required = false, defaultValue = "")
          String name,
      @Parameter(description = "Pageable information for the search results") Pageable pageable) {
    Page<File> files = fileService.searchFiles(name, pageable);

    List<FileDto> fileDtos =
        files.getContent().stream().map(FileDto::new).collect(Collectors.toList());
    PageImpl<FileDto> page =
        new PageImpl<>(fileDtos, files.getPageable(), files.getTotalElements());
    return ResponseEntity.ok(page);
  }
}
