import { type StepTypeWithReactName } from "@/types/steps";

export type FeatureProps = {
  step: StepTypeWithReactName;
  isActive?: boolean;
} & React.ComponentPropsWithoutRef<"div">;
