/** The part of a setup step the progress rules need. */
export interface SetupStepState {
  readonly complete: boolean;
}

export interface SetupProgress {
  readonly done: number;
  readonly total: number;
}

/** How many of the steps are done. Computed from the steps, so the text and the checkboxes cannot disagree. */
export function setupProgress(steps: readonly SetupStepState[]): SetupProgress {
  return { done: steps.filter((step) => step.complete).length, total: steps.length };
}

/** The step to open first: the first one still to do, or none when everything is done. */
export function firstIncompleteIndex(steps: readonly SetupStepState[]): number | null {
  const index = steps.findIndex((step) => !step.complete);
  return index === -1 ? null : index;
}
