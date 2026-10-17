import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { ChevronDown, Check, Plus } from "lucide-react";
import type { MoneyCategory, StudioPayment } from "./studio-model";
import {
  categoryNameKey,
  initialTransactionCategory,
  transactionCategoryOptions,
} from "./money";

export function MoneyCategoryPicker({
  categories,
  type,
  currentId = "",
  disabled,
}: {
  categories: MoneyCategory[];
  type: StudioPayment["type"];
  currentId?: string;
  disabled: boolean;
}) {
  const id = useId(),
    [value, setValue] = useState(
      () => initialTransactionCategory(categories, type, currentId)?.name || "",
    ),
    [open, setOpen] = useState(false),
    [searching, setSearching] = useState(false),
    [active, setActive] = useState(-1);
  const options = transactionCategoryOptions(
      categories,
      type,
      currentId,
    ).filter(
      (c) =>
        !searching || categoryNameKey(c.name).includes(categoryNameKey(value)),
    ),
    exact = categories.find(
      (c) =>
        c.type === type && categoryNameKey(c.name) === categoryNameKey(value),
    ),
    isNew = !!value.trim() && !exact;
  const choose = (name: string) => {
    setValue(name);
    setOpen(false);
    setSearching(false);
    setActive(-1);
  };
  const keyboard = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((v) =>
        e.key === "ArrowDown"
          ? Math.min(v + 1, options.length - 1)
          : Math.max(0, v - 1),
      );
    }
    if (e.key === "Enter" && open) {
      e.preventDefault();
      if (active >= 0 && options[active]) choose(options[active].name);
      else if (isNew) choose(value.trim().replace(/\s+/g, " "));
      else setOpen(false);
    }
  };
  useEffect(() => {
    if (open && active >= 0)
      document
        .getElementById(`${id}-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [id, open, active]);
  return (
    <div
      className="money-category-picker"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <label className="field" htmlFor={id}>
        <span>
          Category<i> *</i>
        </span>
      </label>
      <div className="money-category-input">
        <input
          id={id}
          name="categoryName"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-choices`}
          aria-activedescendant={
            open && active >= 0 ? `${id}-${active}` : undefined
          }
          autoComplete="off"
          value={value}
          placeholder="Select or type a category"
          maxLength={60}
          required
          disabled={disabled}
          onFocus={() => {
            setOpen(true);
            setSearching(false);
          }}
          onChange={(e) => {
            setValue(e.target.value);
            setSearching(true);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={keyboard}
        />
        <button
          type="button"
          aria-label="Show category choices"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => {
            setOpen((v) => !v);
            setSearching(false);
            setActive(-1);
          }}
        >
          <ChevronDown size={18} />
        </button>
      </div>
      {open && (
        <div className="money-category-menu">
          <div
            role="listbox"
            id={`${id}-choices`}
            aria-label="Category choices"
          >
            {options.map((c, i) => (
              <button
                key={c.id}
                id={`${id}-${i}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={
                  active === i ||
                  categoryNameKey(c.name) === categoryNameKey(value)
                }
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(c.name)}
              >
                <i style={{ background: c.color }} />
                <span>
                  {c.name}
                  {!c.active && (
                    <small>Archived · current transaction only</small>
                  )}
                </span>
                {categoryNameKey(c.name) === categoryNameKey(value) && (
                  <Check size={16} />
                )}
              </button>
            ))}
          </div>
          {!options.length && (
            <p>
              {isNew
                ? "No matching category."
                : "No active categories. Type a new name to add one."}
            </p>
          )}
          {isNew && (
            <button
              type="button"
              className="money-category-add"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(value.trim().replace(/\s+/g, " "))}
            >
              <Plus size={16} />
              Use new category “{value.trim()}”
            </button>
          )}
          <button
            type="button"
            className="money-category-done"
            onClick={() => setOpen(false)}
          >
            Done
          </button>
        </div>
      )}
      {isNew && (
        <small className="form-hint">
          This category will be added when you save the transaction.
        </small>
      )}
      {exact && !exact.active && exact.id !== currentId && (
        <small className="studio-error">
          Archived category. Restore it in Categories or use another name.
        </small>
      )}
    </div>
  );
}
