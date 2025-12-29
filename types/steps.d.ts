import { type ComponentType, type ReactNode, type SVGProps } from "react";

export type StepType = {
  name: string;
  summary: string;
  description: string;
  image: string;
  icon: ComponentType<SVGProps<SVGSVGElement>> | (() => JSX.Element);
};

/** Extended type used when name is rendered as JSX (in desktop view) */
export type StepTypeWithReactName = Omit<StepType, "name"> & {
  name: ReactNode;
};
