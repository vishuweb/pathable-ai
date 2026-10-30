"use client";

import { useEffect, useRef, useState } from "react";
import { NEED_GROUPS, NEED_GROUP_INFO, needsInGroup, type NeedPreferences } from "@/lib/needs";
import { usePreferences } from "@/lib/use-preferences";

/** Choose any combination of access needs; stored only in this browser. */
export function NeedsPreferences() {
  const { preferences, loaded, save, clear } = usePreferences();
  const [draft, setDraft] = useState<NeedPreferences>(preferences);
  const [message, setMessage] = useState("");
  const copied = useRef(false);

  // Start editing from the stored choices once they have been read, then leave the draft alone.
  useEffect(() => {
    if (loaded && !copied.current) {
      copied.current = true;
      setDraft(preferences);
    }
  }, [loaded, preferences]);

  const toggle = (id: string, on: boolean) =>
    setDraft((d) => ({ ...d, needs: on ? [...d.needs, id] : d.needs.filter((n) => n !== id) }));

  const onSave = (event: React.FormEvent) => {
    event.preventDefault();
    const stored = save(draft);
    const count = draft.needs.length;
    setMessage(
      stored
        ? `Saved on this device: ${count} ${count === 1 ? "need" : "needs"}${draft.other.trim() ? " and a note" : ""}.`
        : "Your browser blocked saving, so these choices last only until you leave the page.",
    );
  };

  const onClear = () => {
    clear();
    setDraft({ needs: [], other: "" });
    setMessage("All your choices were removed from this device.");
  };

  return (
    <form onSubmit={onSave} className="needs-form">
      {NEED_GROUPS.map((group) => (
        <fieldset key={group} className="field-group need-group">
          <legend>{NEED_GROUP_INFO[group].label}</legend>
          <p className="muted">{NEED_GROUP_INFO[group].description}</p>
          <div className="need-options">
            {needsInGroup(group).map((need) => (
              <label key={need.id} className="need-option">
                <input
                  type="checkbox"
                  checked={draft.needs.includes(need.id)}
                  onChange={(e) => toggle(need.id, e.target.checked)}
                />
                <span>{need.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <label className="field">
        <span>
          Anything else? <span className="muted">(optional, stays on this device)</span>
        </span>
        <textarea
          rows={2}
          maxLength={300}
          value={draft.other}
          onChange={(e) => setDraft((d) => ({ ...d, other: e.target.value }))}
        />
      </label>

      <div className="needs-actions">
        <button type="submit" className="button-primary">
          Save my needs
        </button>
        <button type="button" className="button-secondary" onClick={onClear}>
          Remove all
        </button>
      </div>
      <p className="muted" role="status">
        {message}
      </p>
    </form>
  );
}
