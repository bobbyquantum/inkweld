package observer.quantum.worm.user;

public class UserAuthInvalidException extends RuntimeException {
    public UserAuthInvalidException() {
        super("Auth invalid: ");
    }
}
