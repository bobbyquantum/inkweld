package observer.quantum.worm.content;

import observer.quantum.worm.user.User;
import observer.quantum.worm.user.UserAuthInvalidException;
import observer.quantum.worm.user.UserService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
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
        User currentUser = userService.getCurrentUser().orElseThrow(UserAuthInvalidException::new);

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
        User currentUser = userService.getCurrentUser().orElseThrow(UserAuthInvalidException::new);
        Optional<File> file = fileRepository.findById(fileId);
        if (file.isPresent() && !file.get().getOwner().getId().equals(currentUser.getId())) {
            throw new AccessDeniedException("Access denied.");
        }
        return file;
    }

    @Transactional
    public Optional<File> patchFile(String fileId, FilePatchDto patchDto) {
        return getFile(fileId).map(file -> {
            if (patchDto.getName() != null && !patchDto.getName().isEmpty()) {
                file.setName(patchDto.getName());
            }
            if (patchDto.getSummary() != null) {
                file.setSummary(patchDto.getSummary());
            }
            return fileRepository.save(file);
        });
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

    public boolean deleteFile(String fileId) {
        Optional<File> fileOptional = getFile(fileId);
        if (fileOptional.isPresent()) {
            File file = fileOptional.get();
            contentStore.unsetContent(file);
            fileRepository.delete(file);
            return true;
        }
        return false;
    }

    public Page<File> searchFiles(String nameQuery, Pageable pageable) {
        User currentUser = userService.getCurrentUser().orElseThrow(UserAuthInvalidException::new);
        return fileRepository.findByOwnerAndNameContainingIgnoreCase(currentUser, nameQuery, pageable);
    }
}
