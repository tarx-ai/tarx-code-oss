/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/
import React from 'react';

interface NavRowProps {
  icon: string;
  iconElement?: React.ReactNode;
  label: string;
  onClick: () => void;
  onActionClick?: () => void;
  actionIcon?: string;
  actionTitle?: string;
}

export const NavRow: React.FC<NavRowProps> = ({
  icon,
  iconElement,
  label,
  onClick,
  onActionClick,
  actionIcon,
  actionTitle
}) => {
  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onActionClick?.();
  };

  return (
    <div className="tarx-hierarchy-item" onClick={onClick}>
      {iconElement ? (
        <span className="tarx-hierarchy-icon tarx-custom-icon">{iconElement}</span>
      ) : (
        <i className={`tarx-hierarchy-icon codicon codicon-${icon}`} />
      )}
      <span className="tarx-hierarchy-label">{label}</span>
      {onActionClick && actionIcon && (
        <i
          className={`tarx-hierarchy-add codicon codicon-${actionIcon}`}
          title={actionTitle}
          onClick={handleActionClick}
        />
      )}
    </div>
  );
};
