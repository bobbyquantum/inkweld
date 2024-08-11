package observer.quantum.worm.project;

import observer.quantum.worm.global.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Collections;
import java.util.Date;
import java.util.List;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

public class ProjectControllerTest {

    @InjectMocks
    private ProjectController projectController;

    @Mock
    private ProjectService projectService;

    private MockMvc mockMvc;

    private Project project;

    @BeforeEach
    public void setUp() {
        MockitoAnnotations.openMocks(this);
        mockMvc = MockMvcBuilders.standaloneSetup(projectController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();

        project = new Project();
        project.setId("1");
        project.setTitle("My Project");
        project.setDescription("Project Description");
        project.setStatus("Writing");
        project.setCreatedDate(new Date());
        project.setUpdatedDate(new Date());
    }

    @Test
    public void testGetAllProjects() throws Exception {
        List<Project> projects = Collections.singletonList(project);
        when(projectService.findAll()).thenReturn(projects);

        mockMvc.perform(get("/api/projects"))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$[0].title").value("My Project"));

        verify(projectService, times(1)).findAll();
    }

    @Test
    public void testGetProjectById() throws Exception {
        when(projectService.findById("1")).thenReturn(project);

        mockMvc.perform(get("/api/projects/1"))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.title").value("My Project"));

        verify(projectService, times(1)).findById("1");
    }

    @Test
    public void testCreateProject() throws Exception {
        Project newProject = new Project();
        newProject.setTitle("New Project");
        newProject.setDescription("New Description");

        when(projectService.create(any(Project.class))).thenReturn(newProject);

        mockMvc.perform(post("/api/projects")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"New Project\",\"description\":\"New Description\"}"))
                .andExpect(status().isCreated())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.title").value("New Project"));

        verify(projectService, times(1)).create(any(Project.class));
    }

    @Test
    public void testUpdateProject() throws Exception {
        project.setTitle("Updated Project");

        when(projectService.update(eq("1"), any(Project.class))).thenReturn(project);

        mockMvc.perform(put("/api/projects/1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Updated Project\",\"description\":\"Project Description\"}"))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.title").value("Updated Project"));

        verify(projectService, times(1)).update(eq("1"), any(Project.class));
    }

    @Test
    public void testDeleteProject() throws Exception {
        doNothing().when(projectService).delete("1");

        mockMvc.perform(delete("/api/projects/1"))
                .andExpect(status().isNoContent());

        verify(projectService, times(1)).delete("1");
    }

    @Test
    public void testGetProjectByIdNotFound() throws Exception {
        when(projectService.findById("1")).thenThrow(new ProjectNotFoundException("1"));

        mockMvc.perform(get("/api/projects/1"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.error").value("Project not found with ID: 1"));

        verify(projectService, times(1)).findById("1");
    }

    @Test
    public void testUpdateProjectNotFound() throws Exception {
        when(projectService.update(eq("1"), any(Project.class))).thenThrow(new ProjectNotFoundException("1"));

        mockMvc.perform(put("/api/projects/1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Updated Project\",\"description\":\"Project Description\"}"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.error").value("Project not found with ID: 1"));

        verify(projectService, times(1)).update(eq("1"), any(Project.class));
    }

    @Test
    public void testDeleteProjectNotFound() throws Exception {
        doThrow(new ProjectNotFoundException("1")).when(projectService).delete("1");

        mockMvc.perform(delete("/api/projects/1"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.error").value("Project not found with ID: 1"));

        verify(projectService, times(1)).delete("1");
    }
}
