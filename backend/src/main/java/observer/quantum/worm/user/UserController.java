package observer.quantum.worm.user;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.annotation.Secured;
import org.springframework.web.bind.annotation.*;

@SuppressWarnings("unused")
@Slf4j
@Tag(name = "User", description = "User API")
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @Operation(summary = "Get the currently authenticated user")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "User information retrieved successfully"),
            @ApiResponse(responseCode = "401", description = "Invalid or missing authentication")
    })
    @GetMapping(path = "/me", produces = MediaType.APPLICATION_JSON_VALUE)
    @Secured({"USER", "OAUTH2_USER"})
    public ResponseEntity<UserDto> getCurrentUser() {
        var userOptional = userService.getCurrentUser();
        if (userOptional.isPresent()) {
            var user = userOptional.get();
            log.trace("User info request for {}", user.getUsername());
            return ResponseEntity.ok(new UserDto(user));
        }
        throw new UserAuthInvalidException();
    }

    @Operation(summary = "Update user details",
            parameters = {
                    @Parameter(in = ParameterIn.HEADER,
                            name = "X-XSRF-TOKEN",
                            description = "CSRF token",
                            required = true,
                            schema = @Schema(type = "string"))
            })
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "User details updated successfully"),
            @ApiResponse(responseCode = "400", description = "Invalid input"),
            @ApiResponse(responseCode = "401", description = "Invalid or missing authentication"),
            @ApiResponse(responseCode = "403", description = "Invalid CSRF token")
    })
    @PutMapping(path = "/me", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    @Secured("USER")
    public ResponseEntity<UserDto> updateUserDetails(@Valid @RequestBody UpdateUserRequest updateUserRequest) {
        if (updateUserRequest.getName() == null && updateUserRequest.getAvatarImageUrl() == null) {
            return ResponseEntity.badRequest().build();
        }
        var updatedUser = userService.updateUserDetails(updateUserRequest);
        log.info("User details updated for {}", updatedUser.getUsername());
        return ResponseEntity.ok(new UserDto(updatedUser));
    }

    @Operation(summary = "Delete user account",
            parameters = {
                    @Parameter(in = ParameterIn.HEADER,
                            name = "X-XSRF-TOKEN",
                            description = "CSRF token",
                            required = true,
                            schema = @Schema(type = "string"))
            })
    @ApiResponses(value = {
            @ApiResponse(responseCode = "204", description = "User account deleted successfully"),
            @ApiResponse(responseCode = "401", description = "Invalid or missing authentication"),
            @ApiResponse(responseCode = "403", description = "Invalid CSRF token")
    })
    @DeleteMapping(path = "/me")
    @Secured({"USER", "OAUTH2_USER"})
    public ResponseEntity<Void> deleteAccount() {
        userService.deleteAccount();
        log.info("User account deleted");
        return ResponseEntity.noContent().build();
    }
}