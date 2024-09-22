package observer.quantum.worm.global;

import observer.quantum.worm.user.UserService;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class CustomUserDetailsService implements UserDetailsService {

  private final UserService userService;

  public CustomUserDetailsService(UserService userService) {
    this.userService = userService;
  }

  @Override
  public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
    var currentUser = userService.getUser(username);
    return currentUser.map(user -> new UserDetailsWrapper(user.getUsername())).orElse(null);
  }
}
