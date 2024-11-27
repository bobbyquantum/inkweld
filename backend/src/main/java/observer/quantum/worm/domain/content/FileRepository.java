package observer.quantum.worm.domain.content;

import java.util.UUID;
import observer.quantum.worm.domain.user.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FileRepository extends JpaRepository<File, UUID> {
  Page<File> findByOwnerAndNameContainingIgnoreCase(User owner, String name, Pageable pageable);
}
