"use client";

import { ReactNode, useCallback, useState } from "react";

import { Dialog, DialogTrigger } from "@/components/ui/Dialog";
import { Drawer, DrawerTrigger } from "@/components/ui/Drawer";
import { useMediaQuery } from "@/hooks/use-media-query";

export interface ResponsiveModalProps {
  trigger: ReactNode;
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
}

export function ResponsiveModal({
  trigger,
  children,
  onOpenChange,
}: ResponsiveModalProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [open, setOpen] = useState(false);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      setOpen(newOpen);
      onOpenChange?.(newOpen);
    },
    [onOpenChange]
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        {children}
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      {children}
    </Drawer>
  );
}

export function useIsDesktop() {
  return useMediaQuery("(min-width: 768px)");
}
