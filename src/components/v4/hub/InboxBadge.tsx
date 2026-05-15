interface Props {
  /** Number of unread Activity events for the project. */
  count: number;
}

/**
 * Pill badge shown on the Activity tab with the unread-event count
 * (Epic-011 Task-05). Renders nothing for a non-positive count so the
 * tab label is clean once the user has caught up. Reuses the existing
 * `.v4-hub-tab-badge` style (src/styles/v4.css).
 */
export function InboxBadge({ count }: Props) {
  if (count <= 0) return null;
  return (
    <span
      className="v4-hub-tab-badge"
      aria-label={`${count} новых событий`}
    >
      {count}
    </span>
  );
}

export default InboxBadge;
