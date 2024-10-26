package observer.quantum.worm.project.element;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
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
@RequestMapping("/api/v1/projects/{username}/{projectSlug}/elements")
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
      @Parameter(description = "Slug of the project") @PathVariable String projectSlug) {
    return ResponseEntity.ok(elementService.getProjectElements(username, projectSlug));
  }

  @Operation(
      summary = "Create a new element",
      description =
          "Creates a new element in the specified project. Position will be automatically set if not provided.")
  @ApiResponses(
      value = {
        @ApiResponse(
            responseCode = "200",
            description = "Element created successfully",
            content = @Content(schema = @Schema(implementation = ProjectElementDto.class))),
        @ApiResponse(
            responseCode = "404",
            description = "Project not found",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
      })
  @PostMapping(
      produces = MediaType.APPLICATION_JSON_VALUE,
      consumes = MediaType.APPLICATION_JSON_VALUE)
  @Secured({"USER", "OAUTH2_USER"})
  public ResponseEntity<ProjectElementDto> createElement(
      @Parameter(description = "Username of the project owner") @PathVariable String username,
      @Parameter(description = "Slug of the project") @PathVariable String projectSlug,
      @Parameter(description = "CSRF token", in = ParameterIn.HEADER, required = true)
          @RequestHeader(name = "X-XSRF-TOKEN")
          String csrfToken,
      @Valid @RequestBody ProjectElementDto elementDto) {
    return ResponseEntity.ok(elementService.createElement(username, projectSlug, elementDto));
  }

  @Operation(
      summary = "Update an element",
      description =
          "Updates an existing element in the specified project. Can update name, type, parent, and position.")
  @ApiResponses(
      value = {
        @ApiResponse(
            responseCode = "200",
            description = "Element updated successfully",
            content = @Content(schema = @Schema(implementation = ProjectElementDto.class))),
        @ApiResponse(
            responseCode = "404",
            description = "Project or element not found",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
      })
  @PutMapping(
      path = "/{elementId}",
      produces = MediaType.APPLICATION_JSON_VALUE,
      consumes = MediaType.APPLICATION_JSON_VALUE)
  @Secured({"USER", "OAUTH2_USER"})
  public ResponseEntity<ProjectElementDto> updateElement(
      @Parameter(description = "Username of the project owner") @PathVariable String username,
      @Parameter(description = "Slug of the project") @PathVariable String projectSlug,
      @Parameter(description = "ID of the element to update") @PathVariable String elementId,
      @Parameter(description = "CSRF token", in = ParameterIn.HEADER, required = true)
          @RequestHeader(name = "X-XSRF-TOKEN")
          String csrfToken,
      @Valid @RequestBody ProjectElementDto elementDto) {
    return ResponseEntity.ok(
        elementService.updateElement(username, projectSlug, elementId, elementDto));
  }

  @Operation(
      summary = "Delete an element",
      description = "Deletes an element and its children from the specified project")
  @ApiResponses(
      value = {
        @ApiResponse(responseCode = "204", description = "Element deleted successfully"),
        @ApiResponse(
            responseCode = "404",
            description = "Project or element not found",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
      })
  @DeleteMapping("/{elementId}")
  @Secured({"USER", "OAUTH2_USER"})
  public ResponseEntity<Void> deleteElement(
      @Parameter(description = "Username of the project owner") @PathVariable String username,
      @Parameter(description = "Slug of the project") @PathVariable String projectSlug,
      @Parameter(description = "ID of the element to delete") @PathVariable String elementId,
      @Parameter(description = "CSRF token", in = ParameterIn.HEADER, required = true)
          @RequestHeader(name = "X-XSRF-TOKEN")
          String csrfToken) {
    elementService.deleteElement(username, projectSlug, elementId);
    return ResponseEntity.noContent().build();
  }

  @Operation(
      summary = "Update element position",
      description = "Updates the position of an element relative to its siblings")
  @ApiResponses(
      value = {
        @ApiResponse(
            responseCode = "200",
            description = "Position updated successfully",
            content = @Content(schema = @Schema(implementation = ProjectElementDto.class))),
        @ApiResponse(
            responseCode = "404",
            description = "Project or element not found",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
      })
  @PatchMapping("/{elementId}/position/{position}")
  @Secured({"USER", "OAUTH2_USER"})
  public ResponseEntity<ProjectElementDto> updateElementPosition(
      @Parameter(description = "Username of the project owner") @PathVariable String username,
      @Parameter(description = "Slug of the project") @PathVariable String projectSlug,
      @Parameter(description = "ID of the element") @PathVariable String elementId,
      @Parameter(description = "New position value") @PathVariable Double position,
      @Parameter(description = "CSRF token", in = ParameterIn.HEADER, required = true)
          @RequestHeader(name = "X-XSRF-TOKEN")
          String csrfToken) {
    ProjectElementDto dto = new ProjectElementDto();
    dto.setPosition(position);
    return ResponseEntity.ok(elementService.updateElement(username, projectSlug, elementId, dto));
  }
}
