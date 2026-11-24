import { useEffect, useMemo, useState } from "react";
import { Plus, MessageCircle, Sparkles, Check, Pin, Search as SearchIcon, Trash2, X } from "lucide-react";
import { Avatar } from "@/components/common/Avatar";
import { Bento } from "@/components/common/Bento";
import { Chip, ChipRow } from "@/components/common/Chips";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { Field } from "@/components/common/FormField";
import { inputClass } from "@/components/common/inputClass";
import { MetricCard } from "@/components/common/MetricCard";
import { ModalShell } from "@/components/common/ModalShell";
import { PageError, PageLoading } from "@/components/common/QueryState";
import { addReply as postReply, createThread as postThread, deleteReply as removeReply, deleteThread, updateThread } from "@/api/threads";
import { useApp } from "@/context/useApp";
import { useToast } from "@/context/useToast";
import { useThreads } from "@/hooks/useThreads";
import { cn } from "@/lib/cn";
import { canResolve, sortThreads, tagsFor, timeAgo, validateReply, validateThread } from "@/lib/discussion";
import { Button } from "@/components/ui/button";
import { Scope } from "@/components/common";

const TAG_TONE = {
  Question: "bg-warning-dim text-warning border-warning/25",
  Discussion: "bg-primary-dim text-primary border-primary/25",
  Resource: "bg-success-dim text-success border-success/25",
  Announcement: "bg-danger-dim text-danger border-danger/25",
};

