import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchStudents } from "../api";

interface MentionTextareaProps {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  className: string;
  maxLength: number;
  placeholder: string;
  rows?: number;
  ariaLabel?: string;
  autoFocus?: boolean;
}

export function MentionTextarea({
  id,
  value,
  onValueChange,
  className,
  maxLength,
  placeholder,
  rows,
  ariaLabel,
  autoFocus,
}: MentionTextareaProps) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const mentionRange = useRef<{ start: number; end: number } | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const suggestions = useQuery({
    queryKey: ["mention-suggestions", debouncedQuery],
    enabled: debouncedQuery.length > 0,
    staleTime: 30_000,
    queryFn: () => searchStudents(debouncedQuery, 8),
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  function updateMentionQuery(nextValue: string, cursor: number) {
    const beforeCursor = nextValue.slice(0, cursor);
    const match = beforeCursor.match(/(?:^|\s)@([A-Za-z0-9._-]{1,30})$/);
    if (!match) {
      mentionRange.current = null;
      setQuery("");
      return;
    }

    const username = match[1];
    if (username === undefined) {
      mentionRange.current = null;
      setQuery("");
      return;
    }

    const boundaryLength = match[0].length - username.length - 1;
    const start = cursor - match[0].length + boundaryLength;
    mentionRange.current = { start, end: cursor };
    setQuery(username);
  }

  function choose(username: string) {
    const range = mentionRange.current;
    if (!range) return;
    const replacement = `@${username} `;
    const nextValue = `${value.slice(0, range.start)}${replacement}${value.slice(range.end)}`;
    const cursor = range.start + replacement.length;
    onValueChange(nextValue);
    mentionRange.current = null;
    setQuery("");
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(cursor, cursor);
    });
  }

  const rowsFound = suggestions.data ?? [];
  const showSuggestions = query.length > 0;

  return (
    <div className="relative">
      <textarea
        ref={textarea}
        id={id}
        className={className}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={showSuggestions}
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          updateMentionQuery(event.target.value, event.target.selectionStart);
        }}
        onClick={(event) => updateMentionQuery(event.currentTarget.value, event.currentTarget.selectionStart)}
        onKeyUp={(event) => updateMentionQuery(event.currentTarget.value, event.currentTarget.selectionStart)}
      />
      {showSuggestions && <div className="absolute inset-x-0 bottom-full z-20 mb-1 max-h-56 overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-xl" role="listbox" aria-label="People to mention">
        {suggestions.isLoading && <p className="px-3 py-2 text-xs text-muted">Searching people…</p>}
        {!suggestions.isLoading && suggestions.isError && <p role="status" className="px-3 py-2 text-xs text-muted">People search is unavailable.</p>}
        {!suggestions.isLoading && !suggestions.isError && rowsFound.length === 0 && <p className="px-3 py-2 text-xs text-muted">No matching people.</p>}
        {rowsFound.map((person) => <button
          key={person.id}
          type="button"
          role="option"
          aria-selected="false"
          className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-[#fff4f2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => choose(person.username)}
        >
          <span className="truncate text-sm font-semibold text-fg">{person.display_name}</span>
          <span className="shrink-0 text-xs text-muted">@{person.username}</span>
        </button>)}
      </div>}
    </div>
  );
}
