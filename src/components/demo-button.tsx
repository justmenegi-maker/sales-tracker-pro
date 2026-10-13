"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";

/** Signs into the seeded demo workspace and opens the requested route. */
export function DemoButton({
  role = "branch",
  href = "/dashboard",
  children,
  variant = "default",
  className,
  size = "default",
}: {
  role?: "admin" | "branch";
  href?: string;
  children: React.ReactNode;
  variant?: "default" | "outline" | "secondary" | "ghost";
  className?: string;
  size?: "default" | "sm" | "lg";
}) {
  const { signInDemo } = useAppStore();
  const router = useRouter();

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={() => {
        signInDemo(role);
        router.push(href);
      }}
    >
      {children}
    </Button>
  );
}
