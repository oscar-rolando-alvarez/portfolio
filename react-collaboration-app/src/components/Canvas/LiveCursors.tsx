import React from 'react';
import { User } from '@/types';
import { useCollaborationStore } from '@/stores/collaborationStore';

interface LiveCursorsProps {
  users: User[];
}

export const LiveCursors: React.FC<LiveCursorsProps> = ({ users }) => {
  const { currentUser } = useCollaborationStore();

  return (
    <>
      {users
        .filter(user => user.id !== currentUser?.id && user.cursor && user.isOnline)
        .map(user => (
          <div
            key={user.id}
            className="cursor-pointer"
            style={{
              left: user.cursor!.x,
              top: user.cursor!.y,
              color: user.color,
            }}
            data-user={user.name}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19841L11.7841 12.3673H5.65376Z"
                fill={user.color}
                stroke="white"
                strokeWidth="1"
              />
            </svg>
          </div>
        ))}
    </>
  );
};