import {
  createContext,
  useContext,
  useId,
  useState,
  useEffect,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import {
  listCategories,
  listId,
  listOptions,
  normalise,
  type ListCategory,
  type ListValue,
} from "./collaboration";
import type { StudioData, StudioMember } from "./studio-model";
import { Button, Empty } from "./components";
import "./collaboration.css";
type LibraryContextType = {
  data: StudioData;
  member: StudioMember;
  onSave: (entry: ListValue) => Promise<void>;
};
const LibraryContext = createContext<LibraryContextType | null>(null);
export function LibraryProvider({
  children,
  ...props
}: LibraryContextType & { children: ReactNode }) {
  return (
    <LibraryContext.Provider value={props}>{children}</LibraryContext.Provider>
  );
}
export function SmartField({
  label,
  name,
  category,
  value = "",
  onChange,
  required = false,
  placeholder = "Search or type a new value",
  maxLength = 120,
}: {
  label: string;
  name: string;
  category: ListCategory;
  value?: string;
  onChange?: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
}) {
  const context = useContext(LibraryContext),
    id = useId(),
    [text, setText] = useState(value),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(-1),
    [adding, setAdding] = useState(false),
    [error, setError] = useState("");
  const current = onChange ? value : text,
    options = context ? listOptions(context.data, category) : [],
    filtered = options
      .filter((v) => v.toLowerCase().includes(current.trim().toLowerCase()))
      .slice(0, 40),
    isNew =
      !!normalise(current) &&
      !options.some(
        (v) => v.toLowerCase() === normalise(current).toLowerCase(),
      );
  const change = (v: string) => {
    setText(v);
    onChange?.(v);
    setActive(-1);
  };
  const choose = (v: string) => {
    change(v);
    setOpen(false);
  };
  const keyboard = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((a) =>
        event.key === "ArrowDown"
          ? Math.min(a + 1, filtered.length - 1)
          : Math.max(a - 1, 0),
      );
    }
    if (event.key === "Escape") setOpen(false);
    if (event.key === "Enter" && open && active >= 0 && filtered[active]) {
      event.preventDefault();
      choose(filtered[active]);
    }
  };
  const add = async () => {
    if (!context || adding) return;
    setAdding(true);
    setError("");
    try {
      const val = normalise(current);
      await context.onSave({
        id: listId(category, val),
        category,
        value: val,
        active: true,
      });
      choose(val);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  };
  useEffect(() => {
    if (open && active >= 0)
      document
        .getElementById(`${id}-option-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open, id]);
  return (
    <div
      className="smart-field"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <label className="field" htmlFor={id}>
        <span>
          {label}
          {required && <i> *</i>}
        </span>
      </label>
      <div className="smart-input">
        <input
          id={id}
          name={name}
          value={current}
          required={required}
          maxLength={maxLength}
          placeholder={placeholder}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          aria-activedescendant={
            active >= 0 ? `${id}-option-${active}` : undefined
          }
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            change(e.target.value);
            setOpen(true);
          }}
          onKeyDown={keyboard}
          onBlur={(e) => {
            if (
              !e.currentTarget.parentElement?.parentElement?.contains(
                e.relatedTarget,
              )
            )
              setOpen(false);
          }}
        />
        <button
          type="button"
          aria-label={`Show ${label} choices`}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDown size={17} />
        </button>
      </div>
      {open && (
        <div className="smart-menu">
          <div
            id={`${id}-options`}
            role="listbox"
            aria-label={`${label} choices`}
          >
            {filtered.map((v, i) => (
              <button
                type="button"
                id={`${id}-option-${i}`}
                key={v}
                role="option"
                tabIndex={-1}
                aria-selected={active === i || current === v}
                onClick={() => choose(v)}
                onMouseDown={(e) => e.preventDefault()}
              >
                {v}
              </button>
            ))}
            {!filtered.length && (
              <p>No matching saved choice. You can use what you typed.</p>
            )}
          </div>
          {isNew && context?.member.role !== "client" && (
            <button
              type="button"
              className="smart-add"
              disabled={adding}
              onClick={add}
            >
              <Plus size={15} />
              {adding
                ? "Saving choice…"
                : `Save “${normalise(current)}” as a choice`}
            </button>
          )}
          <button
            type="button"
            className="smart-done"
            onClick={() => setOpen(false)}
          >
            Done
          </button>
        </div>
      )}
      {error && (
        <small role="alert" className="studio-error">
          {error}
        </small>
      )}
    </div>
  );
}
export function ListManager() {
  const context = useContext(LibraryContext),
    [category, setCategory] = useState<ListCategory>("rooms"),
    [newValue, setNewValue] = useState(""),
    [editing, setEditing] = useState<string | null>(null),
    [rename, setRename] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (!context || context.member.role !== "owner") return null;
  const { data, onSave } = context,
    values = listOptions(data, category),
    archived = (data.listValues || []).filter(
      (v) => v.category === category && !v.active,
    );
  const save = async (value: string, active = true, old?: string) => {
    setError("");
    const v = normalise(value);
    if (!v || v.length > 120) {
      setError("Use a name of 1–120 characters.");
      return;
    }
    setBusy(true);
    try {
      await onSave({ id: listId(category, v), category, value: v, active });
      if (old && old.toLowerCase() !== v.toLowerCase())
        await onSave({
          id: listId(category, old),
          category,
          value: old,
          active: false,
        });
      setNewValue("");
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="studio-panel">
      <div className="studio-section-heading">
        <div>
          <h2>Company choices</h2>
          <p>
            Keep common names consistent. Renaming adds the new choice and
            archives the old one; existing records stay unchanged.
          </p>
        </div>
      </div>
      <label className="field">
        <span>Choose a list to manage</span>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value as ListCategory);
            setEditing(null);
            setError("");
          }}
        >
          {Object.entries(listCategories).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="library-add">
        <label className="field">
          <span>Add a choice</span>
          <input
            maxLength={120}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="Type the new name"
          />
        </label>
        <Button
          disabled={busy || !newValue.trim()}
          onClick={() => save(newValue)}
        >
          Add choice
        </Button>
      </div>
      {error && (
        <p role="alert" className="studio-error">
          {error}
        </p>
      )}
      <div className="library-list">
        {values.map((value) => (
          <div className="library-row" key={value}>
            {editing === value ? (
              <>
                <input
                  aria-label={`New name for ${value}`}
                  maxLength={120}
                  value={rename}
                  onChange={(e) => setRename(e.target.value)}
                />
                <Button
                  disabled={busy}
                  onClick={() => save(rename, true, value)}
                >
                  Save name
                </Button>
                <Button onClick={() => setEditing(null)}>Cancel</Button>
              </>
            ) : (
              <>
                <b>{value}</b>
                <Button
                  disabled={busy}
                  onClick={() => {
                    setEditing(value);
                    setRename(value);
                  }}
                >
                  Rename
                </Button>
                <Button disabled={busy} onClick={() => save(value, false)}>
                  Archive
                </Button>
              </>
            )}
          </div>
        ))}
      </div>
      {!values.length && (
        <Empty
          title="Build your company’s list"
          text="Add the names your team uses most often."
        />
      )}
      {archived.length > 0 && (
        <details>
          <summary>Archived choices · {archived.length}</summary>
          {archived.map((v) => (
            <div key={v.id} className="library-row">
              <span>{v.value}</span>
              <Button disabled={busy} onClick={() => save(v.value, true)}>
                Restore
              </Button>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
