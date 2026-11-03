/** Placeholder shapes while a page loads. The label is what screen readers hear; the shapes are hidden from them. */
export function SkeletonList({ label, rows = 5 }: { label: string; rows?: number }) {
  return (
    <div role="status">
      <span className="visually-hidden">{label}</span>
      <div className="skeleton-heading skeleton" aria-hidden="true" />
      <div className="skeleton-list" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="skeleton-card skeleton" />
        ))}
      </div>
    </div>
  );
}
