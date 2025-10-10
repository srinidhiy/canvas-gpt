import React, { useState } from 'react';
import { ArrowUp, GitBranch } from 'lucide-react';

import { SelectedText } from '../../types/canvas';

interface BranchSelectionBannerProps {
  selectedText: SelectedText;
  onCreateBranch: (query?: string) => void;
}

const BranchSelectionBanner: React.FC<BranchSelectionBannerProps> = ({ selectedText, onCreateBranch }) => {
  const [query, setQuery] = useState('');
  if (!selectedText.text) {
    return null;
  }

  const preview = selectedText.text.length > 50 ? `${selectedText.text.slice(0, 40)}...` : selectedText.text;

  const handleCreateBranch = (event: React.FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onCreateBranch(query.trim() || undefined);
    setQuery('');
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleCreateBranch(event);
    }
  };

  return (
    <div className='fixed top-4 left-1/2 transform -translate-x-1/2 z-50'>
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden animate-in slide-in-from-top-2 duration-200 w-96">
        {/* Header */}
        <div className="bg-indigo-600 text-white px-4 py-3 flex items-center gap-3">
          <GitBranch className="w-4 h-4" />
          <span className="text-sm">Selected: "{preview}"</span>
        </div>
        
        {/* Input Section */}
        <form onSubmit={handleCreateBranch} className="p-4">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                id="branch-query"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What would you like to explore?"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                autoFocus
              />
              <button
                type="submit"
                disabled={!query.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BranchSelectionBanner;
