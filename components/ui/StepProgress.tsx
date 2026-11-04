/** Where someone is in a guided task: one line and one thin bar, whatever the screen size. */
export function StepProgress({ steps, current }: { steps: string[]; current: number }) {
  const finished = current >= steps.length;
  const reached = Math.min(current + (finished ? 0 : 1), steps.length);
  return (
    <div className="step-progress">
      <p className="step-progress-label" role="status">
        {finished ? "All steps done" : `Step ${current + 1} of ${steps.length}: ${steps[current]}`}
      </p>
      <span className="step-progress-bar" aria-hidden="true">
        <span style={{ width: `${(reached / steps.length) * 100}%` }} />
      </span>
    </div>
  );
}
