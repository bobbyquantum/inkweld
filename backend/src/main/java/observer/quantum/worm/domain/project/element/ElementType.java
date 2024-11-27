package observer.quantum.worm.domain.project.element;

public enum ElementType {
  FOLDER,
  ITEM;

  public boolean isExpandable() {
    return this == FOLDER;
  }
}
