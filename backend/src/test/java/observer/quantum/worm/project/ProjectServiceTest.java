package observer.quantum.worm.project;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.*;

public class ProjectServiceTests {

    @InjectMocks
    private ProjectService projectService;

    @Mock
    private ProjectRepository projectRepository;

    private Project project;

    @BeforeEach
    public void setUp() {
        MockitoAnnotations.openMocks(this);
        project = new Project();
        project.setId("1");
        project.setTitle("My Project");
        project.setDescription("Project Description");
        project.setStatus("Writing");
        project.setCreatedDate(new Date());
        project.setUpdatedDate(new Date());
    }

    @Test
    public void testFindAll() {
        List<Project> projects = new ArrayList<>();
        projects.add(project);

        when(projectRepository.findAll()).thenReturn(projects);

        List<Project> result = projectService.findAll();

        assertEquals(1, result.size());
        assertEquals("My Project", result.getFirst().getTitle());
        verify(projectRepository, times(1)).findAll();
    }

    @Test
    public void testFindById() {
        when(projectRepository.findById("1")).thenReturn(Optional.of(project));

        Project result = projectService.findById("1");

        assertNotNull(result);
        assertEquals("My Project", result.getTitle());
        verify(projectRepository, times(1)).findById("1");
    }

    @Test
    public void testCreate() {
        when(projectRepository.save(any(Project.class))).thenReturn(project);

        Project result = projectService.create(project);

        assertNotNull(result);
        assertEquals("My Project", result.getTitle());
        verify(projectRepository, times(1)).save(any(Project.class));
    }

    @Test
    public void testUpdate() {
        when(projectRepository.findById("1")).thenReturn(Optional.of(project));
        when(projectRepository.save(any(Project.class))).thenReturn(project);

        project.setTitle("Updated Project");
        Project result = projectService.update("1", project);

        assertNotNull(result);
        assertEquals("Updated Project", result.getTitle());
        verify(projectRepository, times(1)).findById("1");
        verify(projectRepository, times(1)).save(any(Project.class));
    }

    @Test
    public void testDelete() {
        when(projectRepository.findById("1")).thenReturn(Optional.of(project));
        doNothing().when(projectRepository).delete(any(Project.class));

        projectService.delete("1");

        verify(projectRepository, times(1)).delete(project);
    }
}