package observer.quantum.worm.project;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@SuppressWarnings("unused")
@Slf4j
@RestController
@RequestMapping("/api/projects")
public class ProjectController {

    private final ProjectService projectService;

    public ProjectController(ProjectService projectService) {
        this.projectService = projectService;
    }

    @Operation(summary = "Get all projects", description = "Retrieve a list of all projects")
    @GetMapping
    public ResponseEntity<List<Project>> getAllProjects() {
        log.info("getAllProjects");
        List<Project> projects = projectService.findAll();
        return new ResponseEntity<>(projects, HttpStatus.OK);
    }

    @Operation(summary = "Get project by ID", description = "Retrieve a project by its ID")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "Successfully retrieved project"),
            @ApiResponse(responseCode = "404", description = "Project not found")
    })
    @GetMapping("/{id}")
    public ResponseEntity<Project> getProjectById(@Parameter(description = "ID of the project to be retrieved") @PathVariable String id) {
        Project project = projectService.findById(id);
        return project != null ? new ResponseEntity<>(project, HttpStatus.OK) : new ResponseEntity<>(HttpStatus.NOT_FOUND);
    }

    @Operation(summary = "Create a new project", description = "Add a new project to the system")
    @PostMapping
    public ResponseEntity<Project> createProject(@RequestBody Project project) {
        Project createdProject = projectService.create(project);
        return new ResponseEntity<>(createdProject, HttpStatus.CREATED);
    }

    @Operation(summary = "Update an existing project", description = "Update project details by ID")
    @PutMapping("/{id}")
    public ResponseEntity<Project> updateProject(@Parameter(description = "ID of the project to be updated") @PathVariable String id, @RequestBody Project project) {
        Project updatedProject = projectService.update(id, project);
        return updatedProject != null ? new ResponseEntity<>(updatedProject, HttpStatus.OK) : new ResponseEntity<>(HttpStatus.NOT_FOUND);
    }

    @Operation(summary = "Delete a project", description = "Remove a project from the system by ID")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteProject(@Parameter(description = "ID of the project to be deleted") @PathVariable String id) {
        projectService.delete(id);
        return new ResponseEntity<>(HttpStatus.NO_CONTENT);
    }
}