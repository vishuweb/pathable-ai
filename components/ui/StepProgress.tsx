/** Where someone is in a guided task. The full list on wide screens; "Step 3 of 8" and a bar on phones. */
export function StepProgress({ steps, current }: { steps: string[]; current: number }) {
  const finished = current >= steps.length;
  return (
    <nav aria-label="Progress" className="step-progress">
      <p className="step-progress-compact">
        <strong>{finished ? "All steps done" : `Step ${current + 1} of ${steps.length}: ${steps[current]}`}</strong>
        <span className="step-progress-bar" aria-hidden="true">
          <span style={{ width: `${(Math.min(current + (finished ? 0 : 1), steps.length) / steps.length) * 100}%` }} />
        </span>
      </p>
      <ol>
        {steps.map((label, i) => (
          <li key={label} className={i < current ? "step-done" : i === current ? "step-current" : undefined} aria-current={i === current ? "step" : undefined}>
            <span className="step-dot" aria-hidden="true">
              {i < current ? "✓" : i + 1}
            </span>
            {label}
            {i < current && <span className="visually-hidden"> (done)</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
