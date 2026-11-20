import React from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input, Label } from '../../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { describeHousehold } from '../../services/lifestyleService';
import { HouseholdMemberKind, HouseholdProfile } from '../../types';
import { MEMBER_KINDS } from './constants';

interface HouseholdCardProps {
  household: HouseholdProfile;
  sensitive: boolean;
  memberName: string;
  memberKind: HouseholdMemberKind;
  setHousehold: React.Dispatch<React.SetStateAction<HouseholdProfile>>;
  setMemberName: React.Dispatch<React.SetStateAction<string>>;
  setMemberKind: React.Dispatch<React.SetStateAction<HouseholdMemberKind>>;
  onAddMember: () => void;
}

export default function HouseholdCard({
  household,
  sensitive,
  memberName,
  memberKind,
  setHousehold,
  setMemberName,
  setMemberKind,
  onAddMember,
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
          {household.members.map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
            >
              <span className="text-sm text-slate-700">{member.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">{member.kind}</span>
                <button
                  type="button"
                  aria-label={`Remove ${member.name} from household`}
                  onClick={() =>
                    setHousehold((prev) => ({
                      ...prev,
                      members: prev.members.filter((m) => m.id !== member.id),
                    }))
                  }
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
        {household.members.length === 0 && (
          <p className="text-xs text-slate-400">No members yet. Add the people you plan for.</p>
        )}
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <Label htmlFor="member-name">Name</Label>
          <Input
            id="member-name"
            value={memberName}
            onChange={(e) => setMemberName(e.target.value)}
            onKeyDown={(e) => {
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
            onChange={(e) => setMemberKind(e.target.value as HouseholdMemberKind)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
          >
            {MEMBER_KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" size="sm" onClick={onAddMember}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add member
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
