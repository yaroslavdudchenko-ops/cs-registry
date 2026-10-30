import { SYSTEM_TYPE_OPTIONS_GROUPED, systemTypeOptionLabel } from "@/lib/labels";

export const SYSTEM_TYPE_SELECT_CLASS =
  "w-auto min-w-full max-w-full field-sizing-content";

export function SystemTypeSelectOptions({
  includeAllLabel,
}: {
  includeAllLabel?: string;
}): React.JSX.Element {
  return (
    <>
      {includeAllLabel !== undefined ? <option value="">{includeAllLabel}</option> : null}
      {SYSTEM_TYPE_OPTIONS_GROUPED.map((entry) => (
        <optgroup key={entry.group} label={entry.group}>
          {entry.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
      ))}
      <option value="other">{systemTypeOptionLabel("other")}</option>
    </>
  );
}
