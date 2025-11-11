import React, { useState } from 'react';
import { ChevronDown, Copy, Check, GitBranch, Move, Send, Trash2 } from 'lucide-react';

import { CanvasNode, Model } from '../../types/canvas';
import ReactMarkdown from 'react-markdown';

interface CanvasNodeCardProps {
  node: CanvasNode;
  model: Model;
  isRoot?: boolean;
  inputValue: string;
  isProcessing: boolean;
  showModelSelector: boolean;
  models: Model[];
  summary: string;
  childInsights: Record<string, string>;
  knowledgeUpdatedAt: string | null;
  onToggleExpansion: () => void;
  onCreateBranch: () => void;
  onDelete?: () => void;
  onToggleModelSelector: () => void;
  onSelectModel: (modelId: string) => void;
  onInputChange: (value: string) => void;
  onSend: () => void;
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
  summary,
  childInsights,
  knowledgeUpdatedAt,
  onToggleExpansion,
  onCreateBranch,
  onDelete,
  onToggleModelSelector,
  onSelectModel,
  onInputChange,
  onSend,
  chatScrollRef
}) => {
  const [showKnowledgePanel, setShowKnowledgePanel] = useState(false);
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null);
  const hasKnowledge = Boolean(summary.trim() || Object.keys(childInsights).length > 0);
  const knowledgeTimestamp = knowledgeUpdatedAt
    ? new Date(knowledgeUpdatedAt).toLocaleTimeString()
    : null;

  const handleCopy = async (content: string, messageIndex: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageIndex(messageIndex);
      setTimeout(() => setCopiedMessageIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  return (
    <div
      className={`bg-white rounded-2xl shadow-xl border h-full flex flex-col transition-all duration-300 backdrop-blur-sm text-[15px] text-slate-800 ${
        node.isExpanded ? 'border-slate-300 shadow-xl' : 'border-slate-200'
      }`}
    >
      <div className="p-5 bg-slate-50 rounded-t-2xl border-b border-slate-200 flex justify-between items-center cursor-move">
        <div className="flex items-center gap-3">
          <Move className="w-4 h-4 text-slate-400" />
          <span className="font-medium text-slate-700 truncate max-w-72">{node.title}</span>
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
              setShowKnowledgePanel((prev) => !prev);
            }}
            className={`px-3 py-1 rounded-lg text-xs transition-colors duration-200 flex items-center gap-1 ${
              showKnowledgePanel
                ? 'bg-indigo-100 text-indigo-600'
                : hasKnowledge
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            Knowledge
            <ChevronDown
              className={`w-3 h-3 transition-transform duration-200 ${showKnowledgePanel ? 'rotate-180' : ''}`}
            />
          </button>
          {knowledgeTimestamp && (
            <span className="text-[10px] text-slate-400">{knowledgeTimestamp}</span>
          )}
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
            className="flex-1 overflow-y-auto px-5 py-6 space-y-5 chat-content chat-scrollable scroll-smooth cursor-default"
          >
            {node.messages.map((msg, idx) => {
              if (msg.role === 'system') {
                return (
                  <div key={idx} className="flex justify-center">
                    <div className="bg-amber-100 text-amber-800 px-4 py-1.5 rounded-full text-xs tracking-wide">
                      {msg.content}
                    </div>
                  </div>
                );
              }

              if (msg.role === 'user') {
                return (
                  <div key={idx} className="flex justify-end">
                    <div className="bg-indigo-600 text-white px-6 py-[14px] rounded-3xl rounded-tr-md max-w-[75%] shadow-lg text-base leading-relaxed">
                      {msg.content}
                    </div>
                  </div>
                );
              }

              const isLastMessage = idx === node.messages.length - 1;
              const isStreaming = isProcessing && isLastMessage && msg.role === 'assistant';
              const isCopied = copiedMessageIndex === idx;

              return (
                <div key={idx} className="selectable-message group relative" data-node-id={node.id} data-message-index={idx}>
                  <div
                    className="w-full rounded-2xl border border-slate-200 bg-white/85 px-6 py-[18px] text-base leading-relaxed text-slate-800 shadow-sm backdrop-blur-sm select-text prose prose-slate max-w-none prose-headings:text-slate-800 prose-p:text-slate-800 prose-strong:text-slate-900 prose-code:text-indigo-600 prose-code:bg-indigo-50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-slate-100 prose-pre:border prose-pre:border-slate-200"
                    onMouseUp={(mouseEvent) => {
                      mouseEvent.stopPropagation();
                      
                      // Small delay to allow selection to complete
                      setTimeout(() => {
                        const selection = window.getSelection();
                        if (selection && selection.rangeCount > 0 && selection.toString().trim()) {
                          const selectedTextContent = selection.toString().trim();
                          if (selectedTextContent.length > 3) {
                            // Dispatch the text selected event
                            const selectedEvent = new CustomEvent('textSelected', {
                              detail: {
                                nodeId: node.id,
                                messageIndex: idx,
                                text: selectedTextContent,
                                range: selection.getRangeAt(0).cloneRange()
                              }
                            });
                            document.dispatchEvent(selectedEvent);
                          }
                        }
                      }, 10);
                    }}
                  >
                   <ReactMarkdown>{msg.content}</ReactMarkdown>
                   {isStreaming && (
                     <span className="inline-flex items-center ml-1.5">
                       <span className="inline-block w-0.5 h-4 bg-indigo-400 animate-pulse" />
                     </span>
                   )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy(msg.content, idx);
                    }}
                    className="absolute bottom-3 right-3 p-1.5 rounded-lg bg-white/90 hover:bg-white border border-slate-200 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-slate-600 hover:text-indigo-600"
                    title="Copy message"
                  >
                    {isCopied ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="px-5 py-5 border-t border-slate-200 chat-content bg-white rounded-b-2xl">
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

            {showKnowledgePanel && (
              <div className="space-y-4 mb-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Node summary</p>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm leading-relaxed text-slate-700">
                    {summary.trim()
                      ? summary
                      : 'The assistant will summarize this thread after the next response.'}
                  </div>
                </div>
                {Object.keys(childInsights).length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Branch insights</p>
                    <div className="space-y-2">
                      {Object.entries(childInsights).map(([childId, insight]) => (
                        <div
                          key={childId}
                          className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-2 text-sm leading-relaxed text-indigo-900"
                        >
                          {insight}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-2 text-xs text-slate-500">
                    No branch insights yet. Create child nodes to capture discoveries.
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(event) => onInputChange(event.target.value)}
                onKeyPress={(event) => event.key === 'Enter' && onSend()}
                placeholder="Ask anything..."
                className="flex-1 px-6 py-[14px] text-base bg-slate-100 border-0 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-200"
                disabled={isProcessing}
              />
              <button
                onClick={onSend}
                disabled={isProcessing}
                className="px-[22px] py-[14px] bg-indigo-600 text-white rounded-full hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 p-4 overflow-hidden cursor-move">
          <div className="space-y-2">
            {summary.trim() && (
              <div className="p-3 rounded-lg bg-slate-100 text-slate-700 text-sm">
                {summary.length > 160 ? `${summary.slice(0, 160)}…` : summary}
              </div>
            )}
            {node.messages.slice(-2).map((msg, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg text-base ${
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
