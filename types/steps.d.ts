import { type ComponentType, type SVGProps } from "react";

export type StepType = {
  name: string;
  summary: string;
  description: string;
  image: string;
  icon: ComponentType<SVGProps<SVGSVGElement>> | (() => JSX.Element);
};
