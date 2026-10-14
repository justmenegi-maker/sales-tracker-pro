"use client";

import React, { useState } from "react";
import { Download, Share2, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePWAInstall } from "@/lib/use-pwa-install";
import { cn } from "@/lib/utils";

interface PWAInstallButtonProps {
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
  showLabel?: boolean;
}

export function PWAInstallButton({
  className,
  variant = "outline",
  size = "sm",
  showLabel = true,
}: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showGenericGuide, setShowGenericGuide] = useState(false);

  // If already installed or running as standalone PWA, hide
  if (isInstalled) {
    return null;
  }

  // Native Chromium install flow
  if (isInstallable) {
    return (
      <Button
        variant={variant}
        size={size}
        onClick={install}
        className={cn(
          "gap-2 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary transition-all",
          className
        )}
        title="Install SK Tapri as an App"
      >
        <Download className="size-4 animate-bounce" />
        {showLabel && <span>Install App</span>}
      </Button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <Button
          variant={variant}
          size={size}
          onClick={() => setShowIOSGuide(true)}
          className={cn(
            "gap-2 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary transition-all",
            className
          )}
          title="Install on iPhone / iPad"
        >
          <Smartphone className="size-4" />
          {showLabel && <span>Install App</span>}
        </Button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-sm rounded-xl border bg-background p-6 shadow-2xl animate-rise">
              <button
                onClick={() => setShowIOSGuide(false)}
                className="absolute top-4 right-4 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>

              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
                  <Smartphone className="size-5" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-foreground">
                    Install on iPhone / iPad
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Add SK Tapri to your home screen
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3 text-sm">
                <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    1
                  </span>
                  <div className="text-xs leading-relaxed text-muted-foreground">
                    Tap the{" "}
                    <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                      <Share2 className="size-3.5" /> Share
                    </span>{" "}
                    button in the Safari toolbar at the bottom of your screen.
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    2
                  </span>
                  <div className="text-xs leading-relaxed text-muted-foreground">
                    Scroll down and tap{" "}
                    <strong className="text-foreground">
                      Add to Home Screen
                    </strong>
                    .
                  </div>
                </div>
              </div>

              <Button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full"
                size="sm"
              >
                Got it
              </Button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Fallback for desktop browsers before prompt triggers or if user wants install info
  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setShowGenericGuide(true)}
        className={cn(
          "gap-2 border-primary/20 text-muted-foreground hover:text-foreground hover:border-primary/40",
          className
        )}
        title="App Installation"
      >
        <Smartphone className="size-4 text-primary" />
        {showLabel && <span>App</span>}
      </Button>

      {showGenericGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-sm rounded-xl border bg-background p-6 shadow-2xl animate-rise">
            <button
              onClick={() => setShowGenericGuide(false)}
              className="absolute top-4 right-4 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Download className="size-5" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-foreground">
                  Install SK Tapri
                </h3>
                <p className="text-xs text-muted-foreground">
                  Progressive Web App
                </p>
              </div>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              To install SK Tapri for offline quick access:
            </p>

            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs text-muted-foreground">
              <li>
                In <strong>Chrome / Edge</strong>: Click the install icon in the URL bar (right side) or select <em>Install SK Tapri</em> from the browser menu.
              </li>
              <li>
                On <strong>Mobile</strong>: Tap the menu (three dots) and choose <em>Install app</em> or <em>Add to Home screen</em>.
              </li>
            </ul>

            <Button
              onClick={() => setShowGenericGuide(false)}
              className="mt-5 w-full"
              size="sm"
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