// ═══════════════════════════════════════════════════════════════
// CLASS DISCUSSION — threads of one class (GET /threads). Everything is saved
// on the server; authors and times come from the account and the clock, not
// from the page. A teacher sees the class chosen in the sidebar; a student's
// class is implied.
// ═══════════════════════════════════════════════════════════════
export const ClassDiscussion = ({ role }) => {
  const toast = useToast();
  const { user, activeClassObj, scopeLoading } = useApp();
  const isTeacher = role === "teacher";
  const { data, isLoading, error, refetch } = useThreads({
    classId: isTeacher ? activeClassObj?.id : undefined,
    enabled: !isTeacher || Boolean(activeClassObj),
  });
  const threads = useMemo(() => data ?? [], [data]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newTag, setNewTag] = useState("Question");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);

  // "2 hours ago" labels stay fresh while the page is open
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const run = async (fn, okMessage) => {
    setBusy(true);
    try {
      const result = await fn();
      if (okMessage) toast.push(okMessage, "success");
      return result;
    } catch (err) {
      toast.push(err.message || "That didn't work", "error");
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const filtered = useMemo(() => {
    let rows = threads;
    if (filter === "unresolved") rows = rows.filter((t) => !t.resolved);
    if (filter === "mine") rows = rows.filter((t) => t.authorId === user?.id);
    if (filter === "pinned") rows = rows.filter((t) => t.pinned);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (t) => t.title.toLowerCase().includes(q) || t.body.toLowerCase().includes(q) || t.author.toLowerCase().includes(q),
      );
    }
    return sortThreads(rows);
  }, [threads, filter, search, user?.id]);

  const addReply = async (threadId) => {
    const problem = validateReply(replyDraft);
    if (problem) return toast.push(problem, "error");
    const ok = await run(() => postReply(threadId, replyDraft), "Reply posted");
    if (ok) setReplyDraft("");
  };
  const toggleResolved = (threadId) => {
    const t = threads.find((x) => x.id === threadId);
    return run(() => updateThread(threadId, { resolved: !t.resolved }));
  };
  const togglePinned = (threadId) => {
    const t = threads.find((x) => x.id === threadId);
    return run(() => updateThread(threadId, { pinned: !t.pinned }));
  };
  const deleteReply = (threadId, replyId) => run(() => removeReply(threadId, replyId), "Reply removed");

  const createThread = async () => {
    const problem = validateThread({ title: newTitle, body: newBody, tag: newTag }, role);
    if (problem) return toast.push(problem, "error");
    const made = await run(
      () => postThread({ classId: isTeacher ? activeClassObj.id : undefined, title: newTitle, body: newBody, tag: newTag }),
      "Thread posted",
    );
    if (made) {
      setNewOpen(false);
      setNewTitle("");
      setNewBody("");
      setNewTag("Question");
      setExpanded(made.id);
    }
  };

  if (scopeLoading || (isLoading && (!isTeacher || activeClassObj))) return <PageLoading />;
  if (isTeacher && !activeClassObj) {
    return <EmptyState title="Choose a class" body="Pick a class in the sidebar to see its discussion." />;
  }
  if (error) return <PageError error={error} onRetry={refetch} />;

  return (
    <div className="mx-auto max-w-[1360px] px-5 py-6 tablet:px-10 tablet:py-8">
      <div className="mb-5 flex items-center gap-2 text-[13px] font-medium text-ink-3">
        <Scope /> <span className="text-ink-3">/</span> Class
        discussion
      </div>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-[28px] font-semibold tablet:text-[34px] leading-[1.1] tracking-[-0.02em] text-ink">
            Class <span className="text-ink-3">discussion</span>
          </h1>
          <p className="mt-2 max-w-[680px] text-[14px] leading-relaxed text-ink-2">
            Ask questions, share resources, discuss the week's topic. Teachers
            moderate. Be kind — everything here is logged.
          </p>
        </div>
        <Button
          onClick={() => setNewOpen(true)}
        >
          <Plus size={14} /> New thread
        </Button>
      </div>

      <div className="bento mb-8">
        <MetricCard
          icon={MessageCircle}
          iconTone="primary"
          label="Active threads"
          value={threads.filter((t) => !t.resolved).length}
          delta="Awaiting replies"
          deltaTone="success"
        />
        <MetricCard
          icon={Sparkles}
          iconTone="neutral"
          label="Replies"
          value={threads.reduce((s, t) => s + t.replies.length, 0)}
          delta="Across all threads"
          deltaTone="success"
        />
        <MetricCard
          icon={Check}
          iconTone="success"
          label="Resolved"
          value={threads.filter((t) => t.resolved).length}
          delta="Closed threads"
          deltaTone="success"
        />
        <MetricCard
          icon={Pin}
          iconTone="warning"
          label="Pinned"
          value={threads.filter((t) => t.pinned).length}
          delta="Teacher-curated"
          deltaTone="success"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex h-10 min-w-[240px] flex-1 items-center gap-2.5 rounded-[var(--radius-control)] border border-rule-2 bg-surface px-3.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 narrow:max-w-[360px]">
          <SearchIcon size={14} className="shrink-0 text-ink-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search threads…"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3"
          />
        </label>
        <ChipRow>
          {[
            { k: "all", l: "All" },
            { k: "unresolved", l: "Unresolved" },
            { k: "mine", l: "My posts" },
            { k: "pinned", l: "Pinned" },
          ].map((f) => (
            <Chip
              key={f.k}
              active={filter === f.k}
              onClick={() => setFilter(f.k)}
            >
              {f.l}
            </Chip>
          ))}
        </ChipRow>
      </div>

      <div className="flex flex-col gap-2.5">
        {filtered.length === 0 && (
          <EmptyState
            title={
              search.trim() || filter !== "all"
                ? "No threads match"
                : "No discussions yet"
            }
            body={
              search.trim() || filter !== "all"
                ? "Try a different search or clear the filter."
                : "Ask a question, share a resource, or start a discussion with your class."
            }
            action={
              search.trim() || filter !== "all"
                ? "Clear filters"
                : "Start a thread"
            }
            onAction={() => {
              if (search.trim() || filter !== "all") {
                setSearch("");
                setFilter("all");
              } else setNewOpen(true);
            }}
          />
        )}

        {filtered.map((t) => {
          const isOpen = expanded === t.id;
          return (
            <Bento
              key={t.id}
              variant={t.pinned ? "featured" : "default"}
              className={cn(
                "!p-0 overflow-hidden transition-all duration-300",
                t.resolved && "opacity-70",
              )}
            >
              <button
                onClick={() => setExpanded(isOpen ? null : t.id)}
                className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-raised/40"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  {t.pinned && (
                    <Pin size={12} className="shrink-0 text-primary" />
                  )}
                  <span
                    className={cn(
                      "shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[12px] font-semibold",
                      TAG_TONE[t.tag] || "bg-raised text-ink-3 border-rule-2",
                    )}
                  >
                    {t.tag}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 truncate text-[14.5px] font-semibold text-ink",
                      t.resolved && "line-through decoration-ink-4",
                    )}
                  >
                    {t.title}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="hidden items-center gap-2 narrow:flex">
                    <Avatar name={t.author} src={t.authorPhotoUrl} size="sm" decorative tone={t.role === "teacher" ? "teacher" : "neutral"} />
                    <span className="flex flex-col text-[12px] leading-tight">
                      <b className="font-semibold text-ink">{t.author}</b>
                      <span className="text-ink-3">{timeAgo(t.createdAt, now)}</span>
                    </span>
                  </div>
                  {t.resolved && (
                    <span className="whitespace-nowrap rounded-full bg-success-dim px-2 py-0.5 text-[12px] font-semibold text-success">
                      Resolved
                    </span>
                  )}
                  <span className="whitespace-nowrap rounded-full bg-bg px-2.5 py-0.5 text-[13px] font-medium text-ink-3">
                    {t.replies.length}{" "}
                    {t.replies.length === 1 ? "reply" : "replies"}
                  </span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-rule px-5 py-4">
                  <div className="mb-4 max-w-[720px] text-[14px] leading-relaxed text-ink-2">
                    {t.body}
                  </div>

                  {t.replies.length > 0 && (
                    <div className="flex flex-col gap-3 border-t border-rule pt-4">
                      {t.replies.map((r) => (
                        <div key={r.id} className="flex items-start gap-2.5">
                          <Avatar name={r.author} src={r.authorPhotoUrl} size="sm" decorative tone={r.role === "teacher" ? "teacher" : "neutral"} />
                          <div
                            className={cn(
                              "min-w-0 flex-1 rounded-[var(--radius-control)] border border-rule bg-bg px-3.5 py-2.5",
                              r.role === "teacher" &&
                                "border-primary/25 bg-primary-soft",
                            )}
                          >
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <b className="text-[12.5px] font-semibold text-ink">
                                {r.author}
                              </b>
                              {r.role === "teacher" && (
                                <span className="whitespace-nowrap rounded-full bg-primary-dim px-1.5 py-0.5 text-[12px] font-semibold text-primary">
                                  Teacher
                                </span>
                              )}
                              <span className="ml-auto font-mono text-[12px] text-ink-3">
                                {timeAgo(r.createdAt, now)}
                              </span>
                            </div>
                            <div className="text-[13.5px] leading-relaxed text-ink-2">
                              {r.body}
                            </div>
                          </div>
                          {isTeacher && (
                            <button
                              onClick={() => deleteReply(t.id, r.id)}
                              className="grid size-7 shrink-0 place-items-center rounded text-ink-3 transition-colors hover:bg-danger-dim hover:text-danger"
                              title="Delete reply"
                              aria-label="Delete reply"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 flex flex-col gap-2.5 border-t border-rule pt-4">
                    <textarea
                      rows={2}
                      placeholder={
                        isTeacher ? "Reply as teacher…" : "Write a reply…"
                      }
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      className="w-full min-h-[56px] resize-y rounded-[var(--radius-control)] border border-rule-2 bg-bg px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink outline-none transition-all placeholder:text-ink-3 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                    <div className="flex flex-wrap justify-end gap-2">
                      {isTeacher && (
                        <>
                          <Button
                            onClick={() =>
                              setConfirm({
                                title: "Delete this thread?",
                                message: `“${t.title}” and its ${t.replies.length} ${t.replies.length === 1 ? "reply" : "replies"} will be removed for everyone.`,
                                confirmLabel: "Delete thread",
                                onConfirm: () => run(() => deleteThread(t.id), "Thread deleted"),
                              })
                            }
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                          >
                            <Trash2 size={11} /> Delete
                          </Button>
                          <Button onClick={() => togglePinned(t.id)} variant="ghost" size="sm" disabled={busy}>
                            <Pin size={11} /> {t.pinned ? "Unpin" : "Pin"}
                          </Button>
                        </>
                      )}
                      {canResolve(role, user?.id, t) && (
                        <Button onClick={() => toggleResolved(t.id)} variant="ghost" size="sm" disabled={busy}>
                          <Check size={11} /> {t.resolved ? "Unresolve" : "Resolve"}
                        </Button>
                      )}
                      <Button
                        onClick={() => addReply(t.id)}
                        disabled={!replyDraft.trim() || busy} size="sm"
                      >
                        Post reply
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Bento>
          );
        })}
      </div>

      <ModalShell
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="Start a new thread"
        maxWidth="720px"
        footer={
          <>
            <Button
              onClick={() => setNewOpen(false)} variant="ghost"
            >
              Cancel
            </Button>
            <Button onClick={createThread} disabled={busy}>
              {busy ? "Posting…" : "Post thread"}
            </Button>
          </>
        }
      >
        <div className="mb-4">
          <span className="mb-1.5 block text-[12px] font-medium text-ink-3">
            Category
          </span>
          <ChipRow>
            {tagsFor(role).map((c) => (
              <Chip key={c} active={newTag === c} onClick={() => setNewTag(c)}>
                {c}
              </Chip>
            ))}
          </ChipRow>
        </div>
        <Field label="Title">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="What do you want to talk about?"
            autoFocus
            maxLength={140}
            className={inputClass}
          />
        </Field>
        <Field label="Body">
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            rows={5}
            placeholder="Explain your question or idea. Be specific."
            className={cn(inputClass, "min-h-[120px] resize-y leading-relaxed")}
          />
        </Field>
        <div className="mt-2 flex items-start gap-2 rounded-[var(--radius-control)] border border-warning/30 bg-warning-dim px-4 py-3 text-[12.5px] leading-relaxed text-warning">
          <Sparkles size={13} className="mt-0.5 shrink-0" />
          <span>
            <b className="font-semibold">Community rules.</b> Keep it on topic,
            respect everyone, no spam. All messages are visible to teachers.
          </span>
        </div>
      </ModalShell>
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        onConfirm={() => {
          const go = confirm?.onConfirm;
          setConfirm(null);
          go?.();
        }}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
};
