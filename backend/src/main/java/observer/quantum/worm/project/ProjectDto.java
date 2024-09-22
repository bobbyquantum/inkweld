package observer.quantum.worm.project;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import lombok.*;
import observer.quantum.worm.user.UserDto;

@AllArgsConstructor
@NoArgsConstructor
@Getter
@Setter
@Schema(name = "Project", description = "Project Data")
public class ProjectDto {
  @Schema(description = "Project ID", example = "1")
  private Long id;

  @Schema(description = "Project title", example = "My Awesome Novel")
  private String title;

  @Schema(description = "Project description", example = "A thrilling adventure story set in space")
  private String description;

  @Schema(description = "User who owns the project")
  private UserDto user;

  @Schema(description = "Current status of the project", example = "In Progress")
  private String status;

  @Schema(description = "Date when the project was created", example = "2023-04-15T10:30:00Z")
  private OffsetDateTime createdDate;

  @Schema(description = "Date when the project was last updated", example = "2023-04-16T14:45:00Z")
  private OffsetDateTime updatedDate;

  @Schema(
      description = "List of chapter IDs in the project",
      example = "[\"chapter1\", \"chapter2\", \"chapter3\"]")
  private List<String> chapters;

  @Schema(
      description = "List of tags associated with the project",
      example = "[\"sci-fi\", \"adventure\", \"space\"]")
  private List<String> tags;

  public ProjectDto(Project project) {
    this.id = project.getId();
    this.title = project.getTitle();
    this.description = project.getDescription();
    this.user = new UserDto(project.getUser());
    //        this.status = project.getStatus();
    this.createdDate = project.getCreatedDate();
    this.updatedDate = project.getUpdatedDate();
    this.chapters = project.getChapters();
    this.tags = project.getTags();
  }

  public Project toProject() {
    Project project = new Project();
    project.setId(this.id);
    project.setTitle(this.title);
    project.setDescription(this.description);
    //        project.setStatus(this.status);
    project.setChapters(this.chapters);
    project.setTags(this.tags);
    return project;
  }
}
