package observer.quantum.worm.project.element;

public enum ElementType {
    FOLDER,
    ITEM;
    
    public boolean isExpandable() {
        return this == FOLDER;
    }
}
