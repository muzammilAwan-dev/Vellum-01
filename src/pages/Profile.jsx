import { PageError, PageLoading } from "@/components/common";
import { ProfileBasics } from "@/components/profile/ProfileBasics";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfilePreferences } from "@/components/profile/ProfilePreferences";
import { ParentMessageStyle } from "@/components/profile/ParentMessageStyle";
import { ProfileSecurity } from "@/components/profile/ProfileSecurity";
import { useApp } from "@/context/useApp";
import { Link } from "react-router";
import { useProfile } from "@/hooks/useProfile";
import { useInstitution } from "@/hooks/useInstitution";

// One page for every role, mounted at /admin/profile, /teacher/profile and /student/profile.
const Profile = () => {
  const { data: profile, isLoading, error, refetch } = useProfile();
  const { user } = useApp();
  const { data: institution } = useInstitution(); // the header still renders if this fails
  const forced = user?.mustChangePassword === true; // temporary password: Security comes first
  if (isLoading) return <PageLoading />;
  if (error || !profile) return <PageError error={error} onRetry={refetch} />;
  return (
    <div className="mx-auto max-w-[880px] px-5 py-6 tablet:px-10 tablet:py-8">
      <ProfileHeader profile={profile} institution={institution} />
      {forced && <ProfileSecurity profile={profile} forced />}
      <ProfileBasics profile={profile} />
      {!forced && <ProfileSecurity profile={profile} forced={false} />}
      <ProfilePreferences />
      {profile.role === "teacher" && !forced && <ParentMessageStyle profile={profile} />}
      <p className="mt-2 text-[12.5px]"><Link to="/privacy" className="text-ink-3 underline underline-offset-2 hover:text-ink">Privacy policy</Link></p>
    </div>
  );
};

export default Profile;
