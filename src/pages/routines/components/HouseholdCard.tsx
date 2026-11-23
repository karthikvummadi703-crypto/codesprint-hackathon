import { Plus, Trash2, Users } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Input, Label } from '../../../components/ui/Input';
import { describeHousehold } from '../../../services/lifestyleService';
import type { HouseholdMember, HouseholdMemberKind, HouseholdProfile } from '../../../types';
import { MEMBER_KINDS } from '../modules/constants';

interface HouseholdCardProps {
  household: HouseholdProfile;
  sensitive: boolean;
  memberName: string;
  memberKind: HouseholdMemberKind;
  onMemberNameChange: (value: string) => void;
  onMemberKindChange: (kind: HouseholdMemberKind) => void;
  onAddMember: () => void;
  onRemoveMember: (id: string) => void;
}

function MemberRow({
  member,
  onRemove,
}: {
  member: HouseholdMember;
  onRemove: (id: string) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
      <span className="text-sm text-slate-700">{member.name}</span>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-slate-400">{member.kind}</span>
        <button
          type="button"
          aria-label={`Remove ${member.name} from household`}
          onClick={() => onRemove(member.id)}
          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

function MemberForm({
  memberName,
  memberKind,
  onMemberNameChange,
  onMemberKindChange,
  onAddMember,
}: Pick<
  HouseholdCardProps,
  'memberName' | 'memberKind' | 'onMemberNameChange' | 'onMemberKindChange' | 'onAddMember'
>) {
  return (
    <div className="space-y-2 border-t border-slate-100 pt-3">
      <Label htmlFor="member-name">Name</Label>
      <Input
        id="member-name"
        value={memberName}
        onChange={e => onMemberNameChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onAddMember();
          }
        }}
        placeholder="e.g. Riya"
      />
      <Label htmlFor="member-kind">Needs</Label>
      <select
        id="member-kind"
        value={memberKind}
        onChange={e => onMemberKindChange(e.target.value as HouseholdMemberKind)}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
      >
        {MEMBER_KINDS.map(kind => (
          <option key={kind.value} value={kind.value}>
            {kind.label}
          </option>
        ))}
      </select>
      <Button type="button" variant="outline" size="sm" onClick={onAddMember}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add member
      </Button>
    </div>
  );
}

export default function HouseholdCard({
  household,
  sensitive,
  memberName,
  memberKind,
  onMemberNameChange,
  onMemberKindChange,
  onAddMember,
  onRemoveMember,
}: HouseholdCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-5 w-5 text-brand-600" /> Household members
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-slate-500 leading-relaxed">
          {describeHousehold(household)}{' '}
          {sensitive ? 'Your plan includes extra protection for sensitive members.' : ''}
        </p>
        <ul className="space-y-2">
          {household.members.map(member => (
            <MemberRow key={member.id} member={member} onRemove={onRemoveMember} />
          ))}
        </ul>
        {household.members.length === 0 && (
          <p className="text-xs text-slate-400">No members yet. Add the people you plan for.</p>
        )}
        <MemberForm
          memberName={memberName}
          memberKind={memberKind}
          onMemberNameChange={onMemberNameChange}
          onMemberKindChange={onMemberKindChange}
          onAddMember={onAddMember}
        />
      </CardContent>
    </Card>
  );
}
