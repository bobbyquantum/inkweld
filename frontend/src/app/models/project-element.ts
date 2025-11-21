import { Element } from '../../api-client/model/element';

// ProjectElement extends the API type with UI-only fields
export interface ProjectElement
  extends Element {
  expanded?: boolean; // UI state: whether folder is expanded
  visible?: boolean; // UI state: whether element is visible in tree
}

// Map API DTO to frontend model - mainly adds UI state
export function mapDtoToProjectElement(
  dto: Element
): ProjectElement {
  return {
    ...dto,
    expanded: false,
    visible: true,
  };
}
