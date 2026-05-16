# Dealer Team Temporary Password Design

## Context

Bridge Warranty reported that dealer admins cannot create brand-new employees from the main dealer admin Team Management page. The current primary page is `src/pages/DealerTeamPage.tsx`, which exposes first name, last name, phone, email, password, confirm password, and role fields. In Supabase mode, it calls the `dealer-team-tools` edge function to create the auth user and dealership membership.

The client expects dealer admins to create brand-new employee accounts directly. They do not want an invite-only flow for this case. The employee should receive a temporary password created by the system, and the dealer admin should see that password once after creation so they can share it manually.

## Goals

- Allow a dealer admin to create a brand-new employee account from the main Team Management page.
- Generate the temporary password server-side.
- Remove manual password entry from the Add Member and Edit Member form.
- Show the generated temporary password once after successful creation, with a copy action.
- Keep creation scoped to the authenticated dealer admin's dealership.
- Preserve existing enable, disable, role, and profile management behavior.

## Non-Goals

- Emailing temporary passwords automatically.
- Building a full invitation workflow.
- Forcing a password change on first login.
- Adding a dedicated password reset flow for dealer employees.
- Reworking the separate dealership settings Team Management invitation dialog.

## Recommended Approach

Use the existing main dealer admin Team Management page and existing `dealer-team-tools` edge function. Move temporary password generation into the edge function for `create_employee`, return the temporary password only in the successful create response, and update the frontend to show it in a one-time success dialog.

This keeps the security-sensitive password generation in backend code, avoids relying on dealer admins to invent valid passwords, and limits the UI changes to the workflow the client is already using.

## Frontend Design

`src/pages/DealerTeamPage.tsx` remains the primary screen for dealer employee creation.

For new employees, the Add Member form will include:

- First name
- Last name
- Phone
- Role
- Email

The form will no longer include:

- Password
- Confirm password
- Password requirements block

On submit, the page will call `dealer-team-tools` with `action: "create_employee"` and employee profile data only. The request will not include a password.

After successful creation, the page will:

- reset and close the add form
- refresh the team list
- open a success dialog showing the employee email and temporary password
- provide a copy button for the temporary password
- explain that the password is shown once and should be shared securely

For editing existing team members, the form will also stop requiring password fields. Editing will update first name, last name, phone, email, and role only. Password reset support can be added later as a separate explicit action.

## Backend Design

`supabase/functions/dealer-team-tools/index.ts` will own temporary password generation for `create_employee`.

For `create_employee`, the edge function will:

- authenticate the caller from the bearer token
- verify the caller has an active `DEALER_ADMIN` membership
- validate first name, last name, email, and role
- generate a strong temporary password server-side
- create the Supabase auth user with `email_confirm: true`
- upsert the matching `profiles` row with `is_active: true`
- upsert the matching `dealer_members` row with `status: "ACTIVE"`
- return `dealerMemberId`, `userId`, and `temporaryPassword`

For `update_employee`, the edge function will:

- stop requiring a password
- update the auth user email if needed
- update profile fields
- update the dealer member role
- leave the employee password unchanged

The temporary password is returned only from `create_employee`. It is not stored outside Supabase Auth.

## Data Flow

1. Dealer admin opens Team Management.
2. Dealer admin clicks Add Member.
3. Dealer admin enters employee profile details and role.
4. Frontend sends a create request to `dealer-team-tools`.
5. Edge function verifies dealer admin authorization.
6. Edge function generates a temporary password and creates the auth user.
7. Edge function writes profile and dealer membership records.
8. Frontend refreshes team members.
9. Frontend shows the generated temporary password once.

## Error Handling

Existing page-level error display will continue to show failures in the red error banner.

Validation errors should remain specific for missing first name, last name, email, and role. Duplicate email or Supabase Auth creation failures can surface the Supabase error message initially. If implementation exposes unclear duplicate-user messages, the error can be normalized to a clearer message such as "An account with this email already exists."

The frontend should not clear an already displayed temporary password until the success dialog is dismissed.

## Security Considerations

Password generation should happen in the edge function, not in the browser. The generated password should be strong enough for a temporary credential and should avoid ambiguous characters if practical.

The password is visible to the dealer admin once after creation. The UI should make this explicit. Since the app is not emailing passwords in this scope, the dealer admin is responsible for sharing it securely.

The edge function must continue to derive the target dealership from the authenticated dealer admin membership. The client must not be able to pass an arbitrary dealer id.

## Testing And Verification

Implementation should include focused verification:

- Add or update unit coverage for temporary password generation if it is extracted into a small exported helper.
- Verify the Add Member form no longer requires password fields.
- Verify the Edit Member flow no longer requires or sends password fields.
- Run `npm test` if practical.
- Run `npm run build`.

The repo does not currently show a Deno test harness for Supabase edge functions, so backend verification can be handled through build/type checks and direct review unless an existing function test pattern is found during implementation.
