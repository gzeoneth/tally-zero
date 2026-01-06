/**
 * Feature component prop types for marketing page
 */

import { type StepTypeWithReactName } from "@/types/steps";

/** Props for the Feature component */
export type FeatureProps = {
  /** Step configuration to display */
  step: StepTypeWithReactName;
  /** Whether this feature is currently active/selected */
  isActive?: boolean;
} & React.ComponentPropsWithoutRef<"div">;
