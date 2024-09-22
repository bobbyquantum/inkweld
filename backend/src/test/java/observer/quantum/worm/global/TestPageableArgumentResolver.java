package observer.quantum.worm.global;

import org.jetbrains.annotations.NotNull;
import org.springframework.core.MethodParameter;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableHandlerMethodArgumentResolver;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.ModelAndViewContainer;

public class TestPageableArgumentResolver extends PageableHandlerMethodArgumentResolver {
  @Override
  public @NotNull Pageable resolveArgument(
      @NotNull MethodParameter methodParameter,
      ModelAndViewContainer mavContainer,
      NativeWebRequest webRequest,
      WebDataBinderFactory binderFactory) {
    String page = webRequest.getParameter("page");
    String size = webRequest.getParameter("size");
    // TODO implement sort for test
    String sort = webRequest.getParameter("sort");

    int pageNumber = page != null ? Integer.parseInt(page) : 0;
    int pageSize = size != null ? Integer.parseInt(size) : 20;
    Sort pageSort =
        Sort.unsorted(); // = sort != null ? parseParameterIntoSort(sort, ",") : Sort.unsorted();

    return PageRequest.of(pageNumber, pageSize, pageSort);
  }
}
