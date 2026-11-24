import { Avatar } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { PhotoActions } from "./PhotoActions";

const ROLE_LABEL = { admin: "Administrator", teacher: "Teacher", student: "Student" };

// Avatar, name, role and classes. The photo slot is filled in F13d (photoUrl is null until then).
export const ProfileHeader = ({ profile, institution }) => (
  <header className="mb-8 flex flex-col items-start gap-4 narrow:flex-row narrow:items-center narrow:gap-6">
    <Avatar name={profile.name} src={profile.photoUrl} size="xl" decorative />
    <div className="min-w-0">
      <h1 className="font-serif text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink tablet:text-[34px] [overflow-wrap:anywhere]">
        {profile.name}
      </h1>
      {institution?.name && (
        <p className="mt-1.5 flex items-center gap-2 text-[13px] text-ink-3">
          {institution.logo && <img src={institution.logo} alt="" className="size-5 rounded-sm object-contain" />}
          {institution.name}
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge variant="primary">{ROLE_LABEL[profile.role] ?? profile.role}</Badge>
        {profile.classes.map((c) => (
          <Badge key={c.id} variant="outline" title={c.name}>
            {c.code}
          </Badge>
        ))}
      </div>
      <PhotoActions profile={profile} institution={institution} />
    </div>
  </header>
);
