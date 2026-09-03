import {
  FolderPlus, Pencil, ArrowRightLeft, Archive, RotateCcw, Trash2, RotateCw,
  Pin, PinOff, Users, StickyNote, Gavel, CheckCircle2, PauseCircle,
  Clock3, XCircle, CalendarClock, UserX, CalendarPlus, FileUp, FileX,
  Loader2, FileCheck, AlertTriangle, Sparkles, Download, Scale,
} from 'lucide-react';

/** Falls back to Gavel for any event type not explicitly mapped. */
export const EVENT_ICON = {
  CASE_CREATED: FolderPlus,
  CASE_UPDATED: Pencil,
  CASE_STATUS_CHANGED: ArrowRightLeft,
  CASE_ARCHIVED: Archive,
  CASE_RESTORED: RotateCcw,
  CASE_DELETED: Trash2,
  CASE_UNDELETED: RotateCw,
  CASE_PINNED: Pin,
  CASE_UNPINNED: PinOff,
  PARTY_ADDED: Users,
  PARTY_UPDATED: Users,
  PARTY_REMOVED: Users,
  NOTE_ADDED: StickyNote,
  NOTE_UPDATED: StickyNote,
  NOTE_DELETED: StickyNote,
  DOCUMENT_UPLOADED: FileUp,
  DOCUMENT_DELETED: FileX,
  DOCUMENT_PROCESSING_STARTED: Loader2,
  DOCUMENT_PROCESSED: FileCheck,
  DOCUMENT_PROCESSING_FAILED: AlertTriangle,
  AI_ANALYSIS_STARTED: Loader2,
  AI_ANALYSIS_COMPLETED: Sparkles,
  AI_ANALYSIS_FAILED: AlertTriangle,
  ARGUMENTS_GENERATION_STARTED: Loader2,
  ARGUMENTS_GENERATION_COMPLETED: Scale,
  ARGUMENTS_GENERATION_FAILED: AlertTriangle,
  HEARING_CREATED: Gavel,
  HEARING_UPDATED: Gavel,
  HEARING_COMPLETED: CheckCircle2,
  HEARING_ADJOURNED: PauseCircle,
  HEARING_POSTPONED: Clock3,
  HEARING_CANCELLED: XCircle,
  HEARING_RESCHEDULED: CalendarClock,
  HEARING_NO_APPEARANCE: UserX,
  HEARING_DELETED: Trash2,
  NEXT_HEARING_SCHEDULED: CalendarPlus,
  REPORT_GENERATED: Download,
};

export function iconFor(eventType) {
  return EVENT_ICON[eventType] || Gavel;
}
