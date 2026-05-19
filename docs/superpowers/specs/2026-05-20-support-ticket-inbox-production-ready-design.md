# Support Ticket Inbox Production Readiness Design

## Summary

The support feature will be treated as a dependable support ticket inbox, not a full realtime live chat. The existing Supabase-backed `support_conversations` and `support_messages` tables remain the source of truth. The production pass will harden refresh behavior, unread indicators, admin discoverability, copy, and regression coverage while keeping scope narrow.

## Current State

Users can access `/support` and the floating `SupportWidget` from authenticated dashboard routes. Admins can access `/admin-support`. Messages are persisted in Supabase, and conversations have `OPEN`, `PENDING`, and `CLOSED` statuses. The full support page includes a Supabase Realtime subscription, but the widget and admin inbox rely on explicit query invalidation after local actions. The widget also shows a hard-coded unread badge, and the newer admin sidebar does not expose the Support Inbox.

## Goals

- Make the support experience reliable without requiring full realtime chat.
- Ensure users and admins see new ticket activity within a predictable interval.
- Replace hard-coded unread UI with data-derived unread state.
- Make the admin inbox discoverable from admin navigation.
- Align user-facing language with a ticket inbox model.
- Add focused tests that prevent the current production-readiness gaps from returning.

## Non-Goals

- No external chat provider integration.
- No multi-ticket-per-user workflow.
- No attachments, screenshots, priorities, assignment, SLA timers, or email notifications.
- No broad support table redesign.
- No full Supabase Realtime rollout for the widget and admin inbox in this pass.

## Behavior

Each authenticated user continues to have one support conversation. When a user sends a message, the conversation status becomes `OPEN`, `last_sender_type` becomes `USER`, and user read metadata is updated. When an admin replies, status becomes `PENDING`, `last_sender_type` becomes `ADMIN`, and admin read metadata is updated. Admins can close or reopen conversations.

The widget and admin inbox will refresh automatically while visible. The refresh interval should be long enough to avoid unnecessary database load and short enough to feel responsive for a support inbox. A 20-30 second interval is acceptable. Manual invalidation still happens after sending messages, changing status, and marking conversations read.

Unread state will be derived from:

- `last_sender_type`
- `last_message_at`
- `admin_last_read_at`
- `user_last_read_at`

The widget badge will show only when there is an unread admin response for the signed-in user. The admin inbox will show unread state only when the latest message is from a user and newer than `admin_last_read_at`.

## UI And Navigation

The floating widget remains available to eligible authenticated users on dashboard routes. The fixed badge value is removed. Empty and loading states should continue to be clear and non-blocking.

The admin navigation will include a Support Inbox entry so admins can reach `/admin-support` from the dashboard shell. Existing old-route links from the admin dashboard can remain.

Copy should avoid promising live chat. Preferred language:

- "Support"
- "Support messages"
- "Send a message and our support team will reply"
- "We typically reply within 1 business day"

Avoid terms like "real-time chat" for this pass.

## Data Flow

The frontend continues to use Supabase directly:

1. Load the current user's support conversation by `user_id`.
2. Load messages for the selected conversation.
3. Insert user or admin messages into `support_messages`.
4. Update the parent `support_conversations` row with status, sender, timestamps, and read metadata.
5. Refetch visible queries on a fixed interval and after local mutations.

The existing RLS and trigger protections remain in place. This pass does not require new tables.

## Error Handling

Supabase configuration errors should keep the current visible "Supabase is not configured" messaging. Send failures should remain visible near the compose box. Conversation creation should handle any relevant Postgres integrity error code in class `23`, not only unique violation `23505`, then retry fetching the existing conversation.

## Testing

Add focused regression tests for:

- Admin unread state is true only when the latest user message is newer than `admin_last_read_at`.
- User unread state is true only when the latest admin message is newer than `user_last_read_at`.
- No hard-coded widget badge remains.
- Widget and admin inbox queries have an automatic refetch interval.
- Admin navigation includes Support Inbox.
- Duplicate conversation creation handling accepts integrity error class `23`.

Existing build and lint verification remain required.

## Acceptance Criteria

- Users can still send support messages from `/support` and the widget.
- Admins can reach Support Inbox from admin navigation.
- Admins can reply, close, and reopen conversations.
- Widget unread badge is data-derived and absent when there are no unread admin replies.
- Admin unread labels are data-derived.
- Widget and admin inbox update without manual refresh within the configured polling interval.
- UI copy no longer over-promises live chat behavior.
- `npm run build` passes.
- `npm run lint` passes or only reports known unrelated warnings.
