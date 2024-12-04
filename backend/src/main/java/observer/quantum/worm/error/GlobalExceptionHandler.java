package observer.quantum.worm.error;

import jakarta.validation.ConstraintViolationException;
import java.util.List;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import observer.quantum.worm.domain.project.ProjectNotFoundException;
import observer.quantum.worm.domain.user.InvalidInputException;
import observer.quantum.worm.domain.user.UserAuthInvalidException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.BindException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

  @ExceptionHandler(ResourceNotFoundException.class)
  public ResponseEntity<ErrorResponse> handleResourceNotFoundException(
      ResourceNotFoundException ex) {
    log.error("Resource not found: {}", ex.getMessage());
    ErrorResponse error = new ErrorResponse(HttpStatus.NOT_FOUND.value(), ex.getMessage());
    return new ResponseEntity<>(error, HttpStatus.NOT_FOUND);
  }

  @ExceptionHandler(ProjectNotFoundException.class)
  public ResponseEntity<ErrorResponse> handleProjectNotFoundException(ProjectNotFoundException ex) {
    log.error("Project not found: {}", ex.getMessage());
    ErrorResponse error = new ErrorResponse(HttpStatus.NOT_FOUND.value(), ex.getMessage());
    return new ResponseEntity<>(error, HttpStatus.NOT_FOUND);
  }

  @ExceptionHandler(UserAuthInvalidException.class)
  public ResponseEntity<ErrorResponse> handleUserAuthInvalidException(UserAuthInvalidException ex) {
    log.error("Unauthorized: {}", ex.getMessage());
    ErrorResponse error = new ErrorResponse(HttpStatus.UNAUTHORIZED.value(), "Unauthorized");
    return new ResponseEntity<>(error, HttpStatus.UNAUTHORIZED);
  }

  @ExceptionHandler(AccessDeniedException.class)
  public ResponseEntity<ErrorResponse> handleAccessDeniedException(AccessDeniedException ex) {
    log.error("Access denied: {}", ex.getMessage());
    ErrorResponse error = new ErrorResponse(HttpStatus.FORBIDDEN.value(), "Access denied");
    return new ResponseEntity<>(error, HttpStatus.FORBIDDEN);
  }

  @ExceptionHandler(InvalidInputException.class)
  public ResponseEntity<ErrorResponse> handleInvalidInputException(InvalidInputException ex) {
    log.error("Invalid input: {}", ex.getMessage());
    ErrorResponse error = new ErrorResponse(HttpStatus.BAD_REQUEST.value(), ex.getMessage());
    return new ResponseEntity<>(error, HttpStatus.BAD_REQUEST);
  }

  @ExceptionHandler(MissingRequestHeaderException.class)
  public ResponseEntity<ErrorResponse> handleMissingRequestHeaderException(
      MissingRequestHeaderException ex) {
    // if X-XSRF-TOKEN header is missing return 403 Forbidden
    if (ex.getHeaderName().equals("X-XSRF-TOKEN")) {
      log.error("Missing XSRF token");
      ErrorResponse error = new ErrorResponse(HttpStatus.FORBIDDEN.value(), "XSRF token missing");
      return new ResponseEntity<>(error, HttpStatus.FORBIDDEN);
    }

    log.error("Missing request header: {}", ex.getMessage());
    ErrorResponse error = new ErrorResponse(HttpStatus.BAD_REQUEST.value(), ex.getMessage());
    return new ResponseEntity<>(error, HttpStatus.BAD_REQUEST);
  }

  @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
  public ResponseEntity<ErrorResponse> handleOptimisticLockingFailureException(
      ObjectOptimisticLockingFailureException ex) {
    log.error("Optimistic locking failure: {}", ex.getMessage());
    ErrorResponse error =
        new ErrorResponse(
            HttpStatus.CONFLICT.value(),
            "The data has been modified by another user. Please refresh and try again.");
    return new ResponseEntity<>(error, HttpStatus.CONFLICT);
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<ErrorResponse> handleValidationException(
      MethodArgumentNotValidException ex) {
    List<String> errors =
        ex.getBindingResult().getFieldErrors().stream()
            .map(error -> error.getField() + ": " + error.getDefaultMessage())
            .collect(Collectors.toList());

    log.error("Validation error: {}", errors);
    ErrorResponse error =
        new ErrorResponse(HttpStatus.BAD_REQUEST.value(), "Validation failed", errors);
    return new ResponseEntity<>(error, HttpStatus.BAD_REQUEST);
  }

  @ExceptionHandler(BindException.class)
  public ResponseEntity<ErrorResponse> handleBindException(BindException ex) {
    List<String> errors =
        ex.getBindingResult().getFieldErrors().stream()
            .map(error -> error.getField() + ": " + error.getDefaultMessage())
            .collect(Collectors.toList());

    log.error("Binding error: {}", errors);
    ErrorResponse error =
        new ErrorResponse(HttpStatus.BAD_REQUEST.value(), "Invalid request parameters", errors);
    return new ResponseEntity<>(error, HttpStatus.BAD_REQUEST);
  }

  @ExceptionHandler(ConstraintViolationException.class)
  public ResponseEntity<ErrorResponse> handleConstraintViolationException(
      ConstraintViolationException ex) {
    List<String> errors =
        ex.getConstraintViolations().stream()
            .map(violation -> violation.getPropertyPath() + ": " + violation.getMessage())
            .collect(Collectors.toList());

    log.error("Constraint violation: {}", errors);
    ErrorResponse error =
        new ErrorResponse(HttpStatus.BAD_REQUEST.value(), "Validation failed", errors);
    return new ResponseEntity<>(error, HttpStatus.BAD_REQUEST);
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<ErrorResponse> handleGenericException(Exception ex) {
    log.error("Unexpected error occurred", ex);
    ErrorResponse error =
        new ErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR.value(), "An unexpected error occurred");
    return new ResponseEntity<>(error, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
