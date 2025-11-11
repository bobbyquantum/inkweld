import { GetApiV1ProjectsUsernameSlugElements200ResponseInner } from '../../api-client/model/get-api-v1-projects-username-slug-elements200-response-inner';

// ProjectElement extends the API type with UI-only fields
export interface ProjectElement
  extends GetApiV1ProjectsUsernameSlugElements200ResponseInner {
  expanded?: boolean; // UI state: whether folder is expanded
  visible?: boolean; // UI state: whether element is visible in tree
}

// Map API DTO to frontend model - mainly adds UI state
export function mapDtoToProjectElement(
  dto: GetApiV1ProjectsUsernameSlugElements200ResponseInner
): ProjectElement {
  return {
    ...dto,
    expanded: false,
    visible: true,
  };
}
