"use client";

import { useEffect, useRef, useState } from "react";
import { NEED_GROUPS, NEED_GROUP_INFO, needsInGroup, type NeedGroup, type NeedPreferences } from "@/lib/needs";
import { usePreferences } from "@/lib/use-preferences";
import { Icon } from "./ui/Icon";
import { useToast } from "./ui/Toast";

/** Choose any combination of access needs; stored only in this browser. */
export function NeedsPreferences() {
  const { preferences, loaded, save, clear } = usePreferences();
  const toast = useToast();
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

  const setAll = (group: NeedGroup) =>
    setDraft((d) => {
      const ids = needsInGroup(group).map((n) => n.id);
      const on = ids.every((id) => d.needs.includes(id));
      return { ...d, needs: on ? d.needs.filter((n) => !ids.includes(n)) : [...new Set([...d.needs, ...ids])] };
    });

  const onSave = (event: React.FormEvent) => {
    event.preventDefault();
    const stored = save(draft);
    const count = draft.needs.length;
    const text = stored
      ? `Saved on this device: ${count} ${count === 1 ? "need" : "needs"}${draft.other.trim() ? " and a note" : ""}.`
      : "Your browser blocked saving, so these choices last only until you leave the page.";
    setMessage(text);
    toast(text, stored ? "ok" : "error");
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
          <legend>
            <Icon name={group} /> {NEED_GROUP_INFO[group].label}
          </legend>
          <p className="muted">{NEED_GROUP_INFO[group].description}</p>
          <p className="need-group-all">
            <button type="button" className="button-link" onClick={() => setAll(group)}>
              {needsInGroup(group).every((n) => draft.needs.includes(n.id)) ? "Clear these" : "Choose all of these"}
              <span className="visually-hidden">: {NEED_GROUP_INFO[group].label}</span>
            </button>
          </p>
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
