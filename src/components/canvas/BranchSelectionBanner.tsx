import React from 'react';
import { GitBranch } from 'lucide-react';

import { SelectedText } from '../../types/canvas';

interface BranchSelectionBannerProps {
  selectedText: SelectedText;
  onCreateBranch: () => void;
}

const BranchSelectionBanner: React.FC<BranchSelectionBannerProps> = ({ selectedText, onCreateBranch }) => {
  if (!selectedText.text) {
    return null;
  }

  const preview = selectedText.text.length > 40 ? `${selectedText.text.slice(0, 40)}...` : selectedText.text;

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-indigo-600 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 z-50 animate-in slide-in-from-top-2 duration-200">
      <GitBranch className="w-4 h-4" />
      <span className="text-sm">Selected: "{preview}"</span>
      <button
        onClick={(event) => {
          event.stopPropagation();
          onCreateBranch();
        }}
        className="branch-button bg-indigo-700 hover:bg-indigo-800 px-3 py-1 rounded-lg text-sm font-medium transition-colors duration-200"
      >
        Branch
      </button>
    </div>
  );
};

export default BranchSelectionBanner;
