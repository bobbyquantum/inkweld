package observer.quantum.worm.domain.project.element;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Project element data transfer object")
public class ProjectElementDto {
  @Schema(description = "Unique identifier of the element")
  private String id;

  @Schema(description = "Version for optimistic locking")
  private Long version;

  @NotBlank(message = "Name is required")
  @Schema(description = "Name of the element", required = true)
  private String name;

  @NotNull(message = "Type is required")
  @Schema(description = "Type of the element (FOLDER/ITEM)", required = true)
  private ElementType type;

  @Schema(description = "Position for ordering elements")
  @NotNull(message = "Position is required")
  private Integer position;

  @Schema(description = "Level in the tree hierarchy")
  @NotNull(message = "Level is required")
  private Integer level;

  // Client-side computed properties
  @Schema(description = "Whether the element can be expanded (computed from type)")
  private Boolean expandable;

  public ProjectElementDto(ProjectElement element) {
    this.id = element.getId();
    this.version = element.getVersion();
    this.name = element.getName();
    this.type = element.getType();
    this.position = element.getPosition();
    this.level = element.getLevel();
    this.expandable = element.getType().isExpandable();
  }

  public ProjectElement toProjectElement() {
    return ProjectElement.builder()
        .id(id)
        .version(version)
        .name(name)
        .type(type)
        .position(position)
        .level(level)
        .build();
  }
}
