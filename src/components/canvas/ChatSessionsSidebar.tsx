import React from 'react';
import { Plus, MessageSquare, Trash2 } from 'lucide-react';
import { ChatSession } from '../../types/canvas';

interface ChatSessionsSidebarProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: () => void;
  onDeleteSession: (sessionId: string) => void;
}

const ChatSessionsSidebar: React.FC<ChatSessionsSidebarProps> = ({
  sessions,
  currentSessionId,
  onSelectSession,
  onCreateSession,
  onDeleteSession
}) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="w-64 bg-white border-r border-slate-200 flex flex-col h-full">
      <div className="p-4 border-b border-slate-200">
        <button
          onClick={onCreateSession}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors duration-200 font-medium text-sm"
        >
          <Plus className="w-4 h-4" />
          New Canvas
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-1">
          {sessions.length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-sm">
              No sessions yet. Create a new canvas to get started!
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className={`group relative p-3 rounded-lg cursor-pointer transition-colors duration-150 ${
                  currentSessionId === session.id
                    ? 'bg-indigo-50 border border-indigo-200'
                    : 'hover:bg-slate-50 border border-transparent'
                }`}
                onClick={() => onSelectSession(session.id)}
              >
                <div className="flex items-start gap-2">
                  <MessageSquare
                    className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                      currentSessionId === session.id ? 'text-indigo-600' : 'text-slate-400'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-xs text-slate-700 line-clamp-2 leading-relaxed ${
                        currentSessionId === session.id ? 'text-indigo-700' : ''
                      }`}
                    >
                      {session.title}
                    </div>
                    <div className="text-xs text-slate-400 mt-1.5">
                      {formatDate(session.updated_at)}
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(session.id);
                  }}
                  className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 text-red-500 transition-opacity duration-150"
                  title="Delete session"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatSessionsSidebar;

