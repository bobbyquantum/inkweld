package observer.quantum.worm.global;

import java.util.ArrayList;
import java.util.List;
import org.springframework.core.MethodParameter;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableHandlerMethodArgumentResolver;
import org.springframework.lang.NonNull;
import org.springframework.lang.Nullable;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.ModelAndViewContainer;

public class TestPageableArgumentResolver extends PageableHandlerMethodArgumentResolver {
  @Override
  public @NonNull Pageable resolveArgument(
      @NonNull MethodParameter methodParameter,
      @Nullable ModelAndViewContainer mavContainer,
      @Nullable NativeWebRequest webRequest,
      @Nullable WebDataBinderFactory binderFactory) {
    if (webRequest != null) {
      String page = webRequest.getParameter("page");
      String size = webRequest.getParameter("size");
      String sort = webRequest.getParameter("sort");

      int pageNumber = page != null ? Integer.parseInt(page) : 0;
      int pageSize = size != null ? Integer.parseInt(size) : 20;
      Sort pageSort = sort != null ? parseParameterIntoSort(sort) : Sort.unsorted();

      return PageRequest.of(pageNumber, pageSize, pageSort);
    }
    return PageRequest.of(0, getMaxPageSize());
  }

  private Sort parseParameterIntoSort(String sortParameter) {
    if (sortParameter == null || sortParameter.isEmpty()) {
      return Sort.unsorted();
    }

    List<Sort.Order> orders = new ArrayList<>();
    String[] sortCriteria = sortParameter.split(",");

    for (String criteria : sortCriteria) {
      String[] parts = criteria.trim().split(":");
      if (parts.length > 2) {
        throw new IllegalArgumentException("Invalid sort parameter: " + criteria);
      }

      String property = parts[0].trim();
      Sort.Direction direction =
          (parts.length == 2 && parts[1].trim().equalsIgnoreCase("desc"))
              ? Sort.Direction.DESC
              : Sort.Direction.ASC;

      orders.add(new Sort.Order(direction, property));
    }

    return Sort.by(orders);
  }
}
