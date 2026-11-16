import { useState } from "react";
import { applyTheme, readTheme, type ThemeChoice } from "./theme";

const CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function ThemeSwitch() {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme);
  return (
    <fieldset className="theme-switch">
      <legend>Theme</legend>
      {CHOICES.map((c) => (
        <label key={c.value}>
          <input
            type="radio"
            name="theme"
            value={c.value}
            checked={choice === c.value}
            onChange={() => {
              setChoice(c.value);
              applyTheme(c.value);
            }}
          />
          {c.label}
        </label>
      ))}
    </fieldset>
  );
}
