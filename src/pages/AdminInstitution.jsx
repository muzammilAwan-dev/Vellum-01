import { PageError, PageLoading } from "@/components/common";
import { InstitutionForm } from "@/components/admin-institution/InstitutionForm";
import { PrivacyPolicyEditor } from "@/components/admin-institution/PrivacyPolicyEditor";
import { useInstitution } from "@/hooks/useInstitution";

const AdminInstitution = () => {
  const { data: institution, isLoading, error, refetch } = useInstitution();
  if (isLoading) return <PageLoading />;
  if (error || !institution) return <PageError error={error} onRetry={refetch} />;
  return (
    <div className="mx-auto max-w-[880px] px-5 py-6 tablet:px-10 tablet:py-8">
      <h1 className="mb-1.5 font-serif text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink tablet:text-[34px]">Institution</h1>
      <p className="mb-8 max-w-[56ch] text-[14px] leading-relaxed text-ink-2">
        Your institution's name and logo appear on the sign-in page, the sidebar, test pages, printed reports and every profile. These settings apply to everyone.
      </p>
      <InstitutionForm institution={institution} />
      <PrivacyPolicyEditor />
    </div>
  );
};

export default AdminInstitution;
