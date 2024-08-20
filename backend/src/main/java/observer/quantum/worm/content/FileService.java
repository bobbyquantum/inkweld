package observer.quantum.worm.content;

import observer.quantum.worm.user.User;
import observer.quantum.worm.user.UserService;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Optional;

@Service
public class FileService {

    private final FileRepository fileRepository;
    private final FileContentStore contentStore;
    private final UserService userService;

    public FileService(FileRepository fileRepository, FileContentStore contentStore, UserService userService) {
        this.fileRepository = fileRepository;
        this.contentStore = contentStore;
        this.userService = userService;
    }

    public File createFile(MultipartFile file) throws IOException {
        User currentUser = userService.getCurrentUser().orElseThrow(() -> new RuntimeException("User not authenticated"));

        File newFile = new File();
        newFile.setName(file.getOriginalFilename());
        newFile.setContentMimeType(file.getContentType());
        newFile.setContentLength(file.getSize());
        newFile.setOwner(currentUser);

        newFile = fileRepository.save(newFile);
        contentStore.setContent(newFile, file.getInputStream());

        return newFile;
    }

    public Optional<File> getFile(String fileId) {
        User currentUser = userService.getCurrentUser().orElseThrow(() -> new RuntimeException("User not authenticated"));
        Optional<File> file = fileRepository.findById(fileId);
        return file.filter(f -> f.getOwner().getId().equals(currentUser.getId()));
    }

    public boolean updateFileContent(String fileId, MultipartFile file) throws IOException {
        Optional<File> existingFile = getFile(fileId);
        if (existingFile.isPresent()) {
            File updatedFile = existingFile.get();
            updatedFile.setContentMimeType(file.getContentType());
            updatedFile.setContentLength(file.getSize());
            contentStore.setContent(updatedFile, file.getInputStream());
            fileRepository.save(updatedFile);
            return true;
        }
        return false;
    }
}
