"use client";

import { useState } from "react";
import { Action, Resource } from "@abytetex/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { Role } from "./types";
import { Loader2 } from "lucide-react";

const ACTIONS = Object.values(Action);
const RESOURCES = Object.values(Resource);

function resourceLabel(resource: string) {
  return resource
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function PermissionMatrix({
  role,
  onSave,
  isSaving,
  readOnly,
}: {
  role: Role;
  onSave: (permissions: Array<{ resource: string; action: string }>) => void;
  isSaving?: boolean;
  readOnly?: boolean;
}) {
  const [grants, setGrants] = useState<Set<string>>(
    () => new Set(role.permissions.map((p) => `${p.resource}:${p.action}`)),
  );

  function toggle(resource: string, action: string) {
    if (readOnly) return;
    const key = `${resource}:${action}`;
    setGrants((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleSave() {
    const permissions = Array.from(grants).map((key) => {
      const [resource, action] = key.split(":");
      return { resource, action };
    });
    onSave(permissions);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/60 backdrop-blur">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Resource</th>
              {ACTIONS.map((action) => (
                <th key={action} className="px-2 py-2 text-center font-medium">
                  {action}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RESOURCES.map((resource) => (
              <tr key={resource} className="border-t">
                <td className="px-3 py-1.5 font-medium">{resourceLabel(resource)}</td>
                {ACTIONS.map((action) => (
                  <td key={action} className="px-2 py-1.5 text-center">
                    <Checkbox
                      checked={grants.has(`${resource}:${action}`)}
                      onCheckedChange={() => toggle(resource, action)}
                      disabled={readOnly}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="flex justify-end border-t pt-4">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save permissions
          </Button>
        </div>
      )}
    </div>
  );
}
