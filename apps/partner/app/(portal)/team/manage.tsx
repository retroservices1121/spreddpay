"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PARTNER_ROLES, findRoleConflict, type PartnerRoleName } from "@spreddpay/contracts";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Input,
} from "@spreddpay/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const ROLE_HELP: Record<PartnerRoleName, string> = {
  PARTNER_OWNER: "Everything, including team and API keys.",
  PARTNER_ADMIN: "Manage the program, team and branding.",
  PAYOUT_CREATOR: "Create payouts. Cannot approve them.",
  PAYOUT_APPROVER: "Approve payouts. Cannot create them.",
  SUPPORT_AGENT: "Read traders and manage cards for support.",
  ANALYST: "Read-only plus exports and revenue.",
  READ_ONLY: "Read-only.",
};

function RolePicker({
  selected,
  onChange,
  idPrefix,
}: {
  selected: PartnerRoleName[];
  onChange: (roles: PartnerRoleName[]) => void;
  idPrefix: string;
}) {
  // The same rule the server enforces, shown before submission so the conflict
  // is explained rather than discovered as a 403.
  const conflict = findRoleConflict(selected);

  return (
    <div>
      <div className="mb-3 grid gap-1.5 sm:grid-cols-2">
        {PARTNER_ROLES.map((role) => {
          const checked = selected.includes(role);
          return (
            <label
              key={role}
              htmlFor={`${idPrefix}-${role}`}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-edge p-2.5 text-sm hover:bg-surface-muted"
            >
              <input
                id={`${idPrefix}-${role}`}
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, role]
                      : selected.filter((value) => value !== role),
                  )
                }
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-ink">{role.replace(/_/g, " ").toLowerCase()}</span>
                <span className="block text-xs text-ink-subtle">{ROLE_HELP[role]}</span>
              </span>
            </label>
          );
        })}
      </div>
      {conflict ? <Callout tone="critical">{conflict.reason}</Callout> : null}
    </div>
  );
}

export function InviteMemberForm({ partnerId }: { partnerId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<PartnerRoleName[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conflict = findRoleConflict(roles);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${API_URL}/api/v1/partners/${partnerId}/team`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `invite-${form.get("email")}-${Date.now()}`,
        },
        body: JSON.stringify({
          email: String(form.get("email")),
          firstName: String(form.get("firstName")),
          lastName: String(form.get("lastName")),
          roles,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? "Could not send this invite.");
        return;
      }
      setOpen(false);
      setRoles([]);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (!open) return <Button onClick={() => setOpen(true)}>Invite member</Button>;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Invite a team member</CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={submit}>
          {error ? (
            <div className="mb-4">
              <Callout tone="critical">{error}</Callout>
            </div>
          ) : null}

          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label="First name">
              <Input name="firstName" required maxLength={80} />
            </Field>
            <Field label="Last name">
              <Input name="lastName" required maxLength={80} />
            </Field>
          </div>
          <Field label="Work email">
            <Input name="email" type="email" required />
          </Field>

          <p className="mb-2 text-xs font-medium text-ink-muted">Roles</p>
          <RolePicker selected={roles} onChange={setRoles} idPrefix="invite" />

          <div className="mt-4 flex gap-2">
            <Button type="submit" disabled={pending || roles.length === 0 || conflict !== null}>
              {pending ? "Inviting…" : "Send invite"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export function MemberActions({
  partnerId,
  member,
  isSelf,
}: {
  partnerId: string;
  member: { id: string; roles: string[]; status: string; firstName: string; lastName: string };
  isSelf: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [roles, setRoles] = useState<PartnerRoleName[]>(member.roles as PartnerRoleName[]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conflict = findRoleConflict(roles);

  async function call(path: string, body: unknown) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/partners/${partnerId}/team/${member.id}${path}`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? "Request failed.");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setPending(false);
    }
  }

  if (editing) {
    return (
      <div className="max-w-lg">
        <RolePicker selected={roles} onChange={setRoles} idPrefix={member.id} />
        {error ? (
          <div className="mt-2">
            <Callout tone="critical">{error}</Callout>
          </div>
        ) : null}
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            disabled={pending || roles.length === 0 || conflict !== null}
            onClick={async () => {
              if (await call("/roles", { roles })) setEditing(false);
            }}
          >
            Save roles
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
          Edit roles
        </Button>
        {isSelf ? null : member.status === "ACTIVE" ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Deactivate ${member.firstName} ${member.lastName}?`)) {
                void call("/status", { status: "DISABLED" });
              }
            }}
          >
            Deactivate
          </Button>
        ) : (
          <Button size="sm" disabled={pending} onClick={() => call("/status", { status: "ACTIVE" })}>
            Reactivate
          </Button>
        )}
      </div>
      {error ? <p className="max-w-xs text-right text-xs text-critical">{error}</p> : null}
      {isSelf ? <Badge tone="neutral">you</Badge> : null}
    </div>
  );
}
