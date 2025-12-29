"use client";

import { ReactNode } from "react";

import { Dialog, DialogTrigger } from "@/components/ui/Dialog";
import { Drawer, DrawerTrigger } from "@/components/ui/Drawer";
import { useMediaQuery } from "@/hooks/use-media-query";

export interface ResponsiveModalProps {
  trigger: ReactNode;
  children: ReactNode;
}

export function ResponsiveModal({ trigger, children }: ResponsiveModalProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    return (
      <Dialog>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        {children}
      </Dialog>
    );
  }

  return (
    <Drawer>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      {children}
    </Drawer>
  );
}

export function useIsDesktop() {
  return useMediaQuery("(min-width: 768px)");
}
