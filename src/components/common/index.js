// Lightweight shared UI primitives. Heavy modules (charts/, lms/, discussion/, QuestionMixBuilder)
// are imported by path so they stay out of the initial bundle.
export { AnimatedNumber } from "./AnimatedNumber";
export { Avatar } from "./Avatar";
export { Bento } from "./Bento";
export { BrandMark, Wordmark } from "./BrandMark";
export { BRAND } from "./brand";
export { ChipRow, Chip, FilterButton } from "./Chips";
export { ConfirmDialog } from "./ConfirmDialog";
export { Conn } from "./Conn";
export { Th, Td, TableShell } from "./DataTable";
export { EmptyState } from "./EmptyState";
export { Field } from "./FormField";
export { inputClass } from "./inputClass";
export { Icon } from "./Icon";
export { InstitutionMark, InstitutionWordmark, PrintHeader } from "./InstitutionMark";
export { Kbd } from "./Kbd";
export { KpiStrip, Kpi } from "./KpiStrip";
export { LoadingButton } from "./LoadingButton";
export { MetricCard } from "./MetricCard";
export { ModalShell } from "./ModalShell";
export { PageError, PageLoading } from "./QueryState";
export { Scope } from "./Scope";
export { SectionHeader } from "./SectionHeader";
export { SubjectGate } from "./SubjectGate";
export { Skeleton, SkeletonText, SkeletonCard, SkeletonRow } from "./Skeleton";
export { StatusDot } from "./StatusDot";
