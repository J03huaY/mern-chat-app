import { useState } from "react";
import { Check, Pencil, Send, X } from "lucide-react";

// A message the AI assistant drafted. Nothing is sent until the user presses Send.
// `preview` is used while the reply is still streaming: the draft isn't saved yet,
// so it can't be sent until the reply finishes.
const DraftCard = ({ draft, onSend, onCancel, preview = false }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(draft.text);
  const [isBusy, setIsBusy] = useState(false);

  const run = async (action) => {
    setIsBusy(true);
    try {
      await action();
    } finally {
      setIsBusy(false);
    }
  };

  const handleSend = () =>
    run(async () => {
      const ok = await onSend(draft._id, text.trim() !== draft.text ? text.trim() : undefined);
      if (ok) setIsEditing(false);
    });

  if (draft.status === "sent") {
    return (
      <div className="mt-2 rounded-lg bg-base-100 text-base-content p-3 text-sm">
        <p className="flex items-center gap-1.5 text-xs opacity-70 mb-1">
          <Check className="size-3.5" aria-hidden="true" /> Sent to {draft.recipientName}
        </p>
        <p className="whitespace-pre-wrap">{draft.text}</p>
      </div>
    );
  }

  if (draft.status === "cancelled") {
    return (
      <div className="mt-2 rounded-lg bg-base-100 text-base-content p-3 text-sm opacity-70">
        <p className="text-xs mb-1">Draft to {draft.recipientName} cancelled</p>
        <p className="whitespace-pre-wrap line-through">{draft.text}</p>
      </div>
    );
  }

  const isSending = isBusy || draft.status === "sending";
  const textIsValid = text.trim().length > 0 && text.trim().length <= 2000;

  return (
    <div className="mt-2 rounded-lg bg-base-100 text-base-content p-3 text-sm">
      <p className="text-xs opacity-70 mb-1">Draft to {draft.recipientName} · not sent yet</p>

      {isEditing ? (
        <textarea
          id={`draft-${draft._id}`}
          className="textarea textarea-bordered w-full text-sm"
          rows={3}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={`Edit the draft to ${draft.recipientName}`}
        />
      ) : (
        <p className="whitespace-pre-wrap">{text}</p>
      )}

      {preview ? (
        <p className="text-xs opacity-60 mt-2">You can send it once the reply finishes.</p>
      ) : (
        <div className="flex flex-wrap gap-2 mt-2">
          <button
            type="button"
            className="btn btn-primary btn-xs"
            disabled={isSending || !textIsValid}
            onClick={handleSend}
          >
            <Send className="size-3" aria-hidden="true" />
            {isSending ? "Sending…" : `Send to ${draft.recipientName}`}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            disabled={isSending}
            onClick={() => setIsEditing(!isEditing)}
          >
            <Pencil className="size-3" aria-hidden="true" />
            {isEditing ? "Done editing" : "Edit"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            disabled={isSending}
            onClick={() => run(() => onCancel(draft._id))}
          >
            <X className="size-3" aria-hidden="true" />
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

export default DraftCard;
