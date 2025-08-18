import React, { useState } from 'react';
import { Users, Video, Mic, MicOff, VideoOff, Settings, UserPlus } from 'lucide-react';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { Button } from '@/components/ui/Button';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { User } from '@/types';
import { cn } from '@/lib/utils';

export const UsersPanel: React.FC = () => {
  const { 
    users, 
    currentUser, 
    mediaState,
    updateUser 
  } = useCollaborationStore();
  
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');

  const handleInviteUser = () => {
    // In a real app, this would send an invitation
    console.log('Inviting user:', inviteEmail);
    setInviteEmail('');
    setShowInviteModal(false);
  };

  const toggleUserAudio = (userId: string) => {
    // This would typically control the user's audio stream
    console.log('Toggle audio for user:', userId);
  };

  const toggleUserVideo = (userId: string) => {
    // This would typically control the user's video stream
    console.log('Toggle video for user:', userId);
  };

  const getUserMediaState = (userId: string) => {
    // In a real app, this would get the actual media state for each user
    if (userId === currentUser?.id) {
      return mediaState;
    }
    return { audio: false, video: false, screen: false };
  };

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-gray-600" />
          <h3 className="font-medium text-gray-900">Users</h3>
          <span className="text-sm text-gray-500">({users.length})</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowInviteModal(true)}
          className="h-8 w-8"
          title="Invite user"
        >
          <UserPlus className="h-4 w-4" />
        </Button>
      </div>

      {/* Current User */}
      {currentUser && (
        <div className="p-4 border-b border-gray-100 bg-blue-50">
          <div className="flex items-center gap-3 mb-3">
            <UserAvatar user={currentUser} size="md" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {currentUser.name} (You)
              </p>
              <p className="text-xs text-gray-500">Host</p>
            </div>
          </div>
          
          {/* Media Controls */}
          <div className="flex gap-2">
            <Button
              variant={mediaState.audio ? "default" : "outline"}
              size="sm"
              className={cn(
                "flex-1",
                !mediaState.audio && "text-red-600 border-red-200"
              )}
            >
              {mediaState.audio ? (
                <Mic className="h-4 w-4" />
              ) : (
                <MicOff className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant={mediaState.video ? "default" : "outline"}
              size="sm"
              className={cn(
                "flex-1",
                !mediaState.video && "text-red-600 border-red-200"
              )}
            >
              {mediaState.video ? (
                <Video className="h-4 w-4" />
              ) : (
                <VideoOff className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Other Users */}
      <div className="flex-1 overflow-y-auto">
        {users
          .filter(user => user.id !== currentUser?.id)
          .map(user => {
            const userMediaState = getUserMediaState(user.id);
            return (
              <div key={user.id} className="p-4 border-b border-gray-100 hover:bg-gray-50">
                <div className="flex items-center gap-3 mb-2">
                  <UserAvatar user={user} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {user.name}
                    </p>
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "w-2 h-2 rounded-full",
                          user.isOnline ? "bg-green-500" : "bg-gray-400"
                        )}
                      />
                      <p className="text-xs text-gray-500">
                        {user.isOnline ? "Online" : "Offline"}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100"
                  >
                    <Settings className="h-3 w-3" />
                  </Button>
                </div>

                {/* User Media State */}
                {user.isOnline && (
                  <div className="flex gap-2">
                    <div
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded text-xs",
                        userMediaState.audio 
                          ? "bg-green-100 text-green-700" 
                          : "bg-gray-100 text-gray-500"
                      )}
                    >
                      {userMediaState.audio ? (
                        <Mic className="h-3 w-3" />
                      ) : (
                        <MicOff className="h-3 w-3" />
                      )}
                    </div>
                    <div
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded text-xs",
                        userMediaState.video 
                          ? "bg-green-100 text-green-700" 
                          : "bg-gray-100 text-gray-500"
                      )}
                    >
                      {userMediaState.video ? (
                        <Video className="h-3 w-3" />
                      ) : (
                        <VideoOff className="h-3 w-3" />
                      )}
                    </div>
                  </div>
                )}

                {/* User Activity */}
                {user.cursor && user.isOnline && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-400">
                      Cursor at {Math.round(user.cursor.x)}, {Math.round(user.cursor.y)}
                    </p>
                  </div>
                )}
              </div>
            );
          })}

        {users.filter(user => user.id !== currentUser?.id).length === 0 && (
          <div className="p-8 text-center text-gray-500">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No other users online</p>
            <p className="text-xs mt-1">Invite others to collaborate</p>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      <Modal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        title="Invite User"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Email Address
            </label>
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full"
            />
          </div>
          
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => setShowInviteModal(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleInviteUser}
              disabled={!inviteEmail.trim()}
            >
              Send Invite
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};