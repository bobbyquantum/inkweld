import { GetApiV1ProjectsUsernameSlugElements200ResponseInner } from '../../api-client/model/get-api-v1-projects-username-slug-elements200-response-inner';

// ProjectElement now extends the API type with UI-only fields
export interface ProjectElement extends GetApiV1ProjectsUsernameSlugElements200ResponseInner {
  position: number; // Maps to 'order' from API
  expanded?: boolean; // UI state: whether folder is expanded
  visible?: boolean; // UI state: whether element is visible in tree
}

// Map API DTO to frontend model
export function mapDtoToProjectElement(dto: GetApiV1ProjectsUsernameSlugElements200ResponseInner): ProjectElement {
  return {
    ...dto,
    position: dto.order, // Map 'order' from API to 'position' in frontend
    expanded: false,
    visible: true,
  };
}




