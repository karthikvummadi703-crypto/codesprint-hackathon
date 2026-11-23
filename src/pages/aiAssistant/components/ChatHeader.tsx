import { Paperclip } from 'lucide-react';
import { Button } from '../../../components/ui/Button';

interface ChatHeaderProps {
  title: string;
  showUploadPanel: boolean;
  uploadedCount: number;
  onToggleUploadPanel: () => void;
}

export default function ChatHeader({
  title,
  showUploadPanel,
  uploadedCount,
  onToggleUploadPanel,
}: ChatHeaderProps) {
  return (
    <div className="h-16 border-b border-slate-100 flex items-center justify-between px-6 shrink-0">
      <div>
        <h2 className="text-base font-bold text-slate-900 leading-tight">{title}</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          AirGuard Intelligent Environmental Assistant
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          variant={showUploadPanel ? 'secondary' : 'outline'}
          size="sm"
          className="h-9 gap-1.5"
          onClick={onToggleUploadPanel}
        >
          <Paperclip className="h-4 w-4" />
          Knowledge Base ({uploadedCount})
        </Button>
      </div>
    </div>
  );
}
