"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const subscribeEmpty = () => () => {};

function subscribeToStandalone(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", callback);
  window.addEventListener("appinstalled", callback);
  return () => {
    mq.removeEventListener("change", callback);
    window.removeEventListener("appinstalled", callback);
  };
}

function getIsStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone ===
      true
  );
}

function getIsIOS() {
  if (typeof window === "undefined") return false;
  const userAgent = window.navigator.userAgent.toLowerCase();
  return (
    /iphone|ipad|ipod/.test(userAgent) &&
    !(window.navigator as unknown as { MSStream?: boolean }).MSStream
  );
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  const isStandalone = useSyncExternalStore(
    subscribeToStandalone,
    getIsStandalone,
    () => false
  );
  const isIOS = useSyncExternalStore(subscribeEmpty, getIsIOS, () => false);

  useEffect(() => {
    // 1. Register service worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            console.log("[PWA] Service worker registered with scope:", reg.scope);
          })
          .catch((err) => {
            console.warn("[PWA] Service worker registration failed:", err);
          });
      });
    }

    // 2. Capture beforeinstallprompt event inside event callback
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled: isStandalone,
    isIOS,
    install,
  };
}
