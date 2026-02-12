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
    <div className="tarx-nav-row" onClick={onClick}>
      {iconElement ? (
        <span className="tarx-nav-row-icon tarx-custom-icon">{iconElement}</span>
      ) : (
        <i className={`tarx-nav-row-icon codicon codicon-${icon}`} />
      )}
      <span className="tarx-nav-row-label">{label}</span>
      {onActionClick && actionIcon && (
        <i
          className={`tarx-action-btn codicon codicon-${actionIcon}`}
          title={actionTitle}
          onClick={handleActionClick}
        />
      )}
    </div>
  );
};
