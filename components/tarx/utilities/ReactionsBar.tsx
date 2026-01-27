import React from 'react';
import { ThumbsUp, ThumbsDown } from '../Codicon';
import styles from './reactionsBar.module.css';

export interface ReactionsBarProps {
  onLike?: () => void;
  onDislike?: () => void;
  liked?: boolean;
  disliked?: boolean;
}

/**
 * ReactionsBar - VS Code action buttons
 * Message footer with thumbs up/down reactions
 */
export const ReactionsBar: React.FC<ReactionsBarProps> = ({
  onLike,
  onDislike,
  liked = false,
  disliked = false,
}) => {
  return (
    <div className={styles.container} role="group" aria-label="Message reactions">
      {onLike && (
        <button
          className={`${styles.button} ${liked ? styles.liked : ''}`}
          onClick={onLike}
          aria-label={liked ? 'Remove like' : 'Like this response'}
          aria-pressed={liked}
          type="button"
        >
          <ThumbsUp size={16} />
        </button>
      )}

      {onDislike && (
        <button
          className={`${styles.button} ${disliked ? styles.disliked : ''}`}
          onClick={onDislike}
          aria-label={disliked ? 'Remove dislike' : 'Dislike this response'}
          aria-pressed={disliked}
          type="button"
        >
          <ThumbsDown size={16} />
        </button>
      )}
    </div>
  );
};

export default ReactionsBar;
