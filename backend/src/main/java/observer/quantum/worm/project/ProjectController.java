package observer.quantum.worm.project;

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
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import observer.quantum.worm.error.ErrorResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.annotation.Secured;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/projects")
@Slf4j
@Tag(
    name = "Project API",
    description = "The project controller supports various functions relating to projects.")
public class ProjectController {

  private final ProjectService projectService;

  public ProjectController(ProjectService projectService) {
    this.projectService = projectService;
  }

  @Operation(
      summary = "Get all projects for the current user",
      description = "Retrieves a list of all projects belonging to the authenticated user.")
  @ApiResponses(
      value = {
        @ApiResponse(
            responseCode = "200",
            description = "Successfully retrieved the list of projects",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    array = @ArraySchema(schema = @Schema(implementation = ProjectDto.class)))),
        @ApiResponse(
            responseCode = "401",
            description = "Invalid or missing authentication",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class)))
      })
  @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
  @Secured({"USER", "OAUTH2_USER"})
  public ResponseEntity<List<ProjectDto>> getAllProjects() {
    List<Project> projects = projectService.findAllForCurrentUser();
    List<ProjectDto> projectDtos =
        projects.stream().map(ProjectDto::new).collect(Collectors.toList());
    return ResponseEntity.ok(projectDtos);
  }

  @Operation(
      summary = "Get project by username and slug",
      description =
          "Retrieves a specific project by its username and slug. Only accessible by the project owner.")
  @ApiResponses(
      value = {
        @ApiResponse(
            responseCode = "200",
            description = "Successfully retrieved the project",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ProjectDto.class))),
        @ApiResponse(
            responseCode = "401",
            description = "Invalid or missing authentication",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "403",
            description = "User does not have permission to access this project",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "404",
            description = "Project not found",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class)))
      })
  @GetMapping(path = "/{username}/{slug}", produces = MediaType.APPLICATION_JSON_VALUE)
  @Secured({"USER", "OAUTH2_USER"})
  public ResponseEntity<ProjectDto> getProjectByUsernameAndSlug(
      @Parameter(description = "Username of the project owner", required = true) @PathVariable
          String username,
      @Parameter(description = "Slug of the project", required = true) @PathVariable String slug) {
    Project project = projectService.findByUsernameAndSlug(username, slug);
    return ResponseEntity.ok(new ProjectDto(project));
  }

  @Operation(
      summary = "Create a new project",
      description =
          "Creates a new project for the authenticated user. Requires a valid CSRF token.")
  @ApiResponses(
      value = {
        @ApiResponse(
            responseCode = "201",
            description = "Project successfully created",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ProjectDto.class))),
        @ApiResponse(
            responseCode = "400",
            description = "Invalid project data provided",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "401",
            description = "Invalid or missing authentication",
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
  @PostMapping(
      produces = MediaType.APPLICATION_JSON_VALUE,
      consumes = MediaType.APPLICATION_JSON_VALUE)
  @Secured({"USER", "OAUTH2_USER"})
  public ResponseEntity<ProjectDto> createProject(
      @Parameter(
              in = ParameterIn.HEADER,
              name = "X-XSRF-TOKEN",
              description = "CSRF token",
              required = true,
              schema = @Schema(type = "string"))
          @RequestHeader(name = "X-XSRF-TOKEN")
          String csrfToken,
      @io.swagger.v3.oas.annotations.parameters.RequestBody(
              description = "Project details",
              required = true,
              content =
                  @Content(
                      mediaType = MediaType.APPLICATION_JSON_VALUE,
                      schema = @Schema(implementation = ProjectDto.class)))
          @RequestBody
          ProjectDto projectDto) {
    Project project = projectDto.toProject();
    Project createdProject = projectService.create(project);
    return ResponseEntity.status(HttpStatus.CREATED).body(new ProjectDto(createdProject));
  }

  @Operation(
      summary = "Update an existing project",
      description =
          "Updates the details of an existing project for the authenticated user. Requires a valid CSRF token.")
  @ApiResponses(
      value = {
        @ApiResponse(
            responseCode = "200",
            description = "Project successfully updated",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ProjectDto.class))),
        @ApiResponse(
            responseCode = "400",
            description = "Invalid project data provided",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "401",
            description = "Invalid or missing authentication",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "403",
            description =
                "Invalid CSRF token or user does not have permission to update this project",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "404",
            description = "Project not found",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class)))
      })
  @PutMapping(
      path = "/{username}/{slug}",
      produces = MediaType.APPLICATION_JSON_VALUE,
      consumes = MediaType.APPLICATION_JSON_VALUE)
  @Secured({"USER", "OAUTH2_USER"})
  public ResponseEntity<ProjectDto> updateProject(
      @Parameter(description = "Username of the project owner", required = true) @PathVariable
          String username,
      @Parameter(description = "Slug of the project to be updated", required = true) @PathVariable
          String slug,
      @Parameter(
              in = ParameterIn.HEADER,
              name = "X-XSRF-TOKEN",
              description = "CSRF token",
              required = true,
              schema = @Schema(type = "string"))
          @RequestHeader(name = "X-XSRF-TOKEN")
          String csrfToken,
      @io.swagger.v3.oas.annotations.parameters.RequestBody(
              description = "Updated project details",
              required = true,
              content =
                  @Content(
                      mediaType = MediaType.APPLICATION_JSON_VALUE,
                      schema = @Schema(implementation = ProjectDto.class)))
          @RequestBody
          ProjectDto projectDto) {
    Project project = projectDto.toProject();
    Project updatedProject = projectService.update(username, slug, project);
    return ResponseEntity.ok(new ProjectDto(updatedProject));
  }

  @Operation(
      summary = "Delete a project",
      description =
          "Removes a project from the system by username and slug for the authenticated user. Requires a valid CSRF token.")
  @ApiResponses(
      value = {
        @ApiResponse(responseCode = "204", description = "Project successfully deleted"),
        @ApiResponse(
            responseCode = "401",
            description = "Invalid or missing authentication",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "403",
            description =
                "Invalid CSRF token or user does not have permission to delete this project",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "404",
            description = "Project not found",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class)))
      })
  @DeleteMapping(path = "/{username}/{slug}")
  @Secured({"USER", "OAUTH2_USER"})
  public ResponseEntity<Void> deleteProject(
      @Parameter(description = "Username of the project owner", required = true) @PathVariable
          String username,
      @Parameter(description = "Slug of the project to be deleted", required = true) @PathVariable
          String slug,
      @Parameter(
              in = ParameterIn.HEADER,
              name = "X-XSRF-TOKEN",
              description = "CSRF token",
              required = true,
              schema = @Schema(type = "string"))
          @RequestHeader(name = "X-XSRF-TOKEN")
          String csrfToken) {
    projectService.delete(username, slug);
    return ResponseEntity.noContent().build();
  }
}
