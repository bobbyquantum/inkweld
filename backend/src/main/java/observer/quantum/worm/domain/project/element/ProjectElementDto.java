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

  @NotBlank(message = "Name is required")
  @Schema(description = "Name of the element", required = true)
  private String name;

  @NotNull(message = "Type is required")
  @Schema(description = "Type of the element (FOLDER/ITEM)", required = true)
  private ElementType type;

  @Schema(description = "ID of the parent element")
  private String parentId;

  @Schema(description = "Position for ordering siblings")
  private Double position;

  // Client-side computed properties
  @Schema(description = "Whether the element can be expanded (computed from type)")
  private Boolean expandable;

  @Schema(description = "Level in the tree (computed from parent relationships)")
  private Integer level;

  public ProjectElementDto(ProjectElement element) {
    this.id = element.getId();
    this.name = element.getName();
    this.type = element.getType();
    this.parentId = element.getParentId();
    this.position = element.getPosition();
    this.expandable = element.getType().isExpandable();
  }

  public ProjectElement toProjectElement() {
    return ProjectElement.builder()
        .id(id)
        .name(name)
        .type(type)
        .parentId(parentId)
        .position(position)
        .build();
  }
}
