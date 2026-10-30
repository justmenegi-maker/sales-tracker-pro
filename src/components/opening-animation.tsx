"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Store, Sparkles } from "lucide-react";

const subscribeEmpty = () => () => {};

function getShouldShowIntro() {
  if (typeof window === "undefined") return false;
  try {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReducedMotion) return false;

    const seen = sessionStorage.getItem("sktapri_intro_played");
    return !seen;
  } catch {
    return true;
  }
}

export function OpeningAnimation() {
  const isClient = useSyncExternalStore(subscribeEmpty, () => true, () => false);
  const shouldShow = useSyncExternalStore(subscribeEmpty, getShouldShowIntro, () => false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!shouldShow) return;

    try {
      sessionStorage.setItem("sktapri_intro_played", "true");
    } catch {
      // Safe fallback
    }

    // Auto-dismiss after 1.1s for a quick, subtle intro
    const timer = setTimeout(() => {
      setDismissed(true);
    }, 1100);

    return () => clearTimeout(timer);
  }, [shouldShow]);

  if (!isClient || !shouldShow || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="app-opening-splash"
        initial={{ opacity: 1 }}
        exit={{
          opacity: 0,
          scale: 1.03,
          transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
        }}
        onClick={() => setDismissed(true)}
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background select-none cursor-pointer overflow-hidden"
        title="Click to enter immediately"
      >
        {/* Subtle paper grid pattern wash */}
        <div
          aria-hidden
          className="paper-grid pointer-events-none absolute inset-0 opacity-40"
        />

        {/* Ambient soft glow blooms */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 0.6, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          aria-hidden
          className="pointer-events-none absolute -top-12 size-96 rounded-full bg-primary/15 blur-3xl"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 0.5, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.1, ease: "easeOut" }}
          aria-hidden
          className="pointer-events-none absolute -bottom-16 size-96 rounded-full bg-accent/40 blur-3xl"
        />

        {/* Center brand presentation */}
        <div className="relative z-10 flex flex-col items-center">
          {/* Animated Logo Badge */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{
              duration: 0.6,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="relative mb-5"
          >
            {/* Outer soft pulse ring */}
            <motion.div
              animate={{
                scale: [1, 1.15, 1],
                opacity: [0.4, 0.1, 0.4],
              }}
              transition={{
                repeat: Infinity,
                duration: 2,
                ease: "easeInOut",
              }}
              className="absolute -inset-2 rounded-2xl bg-primary/20 blur-sm"
            />

            <div className="relative grid size-16 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-xl ring-2 ring-primary/30">
              <Store className="size-8 text-primary-foreground" />
              <motion.span
                initial={{ rotate: -20, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                transition={{ delay: 0.25, duration: 0.4 }}
                className="absolute -top-1 -right-1 text-amber-300 drop-shadow"
              >
                <Sparkles className="size-4" />
              </motion.span>
            </div>
          </motion.div>

          {/* Brand Title */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
            className="text-center"
          >
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              SK Tapri
            </h1>
            <p className="mt-1 text-xs uppercase tracking-[0.24em] font-medium text-muted-foreground">
              Daily Sales Report
            </p>
          </motion.div>

          {/* Subtle Progress shimmer line */}
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 140, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.25, ease: "easeInOut" }}
            className="mt-6 h-[2.5px] rounded-full bg-gradient-to-r from-transparent via-primary to-transparent"
          />
        </div>

        {/* Quick tap-to-enter hint at bottom */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          transition={{ delay: 0.6, duration: 0.4 }}
          className="absolute bottom-8 text-[11px] tracking-wider uppercase text-muted-foreground font-mono"
        >
          Opening workspace…
        </motion.p>
      </motion.div>
    </AnimatePresence>
  );
}
