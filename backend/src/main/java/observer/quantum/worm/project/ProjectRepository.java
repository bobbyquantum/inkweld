package observer.quantum.worm.project;

import observer.quantum.worm.user.User;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface ProjectRepository extends MongoRepository<Project, String> {
    List<Project> findByUser(User user);
}
