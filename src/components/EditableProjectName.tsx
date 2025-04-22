// --- START OF UPDATED FILE EditableProjectName.tsx ---

import React, { useState, useEffect, useRef } from 'react';
import { Edit2, Check, X, Loader } from 'lucide-react'; // Added Loader
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface EditableProjectNameProps {
  projectId: string;
  initialTitle: string;
  // showUnsavedIndicator prop removed - handled in parent component now
  onTitleChange?: (newTitle: string) => void;
  className?: string; // Keep className to allow parent styling
}

const EditableProjectName: React.FC<EditableProjectNameProps> = ({
  projectId,
  initialTitle,
  onTitleChange,
  className = "font-medium text-gray-800 text-base" // Default light theme style
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle || 'Untitled Project');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update local title if the initial prop changes (e.g., after fetch)
  useEffect(() => {
    if (initialTitle && !isEditing) { // Only update if not currently editing
      setTitle(initialTitle);
    }
  }, [initialTitle, isEditing]);

  // Auto-focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const startEditing = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent potential parent click events
    setTitle(initialTitle || 'Untitled Project'); // Start editing with the current saved title
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setTitle(initialTitle || 'Untitled Project'); // Revert to saved title
    setIsEditing(false);
  };

  const saveTitle = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !projectId || trimmedTitle === initialTitle) {
      setIsEditing(false); // Close editing even if no change or invalid
      if (trimmedTitle !== initialTitle) {
         setTitle(initialTitle || 'Untitled Project'); // Revert if invalid and different
      }
      return;
    }

    setIsSaving(true);
    try {
      const projectRef = doc(db, "projects", projectId);
      await updateDoc(projectRef, {
        title: trimmedTitle,
        lastModified: serverTimestamp()
      });

      if (onTitleChange) {
        onTitleChange(trimmedTitle); // Notify parent of the successfully saved title
      }
      // The initialTitle prop will update via parent state/fetch, triggering useEffect
      setIsEditing(false);
      // Optionally show success notification via parent or context
      // showNotification("Project name updated!");

    } catch (error) {
      console.error("Error updating project title:", error);
      // Revert input to original title on error
      setTitle(initialTitle || 'Untitled Project');
       // Optionally show error notification via parent or context
      // showNotification("Failed to update project name.", "error");
    } finally {
      setIsSaving(false);
      setIsEditing(false); // Ensure editing is closed even on error
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveTitle();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditing();
    }
  };

  return (
    // --- CHANGE: Container uses passed className ---
    <div className={`flex items-center group ${className}`}>
      {isEditing ? (
        // --- CHANGE: Form styling ---
        <form
          onSubmit={(e) => { e.preventDefault(); saveTitle(); }}
          className="flex items-center bg-white rounded-md border border-blue-400 shadow-sm ring-1 ring-blue-400" // Add visual separation while editing
        >
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSaving}
            // --- CHANGE: Light theme input ---
            className="flex-grow bg-transparent text-gray-900 px-2 py-1 text-base focus:outline-none min-w-[180px]"
            placeholder="Project Name"
          />
           {/* --- CHANGE: Light theme Save/Cancel buttons --- */}
          <button
            type="submit"
            disabled={isSaving || !title.trim() || title.trim() === initialTitle} // Disable if saving or no change/empty
            className={`p-1.5 rounded-r-md transition-colors ${
              isSaving || !title.trim() || title.trim() === initialTitle
                ? 'bg-gray-100 text-gray-400'
                : 'bg-green-500 text-white hover:bg-green-600'
            }`}
            title="Save (Enter)"
          >
            {isSaving ? <Loader className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={cancelEditing}
            disabled={isSaving}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full mx-1 disabled:opacity-50"
            title="Cancel (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </form>
      ) : (
        // --- CHANGE: Displayed title styling ---
        <div className="flex items-center">
          {/* Use className prop for base styling, allow overrides */}
          <h1 className={`truncate max-w-xs ${className}`} title={title}>
            {title}
          </h1>
           {/* Edit Button - visible on hover */}
          <button
            onClick={startEditing}
            className="ml-1.5 p-1 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Edit Project Name"
          >
            <Edit2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default EditableProjectName;
// --- END OF UPDATED FILE EditableProjectName.tsx ---