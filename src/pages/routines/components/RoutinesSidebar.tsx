import { Button } from '../../../components/ui/Button';
import type { RoutineController } from '../hooks/useRoutines';
import CommunityWatchCard from './CommunityWatchCard';
import HouseholdCard from './HouseholdCard';

interface RoutinesSidebarProps {
  controller: RoutineController;
}

export default function RoutinesSidebar({ controller }: RoutinesSidebarProps) {
  return (
    <div className="space-y-6">
      <HouseholdCard
        household={controller.household}
        sensitive={controller.sensitive}
        memberName={controller.memberName}
        memberKind={controller.memberKind}
        onMemberNameChange={controller.setMemberName}
        onMemberKindChange={controller.setMemberKind}
        onAddMember={controller.handleAddMember}
        onRemoveMember={controller.removeMember}
      />

      <CommunityWatchCard
        places={controller.places}
        placeAqi={controller.placeAqi}
        placeQuery={controller.placeQuery}
        suggestions={controller.suggestions}
        onPlaceQueryChange={controller.setPlaceQuery}
        onAddPlace={controller.handleAddPlace}
        onRemovePlace={controller.removePlace}
      />

      <Button
        onClick={() => void controller.handleSave()}
        loading={controller.saving}
        className="w-full"
      >
        Save household &amp; community watch
      </Button>
      <p className="text-[11px] text-slate-400 leading-relaxed" role="status">
        {controller.routineCount} routines are available to the AI assistant when you ask about
        daily habits.
      </p>
    </div>
  );
}
