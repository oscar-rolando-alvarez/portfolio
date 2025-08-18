import React, { useState } from 'react';
import { Comment } from '@/types';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { MessageCircle, X, Reply } from 'lucide-react';

interface CommentsProps {
  comments: Comment[];
}

export const Comments: React.FC<CommentsProps> = ({ comments }) => {
  const { updateComment, deleteComment, users, currentUser } = useCollaborationStore();
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const handleResolveComment = (commentId: string) => {
    updateComment(commentId, { resolved: true });
  };

  const handleDeleteComment = (commentId: string) => {
    deleteComment(commentId);
  };

  const handleAddReply = (commentId: string) => {
    if (!replyText.trim() || !currentUser) return;

    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;

    const newReply = {
      id: Date.now().toString(),
      text: replyText,
      userId: currentUser.id,
      timestamp: Date.now(),
    };

    updateComment(commentId, {
      replies: [...comment.replies, newReply],
    });

    setReplyText('');
  };

  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user?.name || 'Unknown User';
  };

  const getUserColor = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user?.color || '#666';
  };

  return (
    <>
      {comments
        .filter(comment => !comment.resolved)
        .map(comment => (
          <div key={comment.id}>
            {/* Comment marker */}
            <div
              className="comment-marker"
              style={{
                left: comment.x,
                top: comment.y,
                backgroundColor: getUserColor(comment.userId),
              }}
              onClick={() => setActiveComment(
                activeComment === comment.id ? null : comment.id
              )}
            >
              <MessageCircle size={12} color="white" />
            </div>

            {/* Comment popup */}
            {activeComment === comment.id && (
              <div
                className="absolute bg-white border border-gray-200 rounded-lg shadow-lg p-4 min-w-64 max-w-80 z-50"
                style={{
                  left: comment.x + 30,
                  top: comment.y,
                }}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium"
                      style={{ backgroundColor: getUserColor(comment.userId) }}
                    >
                      {getUserName(comment.userId).charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium">
                      {getUserName(comment.userId)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(comment.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <button
                    onClick={() => setActiveComment(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Comment text */}
                <div className="mb-3">
                  <p className="text-sm text-gray-800">{comment.text}</p>
                </div>

                {/* Replies */}
                {comment.replies.length > 0 && (
                  <div className="border-t pt-3 mb-3">
                    {comment.replies.map(reply => (
                      <div key={reply.id} className="mb-2 pl-4 border-l-2 border-gray-100">
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className="w-4 h-4 rounded-full flex items-center justify-center text-white text-xs"
                            style={{ backgroundColor: getUserColor(reply.userId) }}
                          >
                            {getUserName(reply.userId).charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs font-medium">
                            {getUserName(reply.userId)}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(reply.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-xs text-gray-700">{reply.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply input */}
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    placeholder="Add a reply..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleAddReply(comment.id);
                      }
                    }}
                    className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded"
                  />
                  <button
                    onClick={() => handleAddReply(comment.id)}
                    disabled={!replyText.trim()}
                    className="px-2 py-1 text-xs bg-blue-500 text-white rounded disabled:opacity-50"
                  >
                    <Reply size={12} />
                  </button>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleResolveComment(comment.id)}
                    className="flex-1 px-3 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                  >
                    Resolve
                  </button>
                  {comment.userId === currentUser?.id && (
                    <button
                      onClick={() => handleDeleteComment(comment.id)}
                      className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
    </>
  );
};