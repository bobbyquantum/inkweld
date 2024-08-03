package observer.quantum.worm.project;

import org.springframework.stereotype.Service;

import java.util.Date;
import java.util.List;

@Service
public class ProjectService {

    private final ProjectRepository projectRepository;

    public ProjectService(ProjectRepository projectRepository) {
        this.projectRepository = projectRepository;
    }

    public List<Project> findAll() {
        return projectRepository.findAll();
    }

    public Project findById(String id) {
        return projectRepository.findById(id).orElseThrow(() -> new ProjectNotFoundException(id));
    }

    public Project create(Project project) {
        project.setCreatedDate(new Date());
        project.setUpdatedDate(new Date());
        return projectRepository.save(project);
    }

    public Project update(String id, Project projectDetails) {
        Project existingProject = findById(id);
        if (existingProject != null) {
            existingProject.setTitle(projectDetails.getTitle());
            existingProject.setDescription(projectDetails.getDescription());
            existingProject.setStatus(projectDetails.getStatus());
            existingProject.setTags(projectDetails.getTags());
            existingProject.setUpdatedDate(new Date());
            return projectRepository.save(existingProject);
        }
        return null;
    }

    public void delete(String id) {
        projectRepository.deleteById(id);
    }
}