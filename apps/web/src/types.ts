// Local UI types. Domain types come from @foldo/protocol.
//
// We re-export the protocol's domain types so existing imports keep working;
// the canvas-specific UI types below (Tool, SelectedElement, ViewportState) are
// not part of the wire protocol and stay here.

export type {
  AppFrameContent,
  Board,
  BoardId,
  Branch,
  Comment,
  CommentAnchor,
  CommentPin as CommentPinAnchor,
  CommentReply,
  CommentTarget,
  Dispatch,
  DispatchStatus,
  Frame,
  FrameContent,
  FrameKind,
  MarkdownFrameContent,
  RecipeStep,
  StepDiff,
  TakeStatus,
  User,
  UserId,
  Variant,
  VariantOverrides,
  WalkthroughFrameContent,
} from '@foldo/protocol';

export type Tool = 'select' | 'hand' | 'comment' | 'edit';

export interface SelectedElement {
  frameId: string;
  label: string;
  file: string;
  line: number;
  currentSource: string;
  /** Pixel coords on the frame for the highlight overlay. */
  rect: { x: number; y: number; width: number; height: number };
}
