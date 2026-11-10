import { useEffect, useId, useState, type KeyboardEvent } from "react";
import type { InstitutionOption } from "./api";

interface InstitutionPickerProps {
  id: string;
  selectedId: string;
  institutions: readonly InstitutionOption[];
  onChange: (institutionId: string) => void;
  isLoading?: boolean;
  isError?: boolean;
}

export function InstitutionPicker({
  id,
  selectedId,
  institutions,
  onChange,
  isLoading = false,
  isError = false,
}: InstitutionPickerProps) {
  const listboxId = useId();
  const selected = institutions.find((institution) => institution.id === selectedId);
  const [query, setQuery] = useState(selected?.name ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!isEditing) setQuery(selected?.name ?? "");
  }, [isEditing, selected?.name]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = institutions.filter((institution) =>
    `${institution.name} ${institution.short_name ?? ""}`
      .toLocaleLowerCase()
      .includes(normalizedQuery),
  );
  const activeOption = filtered[activeIndex];

  function choose(institutionId: string) {
    const institution = institutions.find((item) => item.id === institutionId);
    onChange(institutionId);
    setQuery(institution?.name ?? "");
    setIsEditing(false);
    setIsOpen(false);
    setActiveIndex(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && isOpen && activeOption) {
      event.preventDefault();
      choose(activeOption.id);
    } else if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      setIsOpen(false);
      setIsEditing(false);
      setQuery(selected?.name ?? "");
    }
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          role="combobox"
          className="input min-w-0 flex-1"
          value={query}
          placeholder="Search by institution name or short name"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={isOpen && activeOption ? `${listboxId}-${activeIndex}` : undefined}
          aria-describedby={`${id}-hint`}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setIsOpen(false)}
          onKeyDown={handleKeyDown}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsEditing(true);
            setIsOpen(true);
            setActiveIndex(0);
            if (selectedId) onChange("");
          }}
        />
        {selectedId && (
          <button
            type="button"
            className="btn shrink-0"
            aria-label="Clear institution"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose("")}
          >
            Clear
          </button>
        )}
      </div>
      <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
        {isLoading
          ? "Loading institutions…"
          : isError
            ? "Could not load institutions. Please refresh and try again."
            : `${institutions.length} institutions available. Type to filter the list.`}
      </p>
      {isError && <p role="alert" className="sr-only">Could not load institutions.</p>}
      {isOpen && !isLoading && !isError && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Institutions"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-xl"
        >
          {filtered.length > 0 ? filtered.map((institution, index) => (
            <button
              key={institution.id}
              id={`${listboxId}-${index}`}
              type="button"
              role="option"
              aria-selected={institution.id === selectedId}
              tabIndex={-1}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-primary/5 ${activeIndex === index ? "bg-primary/5" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(institution.id)}
            >
              <span className="block font-medium">{institution.name}</span>
              {institution.short_name && <span className="block text-xs text-muted">{institution.short_name}</span>}
            </button>
          )) : (
            <p className="px-3 py-3 text-sm text-muted">No matching institutions. Try another name or short name.</p>
          )}
        </div>
      )}
    </div>
  );
}
