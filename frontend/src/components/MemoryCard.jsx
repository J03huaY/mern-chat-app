import { useState } from "react";
import { Brain, Check, Pencil, X } from "lucide-react";

const MAX_MEMORY_CHARS = 300;

// Something the AI assistant suggested remembering. Nothing is remembered until
// the user presses Save. `preview` is used while the reply is still streaming.
const MemoryCard = ({ proposal, onSave, onDismiss, preview = false }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(proposal.text);
  const [isBusy, setIsBusy] = useState(false);

  const run = async (action) => {
    setIsBusy(true);
    try {
      await action();
    } finally {
      setIsBusy(false);
    }
  };

  const handleSave = () =>
    run(async () => {
      const ok = await onSave(proposal._id, text.trim() !== proposal.text ? text.trim() : undefined);
      if (ok) setIsEditing(false);
    });

  if (proposal.status === "saved") {
    return (
      <div className="mt-2 rounded-lg bg-base-100 text-base-content p-3 text-sm">
        <p className="flex items-center gap-1.5 text-xs opacity-70 mb-1">
          <Check className="size-3.5" aria-hidden="true" /> Saved to memory
        </p>
        <p className="whitespace-pre-wrap">{proposal.text}</p>
      </div>
    );
  }

  if (proposal.status === "dismissed") {
    return (
      <div className="mt-2 rounded-lg bg-base-100 text-base-content p-3 text-sm opacity-70">
        <p className="text-xs mb-1">Not remembered</p>
        <p className="whitespace-pre-wrap line-through">{proposal.text}</p>
      </div>
    );
  }

  const isSaving = isBusy || proposal.status === "saving";
  const textIsValid = text.trim().length > 0 && text.trim().length <= MAX_MEMORY_CHARS;

  return (
    <div className="mt-2 rounded-lg bg-base-100 text-base-content p-3 text-sm">
      <p className="flex items-center gap-1.5 text-xs opacity-70 mb-1">
        <Brain className="size-3.5" aria-hidden="true" /> Remember this?
      </p>

      {isEditing ? (
        <textarea
          className="textarea textarea-bordered w-full text-sm"
          rows={2}
          maxLength={MAX_MEMORY_CHARS}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Edit the memory"
        />
      ) : (
        <p className="whitespace-pre-wrap">{text}</p>
      )}
      {proposal.replacesText && (
        <p className="text-xs opacity-60 mt-1">Replaces: {proposal.replacesText}</p>
      )}

      {preview ? (
        <p className="text-xs opacity-60 mt-2">You can save it once the reply finishes.</p>
      ) : (
        <div className="flex flex-wrap gap-2 mt-2">
          <button
            type="button"
            className="btn btn-primary btn-xs"
            disabled={isSaving || !textIsValid}
            onClick={handleSave}
          >
            <Check className="size-3" aria-hidden="true" />
            {isSaving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            disabled={isSaving}
            onClick={() => setIsEditing(!isEditing)}
          >
            <Pencil className="size-3" aria-hidden="true" />
            {isEditing ? "Done editing" : "Edit"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            disabled={isSaving}
            onClick={() => run(() => onDismiss(proposal._id))}
          >
            <X className="size-3" aria-hidden="true" />
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
};

export default MemoryCard;
