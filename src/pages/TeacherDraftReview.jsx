import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { EmptyState, PageError, PageLoading } from "@/components/common";
import { GenerationProgress } from "@/components/teacher-drafts/GenerationProgress";
import { DraftReviewScreen } from "@/components/teacher-drafts/DraftReviewScreen";
import { VariantsReviewScreen } from "@/components/teacher-drafts/VariantsReviewScreen";
import { PublishTestModal } from "@/components/teacher-drafts/PublishTestModal";
import { useToast } from "@/context/useToast";
import { duplicateTest } from "@/api/tests";
import { useDraftAutosave } from "@/hooks/useDraftAutosave";
import { useGeneration } from "@/hooks/useGeneration";
import { useTest } from "@/hooks/useTests";

// Review step of the generate → review → publish flow (§7.6: "the teacher
// reviews the drafted test, can edit any question, and only then
// publishes it"). Edits live in local state and are autosaved to the server
// (see useDraftAutosave); publishing flushes them first so the server
// validates exactly what the teacher sees.
const TeacherDraftReview = () => {
  const { testId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: loaded, isLoading, error, refetch } = useTest(testId);
  const { edits, change, flush, state: saveState } = useDraftAutosave(testId);
  const [publishOpen, setPublishOpen] = useState(false);

  // While personalized tests are being written, follow the server's progress.
  // When it reports "done", re-read the test so every variant appears.
  const running = loaded?.generation?.status === "running";
  const { data: progress } = useGeneration(testId, running);
  const wasRunning = useRef(false);
  useEffect(() => {
    if (running) wasRunning.current = true;
  }, [running]);
  useEffect(() => {
    if (running && progress?.status === "done") refetch();
  }, [running, progress?.status, refetch]);
  useEffect(() => {
    if (!running && wasRunning.current) {
      wasRunning.current = false;
      toast.push(`All ${loaded?.generation?.total ?? ""} personalized tests are ready — spot-check a few, then publish`, "success");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  if (isLoading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={refetch} />;
  if (!loaded) {
    return (
      <EmptyState
        title="Test not found"
        body="It may have been deleted, or the link is out of date."
        action="Back to tests"
        onAction={() => navigate("/teacher/drafts")}
      />
    );
  }

  // The server's copy until the teacher edits something; then their edits.
  const test = { ...loaded, ...edits };
  const generating = loaded.generation?.status === "running";
  const readOnly = loaded.status === "live" || loaded.status === "completed" || generating;
  const scope = `${test.subject} · ${test.cls}`;
  const config = { duration: 30, mix: [], ...test.config, mode: test.mode };
  const toList = () => navigate("/teacher/drafts");

  // Send pending edits first, so what's previewed or published is what's saved.
  const afterSaving = async (next) => {
    try {
      await flush();
      next();
    } catch (err) {
      toast.push(err?.message || "Couldn't save your changes — try again", "error");
    }
  };
  const preview = (variant = 0) =>
    afterSaving(() =>
      navigate(`/teacher/preview/${test.id}${variant ? `?v=${variant}` : ""}`),
    );
  const askPublish = () => (generating ? undefined : afterSaving(() => setPublishOpen(true)));

  // A published test is read-only; these are what a teacher can still do with it.
  const copyAsDraft = async () => {
    try {
      const copy = await duplicateTest(test.id);
      toast.push(`Copied as a new draft: "${copy?.title ?? `${test.title} (copy)`}"`, "success");
      navigate(copy?.id ?? copy?._id ? `/teacher/drafts/${copy.id ?? copy._id}` : "/teacher/drafts");
    } catch (err) {
      toast.push(err?.message || "Couldn't copy the test, try again", "error");
    }
  };
  const lockedActions =
    readOnly && !generating
      ? [
          ...(loaded.status === "live" ? [{ id: "live", label: "Live control", primary: true, onClick: () => navigate(`/teacher/live?test=${test.id}`) }] : []),
          { id: "results", label: "Results", primary: loaded.status === "completed", onClick: () => navigate(`/teacher/results/${test.id}`) },
          { id: "copy", label: "Copy as new draft", onClick: copyAsDraft },
        ]
      : [];

  const shared = {
    lockedActions,
    status: loaded.status,
    config,
    subjectId: test.subjectId,
    scope,
    title: test.title,
    readOnly,
    ...(generating
      ? {
          lockReason: "Still generating — you can look through the finished tests, but not edit them yet.",
          lockSummary: "The personalized tests are still being written, so editing is switched off for now.",
          publishDisabled: true,
        }
      : {}),
    saveState: readOnly ? undefined : saveState,
    onBack: toList,
    backLabel: "Back to tests",
    onPublish: readOnly ? undefined : askPublish,
  };

  return (
    <>
      {generating && (
        <div className="mx-auto max-w-[1360px] px-5 pt-6 tablet:px-10 tablet:pt-8">
          <GenerationProgress generation={progress?.status === "running" ? progress : loaded.generation} />
        </div>
      )}
      {test.mode === "personal" ? (
        <VariantsReviewScreen
          {...shared}
          variants={test.variants ?? []}
          onVariantsChange={(variants) => change({ variants })}
          onPreview={preview}
          onPublishAll={shared.onPublish}
        />
      ) : (
        <DraftReviewScreen
          {...shared}
          questions={test.questionSet ?? []}
          onQuestionsChange={(questionSet) => change({ questionSet })}
          onPreview={() => preview(0)}
          onSave={
            readOnly
              ? undefined
              : () =>
                  afterSaving(() => {
                    toast.push("Draft saved", "success");
                    toList();
                  })
          }
        />
      )}

      <PublishTestModal
        test={test}
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onPublished={toList}
      />
    </>
  );
};

export default TeacherDraftReview;
