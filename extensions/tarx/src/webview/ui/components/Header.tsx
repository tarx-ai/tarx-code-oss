/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/
import React, { useMemo } from 'react';

const TarxLogoIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 94 84" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M91.224 43.8742C90.7676 43.7484 90.2908 43.7138 89.821 43.7726C89.3512 43.8313 88.8976 43.9821 88.4862 44.2164C88.0748 44.4507 87.7136 44.7639 87.4234 45.138C87.1332 45.512 86.9197 45.9397 86.795 46.3965C84.386 55.0972 79.1994 62.7723 72.0249 68.2526C64.8505 73.7329 56.0814 76.7183 47.0534 76.7539C38.0254 76.7895 29.2331 73.8734 22.0156 68.4499C14.7981 63.0263 9.55107 55.3924 7.07352 46.7109C6.94174 46.2558 6.7216 45.8311 6.42568 45.4611C6.12977 45.091 5.76386 44.7829 5.34887 44.5543C4.51075 44.0926 3.52354 43.9827 2.60441 44.2489C1.68528 44.515 0.909531 45.1354 0.447811 45.9735C-0.0139082 46.8117 -0.123773 47.7989 0.142384 48.718C3.04957 58.9138 9.2103 67.8795 17.6858 74.2491C26.1613 80.6187 36.4868 84.0428 47.0888 83.9996C57.6909 83.9564 67.9881 80.4483 76.4114 74.0099C84.8348 67.5715 90.9222 58.5558 93.7462 48.3366C93.8762 47.878 93.9139 47.3982 93.8572 46.9249C93.8005 46.4516 93.6506 45.9942 93.416 45.5793C93.1815 45.1643 92.867 44.7999 92.4907 44.5073C92.1145 44.2146 91.6839 43.9994 91.224 43.8742Z"/>
    <path d="M22.1466 14.6311L27.9538 41.5327C28.2671 42.9765 29.058 44.2724 30.1986 45.2114C31.3392 46.1503 32.7629 46.6774 34.24 46.7076C35.717 46.7378 37.1611 46.2692 38.3391 45.3776C39.5171 44.486 40.3601 43.2234 40.7322 41.7937L46.9408 17.8224L53.1427 41.7937C53.5122 43.2266 54.3547 44.4929 55.5336 45.3873C56.7126 46.2817 58.159 46.7519 59.6385 46.7217C61.118 46.6915 62.544 46.1627 63.6855 45.2209C64.827 44.2791 65.6171 42.9796 65.9278 41.5327L71.7283 14.6311L74.7391 29.082L83.4365 28.413L82.5934 24.5595C81.6102 18.7219 80.2015 12.9641 78.3785 7.33198C75.4147 -1.59287 68.7244 -1.59287 66.8243 3.22414C64.9243 8.04115 59.3446 31.0223 59.3446 31.0223L53.3702 6.12772C53.0123 4.63216 52.206 3.28164 51.0594 2.25695C49.9127 1.23226 48.4804 0.582317 46.9542 0.394149C45.4267 0.581038 43.9929 1.2304 42.845 2.25519C41.697 3.27997 40.8898 4.6312 40.5315 6.12772L34.5571 31.0223C34.5571 31.0223 28.9774 8.06122 27.0706 3.22414C25.1639 -1.61294 18.4602 -1.59287 15.5165 7.33867C13.6895 12.9701 12.2786 18.7281 11.2949 24.5662L10.5123 29.082H19.2097L22.1466 14.6311Z"/>
    <path d="M19.2028 29.4132C19.2028 31.8131 17.2574 33.7586 14.8575 33.7586C12.4576 33.7586 10.5122 31.8131 10.5122 29.4132C10.5122 27.0134 12.4576 25.0679 14.8575 25.0679C17.2574 25.0679 19.2028 27.0134 19.2028 29.4132Z"/>
    <path d="M83.4361 28.7475C83.4361 31.1492 81.4891 33.0962 79.0874 33.0962C76.6857 33.0962 74.7387 31.1492 74.7387 28.7475C74.7387 26.3458 76.6857 24.3988 79.0874 24.3988C81.4891 24.3988 83.4361 26.3458 83.4361 28.7475Z"/>
  </svg>
);

// Dynamic greeting based on time of day with TARX branding
const getDynamicGreeting = (userName?: string): string => {
  const hour = new Date().getHours();
  const name = userName ? `, ${userName}` : '';

  // Time-based greetings with TARX flavor
  const greetings: string[] = [];

  if (hour >= 5 && hour < 12) {
    greetings.push(`Good morning${name}`, `Rise and build${name}`, `Morning${name}`);
  } else if (hour >= 12 && hour < 17) {
    greetings.push(`Good afternoon${name}`, `Let's ship${name}`, `Afternoon${name}`);
  } else if (hour >= 17 && hour < 21) {
    greetings.push(`Good evening${name}`, `Evening mode${name}`, `Let's build${name}`);
  } else {
    greetings.push(`Night owl${name}`, `Late session${name}`, `Building late${name}`);
  }

  // Add universal greetings
  greetings.push(`Ready to build${name}`, `TARX ready${name}`, `Let's go${name}`);

  return greetings[Math.floor(Math.random() * greetings.length)];
};

interface HeaderProps {
  logoUri: string;
  connectionStatus?: string;
  modelName?: string;
  userName?: string;
  onLogoClick?: () => void;
  onSettingsClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onLogoClick, userName }) => {
  // Dynamic greeting based on time of day
  const headerText = useMemo(() => getDynamicGreeting(userName), [userName]);

  return (
    <div className="tarx-header">
      <div className="tarx-logo-row">
        <span
          className="tarx-logo-icon tarx-logo-clickable"
          onClick={onLogoClick}
          style={{ cursor: onLogoClick ? 'pointer' : 'default' }}
          title="TARX"
        >
          <TarxLogoIcon />
        </span>
        <span className="tarx-logo-text" style={{ fontWeight: 700, letterSpacing: '0.5px' }}>{headerText}</span>
      </div>
    </div>
  );
};
