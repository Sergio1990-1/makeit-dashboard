interface Props {
  onClick: () => void;
  isOpen: boolean;
}

export function ChatButton({ onClick, isOpen }: Props) {
  if (isOpen) return null;

  return (
    <button className="chat-fab" onClick={onClick} title="AI Помощник">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}
