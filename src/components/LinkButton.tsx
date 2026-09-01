import { Link } from "@tanstack/react-router";
import { type ReactNode } from "react";

interface LinkButtonProps {
  to: string;
  title: string;
  children: ReactNode;
  isActive?: boolean;
  className?: string; // For margin tops etc
  tooltip?: boolean;
}

export function LinkButton({
  to,
  title,
  children,
  isActive,
  className = "",
  tooltip = false,
}: LinkButtonProps) {
  className = className + (isActive ? " bg-muted" : "");

  return (
    <Link
      to={to}
      hash={(prevHash) => prevHash!}
      aria-label={title}
      data-menu-tooltip={tooltip ? title : undefined}
      className={tooltip ? "menu-tooltip" : undefined}
      title={tooltip ? undefined : title}
    >
      <div className={`p-[8px] rounded-full hover:bg-muted ${className}`}>
        {children}
      </div>
    </Link>
  );
}
