import React from 'react';
import { ChevronDown, GitBranch, Loader2, Move, Send, Trash2 } from 'lucide-react';

import { CanvasNode, Model } from '../../types/canvas';

interface CanvasNodeCardProps {
  node: CanvasNode;
  model: Model;
  isRoot?: boolean;
  inputValue: string;
  isProcessing: boolean;
  showModelSelector: boolean;
  models: Model[];
  onToggleExpansion: () => void;
  onCreateBranch: () => void;
  onDelete?: () => void;
  onToggleModelSelector: () => void;
  onSelectModel: (modelId: string) => void;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onTextSelection: (messageIndex: number) => void;
  chatScrollRef: (el: HTMLDivElement | null) => void;
}

const CanvasNodeCard: React.FC<CanvasNodeCardProps> = ({
  node,
  model,
  isRoot = false,
  inputValue,
  isProcessing,
  showModelSelector,
  models,
  onToggleExpansion,
  onCreateBranch,
  onDelete,
  onToggleModelSelector,
  onSelectModel,
  onInputChange,
  onSend,
  onTextSelection,
  chatScrollRef
}) => {
  return (
    <div
      className={`bg-white rounded-xl shadow-lg border h-full flex flex-col transition-all duration-300 ${
        node.isExpanded ? 'border-slate-300 shadow-xl' : 'border-slate-200'
      }`}
    >
      <div className="p-4 bg-slate-50 rounded-t-xl border-b border-slate-200 flex justify-between items-center cursor-move">
        <div className="flex items-center gap-3">
          <Move className="w-4 h-4 text-slate-400" />
          <span className="font-medium text-slate-700 truncate max-w-48">{node.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded-full ${model.color}`}>{model.short}</span>
          <button
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpansion();
            }}
            className="px-3 py-1 hover:bg-slate-200 rounded-lg text-xs text-slate-600 transition-colors duration-200"
          >
            {node.isExpanded ? 'Collapse' : 'Expand'}
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              onCreateBranch();
            }}
            className="p-2 hover:bg-indigo-100 rounded-lg transition-colors duration-200"
          >
            <GitBranch className="w-4 h-4 text-indigo-600" />
          </button>
          {!isRoot && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                onDelete?.();
              }}
              className="p-2 hover:bg-red-100 rounded-lg transition-colors duration-200"
            >
              <Trash2 className="w-4 h-4 text-red-500" />
            </button>
          )}
        </div>
      </div>

      {node.isExpanded ? (
        <>
          <div
            ref={chatScrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-3 chat-content scroll-smooth"
          >
            {node.messages.map((msg, idx) => (
              <div key={idx}>
                {msg.role === 'user' ? (
                  <div className="flex justify-end mb-2">
                    <div className="bg-indigo-600 text-white px-4 py-2 rounded-2xl rounded-tr-sm max-w-[75%] shadow-sm">
                      {msg.content}
                    </div>
                  </div>
                ) : msg.role === 'system' ? (
                  <div className="flex justify-center mb-2">
                    <div className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div className="mb-2">
                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 mt-1">
                        AI
                      </div>
                      <div className="flex-1">
                        <div
                          className="bg-slate-50 text-slate-800 px-4 py-3 rounded-2xl rounded-tl-sm border border-slate-200 selectable-message select-text cursor-text"
                          onMouseUp={() => onTextSelection(idx)}
                        >
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isProcessing && (
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                  AI
                </div>
                <div className="bg-slate-50 px-4 py-3 rounded-2xl rounded-tl-sm border border-slate-200 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                  <span className="text-sm text-slate-600">Thinking...</span>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-200 chat-content bg-white rounded-b-xl">
            <div className="flex items-center gap-2 mb-3">
              <div className="relative model-selector">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleModelSelector();
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all duration-200 ${model.color} hover:shadow-sm`}
                >
                  <span className="font-medium">{model.short}</span>
                  <ChevronDown
                    className={`w-3 h-3 transition-transform duration-200 ${showModelSelector ? 'rotate-180' : ''}`}
                  />
                </button>

                {showModelSelector && (
                  <div className="absolute bottom-full mb-2 left-0 bg-white border border-slate-200 rounded-lg shadow-xl z-10 min-w-48">
                    {models.map((option) => (
                      <button
                        key={option.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectModel(option.id);
                        }}
                        className={`w-full p-3 text-left hover:bg-slate-50 flex justify-between items-center transition-colors duration-150 first:rounded-t-lg last:rounded-b-lg ${
                          node.model === option.id ? 'bg-indigo-50 border-l-4 border-indigo-500' : ''
                        }`}
                      >
                        <div>
                          <div className="font-medium text-slate-800 text-sm">{option.name}</div>
                          <div className="text-xs text-slate-500">{option.description}</div>
                        </div>
                        {node.model === option.id && <div className="w-2 h-2 bg-indigo-500 rounded-full" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(event) => onInputChange(event.target.value)}
                onKeyPress={(event) => event.key === 'Enter' && onSend()}
                placeholder="Ask anything..."
                className="flex-1 px-4 py-2.5 bg-slate-100 border-0 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-200"
                disabled={isProcessing}
              />
              <button
                onClick={onSend}
                disabled={isProcessing}
                className="px-4 py-2.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-md"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 p-4 overflow-hidden cursor-move">
          <div className="space-y-2">
            {node.messages.slice(-2).map((msg, idx) => (
              <div
                key={idx}
                className={`p-2.5 rounded-lg text-sm ${
                  msg.role === 'user'
                    ? 'bg-indigo-100 text-indigo-800'
                    : msg.role === 'system'
                    ? 'bg-amber-100 text-amber-700 text-xs'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {msg.content.length > 100 ? `${msg.content.slice(0, 100)}...` : msg.content}
              </div>
            ))}
            {node.messages.length > 2 && (
              <div className="text-slate-500 text-center text-xs">+{node.messages.length - 2} more</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CanvasNodeCard;
