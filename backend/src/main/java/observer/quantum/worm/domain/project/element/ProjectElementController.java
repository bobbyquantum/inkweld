package observer.quantum.worm.domain.project.element;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import observer.quantum.worm.error.ErrorResponse;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.annotation.Secured;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/projects/{username}/{slug}/elements")
@Tag(name = "Project Elements API", description = "Operations for managing project elements")
public class ProjectElementController {

  private final ProjectElementService elementService;

  @Operation(
      summary = "Get all elements for a project",
      description =
          "Retrieves all elements belonging to the specified project in their hierarchical order")
  @ApiResponses(
      value = {
        @ApiResponse(
            responseCode = "200",
            description = "Successfully retrieved elements",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    array =
                        @ArraySchema(schema = @Schema(implementation = ProjectElementDto.class)))),
        @ApiResponse(
            responseCode = "404",
            description = "Project not found",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
      })
  @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
  @Secured({"USER", "OAUTH2_USER"})
  public ResponseEntity<List<ProjectElementDto>> getProjectElements(
      @Parameter(description = "Username of the project owner") @PathVariable String username,
      @Parameter(description = "Slug of the project") @PathVariable String slug) {
    return ResponseEntity.ok(elementService.getProjectElements(username, slug));
  }

  @Operation(
      summary = "Differential insert elements",
      description =
          "Updates the project's elements to match exactly the provided list. "
              + "Elements not included in the list will be deleted. "
              + "Elements with IDs will be updated, elements without IDs will be created. "
              + "All changes happen in a single transaction.")
  @ApiResponses(
      value = {
        @ApiResponse(
            responseCode = "200",
            description = "Elements successfully synchronized with provided list",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    array =
                        @ArraySchema(schema = @Schema(implementation = ProjectElementDto.class)))),
        @ApiResponse(
            responseCode = "404",
            description = "Project not found or element not found during update",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
      })
  @PutMapping(produces = MediaType.APPLICATION_JSON_VALUE)
  @Secured({"USER", "OAUTH2_USER"})
  public ResponseEntity<List<ProjectElementDto>> dinsertElements(
      @Parameter(description = "Username of the project owner") @PathVariable String username,
      @Parameter(description = "Slug of the project") @PathVariable String slug,
      @Parameter(description = "CSRF token", in = ParameterIn.HEADER, required = true)
          @RequestHeader(name = "X-XSRF-TOKEN")
          String csrfToken,
      @Parameter(
              description =
                  "Complete list of desired elements - any existing elements not in this list will be deleted")
          @RequestBody
          List<ProjectElementDto> elements) {
    return ResponseEntity.ok(elementService.bulkDinsertElements(username, slug, elements));
  }
}
