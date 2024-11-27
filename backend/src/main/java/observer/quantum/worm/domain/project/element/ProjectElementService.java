package observer.quantum.worm.domain.project.element;

import java.util.List;
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

  private static final double POSITION_GAP = 1000.0;

  @Transactional(readOnly = true)
  public List<ProjectElementDto> getProjectElements(String username, String projectSlug) {
    log.debug("Fetching elements for project: {}/{}", username, projectSlug);
    Project project = projectService.findByUsernameAndSlug(username, projectSlug);
    List<ProjectElement> elements = elementRepository.findByProjectOrderByPosition(project);
    return elements.stream().map(this::enrichDto).collect(Collectors.toList());
  }

  @Transactional
  public ProjectElementDto createElement(
      String username, String projectSlug, ProjectElementDto elementDto) {
    log.debug("Creating new element in project {}/{}: {}", username, projectSlug, elementDto);
    Project project = projectService.findByUsernameAndSlug(username, projectSlug);

    ProjectElement element = elementDto.toProjectElement();
    element.setProject(project);

    // If position not specified, append to end
    if (element.getPosition() == null) {
      Double maxPosition = elementRepository.findMaxPositionByParentId(element.getParentId());
      element.setPosition(maxPosition != null ? maxPosition + POSITION_GAP : POSITION_GAP);
    }

    return enrichDto(elementRepository.save(element));
  }

  @Transactional
  public ProjectElementDto updateElement(
      String username, String projectSlug, String elementId, ProjectElementDto elementDto) {
    log.debug("Updating element {} in project {}/{}", elementId, username, projectSlug);
    Project project = projectService.findByUsernameAndSlug(username, projectSlug);
    ProjectElement element =
        elementRepository
            .findById(elementId)
            .orElseThrow(() -> new ResourceNotFoundException("Element not found"));

    if (!element.getProject().getId().equals(project.getId())) {
      throw new ResourceNotFoundException("Element not found in project");
    }

    element.setName(elementDto.getName());
    element.setType(elementDto.getType());

    // Handle position update if specified
    if (elementDto.getPosition() != null) {
      element.setPosition(elementDto.getPosition());
    }

    // Handle parent change if specified
    if (elementDto.getParentId() != null
        && !elementDto.getParentId().equals(element.getParentId())) {
      element.setParentId(elementDto.getParentId());
      if (element.getPosition() == null) {
        Double maxPosition = elementRepository.findMaxPositionByParentId(element.getParentId());
        element.setPosition(maxPosition != null ? maxPosition + POSITION_GAP : POSITION_GAP);
      }
    }

    return enrichDto(elementRepository.save(element));
  }

  @Transactional
  public void deleteElement(String username, String projectSlug, String elementId) {
    log.debug("Deleting element {} from project {}/{}", elementId, username, projectSlug);
    Project project = projectService.findByUsernameAndSlug(username, projectSlug);
    ProjectElement element =
        elementRepository
            .findById(elementId)
            .orElseThrow(() -> new ResourceNotFoundException("Element not found"));

    if (!element.getProject().getId().equals(project.getId())) {
      throw new ResourceNotFoundException("Element not found in project");
    }

    elementRepository.deleteByParentId(elementId);
    elementRepository.delete(element);
  }

  private ProjectElementDto enrichDto(ProjectElement element) {
    ProjectElementDto dto = new ProjectElementDto(element);
    dto.setLevel(calculateLevel(element));
    return dto;
  }

  private int calculateLevel(ProjectElement element) {
    int level = 0;
    String parentId = element.getParentId();
    while (parentId != null) {
      level++;
      ProjectElement parent = elementRepository.findById(parentId).orElse(null);
      parentId = parent != null ? parent.getParentId() : null;
    }
    return level;
  }
}
