import type {
  Comment,
  CommentReply,
  CreateCommentRequest,
  ReplyToCommentRequest,
  SuccessResponse,
  UpdateCommentRequest,
} from '@foldo/protocol';
import { api } from './client';

export function createComment(body: CreateCommentRequest) {
  return api<Comment>('/api/comments', { method: 'POST', body });
}

export function updateComment(commentId: string, body: UpdateCommentRequest) {
  return api<Comment>(`/api/comments/${encodeURIComponent(commentId)}`, {
    method: 'PATCH',
    body,
  });
}

export function deleteComment(commentId: string) {
  return api<SuccessResponse>(`/api/comments/${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
  });
}

export function replyToComment(commentId: string, body: ReplyToCommentRequest) {
  return api<CommentReply>(
    `/api/comments/${encodeURIComponent(commentId)}/replies`,
    { method: 'POST', body },
  );
}
