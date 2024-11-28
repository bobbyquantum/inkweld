package observer.quantum.worm.domain.project.element;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import observer.quantum.worm.domain.project.Project;
import observer.quantum.worm.domain.project.ProjectService;
import observer.quantum.worm.error.ResourceNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectElementService {

  private final ProjectElementRepository elementRepository;
  private final ProjectService projectService;

  @Transactional(readOnly = true)
  public List<ProjectElementDto> getProjectElements(String username, String projectSlug) {
    log.debug("Fetching elements for project: {}/{}", username, projectSlug);
    Project project = projectService.findByUsernameAndSlug(username, projectSlug);
    List<ProjectElement> elements = elementRepository.findByProjectOrderByPosition(project);
    return elements.stream().map(ProjectElementDto::new).collect(Collectors.toList());
  }

  @Transactional
  public List<ProjectElementDto> bulkDinsertElements(
      String username, String projectSlug, List<ProjectElementDto> elementDtos) {
    log.debug(
        "Differential inserting {} elements in project {}/{}",
        elementDtos.size(),
        username,
        projectSlug);
    Project project = projectService.findByUsernameAndSlug(username, projectSlug);

    // Validate all DTOs before proceeding
    elementDtos.forEach(this::validateElementDto);

    // Get all existing elements
    List<ProjectElement> existingElements = elementRepository.findByProjectOrderByPosition(project);

    // Create a map of IDs from the incoming DTOs
    Set<String> dtoIds =
        elementDtos.stream()
            .map(ProjectElementDto::getId)
            .filter(id -> id != null)
            .collect(Collectors.toSet());

    // Delete elements that aren't in the incoming list
    existingElements.stream()
        .filter(element -> !dtoIds.contains(element.getId()))
        .forEach(elementRepository::delete);

    // Create/update elements from the DTOs
    return elementDtos.stream()
        .map(
            dto -> {
              ProjectElement element;
              if (dto.getId() != null) {
                // Update existing element
                element =
                    elementRepository
                        .findById(dto.getId())
                        .orElseThrow(
                            () ->
                                new ResourceNotFoundException(
                                    "Element not found with ID: " + dto.getId()));

                if (!element.getProject().getId().equals(project.getId())) {
                  throw new ResourceNotFoundException(
                      "Element " + dto.getId() + " not found in project");
                }
              } else {
                // Create new element
                element = new ProjectElement();
                element.setProject(project);
              }

              // Update all fields
              element.setName(dto.getName());
              element.setType(dto.getType());
              element.setPosition(dto.getPosition());
              element.setLevel(dto.getLevel());

              return new ProjectElementDto(elementRepository.save(element));
            })
        .collect(Collectors.toList());
  }

  private void validateElementDto(ProjectElementDto dto) {
    if (dto.getName() == null || dto.getName().trim().isEmpty()) {
      throw new IllegalArgumentException("Name is required");
    }
    if (dto.getType() == null) {
      throw new IllegalArgumentException("Type is required");
    }
    if (dto.getPosition() == null) {
      throw new IllegalArgumentException("Position is required");
    }
    if (dto.getLevel() == null) {
      throw new IllegalArgumentException("Level is required");
    }
  }
}
