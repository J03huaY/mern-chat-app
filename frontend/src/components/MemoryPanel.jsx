import { useEffect } from "react";
import { Brain, Trash2, X } from "lucide-react";
import { useChatStore } from "../store/useChatStore";

// Lists what the AI assistant remembers about the user, with a delete button for each.
const MemoryPanel = ({ onClose }) => {
  const { memories, isMemoriesLoading, getMemories, deleteMemory } = useChatStore();

  useEffect(() => {
    getMemories();
  }, [getMemories]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="memory-panel-title"
        className="w-full max-w-md rounded-xl bg-base-100 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 id="memory-panel-title" className="flex items-center gap-2 font-medium">
            <Brain className="size-4" aria-hidden="true" /> What the AI assistant remembers
          </h2>
          <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <p className="text-xs text-base-content/60 mb-3">
          The assistant only remembers what you chose to save. Delete anything you don&apos;t want it to know.
        </p>

        {isMemoriesLoading ? (
          <span className="loading loading-dots loading-sm" aria-label="Loading memories" />
        ) : memories.length === 0 ? (
          <p className="text-sm text-base-content/70">
            Nothing yet. When you tell the assistant something about yourself, it may suggest remembering it.
          </p>
        ) : (
          <ul className="space-y-2 max-h-80 overflow-y-auto">
            {memories.map((memory) => (
              <li key={memory._id} className="flex items-start justify-between gap-2 rounded-lg bg-base-200 p-2 text-sm">
                <span className="whitespace-pre-wrap">{memory.text}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => deleteMemory(memory._id)}
                  aria-label={`Delete memory: ${memory.text}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default MemoryPanel;
