import * as React from "react";

export function VercelBadge({
  href = "https://vercel.com/new",
  className,
}: {
  href?: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      aria-label="Deploy on Vercel"
    >
      <svg
        width="141"
        height="24"
        viewBox="0 0 141 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M141 0H0v17.978h141V0ZM28.208 14.478h13.869v5.867H28.208V14.478ZM21.069 11.627h8.334V5.169H21.069V11.627ZM17.054 12.004h2.731V4.097H17.054V12.004ZM12.554 12.584h2.731v-2.744H12.554v2.744ZM33.462 7.397l1.317-2.819-3.217-8.53H27.908l1.885 5.001 3.633 9.186l1.119-4.82-1.328-3.508h5.345l1.048 4.82 1.048-4.82h2.097l1.127 5.448-1.328 3.596 4.23 11.208h-6.792l-14.336-37.978h8.108l.557 2.647H33.462V7.397Z"
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
        />
      </svg>
    </a>
  );
}
