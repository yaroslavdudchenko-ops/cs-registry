"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { ReasonDialog } from "@/components/reason-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/api";
import { apiErrorText } from "@/lib/api-errors";
import { formatDateTimeUtc } from "@/lib/format";
import { ROLE_LABELS, ROLE_OPTIONS, roleLabel } from "@/lib/labels";
import { userListResponseSchema, userRecordSchema, type UserRecord } from "@/lib/users";
import { USER_ROLES, type UserRole } from "@/server/db/enums";

const MIN_PASSWORD = 12;

type DialogState =
  | { kind: "create" }
  | { kind: "role"; user: UserRecord }
  | { kind: "password"; user: UserRecord }
  | { kind: "deactivate"; user: UserRecord }
  | null;

export function UsersManagement(): React.JSX.Element {
  const router = useRouter();
  const [reloadToken, setReloadToken] = useState(0);
  const [items, setItems] = useState<UserRecord[] | null>(null);
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<{
    key: string;
    message: string;
    requestId: string;
  } | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const requestKey = String(reloadToken);
  const error = errorState !== null && errorState.key === requestKey ? errorState : null;
  const loading = error === null && resolvedKey !== requestKey;

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    void (async () => {
      const result = await apiRequest<unknown>("/api/v1/users", {
        method: "GET",
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      if (!result.ok) {
        if (result.status === 401) {
          router.replace("/login");
          return;
        }
        setErrorState({
          key: requestKey,
          message:
            result.status === 403
              ? "Недостаточно прав для просмотра пользователей"
              : "Не удалось загрузить список пользователей",
          requestId: result.requestId,
        });
        setResolvedKey(requestKey);
        return;
      }
      const parsed = userListResponseSchema.safeParse(result.data);
      if (!parsed.success) {
        setErrorState({
          key: requestKey,
          message: "Не удалось загрузить список пользователей",
          requestId: result.requestId,
        });
        setResolvedKey(requestKey);
        return;
      }
      setItems(parsed.data.items);
      setResolvedKey(requestKey);
    })();
    return () => controller.abort();
  }, [requestKey, router]);

  function closeDialog(): void {
    if (!pending) {
      setDialog(null);
      setFormError(null);
      setRequestId("");
    }
  }

  async function patchUser(id: string, body: Record<string, unknown>): Promise<boolean> {
    setPending(true);
    setFormError(null);
    const result = await apiRequest<unknown>(`/api/v1/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    setPending(false);
    if (!result.ok) {
      setRequestId(result.requestId);
      if (result.status === 401) {
        router.replace("/login");
        return false;
      }
      setFormError(apiErrorText(result.code, "Не удалось сохранить изменения"));
      return false;
    }
    const parsed = userRecordSchema.safeParse(result.data);
    if (parsed.success) {
      setItems((current) =>
        current === null
          ? current
          : current.map((item) => (item.id === parsed.data.id ? parsed.data : item)),
      );
    } else {
      setReloadToken((value) => value + 1);
    }
    setDialog(null);
    return true;
  }

  async function onDeactivate(reason: string): Promise<void> {
    if (dialog?.kind !== "deactivate") {
      return;
    }
    await patchUser(dialog.user.id, {
      version: dialog.user.version,
      is_active: false,
      reason,
    });
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Пользователи</h1>
          <p className="mt-1 text-muted">Учётные записи реестра. Пароли хранятся только в виде хеша.</p>
        </div>
        <Button
          onClick={() => {
            setFormError(null);
            setRequestId("");
            setDialog({ kind: "create" });
          }}
        >
          Добавить пользователя
        </Button>
      </div>
      {loading ? <UsersSkeleton /> : null}
      {error !== null ? (
        <div className="rounded-lg border border-danger/30 bg-danger-soft p-4" role="alert">
          <p className="text-danger">{error.message}</p>
          {error.requestId.length > 0 ? (
            <p className="mt-1 text-sm text-muted">Идентификатор запроса: {error.requestId}</p>
          ) : null}
          <button
            type="button"
            className="mt-3 text-sm text-accent underline"
            onClick={() => setReloadToken((value) => value + 1)}
          >
            Повторить
          </button>
        </div>
      ) : null}
      {!loading && error === null && items !== null && items.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface p-5 text-muted">Пользователей пока нет</p>
      ) : null}
      {!loading && error === null && items !== null && items.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[56rem] border-collapse text-left">
            <caption className="sr-only">Список пользователей</caption>
            <thead className="border-b border-line bg-background/80 text-sm text-muted">
              <tr>
                <th className="px-3 py-3 font-medium">Логин</th>
                <th className="px-3 py-3 font-medium">ФИО</th>
                <th className="px-3 py-3 font-medium">Роль</th>
                <th className="px-3 py-3 font-medium">Статус</th>
                <th className="px-3 py-3 font-medium">Создан</th>
                <th className="px-3 py-3 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-3 font-medium">{item.username}</td>
                  <td className="px-3 py-3">{item.full_name}</td>
                  <td className="px-3 py-3">{ROLE_LABELS[item.role]}</td>
                  <td className="px-3 py-3">{item.is_active ? "Активен" : "Заблокирован"}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{formatDateTimeUtc(item.created_at)}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setFormError(null);
                          setRequestId("");
                          setDialog({ kind: "role", user: item });
                        }}
                      >
                        Сменить роль
                      </Button>
                      {item.is_active ? (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            setFormError(null);
                            setRequestId("");
                            setDialog({ kind: "deactivate", user: item });
                          }}
                        >
                          Деактивировать
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => void patchUser(item.id, { version: item.version, is_active: true })}
                        >
                          Активировать
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setFormError(null);
                          setRequestId("");
                          setDialog({ kind: "password", user: item });
                        }}
                      >
                        Сбросить пароль
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <CreateUserDialog
        open={dialog?.kind === "create"}
        pending={pending}
        error={formError}
        requestId={requestId}
        onClose={closeDialog}
        onCreate={async (payload) => {
          setPending(true);
          setFormError(null);
          const result = await apiRequest<unknown>("/api/v1/users", {
            method: "POST",
            body: JSON.stringify(payload),
          });
          setPending(false);
          if (!result.ok) {
            setRequestId(result.requestId);
            if (result.status === 401) {
              router.replace("/login");
              return;
            }
            if (result.status === 409) {
              setFormError("Такой логин или адрес уже занят");
              return;
            }
            setFormError(apiErrorText(result.code, "Не удалось создать пользователя"));
            return;
          }
          setDialog(null);
          setReloadToken((value) => value + 1);
        }}
      />
      <RoleDialog
        open={dialog?.kind === "role"}
        user={dialog?.kind === "role" ? dialog.user : null}
        pending={pending}
        error={formError}
        requestId={requestId}
        onClose={closeDialog}
        onSave={(role, reason) => {
          if (dialog?.kind !== "role") {
            return;
          }
          void patchUser(dialog.user.id, { version: dialog.user.version, role, reason });
        }}
      />
      <PasswordDialog
        open={dialog?.kind === "password"}
        user={dialog?.kind === "password" ? dialog.user : null}
        pending={pending}
        error={formError}
        requestId={requestId}
        onClose={closeDialog}
        onSave={(password) => {
          if (dialog?.kind !== "password") {
            return;
          }
          void patchUser(dialog.user.id, { version: dialog.user.version, password });
        }}
      />
      <ReasonDialog
        key={dialog?.kind === "deactivate" ? dialog.user.id : "deactivate-closed"}
        open={dialog?.kind === "deactivate"}
        title="Деактивировать пользователя"
        description="Учётная запись потеряет доступ к реестру. Укажите причину."
        confirmLabel="Деактивировать"
        pending={pending}
        error={formError}
        requestId={requestId}
        onClose={closeDialog}
        onConfirm={(reason) => void onDeactivate(reason)}
      />
    </section>
  );
}

function CreateUserDialog({
  open,
  pending,
  error,
  requestId,
  onClose,
  onCreate,
}: {
  open: boolean;
  pending: boolean;
  error: string | null;
  requestId: string;
  onClose: () => void;
  onCreate: (payload: {
    username: string;
    full_name: string;
    email: string;
    password: string;
    role: UserRole;
  }) => Promise<void>;
}): React.JSX.Element | null {
  const titleId = useId();
  if (!open) {
    return null;
  }
  return (
    <Modal titleId={titleId} title="Новый пользователь">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const username = String(form.get("username") ?? "").trim();
          const fullName = String(form.get("full_name") ?? "").trim();
          const email = String(form.get("email") ?? "").trim();
          const password = String(form.get("password") ?? "");
          const role = String(form.get("role") ?? "");
          if (username.length === 0 || fullName.length === 0 || email.length === 0) {
            return;
          }
          if (password.length < MIN_PASSWORD) {
            return;
          }
          if (!(USER_ROLES as readonly string[]).includes(role)) {
            return;
          }
          void onCreate({
            username,
            full_name: fullName,
            email,
            password,
            role: role as UserRole,
          });
        }}
      >
        <Field id={`${titleId}-username`} name="username" label="Логин" required maxLength={100} />
        <Field id={`${titleId}-full_name`} name="full_name" label="ФИО" required maxLength={200} />
        <Field id={`${titleId}-email`} name="email" label="Электронная почта" type="email" required />
        <Field
          id={`${titleId}-password`}
          name="password"
          label="Пароль"
          type="password"
          required
          minLength={MIN_PASSWORD}
        />
        <p className="text-sm text-muted">Не короче {MIN_PASSWORD} символов.</p>
        <div>
          <Label htmlFor={`${titleId}-role`}>Роль</Label>
          <Select id={`${titleId}-role`} name="role" defaultValue="viewer" required>
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <FormFooter
          pending={pending}
          error={error}
          requestId={requestId}
          confirmLabel="Создать"
          onClose={onClose}
        />
      </form>
    </Modal>
  );
}

function RoleDialog({
  open,
  user,
  pending,
  error,
  requestId,
  onClose,
  onSave,
}: {
  open: boolean;
  user: UserRecord | null;
  pending: boolean;
  error: string | null;
  requestId: string;
  onClose: () => void;
  onSave: (role: UserRole, reason: string) => void;
}): React.JSX.Element | null {
  const titleId = useId();
  if (!open || user === null) {
    return null;
  }
  return (
    <Modal titleId={titleId} title={`Сменить роль: ${user.username}`}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const role = String(form.get("role") ?? "");
          const reason = String(form.get("reason") ?? "").trim();
          if (!(USER_ROLES as readonly string[]).includes(role) || reason.length === 0) {
            return;
          }
          onSave(role as UserRole, reason);
        }}
      >
        <p className="text-muted">Текущая роль: {roleLabel(user.role)}</p>
        <div>
          <Label htmlFor={`${titleId}-role`}>Новая роль</Label>
          <Select id={`${titleId}-role`} name="role" defaultValue={user.role} required>
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`${titleId}-reason`}>Причина</Label>
          <Input id={`${titleId}-reason`} name="reason" required />
        </div>
        <FormFooter
          pending={pending}
          error={error}
          requestId={requestId}
          confirmLabel="Сохранить"
          onClose={onClose}
        />
      </form>
    </Modal>
  );
}

function PasswordDialog({
  open,
  user,
  pending,
  error,
  requestId,
  onClose,
  onSave,
}: {
  open: boolean;
  user: UserRecord | null;
  pending: boolean;
  error: string | null;
  requestId: string;
  onClose: () => void;
  onSave: (password: string) => void;
}): React.JSX.Element | null {
  const titleId = useId();
  if (!open || user === null) {
    return null;
  }
  return (
    <Modal titleId={titleId} title={`Сбросить пароль: ${user.username}`}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const password = String(form.get("password") ?? "");
          if (password.length < MIN_PASSWORD) {
            return;
          }
          onSave(password);
        }}
      >
        <Field
          id={`${titleId}-password`}
          name="password"
          label="Новый пароль"
          type="password"
          required
          minLength={MIN_PASSWORD}
        />
        <p className="text-sm text-muted">Не короче {MIN_PASSWORD} символов. Причина не требуется.</p>
        <FormFooter
          pending={pending}
          error={error}
          requestId={requestId}
          confirmLabel="Сбросить"
          onClose={onClose}
        />
      </form>
    </Modal>
  );
}

function Modal({
  titleId,
  title,
  children,
}: {
  titleId: string;
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-lg border border-line bg-surface p-5 shadow-lg"
      >
        <h2 id={titleId} className="text-xl font-semibold">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function Field({
  id,
  name,
  label,
  type = "text",
  required = false,
  maxLength,
  minLength,
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
  minLength?: number;
}): React.JSX.Element {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type={type}
        required={required}
        {...(maxLength === undefined ? {} : { maxLength })}
        {...(minLength === undefined ? {} : { minLength })}
      />
    </div>
  );
}

function FormFooter({
  pending,
  error,
  requestId,
  confirmLabel,
  onClose,
}: {
  pending: boolean;
  error: string | null;
  requestId: string;
  confirmLabel: string;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <>
      {error !== null ? (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
          {requestId.length > 0 ? (
            <span className="mt-1 block text-muted">Идентификатор запроса: {requestId}</span>
          ) : null}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Сохранение…" : confirmLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Отмена
        </Button>
      </div>
    </>
  );
}

function UsersSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface p-4" aria-hidden="true">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
