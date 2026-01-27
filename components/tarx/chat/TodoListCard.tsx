import React from 'react';
import { Codicon, FolderOpen, FileText, File } from '../Codicon';
import styles from './todoListCard.module.css';

const Square: React.FC<{ className?: string; size?: number }> = (props) =>
  <Codicon name="primitive-square" {...props} />;
const CheckSquare: React.FC<{ className?: string; size?: number }> = (props) =>
  <Codicon name="check" {...props} />;
const X: React.FC<{ className?: string; size?: number }> = (props) =>
  <Codicon name="close" {...props} />;
const Settings: React.FC<{ className?: string; size?: number }> = (props) =>
  <Codicon name="settings-gear" {...props} />;

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  icon?: 'folder' | 'file' | 'settings' | 'test';
}

export interface TodoListCardProps {
  items: TodoItem[];
  onToggle?: (id: string, completed: boolean) => void;
  onDelete?: (id: string) => void;
}

const iconMap = {
  folder: FolderOpen,
  file: FileText,
  settings: Settings,
  test: File,
};

/**
 * TodoListCard - VS Code checkbox/list styling
 * Matches VS Code's task list appearance
 */
export const TodoListCard: React.FC<TodoListCardProps> = ({
  items,
  onToggle,
  onDelete,
}) => {
  return (
    <div className={styles.container} role="region" aria-label="Todo list">
      <div className={styles.header}>
        <Square className={styles.headerIcon} size={14} aria-hidden="true" />
        <h3 className={styles.title}>Suggested Next Steps</h3>
      </div>

      <div className={styles.list}>
        {items.map((item) => {
          const IconComponent = item.icon ? iconMap[item.icon] : null;
          
          return (
            <div
              key={item.id}
              className={`${styles.item} ${item.completed ? styles.completed : ''}`}
            >
              <button
                className={styles.checkbox}
                onClick={() => onToggle?.(item.id, !item.completed)}
                aria-label={item.completed ? 'Mark as incomplete' : 'Mark as complete'}
                type="button"
              >
                {item.completed ? (
                  <CheckSquare className={styles.checkboxIconChecked} size={16} />
                ) : (
                  <Square className={styles.checkboxIcon} size={16} />
                )}
              </button>

              {IconComponent && (
                <IconComponent className={styles.itemIcon} size={14} aria-hidden="true" />
              )}

              <span className={styles.text}>{item.text}</span>

              {onDelete && (
                <button
                  className={styles.deleteButton}
                  onClick={() => onDelete(item.id)}
                  aria-label="Delete task"
                  type="button"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TodoListCard;
