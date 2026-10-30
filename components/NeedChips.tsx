import { NEED_GROUP_INFO, type NeedGroup } from "@/lib/needs";

/** Which kinds of access need a barrier may affect, as text (never colour alone). */
export function NeedChips({ needs, label = "May affect" }: { needs: NeedGroup[]; label?: string }) {
  if (!needs.length) return null;
  return (
    <p className="need-chips">
      <span className="need-chips-label">{label}:</span>{" "}
      {needs.map((need, i) => (
        <span key={need}>
          <span className={`need-chip need-${need}`}>{NEED_GROUP_INFO[need].short}</span>
          {i < needs.length - 1 && " "}
        </span>
      ))}
    </p>
  );
}
