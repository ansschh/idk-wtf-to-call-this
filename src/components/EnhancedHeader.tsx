// components/EnhancedHeaderWithChat.tsx
"use client";

import React from 'react';
import {
  ArrowLeft,
  Menu,
  Save,
  Download,
  Play,
  Loader,
  Edit,
  Eye,
  Layout,
  Settings,
  MessageSquare
} from "lucide-react";
import { useChat } from '../context/ChatContext';

interface EnhancedHeaderWithChatProps {
  projectId?: string;
  projectName?: string;
  userId: string | null;
  activeFileName?: string;
  onSidebarToggle: () => void;
  viewMode: "code" | "split" | "pdf";
  setViewMode: (mode: "code" | "split" | "pdf") => void;
  onSave: () => void;
  onCompile: () => void;
  onDownload: () => void;
  isCompiling: boolean;
  isSaved: boolean;
  autoCompile: boolean;
  setAutoCompile: (value: boolean) => void;
  onRename?: (newName: string) => void;
}

const EnhancedHeaderWithChat: React.FC<EnhancedHeaderWithChatProps> = ({
  projectId,
  projectName = "Untitled Project",
  userId,
  activeFileName,
  onSidebarToggle,
  viewMode,
  setViewMode,
  onSave,
  onCompile,
  onDownload,
  isCompiling,
  isSaved,
  autoCompile,
  setAutoCompile,
  onRename
}) => {
  const { isChatOpen, toggleChat } = useChat();

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between flex-shrink-0 shadow-sm">
      {/* Left section */}
      <div className="flex items-center space-x-2">
        {/* Sidebar Toggle */}
        <button
          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 focus:outline-none"
          onClick={onSidebarToggle}
          title="Toggle Sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
        {/* Back Button */}
        <button
          onClick={() => window.location.href = "/dashboard"}
          className="p-1.5 rounded-md hover:bg-gray-100 hover:text-gray-700 text-gray-500 focus:outline-none"
          title="Back to Dashboard"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        {/* Project / File Name */}
        <div className="flex items-center">
          <h1 className="font-medium text-gray-800 text-base mr-1.5">{projectName}</h1>
          {activeFileName && (
            <div className="flex items-center">
              <span className="mx-1 text-sm text-gray-400">/</span>
              <span className="text-sm text-gray-700">{activeFileName}</span>
              {!isSaved && <span className="ml-1.5 text-blue-500 text-lg">•</span>}
            </div>
          )}
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right section */}
      <div className="flex items-center space-x-2">
        {/* Chat Toggle Button */}
        <button
          onClick={toggleChat}
          className={`flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 ${
            isChatOpen
              ? 'bg-indigo-100 text-indigo-700 border border-indigo-200 focus:ring-indigo-500'
              : 'bg-indigo-600 text-white hover:bg-indigo-700 border border-indigo-600 focus:ring-indigo-500'
          }`}
          title={isChatOpen ? "Close Chat" : "Open Chat"}
        >
          <MessageSquare className="h-4 w-4 mr-1.5" /> Chat
        </button>

        {/* View Mode Toggles */}
        <div className="hidden md:flex items-center border border-gray-200 rounded-lg overflow-hidden shadow-sm">
          <button
            onClick={() => setViewMode('code')}
            className={`p-2 transition-colors duration-150 ${
              viewMode === 'code'
                ? 'bg-blue-50 text-blue-600 border-r border-gray-200'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
            title="Code"
          >
            <Edit className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('split')}
            className={`p-2 transition-colors duration-150 ${
              viewMode === 'split'
                ? 'bg-blue-50 text-blue-600 border-r border-gray-200'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
            title="Split"
          >
            <Layout className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('pdf')}
            className={`p-2 transition-colors duration-150 ${
              viewMode === 'pdf'
                ? 'bg-blue-50 text-blue-600'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
            title="PDF"
          >
            <Eye className="h-4 w-4" />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onSave}
            disabled={isSaved}
            className={`flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 ${
              isSaved
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                : 'bg-blue-600 text-white hover:bg-blue-700 border border-blue-600 focus:ring-blue-500'
            }`}
            title="Save (Ctrl+S)"
          >
            <Save className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">Save</span>
          </button>

          <button
            onClick={onCompile}
            disabled={isCompiling}
            className={`flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 ${
              isCompiling
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                : 'bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-600 focus:ring-emerald-500'
            }`}
            title="Compile (Ctrl+Enter)"
          >
            {isCompiling ? (
              <>
                <Loader className="h-4 w-4 mr-1.5 animate-spin" />
                Compiling...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-1.5" />
                Compile
              </>
            )}
          </button>

          <button
            onClick={onDownload}
            className="p-1.5 rounded-lg text-sm font-medium transition-all duration-150 shadow-sm border bg-white text-gray-600 hover:bg-gray-50 border-gray-300 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500"
            title="Download PDF"
          >
            <Download className="h-5 w-5" />
          </button>

          {/* Auto-compile Toggle */}
          <div className="hidden sm:flex items-center space-x-1.5 ml-2 pl-2 border-l border-gray-200">
            <input
              type="checkbox"
              id="autoCompile"
              checked={autoCompile}
              onChange={e => setAutoCompile(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 focus:ring-1 cursor-pointer"
            />
            <label htmlFor="autoCompile" className="text-gray-600 text-xs cursor-pointer select-none">
              Auto-compile
            </label>
          </div>
        </div>

        {/* Settings Button */}
        <button
          className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700 focus:outline-none"
          title="Settings"
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
};

export default EnhancedHeaderWithChat;
