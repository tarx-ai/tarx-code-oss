import React from 'react';

/**
 * Codicon - VS Code icon component
 * Uses VS Code's built-in codicon font
 */

export interface CodiconProps {
  name: string;
  size?: number;
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}

// Lucide to Codicon mapping for easy migration
export const iconMap: Record<string, string> = {
  // Files & folders
  'file-text': 'file',
  'file': 'file',
  'folder': 'folder',
  'folder-open': 'folder-opened',

  // Actions
  'copy': 'copy',
  'plus': 'add',
  'arrow-right': 'arrow-right',
  'arrow-left': 'arrow-left',
  'check': 'check',
  'check-circle': 'pass',
  'x': 'close',
  'x-circle': 'error',
  'edit': 'edit',
  'trash': 'trash',

  // Feedback
  'thumbs-up': 'thumbsup',
  'thumbs-down': 'thumbsdown',

  // UI
  'chevron-right': 'chevron-right',
  'chevron-down': 'chevron-down',
  'chevron-up': 'chevron-up',
  'eye': 'eye',
  'eye-off': 'eye-closed',
  'search': 'search',
  'settings': 'settings-gear',

  // Tools
  'wrench': 'wrench',
  'code': 'code',
  'terminal': 'terminal',
  'database': 'database',

  // Status
  'alert-triangle': 'warning',
  'alert-circle': 'error',
  'info': 'info',
  'lightbulb': 'lightbulb',
  'clock': 'clock',

  // Trends
  'trending-up': 'arrow-up',
  'trending-down': 'arrow-down',

  // Upload
  'upload': 'cloud-upload',
  'cloud-upload': 'cloud-upload',

  // Misc
  'play': 'play',
  'refresh': 'refresh',
  'link': 'link-external',
  'git-branch': 'git-branch',
  'beaker': 'beaker',
};

/**
 * Get codicon name from lucide name
 */
export function getCodiconName(lucideName: string): string {
  const normalized = lucideName.toLowerCase().replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
  return iconMap[normalized] || normalized;
}

/**
 * Codicon component - renders VS Code icons
 */
export const Codicon: React.FC<CodiconProps> = ({
  name,
  size = 16,
  className = '',
  'aria-hidden': ariaHidden = true
}) => {
  const codiconName = iconMap[name.toLowerCase()] || name;

  return (
    <span
      className={`codicon codicon-${codiconName} ${className}`}
      style={{ fontSize: `${size}px` }}
      aria-hidden={ariaHidden}
    />
  );
};

// Named icon exports for easy migration from lucide-react
export const FileText: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="file" {...props} />;

export const FolderOpen: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="folder-opened" {...props} />;

export const Copy: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="copy" {...props} />;

export const Plus: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="add" {...props} />;

export const ArrowRight: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="arrow-right" {...props} />;

export const ThumbsUp: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="thumbsup" {...props} />;

export const ThumbsDown: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="thumbsdown" {...props} />;

export const ChevronRight: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="chevron-right" {...props} />;

export const ChevronDown: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="chevron-down" {...props} />;

export const CheckCircle: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="pass" {...props} />;

export const Check: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="check" {...props} />;

export const AlertTriangle: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="warning" {...props} />;

export const Lightbulb: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="lightbulb" {...props} />;

export const Clock: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="clock" {...props} />;

export const TrendingUp: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="arrow-up" {...props} />;

export const TrendingDown: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="arrow-down" {...props} />;

export const Wrench: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="wrench" {...props} />;

export const Code: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="code" {...props} />;

export const Database: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="database" {...props} />;

export const Eye: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="eye" {...props} />;

export const Upload: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="cloud-upload" {...props} />;

export const CloudUpload: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="cloud-upload" {...props} />;

export const File: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="file" {...props} />;

export const Beaker: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="beaker" {...props} />;

export const Play: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="play" {...props} />;

export const Link: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="link-external" {...props} />;

export const ExternalLink: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="link-external" {...props} />;

export const Zap: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="zap" {...props} />;

export const MemoryStick: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="server-process" {...props} />;

export const CircleCheck: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="pass-filled" {...props} />;

export const CircleX: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="error" {...props} />;

export const SkipForward: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="debug-step-over" {...props} />;

export const Square: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="primitive-square" {...props} />;

export const SquareCheck: React.FC<{ size?: number; className?: string }> = (props) =>
  <Codicon name="check" {...props} />;

export default Codicon;
